# IDEAVEN — Master Completion Matrix (1.0 → 7.0)

**Date:** 2026-09-13 · Verified against the actual implementation (files,
tests, browser runs — sessions 16–36 in `docs/STATUS.md`), not roadmap
checkmarks. Companion documents:
`docs/IDEAVEN_4_COMPLETION_AUDIT.md`, `docs/IDEAVEN_5_COMPLETION_AUDIT.md`,
`docs/IDEAVEN_6_COMPLETION_AUDIT.md`.

Status: **COMPLETE** · **PARTIAL** (gap named) · **FOUNDATION** ·
**MISSING**. Cross-version consistency is verified at the bottom — there is
exactly ONE of each core system (no forks).

---

## 1.0 — Foundation

| Milestone | Status | Evidence |
|---|---|---|
| Authentication (register/login/logout/verify/reset, hashed sessions, rate limits, origin guard) | COMPLETE | `internal/auth/*` + suite; every browser flow signs in |
| Profiles / settings / password change | COMPLETE | `PATCH /api/profile`, `credit-history`, appearance/security/account pages |
| Project system (CRUD, search, sort, archive, duplicate, ownership) | COMPLETE | `internal/project/*` + suites; dashboard library |
| Canonical Project Model (versioned, validated, migrated) | COMPLETE | `internal/project/model.go` (v1 + preview settings), validation everywhere |
| Persistence (model PUT, autosave, flush, retry, snapshots) | COMPLETE | `UpdateModel` + versions; autosave 1.5s + flush-on-hide |
| Dashboard (library, templates, wizard, empty states) | COMPLETE | dashboard pages; i18n'd |

## 2.0 — Product Systems

| Milestone | Status | Evidence |
|---|---|---|
| Extension registry + Studio (manifest/source/versions) | COMPLETE | `internal/extension/*`, extension-studio; source tab; guided errors |
| AIX build pipeline (isolated worker, sha256, logs, history) | COMPLETE (core) | `cmd/extbuild`, `019_extension_builds`, Build panel + SSE stream |
| Extension public shelf + install + palette integration | COMPLETE | public shelf, install flow, ⬡ palette section (session 24) |
| Visual blocks canvas (free workspace, park/attach, pointer DnD) | COMPLETE | `blocks-canvas/dnd/side`; scene-gameplay suite 21/21 |
| Block ↔ Code (codegen, source map, sync, custom-code preservation) | COMPLETE | `codegen.ts`, `code-sync.ts`; custom code never destroyed |
| Device preview + emulators | COMPLETE | TASK 11 universal ViewportFrame (14/14) |
| Theme system (light/dark/system) | COMPLETE | tokens + toggles everywhere |
| i18n EN/ID | COMPLETE (min) | TASK 10; audit 26/26; deep panels expanding |
| Community (channels/Q&A/votes/accept) | COMPLETE (core) | TASK 07; 30/30 |
| Landing playable demo (real physics + score) | COMPLETE | session 23 platformer |
| Asset Studio (sprite editor, layers, frames, PNG export) | COMPLETE | TASK 09; 25/25 |
| Project package portability (backup/import) | COMPLETE | 6J (session 36); round-trip test |
| Intelligence/Graph/DNA/Memory | COMPLETE | sessions 16–18 |
| Marketplace foundation | PARTIAL | public shelf + install; categories/reviews missing |
| Avatars | PARTIAL | external URLs only — asset-pipeline upload is a named gap |
| Accessibility | PARTIAL | focus-visible + aria on core flows; full WCAG pass pending |
| Responsive | PARTIAL | builder toolbars/panels adapted (0 overflow at 390 verified on studio/community); deep editor mobile UX continues |

## 3.0 — Creation OS (M1–M30)

| Milestone | Status |
|---|---|
| M1 Intelligence — COMPLETE (Insights) | M2 AI Agent — PARTIAL (plan/preview/apply/validate; apply-selected gap) |
| M3 Time Machine — PARTIAL (auto versions+restore; compare/named snapshots gap) | M4 Collaboration — MISSING |
| M5 Design System Studio — PARTIAL | M6 Simulator — COMPLETE (TASK 11) |
| M7 Test generator — PARTIAL (runtime covered by suites; in-product generator gap) | M8 Health Center — COMPLETE (core) |
| M9 Performance Doctor — PARTIAL (signals; doctor UI gap) | M10 Game Director — MISSING |
| M11 Asset Intelligence — COMPLETE (session 34) | M12 Dependency Intel — PARTIAL |
| M13–M30 remainder — PARTIAL/MISSING (documented in 4.0/5.0/6.0 audits which absorb them) |

