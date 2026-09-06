# IDEAVEN 4.0 — Architecture Audit (M0)

Audited on the live machine at `~/Downloads/Projek IDEAVEN/ideaven-landing-v1`
(the spec's `/home/parrot/Ideaven` does not exist here; this is the same
project, developed through 16 sessions — see `docs/STATUS.md`).

## 1. Current stack

- **Monorepo** pnpm workspaces: `apps/web`, `apps/api`, `packages/ui`, `packages/config`.
- **Web**: Next.js 15 App Router, React 19, Tailwind v4 (`@theme inline` +
  runtime CSS vars), TypeScript strict. Node 22 (local toolchain in
  `~/.local/opt/node-v22.14.0-linux-x64`).
- **API**: Go (stdlib `net/http` ServeMux + pgx/v5), PostgreSQL 16.4
  (portable install `~/.local/opt/pg`, cluster `~/.local/opt/pgdata`,
  dev DB `ideaven`, test DBs per suite).
- **Toolchains**: no sudo machine — Node/Go/pnpm/PG all user-local.
- **Migrations**: 13 SQL files (users → sessions → auth tokens → profile →
  projects → ai_usage → assets → project_versions → version origin →
  credit grants → publications → extensions → extension_installs), embedded.

## 2. Current architecture

- **API** (`apps/api/internal`): `auth` (sessions, email verify, reset,
  rate-limited login/email), `user`, `project` (library + canonical model +
  versioning + publish/remix + templates + intelligence), `asset` (upload,
  mime/size validation, per-project storage), `ai` (ask/plan/preview/apply
  changesets + credit ledger), `extension` (manifest v1 + registry + AIX
  build via isolated worker `cmd/extbuild`), `build`, `server` (routing,
  47 route registrations), `middleware` (origin guard, security headers),
  `httpx` (JSON envelope, `DisallowUnknownFields` decoding), `config`.
- **Web** (`apps/web/src/app`): 28 routes — landing, auth (login/register/
  verify/reset), dashboard (+ projects, new, templates, extensions),
  builder `[id]` (5 modes), explore, `/p/[slug]` public project,
  creators `[username]`, community, learn (+ `[slug]`), docs, pricing,
  profile, settings (account/security/appearance), start, privacy, terms.
- **Builder modes**: Design (canvas + inspector + palette), Blocks (IR
  block programs), Code (TS codegen + source map), Preview (in-browser
  runtime interpreter), Insights (M1 intelligence).
- **Panels**: Ask AI (plan/preview/apply), Assets, History (versions),
  Diagnostics (client validator with Fix-with-AI).

## 3. Canonical project model (source of truth)

`apps/api/internal/project/model.go` — JSONB `Model v1`:
`schemaVersion / type / settings / screens[] (components tree, styles,
logic.handlers[] (event → block body), code?) / navigation / variables /
assets`. Block IR: 5 statement + 6 expression defs, inputs/slots/children/
elseChildren. All consumers (canvas, blocks, codegen, interpreter,
diagnostics, intelligence, AI operations) share this one IR; codegen is
deterministic with a block↔line source map; custom screen `code` is
authoritative and never overwritten.

## 4. Completed systems (real, verified)

| System | State |
|---|---|
| Auth + sessions + email verify + reset + rate limits | done, tested |
| Project library CRUD, archive, duplicate, templates | done, tested |
| Model editing with server-side version history (20 versions, origin labels, restore) | done, tested |
| Blocks IR + deterministic codegen + runtime interpreter + source map | done, tested |
| Preview runtime (in-browser) with state seeded from model | done |
| AI ask/plan/preview/apply over a closed operation vocabulary + credit ledger + usage tracking | done, tested |
| Asset upload/validation/storage + builder Assets panel | done, tested |
| Publishing: public pages, explore gallery, creator pages, remix, public stats | done, tested |
| Extensions: manifest v1, CRUD, publish, isolated AIX build worker (zip + sha256 + verify), install registry | done, tested |
| Export: standalone HTML bundle + Android source project (with GitHub Actions APK workflow inside the export) | done |
| Theme: dark/light/system, anti-flash bootstrap, persisted | done |
| Project Intelligence (4.0 M1): server report + builder Insights mode | done this session |

## 5. Partially implemented systems

- **Community** = honest aggregation over real publications (no forums/
  comments backend yet). **Learn/Docs** = static content pages.
- **Health**: Insights mode is the builder-level health center; no
  dashboard-level Health Center view yet.
- **Simulator**: preview renders in a frame; no device presets/orientation.
- **Marketplace**: extension registry + install + trust labels exist;
  discovery categories, ratings, commerce do not.
- **Observability**: slog request logs, build logs; no counters/metrics.
- **A11y/Perf/Security centers**: only the signals inside M1's report.

## 6. Technical debt / known bugs

- `scripts/e2e-projects.ps1` is a Windows-era artifact (PowerShell) — the
  Linux browser verification path is currently ad-hoc (Playwright in
  `/tmp/iv-pw`, not committed).
- No frontend unit-test layer (only Go integration tests + `tsc`).
- In-memory rate limiting (per-process, resets on restart).
- `/terms` and `/privacy` use the placeholder-page shell (real text,
  minimal layout).
- Production serving story: `next build` verified, but the machine runs
  `next dev`; the API runs via `go run` (no built binary/service).

## 7. Architecture risks

1. **`.next` collision**: running `next build` while `next dev` serves the
   same directory corrupts chunks (caused a real user-visible 500 once).
   Documented rule: never build while dev runs.
2. **Single PostgreSQL, no backups/restore drill** (4.0 §127/128 gap).
3. **No CI** — validation is a manual three-step (go test, tsc, build).
4. **Extension worker isolation** is process-level only (separate binary,
   no network/FS sandbox) — acceptable today, must be hardened before
   public marketplace.
5. **AI provider** sits behind an adapter in `internal/ai` (mock for
   tests); no model routing/cost tiers yet.

## 8. Synchronization model

Client edits the model → debounced `PUT /api/projects/{id}/model` with
origin label → server snapshots a version (20 kept). Panels read the same
in-memory model via `builder-context`; no offline queue, no multi-user
sync (single-writer per project).

## 9. AI integration today

Ask AI: plan (explanation + `AIOperation[]`) → client preview (proposal
UI) → apply (one undoable commit, server-validated closed vocabulary) →
re-validate. Credits metered per action; usage recorded. Diagnostics panel
has Fix-with-AI (errors seeded into the request). This is the base for
4.0's M6 Project Agent (roles, multi-step plans, sandbox) and M7 (rich
diffs, apply-selected).

## 10. Build/export infrastructure today

- Web export: self-contained HTML bundle of the project runtime.
- Android export: complete source project + GitHub Actions workflow that
  builds a debug APK (no local Android SDK; documented honestly).
- Extensions: AIX pipeline with isolated `cmd/extbuild` worker — the
  in-repo precedent for 4.0's Build Farm workers.

## 11. Marketplace state

Installed-extension registry per user; publish/unpublish; manifest with
components/methods/events/blocks/docs/dependencies; AIX artifacts with
checksums. Missing: discovery categories, ratings/reviews, quality
signals, any paid flow (credits ledger exists but no payment provider —
pricing page states this honestly).

## 12. Localization / accessibility today

- **i18n: none** (hardcoded English UI strings; number/date formatting is
  locale-driven only). 4.0 M38 is a from-scratch build.
- **A11y**: focus-visible styles, aria labels on core controls, semantic
  landmarks; no systematic audit/regression suite yet.
