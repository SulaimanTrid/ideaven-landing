# IDEAVEN 4.0 — Roadmap (M0–M56)

Status legend: ✅ done (verified) · ◐ partial base exists · ⬜ not started.
"Base" = what the audit (`IDEAVEN_4_ARCHITECTURE_AUDIT.md`) already provides.
One milestone at a time; STOP + checkpoint report after each.

| M | Milestone | Status | Reusable base | Key new work | Depends |
|---|---|---|---|---|---|
| M0 | Architecture Audit | ✅ this session | STATUS.md sessions 1–16 | IDEAVEN_4_ARCHITECTURE_AUDIT.md | — |
| M1 | Core Project Intelligence | ✅ delivered (3.0 M1) | canonical model, block walker | — (kept: report + Insights mode) | — |
| M2 | Project Graph | ✅ | M1 navigation edges, diagnostics walker | full graph layer (UI/logic/asset/extension/data) + Project Map UI with relationship inspector | M1 |
| M3 | Project DNA | ✅ | M1 report, templates metadata | derived DNA doc + UI tabs (purpose/architecture/conventions/health) | M1 |
| M4 | Project Memory | ✅ delivered (5.0 phase 5A, session 18) | AI request context assembly | per-project instruction store + planner consumption + UI | M6 |
| M5 | Command Palette + Universal Search | ✅ delivered (session 21 palette + session 34 in-builder universal search) | navigation routes, model tree | Ctrl+K palette (commands + search across project/dashboard) | — |
| M6 | AI Project Agent | ◐ | Ask AI plan/preview/apply pipeline | inspect/plan/test/validate/review loop, agent summary, roles | M1 |
| M7 | Change Preview | ◐ | AI proposal UI, one-commit apply | universal diff surfaces (tree/block/code), apply-selected | M6 |
| M8 | AI Sandbox | ⬜ | model versioning, restore | sandbox state + merge/discard flow | M6, M7 |
| M9 | Time Machine | ◐ | project_versions (20, origin, restore) | compare view, named snapshots, history timeline | M1 |
| M10 | Branching / Merge | ⬜ | version restore | beginner-friendly branches ("Try New UI"), merge w/ conflict paths | M9 |
| M11 | Local-first + Sync | ⬜ | debounced save, version snapshots | local state + sync engine + offline queue | M9 |
| M12 | Collaboration | ⬜ | sessions | presence, comments (entity-attached), roles/permissions | M11 |
| M13 | Design System Studio | ◐ | @ideaven/ui tokens, theme system | project-level token editor (colors/type/spacing/radius) | — |
| M14 | Adaptive UI / Modes | ◐ | builder modes, insights | beginner/advanced complexity levels, Focus/Debug/Learn/Studio modes | — |
| M15 | Simulator | ✅ delivered (TASK 11, session 33) | preview-mode runtime | device presets, orientation, offline sim, labeled limitations | — |
| M16 | Tests / Test Generator | ⬜ | runtime interpreter, diagnostics | deterministic navigation/interaction runs in preview sandbox + generated test artifacts | M15 |
| M17 | Health Center | ◐ | M1 report + Insights UI | dashboard health center (root cause, affected objects, suggested fix) | M1 |
| M18 | Performance Doctor | ◐ | M1 performance signals, asset sizes | suggestions + preview/apply | M1 |
| M19 | Security Center | ◐ | M1 security signals, upload validation | findings model (info→critical), review workflow | M1 |
| M20 | Accessibility Center | ◐ | M1 a11y issues, diagnostics | review/explain/fix loop | M1 |
| M21 | Backend Cloud Studio | ⬜ | Go API patterns | project-scoped API/DB/auth/storage/jobs | M22, M23 |
| M22 | Database Builder | ⬜ | migrations discipline (in-repo precedent) | visual entities/fields/relations + migration preview | M21 |
| M23 | API Builder | ⬜ | httpx envelope patterns | visual routes/params/validation + OpenAPI-ish docs + playground | M21 |
| M24 | Environment / Secrets | ⬜ | config env pattern | env manager (dev/staging/prod) + secrets storage (redacted logs) | M21 |
| M25 | Dependency Intelligence | ◐ | extension deps in manifest | conflict/compat reporting, unused detection | M1 |
| M26 | Extension Intelligence | ◐ | manifest v1 (components/methods/events/blocks/docs) | quality/doc/compat scores (honest, non-certification) | M1 |
| M27 | AIX Build Pipeline | ✅ core | cmd/extbuild isolated worker, zip+sha256+verify | test step in pipeline | — |
| M28 | Companion | ⬜ | preview runtime (web) | device app shell for live preview/debug | M15 |
| M29 | Game Director | ⬜ | AI changesets, game templates | structured game plan → approved artifacts | M6 |
| M30 | Asset Intelligence | ✅ delivered (session 34) | asset metadata (mime/size), M1 usage | dimensions/usage/memory tracking, optimization hints | M1 |
| M31 | Release Center | ⬜ | publish flow, versions | staged releases (dev→testing→beta→RC→prod) + validation gates | M16, M19 |
| M32 | Build Center | ◐ | HTML + Android export, GH Actions workflow | centralized multi-target build UI (honest platform claims) | M33 |
| M33 | Build Farm | ◐ pattern | extension isolated worker | queue + worker pool for app builds | M32 |
| M34 | Artifact Manager | ◐ | AIX artifacts (checksum, download) | general artifacts (platform, retention policy) | M33 |
| M35 | Project Monitoring | ⬜ | request slog | deployed-app monitoring hooks (opt-in, no PII) | M31 |
| M36 | AI Teaching | ◐ | Ask AI explanations, Learn pages | Explain/Teach-me/Why actions on generated changes + modes | M6 |
| M37 | Documentation 2.0 | ◐ | docs + learn static pages | progressive explanation levels, interactive playgrounds | M36 |
| M38 | Localization | ✅ minimum delivered (TASK 10, session 32: EN/ID, account→local→browser→EN, key-based, e2e-i18n-audit 26/26) | dictionary architecture | additional locales = data; deep panels expanding | — |
| M39 | Landing Product Experience | ✅ delivered (session 23) | real landing sections, live exports | genuinely representative live demo/playable game | M15 |
| M40 | Brand / Logo | ◐ | logo + consistent visual language | full identity kit + brand guidelines | — |
| M41 | Community 2.0 | ✅ core delivered (TASK 07, session 29) | community = publications aggregation | forums/threads/comments/reactions backend | — |
| M42 | Showcase / Remix / Discovery | ◐ | publish, explore, remix, creators | For You/Trending/New/Featured, attribution metadata | M41 |
| M43 | Creator Analytics | ◐ | public stats | per-project views/remixes dashboard (privacy-respecting) | M42 |
| M44 | Marketplace Foundation | ◐ | extension registry + installs | categories, reviews, listings UI | M41 |
| M45 | Marketplace Trust | ◐ | honest trust labels | verified/maintained signals (non-authoritative, labeled) | M44 |
| M46 | Paid Commerce Readiness | ⬜ | credits ledger | provider abstraction, webhooks, licenses — only with full checklist | M45 |
| M47 | Privacy Center | ◐ | visibility (private/unlisted/public), privacy page | AI access, analytics, telemetry, export, deletion controls | — |
| M48 | Organization / Teams | ⬜ | single-owner model | personal/team/school workspaces, least-privilege roles | M12 |
| M49 | Classroom Foundation | ⬜ | — | class/assignment/submission schema (architecture only) | M48 |
| M50 | Notification / Activity Center | ◐ | history panel, version origins | grouped notification center + activity feed | — |
| M51 | Performance Optimization | ◐ | modest bundles, tiny runtime | budgets, virtualization, image optimization | M11 |
| M52 | Accessibility Regression | ◐ | focus-visible, aria usage | keyboard/screen-reader regression pass | — |
| M53 | Security Hardening | ◐ | rate limits, origin guard, isolation, validation | full audit incl. extension worker sandbox review | — |
| M54 | Observability | ◐ | slog, build logs | error/latency counters, no PII | — |
| M55 | Final Product QA | ⬜ | all above | journey-based QA (7 journeys + failure journeys) | all |
| M56 | Production Readiness Audit | ⬜ | all above | full pass + recovery drills | all |

