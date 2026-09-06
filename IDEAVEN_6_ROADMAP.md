# IDEAVEN 6.0 — Roadmap (Phases 6A–6O, M0–M354)

Status: ✅ done · ◐ partial · ⬜ not started. One phase per run; STOP +
phase report (M344) after each. Never mark cloud/database/deploy/billing/
marketplace complete on UI evidence alone (M345).

| Phase | Scope | Status | Base today | Key new work |
|---|---|---|---|---|
| 6A | M0–M12 Cloud Project Foundation | **◐ in progress** | projects CRUD/archive/versions/publish; upload validation; BYTEA assets; audience-scoped cache | M0 docs; **StorageAdapter + local backend (bytes → disk, lazy DB→file backfill)**; sha256 column + ETag/304 + long-immutable public caching; storage model split continues; avatars (M9) via asset pipeline; sync engine (M10–M12) |
| 6B | M13–M24 Collaboration + Organizations | ⬜ | single-owner projects; sessions | presence, comments (entity-targeted), roles/permissions, workspaces, activity |
| 6C | M25–M49 Backend Cloud Studio | ⬜ | platform auth/DB (not project-facing) | project-facing backend model: DB builder, API builder, functions, jobs, env, secrets |
| 6D | M50–M82 Deployment + Runtime | ⬜ | static exports only | runtime abstraction, deploy pipeline (validate→build→test→package→deploy→smoke), targets, domains, rollback — no fake deploy |
| 6E | M83–M90 Analytics + Monitoring | ⬜ | publication-level counters | project analytics, telemetry (opt-in), error↔release linking, perf monitoring/history |
| 6F | M91–M102 Public Projects + Creator | ◐ | /p/[slug], explore, creators, remix | richer public pages (screenshots/live preview/embed), licenses, portfolio, verification foundation |
| 6G | M103–M124 Marketplace Infrastructure | ◐ | extension registry/installs/trust labels | categories, versioning UX, dependency check, update manager, analytics, moderation — commerce locked (M113) |
| 6H | M125–M138 Localization + Education | ⬜ | no i18n; static Learn | i18n layer FIRST, then locale-aware formats, language profiles, classroom foundation |
| 6I | M139–M161 Billing + Organizations | ◐ | AI credits ledger | usage metering (storage/build/bandwidth), quotas, workspace billing foundation, privacy center, data export, account deletion |
| 6J | M162–M172 Integrations + Portability | ◐ | HTML/Android exports | public API foundation, webhooks, adapters, git mapping, project package + portability validator, backup/restore drills |
| 6K | M173–M194 Reliability + Infrastructure | ◐ | slog requests | reliability targets, status, observability/tracing/metrics/alerting, queues, tenant isolation, cache strategy, CDN, search infra |
| 6L | M195–M220 Discovery + Ecosystem | ◐ | explore, creators, extensions | ranking, recommendations, creator growth, ecosystem graph + project ecosystem page, extension lifecycle channels |
| 6M | M221–M267 Security + Governance | ◐ | owner-scoping, rate limits, isolation | file/URL access control, API auth audit, webhook/payment security, abuse prevention, moderation queue, audit logs, data consistency/repair, migration engine, canary |
| 6N | M268–M300 UX + Platform Polish | ◐ | theme system, responsive passes | progressive disclosure, cloud onboarding, deploy wizard, project home 6.0, command center, unified identity/portfolio, global discovery |
| 6O | M301–M342 Testing + Operations + Final Audit | ⬜ | Go suites, Playwright harness | journeys + failure journeys, security/privacy/cost reviews, load/job/backup/migration testing, ops docs, admin tools, final audit |

## Phase 6A status detail

- ✅ M0 — this file + `IDEAVEN_6_ARCHITECTURE.md` + `IDEAVEN_6_DECISIONS.md`.
- ✅ M1–M3 (verified existing): create/open/save/duplicate/archive/restore/
  version/snapshot all live and tested; storage split already separates
  metadata (projects), model (JSONB), assets (table+adapter), packages
  (files).
- ✅ M5+M6+M4 partial (delivered, session 19): `internal/storage.Adapter`
  (LocalAdapter under `.data/assets/<project>/<asset>`, ID-only paths with
  traversal guards, atomic writes, 0600/0700); migration `015_asset_storage`
  (sha256 column); upload computes+stores the hash and mirrors bytes to the
  adapter; reads try the adapter first with the DB row as fallback of
  record + lazy DB→disk backfill; delete removes both; ETag (sha256) with
  If-None-Match → 304; public caching upgraded to
  `public, max-age=31536000, immutable` (private stays
  `private…immutable` — audience split preserved).
- ⬜ Remaining in 6A: M8 image processing (deferred per DECISIONS-3),
  M9 avatars via the asset pipeline, M10–M12 sync engine (per DECISIONS-4),
  M7 re-verification pass.
