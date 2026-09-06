// Package config loads runtime configuration from the environment.
package config

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"log/slog"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// Environment names for Env.
const (
	EnvDevelopment = "development"
	EnvProduction  = "production"
)

// CookieConfig describes how the session cookie is written.
type CookieConfig struct {
	Name     string
	Secure   bool
	HTTPOnly bool
	SameSite string
	Path     string
	MaxAge   time.Duration
}

// Config holds the API's runtime settings. Every value has a safe default so
// the service runs with zero configuration in development; production refuses
// to start without the secrets it genuinely needs.
type Config struct {
	// Env is "development" or "production".
	Env string
	// Addr is the listen address, e.g. ":8080".
	Addr string
	// ReadTimeout and WriteTimeout bound request handling.
	ReadTimeout  time.Duration
	WriteTimeout time.Duration
	// AllowedOrigins lists browser origins permitted to call the API via
	// credentialed CORS. Empty in production is a startup error.
	AllowedOrigins []string
	// DatabaseURL is the PostgreSQL DSN.
	DatabaseURL string
	// SessionSecret is the HMAC key applied to session and email-token
	// verifiers before hashing. Dev-only fallback: a random key persisted to
	// DataDir with 0600 permissions, so sessions survive restarts without a
	// secret ever living in source code.
	SessionSecret []byte
	// AppURL is the frontend origin used to build links inside emails.
	AppURL string
	// SessionTTL is how long a session lives, refreshed by activity.
	SessionTTL time.Duration
	// ResetTokenTTL limits password-reset tokens.
	ResetTokenTTL time.Duration
	// VerifyTokenTTL limits email-verification tokens.
	VerifyTokenTTL time.Duration
	// Cookie configures the session cookie.
	Cookie CookieConfig
}

// IsProduction reports whether the service runs with production strictness.
func (c Config) IsProduction() bool { return c.Env == EnvProduction }

// Load reads configuration from the environment and .env files:
//
//	API_ENV               development | production   (default development)
//	API_ADDR              listen address             (default PORT, then ":8080")
//	API_ALLOWED_ORIGINS   comma-separated CORS origins (dev default localhost:3000)
//	DATABASE_URL          PostgreSQL DSN             (dev default local podman DB)
//	SESSION_SECRET        hex-encoded HMAC key       (dev: auto-generated)
//	APP_URL               frontend origin for links  (default http://localhost:3000)
func Load() (Config, error) {
	// apps/api/.env and apps/api/.env.local keep local secrets out of source;
	// real environment variables always win over file values.
	for _, name := range []string{".env", ".env.local"} {
		if err := loadDotEnv(filepath.Join(".", name)); err != nil {
			return Config{}, fmt.Errorf("config: load %s: %w", name, err)
		}
	}

	env := envOr("API_ENV", EnvDevelopment)
	if env != EnvDevelopment && env != EnvProduction {
		return Config{}, fmt.Errorf("config: API_ENV must be %q or %q, got %q", EnvDevelopment, EnvProduction, env)
	}

	allowed := splitOrigins(envOr("API_ALLOWED_ORIGINS", "http://localhost:3000"))
	if env == EnvProduction && len(allowed) == 0 {
		return Config{}, errors.New("config: API_ALLOWED_ORIGINS is required in production")
	}
	for _, origin := range allowed {
		if err := validateOrigin(origin); err != nil {
			return Config{}, fmt.Errorf("config: API_ALLOWED_ORIGINS: %w", err)
		}
	}

	databaseURL := envOr("DATABASE_URL", "postgres://ideaven:ideaven@127.0.0.1:5432/ideaven?sslmode=disable")
	if databaseURL == "" {
		return Config{}, errors.New("config: DATABASE_URL is required")
	}

	appURL := strings.TrimRight(envOr("APP_URL", "http://localhost:3000"), "/")
	if err := validateOrigin(appURL); err != nil {
		return Config{}, fmt.Errorf("config: APP_URL: %w", err)
	}

	secret, generated, err := loadSessionSecret(env)
	if err != nil {
		return Config{}, err
	}
	if generated {
		slog.Warn("SESSION_SECRET not set — generated a dev-only secret; set SESSION_SECRET explicitly for anything shared")
	}

	return Config{
		Env: env,
		// Managed platforms (Vercel, Render) dictate the port via PORT.
		Addr:           envOr("API_ADDR", envOr("PORT", ":8080")),
		ReadTimeout:    10 * time.Second,
		WriteTimeout:   10 * time.Second,
		AllowedOrigins: allowed,
		DatabaseURL:    databaseURL,
		SessionSecret:  secret,
		AppURL:         appURL,
		SessionTTL:     7 * 24 * time.Hour,
		ResetTokenTTL:  time.Hour,
		VerifyTokenTTL: 24 * time.Hour,
		Cookie: CookieConfig{
			Name:     "ideaven_session",
			Secure:   env == EnvProduction,
			HTTPOnly: true,
			SameSite: "Lax",
			Path:     "/",
			MaxAge:   7 * 24 * time.Hour,
		},
	}, nil
}

