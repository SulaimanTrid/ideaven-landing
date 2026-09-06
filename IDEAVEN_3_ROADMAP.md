# IDEAVEN 3.0 — Roadmap (M1–M30)

Date: 2026-09-06. "The Creation OS" — long-term architecture mapped onto the
live implementation. Completion bar per milestone: UI + state + API +
validation + error handling + persistence + security + a11y + i18n-readiness
+ tests + browser verification + production build, where applicable.

Current foundation (all verified in previous sessions): canonical model v1 +
block IR + codegen/runtime/source-map, builder (Design/Blocks/Code/Preview),
AI changeset agent (closed vocabulary, credits, snapshots, auto-fix),
publishing/gallery/remix/stats, extensions (registry + manifest v1 + isolated
AIX pipeline + installs), templates, exports (HTML/Android), theme system
(light/dark/system), auth/credits/versions.

| M | Milestone | Status | Reusable base | Key new work | Depends |
|---|---|---|---|---|---|
| M1 | Project Intelligence | ✅ this session | canonical model, block walker, asset refs | server intelligence report (graphs + 7 health dimensions) + builder "Insights" mode | — |
| M2 | AI Project Agent + Change Preview | ◐ | Ask AI changesets (plan=explanation+ops, preview=proposal UI, apply=one commit, validate=re-check) | multi-step plan display, universal diff surface (+/−/~/✓), apply-selected | M1 |
| M3 | Time Machine / Branching | ◐ | project_versions (20, origin labels, restore) | compare view, named snapshots, branch concept | M1 |
| M4 | Collaboration | ⬜ | auth, ownership | presence relay, comments w/ object anchors, roles | — |
| M5 | Design System Studio | ◐ | theme tokens (session 14), screen styles | per-project token editing | — |
| M6 | Device/App simulator | ◐ | device frames, preview runtime | orientation, safe areas, network/offline simulation, custom size | — |
| M7 | Test generator | ⬜ | runtime interpreter, diagnostics | deterministic navigation/interaction test runs in preview sandbox | M1 |
| M8 | Health Center | ✅ core (M1 UI) | M1 report | dedicated dashboard view as health evolves | M1 |
| M9 | Performance Doctor | ◐ | M1 performance signals, asset sizes | suggestions + preview/apply | M1 |
| M10 | Game Director | ⬜ | AI changesets, templates | plan → entities for game projects | M2 |
| M11 | Asset Intelligence | ◐ | asset metadata (mime/size) | dimensions/usage/memory tracking, optimization hints | M1 |
| M12 | Dependency intelligence | ◐ | extension deps in manifest, M1 dependency graph | conflict/compat reporting | M1 |
| M13 | Extension intelligence | ◐ | manifest v1 (components/methods/events/blocks/docs) | quality/doc/compat scores (honest, non-certification) | M1 |
| M14 | Companion | ◐ | QR→published live page, exported runtime | pairing + SSE relay + PWA shell | M6 |
| M15 | Learn platform | ◐ | 6 lessons + docs + progress none | tracks + progress persistence | — |
| M16 | Project Explainer / README | ◐ | M1 intelligence data, AI command | explain/README generation from real data | M1, M2 |
| M17 | Showcase / Remix | ◐ | publish page, remix, creators | showcase fields on publication, richer remix credits | — |
| M18 | Discovery / Creator analytics | ◐ | stats endpoint, gallery | for-you/trending feeds, per-creator counters | M17 |
| M19 | Events / Challenges | ⬜ | community page | events + challenge definitions | M9? no — M18 |
| M20 | Brand / logo system | ◐ | Logo + favicon exist | concept family + usage rules page | — |
| M21 | Landing product experience | ◐ | landing real; published runtime shared | playable IR demo embedded | M2/M6 |
| M22 | Pricing experience | ◐ | pricing honest page | premium visual pass, reduced-motion | M6 |
| M23 | Global i18n | ⬜ | 10 locales listed | key-based dictionary + negotiation chain | — |
| M24 | Accessibility | ◐ | strong baseline | canvas keyboard map, contrast/text-scale pass | M6 |
| M25 | Security hardening | ◐ | sessions, origin guard, rate limits, isolation | audit pass incl. extension worker sandbox review | M1 |
| M26 | Privacy | ◐ | visibility model (private/unlisted/public) | explicit data-flow doc + minimal collection audit | — |
| M27 | Marketplace readiness | ◐ | extensions registry+installs+publish gate, explore/remix | categories/detail/reviews schema (free tier) | M13 |
| M28 | Observability | ◐ | slog requests, build logs | error/latency counters, no PII | — |
| M29 | Performance | ◐ | bundles modest; runtime tiny | virtualized lists, asset optimization | M11 |
| M30 | Final production audit | ⬜ | all above | full pass | all |

## M1 — Project Intelligence (this session)

**Objective.** One canonical intelligence layer over the existing model (no
duplicate model): project/component/event/navigation/asset/dependency graphs
plus seven health dimensions (build, architecture, performance, a11y,
security, dependency, build-readiness), surfaced in the builder.

**Server.** `internal/project/intelligence.go`:
- `GET /api/projects/{id}/intelligence` (owner-only) → report:
  - counts: screens/components-by-type/handlers/blocks-by-type/variables/assets
  - navigation graph (screen → screens via navigate blocks)
  - event graph (component → events wired)
  - dangling references (handlers on deleted components, navigate to missing
    screens, set/get-variable on unknown names, asset refs missing)
  - health: build-ready (0 errors), architecture (empty screens, giant
    screens >40 components, deep nesting >6), performance (oversized screens,
    per-asset size totals), accessibility (buttons without labels, images
    without alt), security (public visibility notice, asset exposure),
    dependency (extension manifest deps + installed), diagnostics count.
- Every issue carries screenId/componentId/handlerId so the UI can link to
  its cause (health center requirement, M8).

**Web.** Builder gains an **Insights** mode (same top-bar pattern): health
cards (Healthy/Attention/Critical + counts, click → filtered list), issue
list click-through (screen/component navigation reusing existing goTo logic),
graph summary panels (navigation map as adjacency list, event coverage per
screen), and intelligence totals. Pure client view over the report; no
duplicate state.

**Tests.** Server: report correctness fixture test (counts, dangling,
health flags, navigation edges) + route ownership. Browser: open Insights on
a seeded project, switch theme-agnostic render, click-through.

**Risks.** Report must stay derived-only (never mutate the model); keep O(n)
walks single-pass per screen.

### M1 outcome (delivered + verified)

Shipped as specified, with honest deltas:

- Report: counts, navigation edges (with handlerId/blockId provenance),
  issues ×7 dimensions, seven health roll-ups — all derived-only. The
  event graph is currently implicit (handlers-wired count + per-screen
  handler list in the sidebar) rather than a separate adjacency panel;
  the dependency dimension reads manifest deps in M12, not M1.
- Issues: dangling handlers, ghost navigation, unknown variables,
  missing assets, unlabeled buttons, missing alt, empty/giant screens,
  empty handlers — every block-level issue carries handlerId (+ blockId
  where applicable) so click-through opens the exact cause.
- Web: Insights mode with counts strip, 7 health cards, screen flow,
  severity-filtered issue list, click-through (handler issues → Blocks
  mode with handler selected; others → Design on their screen).
- Verified: go suite 8/8 on live PostgreSQL (fixture asserts edge
  provenance + variable issue + ≥3 criticals), `tsc --noEmit` clean,
  `next build` green, Playwright browser pass (render + click-through
  screenshots) against the live two-server setup.
