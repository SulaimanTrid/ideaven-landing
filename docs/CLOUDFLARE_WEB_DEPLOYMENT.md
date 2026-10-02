# Cloudflare Web Deployment (Phase 1B — explicit vinext/Wrangler config)

Status: **FUNCTIONAL / TESTED** — build, preview, and deploy dry-run verified; real dashboard deploy is one command away (`pnpm run deploy:vinext`).
Date: 2026-10-02. This document is the source of truth for deploying `apps/web` to Cloudflare Workers.

---

## 1. Why Cloudflare Workers

An additional deployment target next to Vercel: edge-rendered Next.js (App
Router + RSC) on Workers with static assets on Cloudflare's network. The
original deployment failure (`npm error Unsupported URL Type "workspace:"`)
came from Cloudflare's automatic framework detection running npm against the
pnpm workspace. The fix is NOT to touch the monorepo — it is an explicit,
generated Wrangler configuration so Cloudflare never runs detection again.

## 2. Compatibility result (`vinext check`, run in apps/web)

- **Overall 87% compatible — no blocking issues.**
- Fully supported: `next/navigation` (24 files), `next/link` (30),
  `next/script`, `headers()`, `transpilePackages`, `poweredByHeader`,
  Tailwind, App Router structure (32 pages, 4 layouts, error + not-found).
- Partial (non-blocking, documented):
  - `next/font/google` — fonts load from Google's CDN instead of being
    self-hosted at build time (visual behavior unchanged).
  - `reactStrictMode` — enforced for the client root; App Router strict mode
    remains Next's default-on behavior.
- One auto-fixed issue: missing `"type": "module"` in `apps/web/package.json`
  (required by Vite) — added by `vinext init`.

## 3. Versions

- vinext **1.0.0-beta.12** (+ @vinext/cloudflare 1.0.0-beta.10,
  react-server-dom-webpack ^19.3.0)
- wrangler **4.141.0**, @cloudflare/vite-plugin ^1.60.2, vite ^8.3.1
- react/react-dom upgraded **19.1.0 → 19.3.0** (vinext requirement for
  RSC-on-Vite; Next 15.3 peer-compatible — `next build` and `next dev` still
  pass with 19.3.0).
- pnpm 11.22.0 (unchanged, via corepack), node ≥ 20.

## 4. Generated configuration (source of truth)

Created by `vinext init --platform=cloudflare` inside **apps/web**:

- `apps/web/wrangler.jsonc` — Worker `web`, `main: vinext/server/fetch-handler`,
  `compatibility_date: 2026-09-27`, `nodejs_compat`, static assets from
  `dist/client` (binding ASSETS), Images binding.
- `apps/web/vite.config.ts` — vinext plugin + images optimizer + the
  Cloudflare Vite plugin (rsc environment with ssr child).
- `apps/web/.gitignore` — `dist/`, `.vinext/`, `.wrangler/`.
- `pnpm-workspace.yaml` — `allowBuilds` completed with real values:
  `esbuild: true`, `workerd: true` (vinext wrote placeholders; both build
  scripts are required by the Vite/Wrangler toolchain; `sharp: false` kept).

## 5. Package scripts (apps/web)

Added by init — existing `dev`, `build`, `start`, `check` untouched:

