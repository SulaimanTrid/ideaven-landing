# Ideaven Architecture (Phase 1)

## Monorepo layout

pnpm workspaces with two app packages and two shared packages:

```
apps/web        @ideaven/web      Next.js 15, App Router, React 19, Tailwind v4
apps/api        @ideaven/api      Go 1.24, stdlib only
packages/ui     @ideaven/ui       Shared React primitives (TS source, transpiled by web)
packages/config @ideaven/config   Shared tsconfig bases (extended by relative path)
```

Key decisions:

- **`@ideaven/ui` ships TypeScript source**, not a build. `apps/web` compiles it
  via `transpilePackages` and scans it for Tailwind classes via `@source` in
  `globals.css`. No bundler config duplication, one source of truth.
- **Design tokens live in `apps/web/src/app/globals.css`** (`@theme` block).
  UI primitives reference those tokens by Tailwind class. When a second web app
  appears, tokens should graduate into `packages/ui` (see ROADMAP).
- **tsconfigs extend by relative path** (`../../packages/config/...`) — robust,
  zero package-resolution magic.

## Frontend

### Rendering strategy

Everything is a **server component by default**. Only five small client
islands exist:

| Island                  | Why it's client                              |
| ----------------------- | -------------------------------------------- |
| `site-header`           | scroll state, mobile menu, Escape handling   |
| `editor-visual`         | BLOCKS/CODE tabs, Run/Pause/Stop state        |
| `ai-demo`               | timed concept animation                       |
| `loop-section`          | auto-advancing state cycler                   |
| `reveal`                | IntersectionObserver entrance animations      |

Result: all 12 routes prerender as static content; ~110 kB first-load JS on `/`.

### Progressive enhancement

- A tiny `beforeInteractive` script adds `.js` to `<html>`. CSS only pre-hides
  reveal targets when that flag exists — no-JS visitors (and crawlers) see full
  content immediately.
- The code-typing simulation renders the full snippet server-side, then replays
  the animation client-side.
- All timed/animated islands check `prefers-reduced-motion` and fall back to a
  static final state; a global CSS rule neutralizes remaining animations.

### Route inventory

| Route        | Type      | Purpose                                  |
| ------------ | --------- | ---------------------------------------- |
| `/`          | static    | Landing page (all sections)              |
| `/learn` `/explore` `/community` `/pricing` `/login` `/start` `/docs` `/privacy` `/terms` | static, `noindex` | Future-phase placeholders — every future link resolves here, no dead ends |
| `/robots.txt` `/sitemap.xml` | metadata routes | SEO |
| `/_not-found` | static    | Custom 404 in brand voice                |

An `error.tsx` boundary renders a branded retry screen for render failures.

## Backend

```
cmd/api/main.go            entrypoint: config.Load() → server.Run()
internal/config            env parsing (API_ADDR, API_ALLOWED_ORIGINS)
internal/handler           HTTP handlers (health) + tests
internal/middleware        chain: logger → recover → secure headers → CORS
internal/server            mux wiring, JSON 404 fallback, graceful shutdown
internal/build             version constant (ldflags-overridable)
```

- Go 1.22+ method-aware mux patterns (`GET /api/health`) give 405s for free.
- Graceful shutdown on SIGINT/SIGTERM with a 10 s drain window.
- Structured logging via `log/slog`; panics become JSON 500s, never stack trace
  leaks.
- CORS is allowlist-only and inert until origins are configured.

### Growth path (by phase)

Adding a feature later means: new `internal/<domain>` package, handlers
registered in `server.New`, tests beside handlers. No phase-1 code needs to be
deleted. See `docs/ROADMAP.md` for the full mapping.

## Verification performed (Phase 1 exit gate)

- `tsc --noEmit` clean; `go vet` + `go test` green; production build all-static
- Playwright suite: 18/18 — routes, overflow, console errors, tab/typing/run
  interactions, mobile menu, anchor navigation, FCP/perf budget, SEO tags
- Manual visual QA at 1440 px and 375 px across all sections
