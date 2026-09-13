# IDEAVEN 6.0 — Completion Audit (phases 6A–6O)

**Date:** 2026-09-13 · **Method:** evidence-based per-phase status against
`IDEAVEN_6_ROADMAP.md` / `IDEAVEN_6_ARCHITECTURE.md` / `IDEAVEN_6_DECISIONS.md`
+ the implementation (files, tests, browser evidence in `docs/STATUS.md`
sessions 16–35). Status: **COMPLETE** · **PARTIAL** (gap named) ·
**FOUNDATION** (explicitly documented supported base / externally blocked) ·
**MISSING**.

---

### 6A — Cloud Project Foundation — PARTIAL (storage core COMPLETE)
COMPLETE: `internal/storage/storage.go` (Adapter interface + LocalAdapter:
`.data/assets/<project>/<asset>` id-only paths, traversal guards,
temp-file+rename atomic writes, 0600/0700), migration `015_asset_storage`
(`assets.sha256`), strong ETag + 304, immutable caching split
public/private, upload MIME allow-list + 2MiB cap + 50-asset ceiling,
owner/public ACL split (published projects serve assets publicly) — all
tested (`TestAssetStorageAdapterAndETag` + asset suite). Project metadata
vs model vs assets vs artifacts are separate stores already. GAPS: build
artifacts/packages do not flow through the adapter yet; **avatar uploads
still reference external URLs only** (named gap).

### 6B — Collaboration + Organizations — MISSING (single-owner by design)
One owner per project, enforced everywhere. Workspaces/roles/presence/
comments are the largest missing block; server-enforced permission
patterns exist (ownership checks) as the base.

### 6C — Backend Cloud Studio — FOUNDATION (reference implementation exists)
The platform's own Go API (httpx envelope, migrations discipline, env
config, secrets via env only) is the honest reference base. Project-facing
DB/API builders not started (largest missing product surface).

### 6D — Deployment + Runtime — PARTIAL (honest)
Export pipelines ship ready-to-build projects + CI workflows (Web .html,
Android APK/AAB via GH Actions, Windows Electron) — "never fake binaries";
publish snapshots with public pages + QR; publish validation gates.
GAPS: no server-side build farm, no deploy/rollback/health-check pipeline
for built apps (requires real infra — DEC-6.0: no fake deployment).

### 6E — Analytics + Monitoring — PARTIAL
Real derived stats (`/api/public/stats`), `ai_usage` ledger
(per-user/project/model/chars/success), request slog, build logs. GAPS:
opt-in project usage analytics, release-linked error/perf telemetry.

### 6F — Public Projects + Creator — PARTIAL (core COMPLETE)
`/p/[slug]`: title, creator byline, type, description, live interactive
preview, remix (with attribution), share (QR), discussions; creator pages
with portfolio + counts; deterministic thumbnails. GAPS: license field on
projects; verified indicators (must stay non-authoritative).

### 6G — Marketplace Infrastructure — PARTIAL (foundation)
Extension registry (immutable versions, sha256 artifacts, build history),
public shelf with install + counts, guided errors; extension source tab.
GAPS: categories, reviews, moderation queue, template/asset/theme
listings. Commerce intentionally locked (DEC-6.0).

### 6H — Localization + Education — PARTIAL (localization core COMPLETE)
EN/ID key-based i18n with account→local→browser→EN priority + audit
harness (26/26) — TASK 10; `/learn` + 6 lessons + `/docs` reference.
GAPS: additional locales (data), learning progress tracking, interactive
examples.

### 6I — Billing + Organizations — PARTIAL (ledger COMPLETE)
AI credits: derived daily allowance (20), ledger-recorded usage
(per-user/project/model/chars/ok), gate before the provider, account
settings surfaces; payment explicitly not activated (honest pricing page).
GAPS: storage/build metering, provider abstraction/webhooks (M46 6.0
checklist), org billing.

### 6J — Integrations + Portability — PARTIAL → **completed this session**
NEW: **project package backup/restore** — `GET /api/projects/{id}/package`
streams a zip (`package.json` with schema/version/exportedAt, `model.json`,
`assets/<n>__<name>`) and `POST /api/projects/import` restores it as a new
owned project with assets re-uploaded through the validated asset path;
owner-scoped, tested (`TestProjectPackageRoundTrip`); Export menu +
Projects-page import UI. Existing: HTML/Android/Windows exports, project
duplicate, public JSON model. GAPS: public API keys/webhooks for external
integrations.

### 6K — Reliability + Infrastructure — PARTIAL
`/api/health`, graceful shutdown, request slog, build logs, ETag/304,
immutable cache, single-binary simplicity; the DB is PostgreSQL with
migration discipline. GAPS: queues, CDN/search infra, multi-tenant
deployment story (single-tenant by design today).

### 6L — Discovery + Ecosystem — PARTIAL
Explore with search/type filters + newest-first (real ordering only —
"no fake ranking" honored), public feeds for extensions, creator pages,
Community. GAPS: trending/featured require real usage signals (tracked
in M43) — deliberately absent rather than faked.

### 6M — Security + Governance — PARTIAL (strong base)
Sessions (hashed tokens), per-route rate limits, origin guard, CORS
allow-list, ownership on every query, MIME sniffing + size caps, isolated
extension build worker, no eval, LAUNCH_AUDIT P0-clean. GAPS: webhook
security (no webhooks yet), moderation tooling, audit-log UI.

### 6N — UX + Platform Polish — PARTIAL (major progress)
Unified design tokens (light/dark), i18n, one builder (5 modes + Insights
tabs), command palette, device/viewport system, asset studio, community —
one visual language. GAPS: deploy wizard (blocked by 6D), progressive
disclosure levels.

### 6O — Testing + Operations + Final Audit — PARTIAL
Go integration+unit suites (10 packages), 8 permanent Playwright harnesses
(~160 checks) covering journeys (signup→create→edit→preview, blocks→code,
extension install→use, AI plan→apply, build artifact, community, i18n,
viewport) + failure paths (401/404/400/429/oversize/foreign). GAPS: load
tests, recovery drills, consolidated journey runner.

---

## Bottom line

- **COMPLETE (core):** 6A storage core, 6F core, 6H localization core,
  6I credits ledger, **6J package portability (this session)**.
- **PARTIAL with named gaps:** 6D, 6E, 6G, 6K, 6L, 6M, 6N, 6O, and the
  remainder of 6A/6F/6H/6I.
- **MISSING:** 6B (collaboration/orgs), 6C (backend studio).

**7.0 READINESS: NO** — 7.0 phases (per `IDEAVEN_7_ROADMAP.md`) assume
6B collaboration/orgs and 6C backend studio; those are the two largest
remaining builds and are not fakeable. The DEC-6.0 locks (no fake
deployment/payment/commerce) remain honored.