3.0 was superseded by 4.0→7.0 milestones which absorb its backlog; its
unique items (M4 collaboration, M10 game director) remain the platform's
standing gaps.

## 4.0 — M0–M56 (see `IDEAVEN_4_COMPLETION_AUDIT.md`)

COMPLETE: M0–M5, M15, M27-core, M30, M38-min, M39, M41-core (12).
PARTIAL (named gaps): M6–M9, M11, M13–M14, M16–M20, M25–M26, M36–M37,
M42–M47, M51–M56. FOUNDATION: M8, M21–M24, M28, M31–M35, M46, M48–M50.
MISSING: M10 branching, M12 collaboration, M29 game director.

## 5.0 — 5A–5O (see `IDEAVEN_5_COMPLETION_AUDIT.md`)

COMPLETE: 5A, 5B (context engine core, this cycle), plus 5L dedupe.
PARTIAL (named gaps): 5C–5I, 5J, 5L remainder, 5M–5O.
MISSING: 5D multi-agent, 5K evolution.

## 6.0 — 6A–6O (see `IDEAVEN_6_COMPLETION_AUDIT.md`)

COMPLETE (core): 6A storage, 6F public pages, 6H i18n, 6I credits ledger,
6J package portability. PARTIAL (named gaps): 6D, 6E, 6G, 6K, 6L, 6M, 6N,
6O. MISSING: 6B collaboration/orgs, 6C backend studio.

## 7.0 — 7A–7W (verified against implementation; corrected where stale)

| Phase | Status | Note |
|---|---|---|
| 7A Universal Project + Intent/Brain | PARTIAL→COMPLETE (core) | Intent + Brain tab shipped (session 20); universal types shipped (session 21) |
| 7B Universal Knowledge/Graph | PARTIAL | graph.ts + map exist; semantic "why/what-if" queries missing |
| 7C Project Brain | PARTIAL (Brain tab exists) | corrections view gap |
| 7D Universal Intelligence (multi-agent) | MISSING | depends on 5C/5D |
| 7E Cross-Layer Debugging | PARTIAL | runtime trace (TASK 08) + diagnostics click-through exist; full chain trace missing |
| 7F Universal Testing | PARTIAL | suites + harnesses; in-product test matrix missing |
| 7G Evolution / Tech Debt | PARTIAL | orphan/duplicate detection exists; debt center missing |
| 7H Universal Runtime / Game | PARTIAL | 2D runtime real; 3D + companion missing |
| 7I Cloud + Deployment | FOUNDATION | honest exports + CI; no deploy farm |
| 7J Universal Collaboration | MISSING | (6B missing) |
| 7K Creator Identity | PARTIAL | creator pages + portfolio; badges missing |
| 7L Education | PARTIAL | learn pages; progress tracking missing |
| 7M Community | PARTIAL (core COMPLETE) | forums→links gap |
| 7N Marketplace | PARTIAL | foundation only; commerce locked |
| 7O Creator Economy | FOUNDATION | credits ledger; commerce locked per DEC-6.0 |
| 7P Globalization | PARTIAL (EN/ID COMPLETE) | more locales = data |
| 7Q Security/Privacy/Governance | PARTIAL | strong base; policy engine/audit UI missing |
| 7R Resilience / DR | MISSING | backups/drills need infra |
| 7S Performance / Global Scale | PARTIAL | budgets/bundles fine; job system/CDN missing |
| 7T Unified Product UX | PARTIAL→COMPLETE (command center) | adaptive workspaces gap |
| 7U Ecosystem Integration | MISSING | |
| 7V Full Regression | PARTIAL | 8 harnesses ~160 checks; consolidation gap |
| 7W Production Readiness | PARTIAL | deploy path exists; DR/monitoring missing |

---

## Cross-version consistency (verified)

ONE Project Model (`internal/project/model.go` ⇄ `types/project.ts`) · ONE
block IR (`blocks.ts` ⇄ `model.go`) · ONE runtime (`runtime.ts` +
export-runtime port) · ONE AI router (`internal/ai` provider adapter) · ONE
extension registry (`internal/extension`) · ONE theme system · ONE i18n
pipeline (`assembleContext` is the singular AI context builder — the old
one was removed) · ONE auth system. Duplicate-shell grep: the phone frame
exists only in `device-frame.tsx`, the game viewport only in
`viewport.tsx`. Dead legacy: `buildUserMessage` removed this cycle.
