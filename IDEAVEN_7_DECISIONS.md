# IDEAVEN 7.0 — Decision Log

## DEC-1: Project Brain lives inside Insights, not as a new page

**Context.** Spec M371 wants a centralized "Project Brain"; a separate
route would compete with the existing Insights mode (health/map/DNA/
memory) and risk the §2 duplicate-surfaces ban.

**Decision.** The Brain is a new tab in the builder's Insights mode, built
on the same shell and data patterns. A dashboard-level Intelligence Center
(7U) can later aggregate these without forking anything.

## DEC-2: Project Intent is user-authored structured data, separate from DNA

**Context.** Intent (M11: goal/audience/platforms/constraints/success) is
declarative and user-owned; DNA is derived. Mixing them would let derived
data look authoritative and user data look computed.

**Decision.** Intent gets its own table (`016_project_intent`, one row per
project, owner-checked like memory), is rendered read-only in the Brain,
and is injected into AI planning alongside Project Memory. DNA may later
*reference* intent fields but never owns them.

## DEC-3: Universal project `type` waits for a dedicated compatibility pass

**Context.** M7 wants project types beyond app/game; `type` is part of the
public wire contract (TS unions, templates, validation, publish, exports).

**Decision.** Extending the vocabulary ships alone, with a migration,
server validation update, TS union update, and template/export audit —
not smuggled into the intent slice.

## DEC-4: 7.0 phases wrap the 4/5/6 backlog; the roadmap says so

**Context.** 5.0 and 6.0 are partially delivered. Pretending otherwise
would violate the no-false-completion rules shared by every spec.

**Decision.** The 7.0 roadmap carries an explicit dependency column naming
the 4/5/6 milestones each phase presupposes. 7.x work never re-implements
those substrates; it builds on them once they land.

## DEC-5: Knowledge base reads derive from the same graph/intelligence layer

**Context.** M13 (knowledge base) and 7B could tempt a separate index
service.

**Decision.** The knowledge base extends `graph.ts` + `intelligence.go`
outputs (plus docs/history sources) behind one query interface. No second
project representation is introduced.
