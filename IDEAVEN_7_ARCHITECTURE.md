# IDEAVEN 7.0 — Architecture Audit (M0)

Audits the accumulated 4/5/6 state against the 7.0 "Universe" vision.
Machine path: `~/Downloads/Projek IDEAVEN/ideaven-landing-v1`. Companion
audits: 4.0/5.0/6.0 architecture docs (all current).

## 1. Where 4/5/6 actually stand (the honest baseline)

| Spec | Delivered | Remaining |
|---|---|---|
| 4.0 Creation OS | M0–M3 (audit, intelligence, graph, DNA) + 2.0 Phase 2 blocks canvas + AIX core | M4–M56 backlog (context engine, agent tools, sandbox, time machine UX, backend studio, build farm, i18n, …) |
| 5.0 Intelligent OS | M0 + Phase 5A (project memory + planner injection, map search/filter) | 5B–5O (context engine, agent, sandbox, multi-agent, change engine, QA/health, teaching, governance, observability, audits) |
| 6.0 Cloud Platform | M0 + 6A storage slice (adapter, sha256, ETag/immutable) | 6A remainder (avatars, sync) + 6B–6O (collab, backend studio, deploy, analytics, marketplace, i18n, billing, portability, reliability, discovery, security, UX, audits) |

Consequence: 7.0 phases largely *wrap* the 4/5/6 backlog. The 7.0 roadmap
must therefore carry those dependencies explicitly instead of pretending
the substrate exists.

## 2. Mapping existing systems → 7.0 core concepts (spec §2)

| 7.0 concept | State today |
|---|---|
| Project Model | ✅ canonical `Model v1` JSONB — the one truth (UI, blocks, codegen, runtime, AI, intelligence all consume it) |
| Project Graph | ✅ web `graph.ts` derived layer (UI/logic/data/asset/extension edges, stable IDs) |
| Project DNA | ✅ server `dna.go` + DnaView (M4/10 delta: "identity" fields like intent/creator/community are not yet in DNA) |
| Project Memory | ✅ `014_project_memory` + planner injection (M12 deltas: categories are 9 platform-defined, not yet game/platform/security splits — acceptable overlap) |
| Project Intelligence | ✅ intelligence.go + DNA + client diagnostics (spec §14 context engine = 5.0 M7, still pending) |
| Project Runtime | ◐ in-browser preview interpreter + HTML/Android exports (spec §60 runtime abstraction = 6D backlog) |
| Project Identity | ◐ publications + creators pages; no workspace/org identity (6B/6I) |
| Workspace | ⬜ not started (6B) |
| Creator | ◐ profile + publications + analytics-lite |
| Extension | ✅ manifest v1, AIX worker, registry, install, blocks into canvas |
| Artifact | ◐ AIX artifacts with checksums; build artifacts (6D/6H) pending |
| Release | ◐ publish flow; staged releases (6D M62–M63) pending |

## 3. Duplicate systems check (spec §2 forbid-list)

None introduced. Intelligence/DNA/graph are all derived-only views of the
one model; memory is its own store by design (user-authored rules, not a
model copy); storage adapter wraps assets without a second metadata model.
7.0 rule for the future: the Project Map/graph/knowledge base must extend
`graph.ts` + `intelligence.go`, never fork them.

## 4. Migration requirements identified for Phase 7A

- `016_project_intent.sql`: one row per project of structured intent
  (goal, audience, platforms, constraints, success criteria) — feeds AI
  planning (with memory), the Brain view, and later DNA identity fields.
- Universal project `type` (spec §7: app/game/website/backend/api/database/
  experience/extension/tool/educational) touches the wire contract
  (`type: "app"|"game"` in TS + templates + validation) — deferred to its
  own slice with a migration + compatibility pass, not bundled here.

## 5. Architectural blockers for Phase 7A

None critical. Standing honest limitations: no i18n layer (blocks 7P and
spec §143–146 until 4.0-M38 lands); single-writer projects (blocks 7J
until 6B); no deploy runtime (blocks 7I until 6D). None of these block the
Universal Project + Brain work in 7A.

## 6. First safe implementation milestone (Phase 7A slice 1)

**Project Intent + Project Brain**: store structured intent (M11), expose
it in a Project Brain surface (M371 — realized as the "Brain" tab inside
the existing Insights mode, reusing its shell rather than building a
competing page), and inject intent into AI planning context next to
Project Memory (spec §11: "AI and tools should reference Project Intent").
