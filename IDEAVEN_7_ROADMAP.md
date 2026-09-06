# IDEAVEN 7.0 — Roadmap (Phases 7A–7W, M0–M429)

Status: ✅ · ◐ · ⬜ (same rules as prior roadmaps; one phase per run, STOP +
report per M408–M409; no false completion per M425). **Dependency column
shows which 4/5/6 backlog must land first** — 7.0 phases wrap that backlog
rather than re-implement it.

| Phase | Scope (7.0 §407) | Status | Depends on | Key new work in 7.0 terms |
|---|---|---|---|---|
| 7A | Universal Project + Ecosystem Architecture | ◐ (slice 1 ✅) | — | M0 docs; **Project Intent + Project Brain** (M11, M371); universal project `type` extension (M7); knowledge base start (M13) |
| 7B | Universal Knowledge / Graph | ⬜ | 5B context engine, 4.0 M2 graph | knowledge index over model+docs+history; semantic queries (M43); "why/what-if/where/how/when/who" (M381–386); evidence-first answers |
| 7C | Project Brain | ◐ (Brain tab in 7A) | 5.0 intelligence | brain dashboard completeness: rules, understanding, AI actions, corrections |
| 7D | Universal Intelligence | ⬜ | 5C–5E agent/sandbox | roles (M16), orchestrator (M17), autonomy levels (M18), multi-solution (M22) |
| 7E | Cross-Layer Debugging | ⬜ | 5E change engine, runtime | trace UI→event→block→code→service→DB; root-cause with evidence (M30–33) |
| 7F | Universal Testing / QA | ⬜ | 5F test generator | test matrix (M36), AI self-verification pipeline UI (M37) |
| 7G | Project Evolution / Tech Debt | ⬜ | 5H, versions | evolution engine (M27), debt intelligence (M28), safe refactoring (M29), legacy mode (M209) |
| 7H | Universal Runtime / Game / App | ⬜ | 6D runtime, 2.0 blocks | runtime abstraction targets, game engine experience (M67), companion (M77) |
| 7I | Cloud + Deployment Integration | ⬜ | 6C/6D | release pipeline (M85–91), build farm integration (M92–93) |
| 7J | Universal Collaboration | ⬜ | 6B | shared canonical project (M96–97), review flows (M98–100) |
| 7K | Creator Identity | ⬜ | 6F | unified profile/portfolio/badges (M108–111, M232–236) |
| 7L | Education | ⬜ | 6H | learning network, project-based education (M104–107, M251–256) |
| 7M | Community | ⬜ | 6B/6G | forums→project/learning/extension links (M118–122, M207–210) |
| 7N | Marketplace | ⬜ | 6G | categories, trust graph (M123–128, M238) |
| 7O | Creator Economy | ⬜ | 6G/6I (commerce locked) | orders/refunds/payouts (M129–135, M299–301) |
| 7P | Globalization | ⬜ | **4.0 M38 i18n layer** | localized discovery/docs/AI answers (M143–146, M243–250) |
| 7Q | Security / Privacy / Governance | ◐ | 6M | policy engine (M177), audit log (M178), tenant isolation (M173), privacy center (M172, M310) |
| 7R | Resilience / Disaster Recovery | ⬜ | 6K | backups + restore drills (M197–200), status/incident system (M179–180) |
| 7S | Performance / Global Scale | ⬜ | 6K | job system (M185–188), editor responsiveness (M271–277), CDN (M195) |
| 7T | Unified Product UX | ◐ (command center ✅) | theme system | command center (M44, M263), mode system (M58), adaptive workspaces (M266–270), landing as Universe front door (M152–156) |
| 7U | Final Ecosystem Integration | ⬜ | all above | ecosystem graph UI (M115–117), universal next action (M161, M390), readiness (M213) |
| 7V | Full Regression | ⬜ | 5N/6O suites | M410–412 journey + failure audits |
| 7W | Production Readiness | ⬜ | all | M413–426 performance/security/privacy/a11y/localization/reliability/coherence/truthfulness reviews |

## Phase 7A status detail (M0 + slice 1 complete — session 20)

- ✅ M0 — the three 7.0 documents (this file, ARCHITECTURE, DECISIONS).
- ✅ 7A slice 1: **Project Intent** (migration `016_project_intent`,
  owner-scoped GET/PUT with upsert semantics, length caps, `TestProjectIntent`
  covering round-trip/overwrite/foreign-404/anonymous-401) + **intent → AI
  planner injection** (ownership-enforced JOIN, "Project intent:" section in
  every plan message next to Project Memory) + **Project Brain tab**
  (Insights → Brain: editable intent form with saved-state feedback,
  read-back after reload verified in browser, zero console errors).
- Fixed en route: intent GET/PUT were initially two `route()` calls on one
  path — the known mux duplicate-fallback panic; now one `routeMethods`.
- ✅ 7A slice 2 (session 21): **universal project types** (M7) — migration
  `017_project_types` replaces the check constraint with the 10-type
  vocabulary; server create+model validation share one `typeVocabulary`;
  `ProjectType` union + `projectTypeLabel()` collapse every binary
  App/Game ternary across cards/explore/public pages/builder; creation
  flow gains "More kinds" chips and an honest no-templates empty state;
  explore filters cover all types; `TestUniversalProjectTypes` green and
  the old tests' "website"-as-invalid fixtures updated; browser E2E
  creates a Website project through the guided flow (chip → blank →
  builder) with correct labels.
- ✅ Command Center (M44/M263, lands under 7T): global Ctrl+K palette
  (`components/command-palette/command-palette.tsx`) mounted in the
  dashboard layout and the builder — navigation commands, project search
  with Enter-to-open, builder-context commands (mode switches, panels,
  Ask AI), theme toggle, full keyboard model (↑/↓/Enter/Esc). Browser
  verified end-to-end with zero console errors.
- ⬜ 7A remainder: knowledge-base starter, DNA identity fields fed by
  intent.
