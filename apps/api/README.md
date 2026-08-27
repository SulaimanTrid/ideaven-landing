# @ideaven/api

The Ideaven API service. Phase 2 adds full user authentication on top of the
Phase 1 liveness/middleware foundation. Sessions are HttpOnly cookies using
the OWASP selector/verifier token pattern; passwords are hashed with Argon2id.

```bash
pnpm dev        # go run ./cmd/api  → :8080
pnpm build      # go build -o bin/api ./cmd/api
pnpm test       # go test ./...
pnpm check      # go vet ./...
```

Requires a reachable PostgreSQL instance; in development the target database
is created automatically on startup and migrations run embedded.

Endpoints:

```
GET  /api/health                     liveness
POST /api/auth/register              create account (starts session)
POST /api/auth/login                 sign in (rate limited)
POST /api/auth/logout                clear session
GET  /api/auth/me                    current user from session cookie
POST /api/auth/forgot-password       request reset link (opaque, rate limited)
POST /api/auth/validate-reset-token  check a reset token (rate limited)
POST /api/auth/reset-password        consume token, set new password (rate limited)
POST /api/auth/verify-email          confirm email via token
POST /api/auth/resend-verification   resend verification email (rate limited)
```

Configuration:

| Variable              | Default                                                             | Purpose                       |
| --------------------- | ------------------------------------------------------------------- | ----------------------------- |
| `API_ADDR`            | `:8080`                                                             | Listen address                |
| `API_ALLOWED_ORIGINS` | —                                                                   | Comma-separated CORS origins  |
| `DATABASE_URL`        | `postgres://ideaven:ideaven@127.0.0.1:5432/ideaven?sslmode=disable` | PostgreSQL DSN                |
| `SESSION_SECRET`      | dev-generated                                                       | HMAC key for session verifier |
| `APP_URL`             | `http://localhost:3000`                                             | Base URL used in email links  |
| `API_ENV`             | `development`                                                       | `production` enables Secure cookies |

Architecture: `cmd/api` (entrypoint) → `internal/server` (routes, graceful
shutdown) → `internal/handler` + `internal/auth` (endpoint logic, tests) →
`internal/middleware` (logger, recovery, security headers, CORS, rate
limiting) with `internal/config` for env and `internal/build` for versioning.
The web app consumes these endpoints via `apps/web/src/lib/api.ts`.