// loadSessionSecret resolves SESSION_SECRET (hex). In development a missing
// secret is generated once and persisted under .data/ (gitignored) so sessions
// survive restarts; in production a missing secret is fatal.
func loadSessionSecret(env string) (secret []byte, generated bool, err error) {
	if encoded := os.Getenv("SESSION_SECRET"); encoded != "" {
		decoded, decodeErr := hex.DecodeString(strings.TrimSpace(encoded))
		if decodeErr != nil || len(decoded) < 32 {
			return nil, false, errors.New("config: SESSION_SECRET must be hex encoding at least 32 bytes (generate: openssl rand -hex 32)")
		}
		return decoded, false, nil
	}
	if env == EnvProduction {
		return nil, false, errors.New("config: SESSION_SECRET is required in production (generate: openssl rand -hex 32)")
	}

	path := filepath.Join(".data", "session_secret")
	if existing, readErr := os.ReadFile(path); readErr == nil {
		if decoded, decodeErr := hex.DecodeString(strings.TrimSpace(string(existing))); decodeErr == nil && len(decoded) >= 32 {
			return decoded, false, nil
		}
	}
	fresh := make([]byte, 32)
	if _, randErr := rand.Read(fresh); randErr != nil {
		return nil, false, fmt.Errorf("config: generate session secret: %w", randErr)
	}
	if writeErr := os.MkdirAll(filepath.Dir(path), 0o700); writeErr != nil {
		return nil, false, fmt.Errorf("config: create data dir: %w", writeErr)
	}
	if writeErr := os.WriteFile(path, []byte(hex.EncodeToString(fresh)), 0o600); writeErr != nil {
		return nil, false, fmt.Errorf("config: persist session secret: %w", writeErr)
	}
	return fresh, true, nil
}

func envOr(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}

func splitOrigins(raw string) []string {
	parts := strings.Split(raw, ",")
	origins := make([]string, 0, len(parts))
	for _, part := range parts {
		if origin := strings.TrimSpace(part); origin != "" {
			origins = append(origins, origin)
		}
	}
	return origins
}

func validateOrigin(origin string) error {
	parsed, err := url.Parse(origin)
	if err != nil || parsed.Scheme == "" || parsed.Host == "" || parsed.Path != "" {
		return fmt.Errorf("origin %q must be scheme://host without a path", origin)
	}
	return nil
}

// loadDotEnv reads simple KEY=VALUE lines from path into the environment when
// the key is not already set. Missing files are fine.
func loadDotEnv(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil
		}
		return err
	}
	for line := range strings.SplitSeq(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, found := strings.Cut(line, "=")
		if !found {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if len(value) >= 2 && (value[0] == '"' && value[len(value)-1] == '"' || value[0] == '\'' && value[len(value)-1] == '\'') {
			value = value[1 : len(value)-1]
		}
		if key != "" && os.Getenv(key) == "" {
			_ = os.Setenv(key, value)
		}
	}
	return nil
}