## M2 outcome (delivered + verified, session 17)

- `lib/project-model/graph.ts`: derived graph document — nodes
  (screen/component/handler/block/variable/asset/extension) + typed edges
  (contains/wires/navigates/writes/reads/uses-asset/provides) +
  `relationshipsOf()` grouped inspector queries.
- Builder → Insights → **Project map** tab (`project-map.tsx`): the Project
  tree (screens → components → handlers, Data, Assets, Extensions), and a
  relationship inspector answering the spec's questions ("wired by
  handlers", "written by", "used on", "provided by"). Rows with a builder
  home jump straight there (screen→Design, handler/block→Blocks).
- Verified in-browser: tree renders the real model; variable → "WRITTEN
  BY" → jump lands in Blocks; image component → "USES ASSET" (incl. ghost
  asset references); zero console errors; tsc clean.

## M3 outcome (delivered + verified, session 17)

- Server `GET /api/projects/{id}/dna` (owner-only, 404/401 tested):
  `internal/project/dna.go` — purpose (name/description/type/visibility),
  architecture (counts, component types, start screen, empty screens,
  navigation map), state (variables with real write/read counts), assets
  (usage counts + orphan detection), logic (events used), extension
  provenance (slugs from namespaced block types), and health that reuses
  the M1 intelligence pass so both reports always agree. Derived-only.
- Web: Insights gains a third tab **DNA** (`types/dna.ts`,
  `projectApi.dna`, `DnaView`) — purpose card, counts, architecture,
  variables with writes/reads, orphan assets flagged, events, extensions,
  health chips colored by level. Fetched lazily on first open.
- Verified: `TestProjectDNA` green (counts, usage, orphan, extension slug,
  health agreement, ownership 404/401) inside the 8/8 suite; live endpoint
  asserted against the fixture project; browser pass shows every section
  with zero console errors; tsc clean; production build green.

## Execution order (dependency-critical path)

M1 ✅ → **M2 Project Graph → M3 Project DNA → M6 AI Agent → M7 Change
Preview → M8 Sandbox → M9 Time Machine → M5 Palette/Search** (AI+context
core), then Health/Perf/A11y/Security centers (M17–M20), then platform
(M21–M24 backend studio), ecosystem (M25–M28, M30), release pipeline
(M31–M35), experience (M36–M43), foundations (M44–M50), hardening
(M51–M54), QA (M55–M56). Localization (M38) can start any time after M5.

## Milestone rule

Per milestone: inspect → plan → implement → test → browser verify → fix
regressions → document (STATUS.md + this roadmap) → **STOP and report**.
Never start the next milestone before the current one meets its bar.
