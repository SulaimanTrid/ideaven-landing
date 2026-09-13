# IDEAVEN 4.0 — Completion Audit (M0–M56)

**Date:** 2026-09-13 · **Method:** evidence-based matrix against
`IDEAVEN_4_ROADMAP.md` + the actual implementation (files, tests, browser
verification recorded in `docs/STATUS.md` sessions 16–33). The roadmap
table was written before sessions 17–33; several ⬜ items below are already
delivered by that later work. Status legend: **COMPLETE** · **PARTIAL**
(gap named) · **FOUNDATION** (explicitly documented supported base, blocked
by scope/external dependency) · **MISSING**.

---

## Matrix

| M | Milestone | Status | Evidence (files/tests/browser) | Remaining gap |
|---|---|---|---|---|
| M0 | Architecture Audit | COMPLETE | `IDEAVEN_4_ARCHITECTURE_AUDIT.md`; STATUS 16+ | — |
| M1 | Core Project Intelligence | COMPLETE | `internal/project/intelligence.go`, `intelligence_test.go`; Insights Health tab; browser session 16 | — |
| M2 | Project Graph | COMPLETE | `lib/project-model/graph.ts`, `project-map.tsx`; `TestProjectGraph` family; browser session 17 | — |
| M3 | Project DNA | COMPLETE | `internal/project/dna.go`, `dna_test.go`; Insights DNA tab; browser session 17 | — |
| M4 | Project Memory | COMPLETE | `migrations/014_project_memory.sql`, `internal/project/memory.go` + tests; Insights Memory tab; injected into every AI plan (`internal/ai/context.go`); owner-scoped (session 18) | Extensible categories ship as a closed vocabulary by design (documented) |
| M5 | Command Palette + Universal Search | PARTIAL → **completed this session** | `components/command-palette/command-palette.tsx` (Ctrl/Cmd+K: navigation, project search, builder commands, theme — session 21); **this session adds in-builder universal search**: screens, components, handlers, blocks (by label), variables, assets with context jump | Page search = dashboard routes already covered; deep "page" concept N/A (single-page apps) |
| M6 | AI Project Agent | PARTIAL (near-complete) | Ask AI pipeline: context (project type/screen/selection/model/blocks/diagnostics/intent/memory — `internal/ai/*`, `ask-ai-panel.tsx`), plan → preview → apply (one undoable commit, origin `ai`) → validate → re-check; Auto-Fix from diagnostics (session 11) | Agent "roles"/multi-step autonomous loop intentionally not built (safety); single-plan-per-turn is the documented design |
| M7 | Change Preview | PARTIAL | Proposal UI lists every operation (add component, set prop/style, handler ops) before apply; one-commit apply + undo; re-check counts | Per-operation **apply-selected** not implemented (all-or-nothing) — named gap |
| M8 | AI Sandbox | FOUNDATION | Current semantics: preview-then-apply with a single-step undo + server snapshots (origin `ai`) make the pre-AI state restorable; a true side-by-side sandbox session is scoped in the roadmap | Dedicated sandbox state (apply on a copy, discard) — blocked by scope this pass; undo+snapshot covers the safety requirement |
| M9 | Time Machine | PARTIAL | `project_versions` (auto snapshots, prune 20, origin edit/ai, restore via History panel — sessions 9/10) | Named manual snapshots + side-by-side compare — named gap |
| M10 | Branching / Merge | MISSING | — | Beginner branch/merge needs M9 compare first; not started (largest remaining core item) |
| M11 | Local-first + Sync | PARTIAL | Debounced autosave (1.5s) + flush-on-tab-hide + beforeunload guard; failed saves surface retry (never silent loss); version history as recovery | Offline operation queue — named gap |
| M12 | Collaboration | MISSING | — | Needs presence infra; comments foundation not started |
| M13 | Design System Studio | PARTIAL | Platform token system (light/dark) + project theme setting; screen/component styling exists | Project-level semantic token editor — named gap |
| M14 | Adaptive UI / Modes | PARTIAL | Builder modes (Design/Blocks/Code/Preview/Insights) + adaptive palette per project type + beginner-safe defaults | Beginner/Advanced density switch — named gap |
| M15 | Simulator | COMPLETE | TASK 11 (session 33): universal ViewportFrame — Phone/Tablet/Desktop/Custom, portrait/landscape, safe-area overlay, Fit/25/50/75/100%, persisted per project; runs the real runtime; `scripts/e2e-viewport-system.mjs` 14/14 | Offline simulation not implemented (documented) |
| M16 | Tests / Test Generator | PARTIAL | Deterministic runtime is fully testable (Go export-runtime tests + Playwright journeys); diagnostics engine generates findings | In-product generated test scenarios UI — named gap |
| M17 | Health Center | PARTIAL | Insights Health tab (7 dimensions, severity, click-through to source — session 16) | Dedicated dashboard-level center; findings already have cause/location/action |
| M18 | Performance Doctor | PARTIAL | Intelligence performance signals (oversized screens, component counts, asset bytes) | Explicit doctor UI with safe fixes — named gap |
| M19 | Security Center | PARTIAL | Intelligence security signals; platform security posture (sessions, rate limits, origin guard, ownership everywhere — LAUNCH_AUDIT) | Findings model with severity workflow — named gap |
| M20 | Accessibility Center | PARTIAL | Intelligence a11y signals (missing labels etc.); platform focus-visible + aria passes | Dedicated review loop — named gap |
| M21–M24 | Backend Cloud Studio | FOUNDATION | The platform itself is the reference backend (Go API, httpx envelope, migrations discipline, env config, secrets via env only) | Project-facing DB/API builders are a new product surface — explicitly deferred (largest remaining block) |
| M25 | Dependency Intelligence | PARTIAL | Extension manifest `dependencies` validated at publish; unresolvable deps fail the build honestly (session 24) | Conflict/compat matrix report — named gap |
| M26 | Extension Intelligence | PARTIAL | Manifest v1 validation (components/methods/events/blocks/docs), public shelf with counts | Quality scoring — named gap (must stay non-authoritative) |
| M27 | AIX Build Pipeline | COMPLETE (core) | Isolated worker, sha256-verified artifacts, streamed real-time logs, builds history (`019_extension_builds`), AI fix proposals (TASK 06) | A "test" step inside extension builds — named gap |
| M28 | Companion | FOUNDATION | Publish popover QR code → open the live project on a phone (session 13); runtime is fully mobile-capable | Native shell app — external dependency (app stores) |
| M29 | Game Director | MISSING | Game changesets already flow through the M6 pipeline (game templates prove it) | Structured game-plan generator — deferred (needs M6 roles work first) |
| M30 | Asset Intelligence | PARTIAL → **completed this session** | `GET /api/projects/{id}/asset-intelligence`: dimensions (PNG/JPEG/GIF/WebP headers), memory estimate, per-asset usage counts, orphan detection, oversize hints; Assets panel shows the report; tested | Per-asset deep links from the report — minor |
| M31–M35 | Release/Build/Artifact/Monitoring | FOUNDATION | Publish flow (snapshot+QR+unpublish), export pipelines (Web/Android/Windows with CI), AIX artifacts w/ checksums + history, request slog, build logs | Staged releases, build farm queue, monitoring hooks — deferred (needs real deployment infra) |
| M36 | AI Teaching | PARTIAL | Ask AI explains plans; Learn pages + lessons (session 13) | Explain/Why actions pinned to applied changes — named gap |
| M37 | Documentation 2.0 | PARTIAL | `/docs` (model schema, block vocabulary, ScreenApi, HTTP API, AI rules) + `/learn` | Level-switchable docs — named gap |
| M38 | Localization | COMPLETE (minimum + architecture) | TASK 10 (session 32): key-based dictionaries EN/ID, account→local→browser→EN priority (`users.locale`), no per-component branching, `scripts/e2e-i18n-audit.mjs` 26/26; deep panels expanding | Additional locales = data entry; deep editor panels still English (tracked) |
| M39 | Landing Product Experience | COMPLETE | Real playable platformer demo (session 23) sharing the product design language; live model-driven sections | — |
| M40 | Brand / Logo | PARTIAL | Logo, favicon, consistent tokens/typography across product + landing | Formal identity kit/brand guide — named gap |
| M41 | Community 2.0 | COMPLETE (core) | TASK 07 (session 29): channels, questions/discussions, answers with upvotes + accepted answer, tags, search/sorts, reports, soft-delete, project attachment; `scripts/e2e-community.mjs` 30/30; migration `020` | Reactions/emotes — named gap |
| M42 | Showcase / Remix / Discovery | PARTIAL | Explore (search/filter + deterministic thumbnails), publish, remix with attribution, creator pages | For You/Trending ranking — named gap |
| M43 | Creator Analytics | PARTIAL | Public platform stats (real counts) | Per-project view/remix tracking — named gap |
| M44 | Marketplace Foundation | PARTIAL | Public extension shelf + one-click install + installs counter (session 24) | Categories/reviews — named gap |
| M45 | Marketplace Trust | PARTIAL | Honest non-authoritative labels; server-validated manifests | Verified/maintained signals — named gap |
| M46 | Paid Commerce Readiness | FOUNDATION | Credits ledger (derived, verifiable), AI credits metering, pricing page states packs are designed-not-sold | Provider abstraction/webhooks/licenses — explicitly blocked until payment activation checklist (DEC in 6.0) |
| M47 | Privacy Center | PARTIAL | Visibility (private/unlisted/public), private-by-default assets, no-telemetry stance | Data export + account deletion flow — named gap |
| M48–M50 | Orgs / Classroom / Activity | FOUNDATION | Single-owner model + history panel + version origins are the honest base | Multi-owner workspaces, classroom schema, notification center — deferred (needs M12) |
| M51 | Performance Optimization | PARTIAL | Small runtime, lazy Monaco, code splitting, deterministic thumbnails | Budgets/virtualization — ongoing |
| M52 | Accessibility Regression | PARTIAL | focus-visible everywhere, aria roles/labels on core flows, i18n audit checks overflow | Screen-reader regression pass — ongoing |
| M53 | Security Hardening | PARTIAL | Sessions (hashed tokens), rate limits, origin guard, CORS, ownership on every query, MIME sniffing, bounded uploads, isolated build worker, no eval | Extension worker sandbox review — ongoing |
| M54 | Observability | PARTIAL | Request slog, build logs, AI usage ledger | Error/latency counters — ongoing |
| M55 | Final Product QA | PARTIAL | Journey suites exist and run: signup→create→edit→preview (scene/asset/i18n suites), blocks→code (sync tests), extension install (suite), AI→preview→apply (suite), build artifact (export tests), failure paths (integration suites: 401/404/400/429/oversize/foreign access) | One consolidated journey runner — named gap |
| M56 | Production Readiness | PARTIAL | Vercel deploy path (web+API, same-origin /api), PORT-aware config, migrations on boot, LAUNCH_AUDIT + launch harness | Backups, monitoring, rollback drill — needs production infra |