| script | command | purpose |
|---|---|---|
| `dev:vinext` | `vinext dev --port 3001` | vinext dev server |
| `build:vinext` | `vinext build` | Workers production build (5-phase Vite build; output in `dist/`) |
| `start:vinext` | `wrangler dev --config dist/server/wrangler.json` | local Workers preview (**http://127.0.0.1:8787**) |
| `deploy:vinext` | `vinext-cloudflare deploy --config dist/server/wrangler.json` | real deployment |

## 6. Monorepo / workspace handling (the actual fix)

- `@ideaven/ui = workspace:*` **remains exactly as-is** — no duplication, no
  version substitution, no flattening. `pnpm install` from the repository
  root works and resolves the workspace package.
- The Cloudflare build failure was npm running framework detection; with the
  explicit `wrangler.jsonc` + generated scripts, the deploy path never runs
  npm detection again.
- Cloudflare Workers Builds dashboard settings (Phase 1B dashboard step):
  - Repository `SulaimanTrid/ideaven-landing`, branch `main`
  - **Root Directory: `apps/web`**
  - Deploy command: **`pnpm run deploy:vinext`** (or the dashboard's
    install+build using the generated scripts)
  - No framework-detection overrides.

## 7. Environment variables

No invented backend values. The Worker build carries only the existing
`NEXT_PUBLIC_*` values from `.env.local` (they surface as Worker vars:
`NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_URL` — visible in `wrangler dev`).
No `DATABASE_URL`/`SESSION_SECRET`/`API_*` were added — the Go API is a
separate future phase, so **authenticated actions do not work on the Workers
deployment yet** and are not faked.

## 8. Vercel relationship

Vercel stays the primary/working deployment (`vercel.json` untouched;
`next dev`/`next build` verified green after the change). Cloudflare is an
additional target. Rollback = stop using the Cloudflare dashboard deployment;
nothing in the Vercel path was modified (the only shared-file change is
`package.json`, whose `next build` is verified).

## 9. Verification performed (local, honest)

- `pnpm dlx vinext check` → 87%, no blockers (recorded above).
- `pnpm install` (root) → clean; esbuild/workerd build scripts ran.
- `pnpm --filter @ideaven/web check` (tsc) → clean.
- `pnpm --filter @ideaven/web build:vinext` → exit 0, all 32 routes built.
- `pnpm --filter @ideaven/web start:vinext` → Workers preview on
  http://127.0.0.1:8787; browser verification (`scripts/verify-cf-preview.mjs`)
  **12/12**: landing/login/register/pricing/explore/docs render (HTTP 200 with
  expected content), header navigation (login/community/pricing/start),
  builder route without backend does not hard-crash, ZERO pageerror and ZERO
  hydration/rendering console errors. The only console errors are
  `ERR_CONNECTION_REFUSED` toward the API — expected, the backend is
  intentionally not deployed for the Worker (documented, not faked).
- `npx wrangler deploy --dry-run --config dist/server/wrangler.json` → exit 0
  (202 modules, bindings ASSETS + IMAGES + NEXT_PUBLIC_* resolved).
- Real `deploy:vinext` was NOT run (no Cloudflare authentication on this
  machine) — dashboard deploy pending, see checklist below.
- Full regression after the change: 15 E2E suites green (3d-character-
  controller 35, 3d-material-lighting 42, 3d-transform-gizmos 34, 3d-physics
  24, 3d-foundation 18, 3d-hierarchy 17, tilemap 44, input-actions 32, camera
  34, 2d-particles 22, state-machine 20, 2d-lighting 19, explore-sprite 18,
  gameplay 21, sorting 19, motion 11), `tsc` clean, `go vet` clean,
  `go test` 11/11 packages, `next build` exit 0.

## 10. Acceptance checklist (dashboard deploy)

1. [ ] GitHub push contains this commit
2. [ ] Cloudflare Workers Builds → repo `SulaimanTrid/ideaven-landing`, branch `main`, Root Directory `apps/web`
3. [ ] Install command: pnpm install (root) succeeds — `workspace:*` intact
4. [ ] Build: `pnpm run build:vinext` succeeds
5. [ ] Deploy command: `pnpm run deploy:vinext` succeeds (no auto-detection — wrangler.jsonc is explicit)
6. [ ] workers.dev URL opens
7. [ ] Landing page renders
8. [ ] /login renders
9. [ ] /register renders
10. [ ] Builder route responds (login fallback — API not connected)
11. [ ] 3D UI chunks present (builder bundle includes the 3D engine)
12. [ ] No `EUNSUPPORTEDPROTOCOL workspace:*` error
13. [ ] No automatic framework detection error
14. [ ] No new console errors beyond API-connection refusals

## 11. Known limitations

- The Workers deployment has NO backend: login/register/API calls fail with
  connection errors until the Go API is deployed (Phase 2, separate task).
  Pages render; authenticated flows intentionally do not work yet.
- vinext is 1.0.0-beta — route classification is static-analysis-based
  (cosmetic build log only).
- `next/font/google` fonts come from the CDN (not self-hosted).
- Worker name is `web` (generated from the package name).

## 12. Rollback procedure

1. In the Cloudflare dashboard, disable/delete the Workers Builds application
   (or pause deploys) — the Worker `web` can also be deleted outright.
2. Vercel remains untouched and authoritative — no rollback needed there.
3. To remove the Cloudflare path from the repo: delete `apps/web/wrangler.jsonc`,
   `apps/web/vite.config.ts`, the vinext scripts from `apps/web/package.json`,
   the vinext/wrangler/vite devDependencies, revert `pnpm-workspace.yaml`
   allowBuilds to `sharp: false` only, and remove `"type": "module"` — then
   `pnpm install` and verify `next build`.
