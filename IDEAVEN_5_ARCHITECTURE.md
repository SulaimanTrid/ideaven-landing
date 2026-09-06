# IDEAVEN 5.0 — Architecture Audit (M0)

Grounded in the 4.0 audit (`IDEAVEN_4_ARCHITECTURE_AUDIT.md`, still current —
stack, routing, model, and verification pipeline are unchanged). This file
covers only what 5.0 adds or depends on. Live machine path:
`~/Downloads/Projek IDEAVEN/ideaven-landing-v1`.

## 1. Sources of truth (must not be duplicated)

| Concern | Source of truth today |
|---|---|
| Project content | Canonical `Model v1` JSONB (`apps/api/internal/project/model.go`) |
| Intelligence/health | `IntelligenceFor` (M1) + `DNAFor` (M3) — both derive from the model, never persist |
| Relationships | Web `lib/project-model/graph.ts` — derived (client) |
| Version history | `project_versions` (20 kept, origin labels, restore) |
| AI changes | Closed `AIOperation` vocabulary, validated server-side, applied as one undoable commit |
| Extensions | `extensions` + `extension_versions` + `extension_installs`; blocks namespaced `ext:<slug>:<type>` |

## 2. What 5.0 milestones already have (verified)

- **M1 Project Intelligence Core** — intelligence report + DNA cover
  context/graph/summary/health/dependencies/risks. All derived-only.
- **M2 Project Graph** — web graph layer with typed edges; stable string
  node IDs (`screen:…`, `component:<screen>:<id>`, `block:<screen>:<handler>:<id>`,
  `variable:<name>`, `asset:<id>`, `extension:<slug>`); `relationshipsOf()`
  traversal answers "what uses this / what is this wired to".
- **M3 Project Map UI** — Insights → Project map tab (tree + relationship
  inspector + jump-through). Deltas for 5.0: **search** and **kind filter**
  are missing (zoom/pan do not apply to the tree representation; the spec's
  own rule — use the same graph source of truth, don't create an unrelated
  graph — keeps the tree legitimate).
- **M4 Project DNA** — server DNA endpoint + DnaView. Deltas: human-readable
  summary exists; "conventions" are factual only (events/types used).

## 3. What 5.0 needs that does not exist yet

1. **Project Memory (M5)** — per-project durable instructions. No table, no
   API, no UI, and the AI planner does not read any project rules today.
2. **Context engine (M7–M8)** — the Ask AI request assembles context
   client-side; there is no ranked/limited context selection with budgets.
3. **Agent tool layer (M9–M10)** — AI is one plan/preview/apply pipeline;
   no named tools, no action classification (READ/SUGGEST/MODIFY/…), no
   risk gating.
4. **Sandbox (M16–M17)** — changes apply to the live model after preview;
   "sandbox" today = the preview/undo path + version snapshots, not an
   isolated merge flow.
5. **Multi-solution / multi-agent (M18–M21)** — single pipeline only.
6. **Impact analysis (M31–M32)** — the graph can answer this but nothing
   computes "affected entities" before apply yet.
7. **i18n (spec M216)** — there is NO i18n infrastructure; "use existing
   i18n" cannot be satisfied until the localization layer (4.0 M38) exists.
   New 5.0 UI stays English with centralized string tables prepared.

## 4. Architectural constraints that already exist

- Server decoding is `DisallowUnknownFields` — every new request shape must
  match its Go struct exactly.
- One `route()`/`routeMethods()` per path (mux duplicate-fallback panic).
- `go run` child binaries live under `~/.cache/go-build/…` (no stable name):
  restart by PID/port, with full env (`DATABASE_URL`, `API_ADDR`).
- AI credits are metered (`ai_usage`, `credit_grants`); any agent loop must
  meter through the same ledger.
- All AI ops flow through `commitModel` (one undoable step) on the client
  and through the server's operation validator — no raw writes.

## 5. Security boundaries relevant to 5.0 AI work

- Project isolation: every project query is owner-scoped (404/401 tested
  patterns exist in `project` and `extension` suites). Memory rows must
  inherit this exactly.
- Prompt-injection surface: project content (labels, code) is already sent
  to the provider in Ask AI; memory content will be too. Rule adopted:
  project/memory content is DATA, never instructions to the platform; the
  closed operation vocabulary is the hard boundary (an injected model
  response can only produce schema-valid ops, which the user previews).
- No secrets exist in the model today; when M98 lands, redaction hooks go
  at context-assembly time.

## 6. Blockers for Phase 5A

None critical. Honest limitations carried forward: no i18n layer (M216
unsatisfiable yet), no frontend test runner (verification = Go suite +
`tsc` + production build + Playwright passes).

## 7. First implementation target (Phase 5A remainder)

1. **M5 Project Memory**: migration `014_project_memory`, service + CRUD
   API (owner-scoped), Insights "Memory" tab (add/inspect/delete), and
   planner consumption (memory rules injected into Ask AI plan context).
2. **M3 delta**: Project map search + kind filter.
