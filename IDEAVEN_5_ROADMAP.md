# IDEAVEN 5.0 — Roadmap (Phases 5A–5O, M0–M256)

Status: ✅ done · ◐ partial base · ⬜ not started. One phase at a time;
STOP + phase report (M254) after each. Sources of truth are listed in
`IDEAVEN_5_ARCHITECTURE.md` §1 — nothing here may fork them.

| Phase | Scope | Status | Reusable base | Key new work |
|---|---|---|---|---|
| 5A | M0–M5 Architecture + Project Intelligence | ✅ | 4.0 audit, intelligence.go, dna.go, graph.ts, Project Map, DnaView | M0 docs (this file + ARCHITECTURE); M3 delta (map search/filter); **M5 Project Memory** (table+API+UI+planner consumption) |
| 5B | M6–M8 Context Engine | ✅ core (session 34) | Ask AI context assembly, diagnostics seeding | **`internal/ai/context_engine.go`: ranked/budgeted/sanitized/deterministic assembly (24k-char budget, priority+relevance ranking, secret redaction, injection neutralization, data-only delimiters) — 7 engine tests green**; memory confirmation UX remains |
| 5C | M9–M18 AI Project Agent | ◐ | plan/preview/apply pipeline, credits, preview UI | tool layer + action classification/risk gating, plan doc (goal/assumptions/risks), universal change preview, sandbox, multi-solution |
| 5D | M19–M27 Multi-Agent | ⬜ | AI provider adapter (mockable), router hooks | roles as planners over one model, handoff artifacts, review, confidence, safe mode, budget/cost, routing/fallback/validation |
| 5E | M28–M39 Change Engine + Sandbox | ◐ | AIOperation validator, versioning, graph | structured op expansion, transactional apply, impact analysis, breakage prediction, time machine UX, session history, branches, smart merge, conflict UI, regression detection |
| 5F | M40–M52 Automated QA + Health | ◐ | runtime interpreter, intelligence/dna, diagnostics | test generator + coverage map + prioritization + failure explainer, self-check pipeline, health engine + history + guardian, perf/security/a11y/doc reviewers |
| 5G | M53–M60 Learning + Explainability | ◐ | Learn pages, Ask AI explain, DnaView | project explainer (levels), teach-me, learning modes, personalization |
| 5H | M61–M79 Architecture + Tech Debt | ◐ | graph, intelligence, AI | UX journey review, visual regression, design consistency, reuse/duplicate/unused analysis, debt center, refactor planner + safe refactoring, rule/policy engine, team permissions, audit log, explainability, failure recovery, partial-failure, workflow templates |
| 5I | M80–M100 Universal Intelligence UX | ◐ | health center patterns, Insights | review mode + priority engine + next action, contextual help, universal explain, evidence-first answers, doc sync, context export, privacy/redaction/injection defenses, tool permission boundary |
| 5J | M101–M120 Security + Governance | ◐ | owner-scoping patterns, rate limits, isolation | autonomy levels, guardrails, env separation, action diff history, idempotency, duplicate prevention, cache/incremental, semantic/symbol search, timeline, causal analysis, decision log |
| 5K | M121–M145 Project Evolution | ⬜ | versions/restore | ADR support, debt roadmap, refactor queue, evolution view, feature lifecycle, deprecation + migration assistant, compatibility, onboarding/tour, notifications, assistant home, daily/team summary, review requests, entity review assistants, action history UI, risk gating, recovery-first, safe delete |
| 5L | M146–M180 AI Reliability + Cost | ◐ | credits ledger, usage records | **duplicate-command prevention shipped (session 34: 60s idempotency dedupe — retries never double-burn credits; 3 tests)**; remaining: loop detection, quality metrics, fallback models |
| 5M | M181–M219 Scalability + Observability | ◐ | slog, build logs | observability, error correlation, job queue, background analysis, index status, caching, DB integrity, backward compat, schema versioning, retention, export, deletion, privacy boundary, security audit, isolation, rate limits, authorization, audit trail, Intelligence Center + Brain panel |
| 5N | M220–M231 Testing + Documentation | ◐ | Go suites, Playwright harness | tests for graph/dna/memory/context/permissions/preview/sandbox/ops/rollback/impact/health/search/history, fixtures, mocks, e2e AI flows, security tests, regression, browser+visual QA, docs (ARCHITECTURE/AI_MODEL/SECURITY/DECISIONS, dev+user), feature flags |
| 5O | M232–M252 Metrics + Final Audit | ⬜ | usage records | observability dashboard, product metrics, value measurement, cost efficiency, model-agnostic, fallback UX, final journeys + failure journeys, architecture/SoT/data-flow audits, trust review, quality bar, completion criteria |

## Phase rule (M253–M255)

Per phase: inspect relevant code → short plan → implement → test → verify →
update STATUS.md + this roadmap → **STOP and report** (phase, status,
implemented, reused, files, tests, build, browser verification, known
issues, next phase). Stop immediately on: unclear architecture, risky
migration, uncertain security boundary, duplication of core systems, or a
major regression.

## Phase 5A status detail (complete — session 18)

- ✅ M0 — `IDEAVEN_5_ARCHITECTURE.md` + this file.
- ✅ M1/M2/M4 — delivered previously (intelligence core, graph layer, DNA);
  deltas recorded in ARCHITECTURE §2–§3.
- ✅ M3 — Project map gained search + kind filters (component/handler/
  variable/asset/extension chips); browser-verified (search "button" hides
  unrelated rows; asset filter isolates assets).
- ✅ M5 — Project Memory: migration `014_project_memory`; service CRUD with
  closed categories, 500-char limit, 50-rules cap, owner-check on every
  path (`TestProjectMemory` green: lifecycle, validation, foreign 404,
  anonymous 401); routes GET/POST `/api/projects/{id}/memory` + DELETE
  `…/memory/{memoryId}`; the AI command handler now loads the caller's
  rules (ownership-enforced JOIN) and injects them into every plan message
  ("Project rules (must be respected)"); Insights **Memory** tab
  (`memory-panel.tsx`) with add form, category chips, delete, and the
  spec's empty state. Browser-verified: seed rule visible, UI add + delete
  live, zero console errors.
