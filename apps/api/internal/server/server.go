// Package server wires the API's routes, middleware, and lifecycle.
package server

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"ideaven/apps/api/internal/auth"
	"ideaven/apps/api/internal/config"
	"ideaven/apps/api/internal/handler"
	"ideaven/apps/api/internal/httpx"
	"ideaven/apps/api/internal/middleware"
)

// New builds the fully-wired HTTP handler for the API.
func New(cfg config.Config, db *sql.DB) http.Handler {
	mux := http.NewServeMux()

	// Phase 1: liveness probe.
	mux.HandleFunc("GET /api/health", handler.Health)

	// Phase 2: authentication.
	authService := auth.NewService(db, cfg, auth.NewLogMailer(slog.Default()), slog.Default())
	authHandler := auth.NewHandler(authService, cfg.Cookie)

	// Sensitive endpoints get stricter per-IP limits than the general pool:
	// credential stuffing and email-triggering routes burn budget fastest.
	loginLimiter := middleware.NewRateLimiter(10, time.Minute)
	emailLimiter := middleware.NewRateLimiter(5, time.Minute)

	mux.HandleFunc("POST /api/auth/register", authHandler.Register)
	mux.Handle("POST /api/auth/login", middleware.Chain(http.HandlerFunc(authHandler.Login), loginLimiter.Middleware))
	mux.HandleFunc("POST /api/auth/logout", authHandler.Logout)
	mux.HandleFunc("GET /api/auth/me", authHandler.Me)
	mux.Handle("POST /api/auth/forgot-password", middleware.Chain(http.HandlerFunc(authHandler.ForgotPassword), emailLimiter.Middleware))
	mux.Handle("POST /api/auth/validate-reset-token", middleware.Chain(http.HandlerFunc(authHandler.ValidateResetToken), emailLimiter.Middleware))
	mux.Handle("POST /api/auth/reset-password", middleware.Chain(http.HandlerFunc(authHandler.ResetPassword), emailLimiter.Middleware))
	mux.HandleFunc("POST /api/auth/verify-email", authHandler.VerifyEmail)
	mux.Handle("POST /api/auth/resend-verification", middleware.Chain(http.HandlerFunc(authHandler.ResendVerification), emailLimiter.Middleware))

	// Every other path is a JSON 404 — future features get real routes,
	// never silent defaults.
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		httpx.WriteError(w, httpx.Errorf(http.StatusNotFound, httpx.CodeNotFound, "Route not found."))
	})

	return middleware.Chain(mux,
		middleware.Logger,
		middleware.Recover,
		middleware.SecureHeaders,
		middleware.CORS(cfg.AllowedOrigins),
		middleware.OriginGuard(cfg.AllowedOrigins),
	)
}

// Run starts the API, applies migrations, and shuts down gracefully on
// SIGINT/SIGTERM.
func Run(cfg config.Config, db *sql.DB) error {
	srv := &http.Server{
		Addr:         cfg.Addr,
		Handler:      New(cfg, db),
		ReadTimeout:  cfg.ReadTimeout,
		WriteTimeout: cfg.WriteTimeout,
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// Background hygiene: purge expired sessions and tokens hourly.
	authService := auth.NewService(db, cfg, auth.NewLogMailer(slog.Default()), slog.Default())
	authService.StartCleanup(ctx)

	serverError := make(chan error, 1)
	go func() {
		slog.Info("api listening", "addr", cfg.Addr, "env", cfg.Env, "version", "0.2.0")
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverError <- err
		}
	}()

	select {
	case err := <-serverError:
		return err
	case <-ctx.Done():
		slog.Info("shutting down gracefully")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		return srv.Shutdown(shutdownCtx)
	}
}