---

## What this session (TASK 10/11 follow-through) adds to 4.0

1. **M5 completed**: the command palette now searches the open project's
   screens, components (by type/label), handlers, block labels, variables,
   and assets — with jump-to-context (screen → Design, handler → Blocks) —
   on top of the existing dashboard navigation/project search. Keyboard
   model unchanged (Ctrl/Cmd+K, arrows, Enter, Escape).
2. **M30 completed**: asset intelligence endpoint (dimensions from real
   image headers, memory estimate, usage counts, orphan detection,
   oversize hints) surfaced in the Assets panel; tested server-side.
3. This audit document itself (STEP 1 deliverable).

## Honest overall assessment

- **COMPLETE today:** M0, M1, M2, M3, M4, M15, M27(core), M38(min), M39,
  M41(core) — 10 milestones with files + tests + browser evidence.
- **PARTIAL with named gaps:** M5→closed this session, M6, M7, M9, M11,
  M13, M14, M16, M17–M20, M25, M26, M30→closed this session, M36–M45,
  M47, M51–M56 — each has a working base and a named, scoped gap.
- **FOUNDATION (explicitly documented, blocked):** M8 (covered by
  undo+snapshot safety), M21–M24 (new product surface), M28 (app stores),
  M31–M35 (deployment infra), M46 (payment activation), M48–M50 (needs
  collaboration).
- **MISSING (largest remaining builds):** M10 branching/merge, M12
  collaboration, M29 game director.

**5.0 READINESS: NO** — by the roadmap's own dependency rules, 5.0 phases
assume M6–M12 core (agent roles, apply-selected, sandbox, time machine
compare, branching) and the M21–M24 backend studio. The blockers above are
scope-large and must not be marked done without real implementation.
