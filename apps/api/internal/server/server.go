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
	"path/filepath"
	"sort"
	"strings"
	"syscall"
	"time"

	"ideaven/apps/api/internal/ai"
	"ideaven/apps/api/internal/asset"
	"ideaven/apps/api/internal/auth"
	"ideaven/apps/api/internal/config"
	"ideaven/apps/api/internal/community"
	"ideaven/apps/api/internal/extension"
	"ideaven/apps/api/internal/handler"
	"ideaven/apps/api/internal/httpx"
	"ideaven/apps/api/internal/middleware"
	"ideaven/apps/api/internal/project"
	"ideaven/apps/api/internal/storage"
)

// New builds the fully-wired HTTP handler for the API.
func New(cfg config.Config, db *sql.DB) http.Handler {
	mux := http.NewServeMux()

	// Phase 1: liveness probe.
	route(mux, http.MethodGet, "/api/health", http.HandlerFunc(handler.Health))

	// Phase 2: authentication.
	authService := auth.NewService(db, cfg, auth.NewLogMailer(slog.Default()), slog.Default())
	authHandler := auth.NewHandler(authService, cfg.Cookie)

	// Sensitive endpoints get stricter per-IP limits than the general pool:
	// credential stuffing and email-triggering routes burn budget fastest.
	loginLimiter := middleware.NewRateLimiter(10, time.Minute)
	emailLimiter := middleware.NewRateLimiter(5, time.Minute)

	route(mux, http.MethodPost, "/api/auth/register", http.HandlerFunc(authHandler.Register))
	route(mux, http.MethodPost, "/api/auth/login", middleware.Chain(http.HandlerFunc(authHandler.Login), loginLimiter.Middleware))
	route(mux, http.MethodPost, "/api/auth/logout", http.HandlerFunc(authHandler.Logout))
	route(mux, http.MethodGet, "/api/auth/me", http.HandlerFunc(authHandler.Me))
	route(mux, http.MethodPost, "/api/auth/forgot-password", middleware.Chain(http.HandlerFunc(authHandler.ForgotPassword), emailLimiter.Middleware))
	route(mux, http.MethodPost, "/api/auth/validate-reset-token", middleware.Chain(http.HandlerFunc(authHandler.ValidateResetToken), emailLimiter.Middleware))
	route(mux, http.MethodPost, "/api/auth/reset-password", middleware.Chain(http.HandlerFunc(authHandler.ResetPassword), emailLimiter.Middleware))
	route(mux, http.MethodPost, "/api/auth/verify-email", http.HandlerFunc(authHandler.VerifyEmail))
	route(mux, http.MethodPost, "/api/auth/resend-verification", middleware.Chain(http.HandlerFunc(authHandler.ResendVerification), emailLimiter.Middleware))

	// Phase 3: profile & account. Identity is derived from the session cookie;
	// these routes accept no user ID from the client.
	route(mux, http.MethodPatch, "/api/profile", http.HandlerFunc(authHandler.UpdateProfile))
	route(mux, http.MethodPost, "/api/auth/change-password", middleware.Chain(http.HandlerFunc(authHandler.ChangePassword), loginLimiter.Middleware))

	// Phase 4: projects. Every route is scoped to the session's user; project
	// IDs never travel as a trust signal.
	projectService := project.NewService(db, slog.Default())
	projectService.SetAssetMediaSource(asset.NewStore(db))
	projectHandler := project.NewHandler(projectService, authService, cfg.Cookie)

	// Project creation writes a row plus a model document; cap it per IP so
	// automated accounts cannot flood the library.
	createLimiter := middleware.NewRateLimiter(20, time.Minute)

	routeMethods(mux, "/api/projects", map[string]http.Handler{
		http.MethodPost: middleware.Chain(http.HandlerFunc(projectHandler.Create), createLimiter.Middleware),
		http.MethodGet:  http.HandlerFunc(projectHandler.List),
	})
	routeMethods(mux, "/api/projects/{id}", map[string]http.Handler{
		http.MethodGet:    http.HandlerFunc(projectHandler.Get),
		http.MethodPatch:  http.HandlerFunc(projectHandler.Update),
		http.MethodDelete: http.HandlerFunc(projectHandler.Delete),
	})
	route(mux, http.MethodPost, "/api/projects/{id}/duplicate", http.HandlerFunc(projectHandler.Duplicate))
	// 6J project package portability: owner-only backup zip + import.
	// The import route registers method-first WITHOUT a same-path fallback:
	// a literal "import" segment conflicts with the {id} wildcard's 405
	// fallback (the documented mux rule). Other methods on the literal path
	// fall through to GET /{id}, which rejects "import" as a malformed id.
	mux.Handle("POST /api/projects/import", middleware.Chain(http.HandlerFunc(projectHandler.ImportPackage), createLimiter.Middleware))
	route(mux, http.MethodGet, "/api/projects/{id}/package", http.HandlerFunc(projectHandler.ProjectPackage))
	route(mux, http.MethodPost, "/api/projects/{id}/open", http.HandlerFunc(projectHandler.Open))
	route(mux, http.MethodPut, "/api/projects/{id}/model", http.HandlerFunc(projectHandler.UpdateModel))
	route(mux, http.MethodGet, "/api/projects/{id}/versions", http.HandlerFunc(projectHandler.ListVersions))
	route(mux, http.MethodGet, "/api/projects/{id}/versions/{versionId}", http.HandlerFunc(projectHandler.GetVersion))
	// Roadmap 3.0 M1: project intelligence — derived-only report over the
	// canonical model (graphs + health), owner-scoped.
	route(mux, http.MethodGet, "/api/projects/{id}/intelligence", http.HandlerFunc(projectHandler.Intelligence))
	// Roadmap 4.0 M3: project DNA — derived understanding document.
	route(mux, http.MethodGet, "/api/projects/{id}/dna", http.HandlerFunc(projectHandler.DNA))
	// Roadmap 4.0 M30: derived asset intelligence (owner-only).
	route(mux, http.MethodGet, "/api/projects/{id}/asset-intelligence", http.HandlerFunc(projectHandler.AssetIntelligence))
	// Roadmap 7.0 M11 (phase 7A): project intent — structured purpose.
	routeMethods(mux, "/api/projects/{id}/intent", map[string]http.Handler{
		http.MethodGet: http.HandlerFunc(projectHandler.IntentGet),
		http.MethodPut: http.HandlerFunc(projectHandler.IntentSet),
	})
	// Roadmap 5.0 M5 (phase 5A): project memory — durable AI rules.
	routeMethods(mux, "/api/projects/{id}/memory", map[string]http.Handler{
		http.MethodGet:  http.HandlerFunc(projectHandler.MemoryList),
		http.MethodPost: http.HandlerFunc(projectHandler.MemoryAdd),
	})
	route(mux, http.MethodDelete, "/api/projects/{id}/memory/{memoryId}", http.HandlerFunc(projectHandler.MemoryDelete))

	// Phase 19: publishing. Owner routes snapshot/unpublish; the public
	// routes answer anonymously from the stored snapshot only.
	route(mux, http.MethodPost, "/api/projects/{id}/publish", http.HandlerFunc(projectHandler.Publish))
	route(mux, http.MethodPost, "/api/projects/{id}/unpublish", http.HandlerFunc(projectHandler.Unpublish))
	route(mux, http.MethodGet, "/api/public/projects/{slug}", http.HandlerFunc(projectHandler.PublicProject))
	// TASK 07: deterministic preview thumbnail rendered from the published
	// model itself (no stock imagery).
	route(mux, http.MethodGet, "/api/public/projects/{slug}/thumbnail.svg", http.HandlerFunc(projectHandler.PublicThumbnail))
	route(mux, http.MethodGet, "/api/public/projects", http.HandlerFunc(projectHandler.PublicList))
	// Phase 20/33–35: community loop — public creator pages, remix into the
	// caller's account, and honest platform counters. Phase 4/32: templates.
	route(mux, http.MethodGet, "/api/public/creators/{username}", http.HandlerFunc(projectHandler.PublicCreator))
	route(mux, http.MethodPost, "/api/public/projects/{slug}/remix", http.HandlerFunc(projectHandler.Remix))
	route(mux, http.MethodGet, "/api/public/stats", http.HandlerFunc(projectHandler.PublicStats))
	route(mux, http.MethodGet, "/api/templates", http.HandlerFunc(projectHandler.ListTemplates))
	// TASK 07: creator community — questions/discussions in channels with
	// upvoted, acceptable answers. Reads are public; writes need a session.
	communityService := community.NewService(db, slog.Default())
	communityHandler := community.NewHandler(communityService, authService, cfg.Cookie)
	communityLimiter := middleware.NewRateLimiter(30, time.Minute)
	route(mux, http.MethodGet, "/api/community/feed", http.HandlerFunc(communityHandler.Feed))
	route(mux, http.MethodGet, "/api/community/summary", http.HandlerFunc(communityHandler.Summary))
	route(mux, http.MethodPost, "/api/community/posts", middleware.Chain(http.HandlerFunc(communityHandler.CreatePost), communityLimiter.Middleware))
	// One routeMethods call for the shared path — two route() calls would
	// register duplicate 405 fallbacks and panic the mux.
	routeMethods(mux, "/api/community/posts/{id}", map[string]http.Handler{
		http.MethodGet:    http.HandlerFunc(communityHandler.Post),
		http.MethodDelete: http.HandlerFunc(communityHandler.DeletePost),
	})
	route(mux, http.MethodPost, "/api/community/posts/{id}/replies", middleware.Chain(http.HandlerFunc(communityHandler.CreateReply), communityLimiter.Middleware))
	route(mux, http.MethodPost, "/api/community/posts/{id}/vote", http.HandlerFunc(communityHandler.VotePost))
	route(mux, http.MethodPost, "/api/community/posts/{id}/accept", http.HandlerFunc(communityHandler.AcceptReply))
	route(mux, http.MethodDelete, "/api/community/replies/{id}", http.HandlerFunc(communityHandler.DeleteReply))
	route(mux, http.MethodPost, "/api/community/replies/{id}/vote", http.HandlerFunc(communityHandler.VoteReply))
	route(mux, http.MethodPost, "/api/community/report", http.HandlerFunc(communityHandler.Report))
	// Roadmap 2.0-B: extension registry — authored extensions and their
	// immutable versions, owner-scoped like projects.
	extensionService := extension.NewService(db, "") // built AIX packages live under .data/extensions
	// The AI provider (when configured) also powers the extension build
	// fixer, sharing one credit allowance and one usage ledger.
	aiProvider := ai.LoadProvider(os.Getenv, nil)
	extensionHandler := extension.NewHandler(extensionService, authService.Authenticate,
		config.CookieConfig{Name: cfg.Cookie.Name},
		extension.WithFixProvider(aiProvider),
		extension.WithFixGate(func(ctx context.Context, userID string) bool {
			return ai.Exhausted(db, userID)
		}),
		extension.WithUsageRecorder(func(userID, provider, model string, promptChars, outputChars int, ok bool) {
			ai.RecordUsage(db, userID, provider, model, promptChars, outputChars, ok)
		}),
	)
	// Launch feedback: everyone can browse published extensions.
	route(mux, http.MethodGet, "/api/public/extensions", http.HandlerFunc(extensionHandler.PublicList))
	routeMethods(mux, "/api/extensions", map[string]http.Handler{
		http.MethodGet:  http.HandlerFunc(extensionHandler.List),
		http.MethodPost: http.HandlerFunc(extensionHandler.Create),
	})
	// Installed lives outside /{id}: a literal segment under a wildcard
	// path conflicts with the mux's precedence rules.
	route(mux, http.MethodGet, "/api/me/extensions", http.HandlerFunc(extensionHandler.Installed))
	routeMethods(mux, "/api/extensions/{id}", map[string]http.Handler{
		http.MethodGet:    http.HandlerFunc(extensionHandler.Get),
		http.MethodPatch:  http.HandlerFunc(extensionHandler.Update),
		http.MethodDelete: http.HandlerFunc(extensionHandler.Delete),
	})
	routeMethods(mux, "/api/extensions/{id}/versions", map[string]http.Handler{
		http.MethodPost: http.HandlerFunc(extensionHandler.SaveVersion),
		http.MethodGet:  http.HandlerFunc(extensionHandler.ListVersions),
	})
	route(mux, http.MethodPost, "/api/extensions/{id}/publish", http.HandlerFunc(extensionHandler.Publish))
	route(mux, http.MethodPost, "/api/extensions/{id}/build", http.HandlerFunc(extensionHandler.Build))
	// Task 06: the same pipeline over SSE — real states and logs stream as
	// they happen; builds history; AI fix proposals (diff-based).
	route(mux, http.MethodPost, "/api/extensions/{id}/build/stream", http.HandlerFunc(extensionHandler.BuildStream))
	route(mux, http.MethodGet, "/api/extensions/{id}/builds", http.HandlerFunc(extensionHandler.ListBuilds))
	route(mux, http.MethodPost, "/api/extensions/{id}/fix", http.HandlerFunc(extensionHandler.Fix))
	route(mux, http.MethodGet, "/api/extensions/{id}/aix", http.HandlerFunc(extensionHandler.AIX))
	routeMethods(mux, "/api/extensions/{id}/install", map[string]http.Handler{
		http.MethodPost:   http.HandlerFunc(extensionHandler.Install),
		http.MethodDelete: http.HandlerFunc(extensionHandler.Uninstall),
	})

	// Phase 26/30–31: exports — standalone HTML and an Android WebView
	// project archive, both owner-only downloads.
	route(mux, http.MethodGet, "/api/projects/{id}/export/html", http.HandlerFunc(projectHandler.ExportHTML))
	route(mux, http.MethodGet, "/api/projects/{id}/export/android", http.HandlerFunc(projectHandler.ExportAndroid))
	route(mux, http.MethodGet, "/api/projects/{id}/export/windows", http.HandlerFunc(projectHandler.ExportWindows))

	// Phase 3: Ask AI. Provider comes from AI_* env vars; without them the
	// endpoint reports AI_NOT_CONFIGURED honestly. Keys never leave the server.
	aiHandler := ai.NewHandler(aiProvider, authService.Authenticate, db, ai.CookieConfig{Name: cfg.Cookie.Name})
	aiLimiter := middleware.NewRateLimiter(10, time.Minute)
	route(mux, http.MethodPost, "/api/ai/command", middleware.Chain(http.HandlerFunc(aiHandler.Command), aiLimiter.Middleware))
	route(mux, http.MethodGet, "/api/ai/credits", http.HandlerFunc(aiHandler.Credits))
	route(mux, http.MethodGet, "/api/ai/credits/activity", http.HandlerFunc(aiHandler.CreditActivity))

	// Phase 3b: per-project media assets. Ownership rides the project — the
	// authorizer reuses the project service's owner-scoped lookup, so an
	// asset ID alone never grants access. Raw bytes are served only to the
	// owning session.
	assetService := asset.NewService(asset.NewStore(db), func(ctx context.Context, ownerID, projectID string) error {
		_, err := projectService.Get(ctx, ownerID, projectID)
		return err
	}, storage.NewLocalAdapter(filepath.Join(".data", "assets")))
	assetHandler := asset.NewHandler(assetService, authService.Authenticate, asset.CookieConfig{Name: cfg.Cookie.Name})

	// 6J package import: assets re-enter through the asset service's
	// validated Create path (MIME sniffed, capped) — never raw bytes.
	projectService.AssetInserter = func(ctx context.Context, ownerID, projectID, fileName string, data []byte) (string, error) {
		inserted, err := assetService.Create(ctx, ownerID, projectID, fileName, data)
		if err != nil {
			return "", err
		}
		return inserted.ID, nil // bare id — the importer remaps asset:<old> → asset:<new>
	}
	uploadLimiter := middleware.NewRateLimiter(30, time.Minute)

	routeMethods(mux, "/api/projects/{id}/assets", map[string]http.Handler{
		http.MethodPost: middleware.Chain(http.HandlerFunc(assetHandler.Upload), uploadLimiter.Middleware),
		http.MethodGet:  http.HandlerFunc(assetHandler.List),
	})
	route(mux, http.MethodGet, "/api/assets/{id}/raw", http.HandlerFunc(assetHandler.Raw))
	route(mux, http.MethodDelete, "/api/assets/{id}", http.HandlerFunc(assetHandler.Delete))

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

// route registers a method-specific handler and a same-path fallback that
// answers every other method with an RFC-correct 405 and Allow header — the
// catch-all "/" would otherwise shadow method mismatches with a 404.
func route(mux *http.ServeMux, method, path string, h http.Handler) {
	routeMethods(mux, path, map[string]http.Handler{method: h})
}

// routeMethods registers one handler per method for a single path plus the
// shared 405 fallback. Multi-method paths (list+create, get+patch+delete)
// must use this — two route() calls on one path would register duplicate
// fallbacks and panic the mux.
func routeMethods(mux *http.ServeMux, path string, handlers map[string]http.Handler) {
	allow := make([]string, 0, len(handlers))
	for method, h := range handlers {
		mux.Handle(method+" "+path, h)
		allow = append(allow, method)
	}
	sort.Strings(allow)
	mux.Handle(path, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Allow", strings.Join(allow, ", "))
		httpx.WriteError(w, httpx.Errorf(http.StatusMethodNotAllowed, httpx.CodeMethodNotAllowed, "That method is not allowed for this route."))
	}))
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
