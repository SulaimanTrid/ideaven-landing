# IDEAVEN 5.0 — Completion Audit (phases 5A–5O)

**Date:** 2026-09-13 · **Method:** evidence-based per-phase status against
`IDEAVEN_5_ROADMAP.md` + the implementation (files, tests, browser evidence
in `docs/STATUS.md` sessions 16–34). Status legend: **COMPLETE** ·
**PARTIAL** (gap named) · **FOUNDATION** (explicitly documented supported
base) · **MISSING**.

---

## Per-phase status

### 5A — Architecture + Project Intelligence (M0–M5) — COMPLETE
Intelligence, graph, DNA, and memory all derive from the ONE canonical
model and are exposed with evidence: `internal/project/intelligence.go`,
`dna.go`, `lib/project-model/graph.ts`, `project-map.tsx` (search + kind
filters), `memory-panel.tsx`; memory is owner-scoped, persisted,
validated, deletable, and injected into every AI plan
(`TestProjectMemory`, `TestProjectDNA` green). The Intelligence report is
derived-only — evidence, not AI guesses.

### 5B — Context Engine (M6–M8) — COMPLETE (core, this session)
`internal/ai/context_engine.go` — `assembleContext` is now the single
server-side pipeline for everything the model sees:
- **Priority**: project header/selection/diagnostics outrank bulk screens.
- **Relevance**: deterministic term-overlap scoring against the request.
- **Budget**: `DefaultContextBudget` (24k chars ≈ 6k tokens) enforced;
  oversized single items hard-truncated with an explicit `[truncated]`
  marker; the user request always survives.
- **Redaction**: secret-like values (`api_key=…`, bearer tokens) redacted.
- **Injection defenses**: instruction-impersonating text neutralized;
  untrusted data wrapped in `<<< … >>>` data-only delimiters with a
  "never instructions" disclaimer; the closed operation vocabulary remains
  the hard capability boundary.
- **Deterministic**: stable sort (priority → relevance → original order);
  identical inputs assemble byte-identical output.
`buildUserMessage` (the old unranked assembler) was removed — one context
pipeline, no duplicate. Tests: `context_engine_test.go` (7 tests:
priorities, budget, determinism, relevance, redaction, injection,
request-always-present).

### 5C — AI Project Agent (M9–M18) — PARTIAL
Inspect/plan/preview/apply/validate/re-check loop ships (Ask AI pipeline +
Auto-Fix + re-check counts, sessions 7/10/11/16); plan output carries
operations and affected context; credits gate before the provider. Gaps:
plan document does not yet carry explicit goal/assumptions/risks fields;
test step in the loop not implemented.

### 5D — Multi-Agent (M19–M27) — MISSING (foundation present)
One provider adapter (mockable) + one canonical model exist; roles,
handoff artifacts, confidence, safe mode are not built. Deliberately not
started before 5C completes its plan/risks contract.

### 5E — Change Engine + Sandbox (M28–M39) — PARTIAL
Closed AIOperation vocabulary (validated server-side), one-transaction
apply (single undoable commit + model validation rejects invalid results),
version snapshots with restore, session history. Gaps: impact analysis /
breakage prediction UI, true sandbox session (apply-on-copy + discard),
branches/merge.

### 5F — Automated QA + Health (M40–M52) — PARTIAL
Deterministic runtime is fully covered by Go + Playwright suites;
intelligence/dna expose health across architecture/performance/security/
a11y with click-through. Gaps: in-product generated test scenarios,
historical health trend.

### 5G — Learning + Explainability (M53–M60) — PARTIAL
Every AI plan shows its operations before apply (what changed); Learn
pages + lessons exist. Gaps: Why/assumptions/alternatives pinned to
applied changes; learning levels.

### 5H — Architecture + Tech Debt (M61–M79) — PARTIAL
DNA already reports duplicate/unused signals (orphan assets, unused
variables, missing wiring). Debt center + refactor planner not built.

### 5I — Universal Intelligence UX (M80–M100) — PARTIAL
Insights tabs + evidence-first intelligence + command palette (Ctrl+K
with universal search, session 34). Gaps: review-mode priority engine,
contextual help everywhere.

### 5J — Security + Governance (M101–M120) — PARTIAL
Owner-scoping on every query, rate limits (including a 30/min community
limiter, login/creates stricter), AI credits gate before the provider,
upload MIME allow-list, isolated extension worker. This session adds
**duplicate-command prevention** (60s idempotency dedupe — rapid retries
never double-burn credits or fork plans). Gaps: explicit autonomy levels,
action-diff history UI, env separation.

### 5K — Project Evolution (M121–M145) — MISSING (versions/restore base)

### 5L — AI Reliability + Cost (M146–M180) — PARTIAL
Credits ledger (derived, verifiable), 20/day free gate enforced server
side before the provider, failed calls never drain the allowance, usage
records (user/project/model/chars/ok) — sessions 10/11. This session adds
duplicate-command prevention + the no-false-success rule is enforced in
the pipeline (provider errors surface as AI_PROVIDER_ERROR; unparseable
output surfaces honestly; nothing pretends success). Gaps: loop
detection across turns, quality metrics, fallback models.

### 5M — Scalability + Observability (M181–M219) — PARTIAL
Request slog, build logs, AI usage ledger, context budgets (this session)
bounding large-project payloads. Gaps: job queue, caching layers,
retention jobs.

### 5N — Testing + Documentation (M220–M231) — PARTIAL
Go suites across auth/projects/assets/ai/community/extensions (integration
+ unit), context-engine + dedupe tests (this session), Playwright harness
with 6 permanent suites (~130 checks), `/docs` + `/learn`. Gaps: docs set
(AI_MODEL/SECURITY pages), more e2e AI flows.

### 5O — Metrics + Final Audit (M232–M252) — PARTIAL
`ai_usage` ledger gives per-user/project usage + success records; public
stats derive from real rows. Gaps: latency/cost metrics, observability
dashboard.

---

## Honest bottom line

- **COMPLETE:** 5A (session 18), **5B core (this session)**.
- **PARTIAL with named gaps:** 5C, 5E–5I, 5J (closed further this
  session), 5L (closed further this session), 5M–5O.
- **MISSING:** 5D, 5K.
- **Not faked anywhere:** every status above cites files/tests; nothing
  pretends to work.

**6.0 READINESS: NO** — 5.0's own dependency chain (5C plan contract →
5D multi-agent; 5E sandbox → 5K evolution) requires completing the agent
plan/risks contract, apply-selected, sandbox session, and branching first.
The next highest-value phase is **5C completion** (goal/assumptions/risks
plan document + test step), which 5D and 5E both depend on.
