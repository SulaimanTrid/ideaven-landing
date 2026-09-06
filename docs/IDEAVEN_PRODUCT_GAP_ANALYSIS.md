# IDEAVEN — Product Gap Analysis

Created 2026-09-06 (session 25, master realignment Phase 0.1). Grounded in
24 sessions of verified implementation (STATUS.md 1–24), live browser E2E
runs, and the 8/8 Go suite. Severity: **P0** blocks credibility/launch ·
**P1** major functionality · **P2** important quality · **P3** polish.

## Executive Summary

IDEAVEN today is a working creation platform: real auth, real versioned
project model, a Scratch-style block canvas over one canonical IR with
codegen + source map + runtime preview, a real extension registry with an
isolated AIX build worker and install-to-palette flow, publishing/remix,
AI plan→preview→apply with credits, project intelligence/DNA/graph, five
professional templates, device-framed preview emulator, and a four-target
honest export flow. All of that is browser-verified.

The biggest gaps between the current product and the 9.5/10 target are:
**no i18n at all** (English-only, hardcoded), **App-vs-Game studio
identity is still thin** (the palette does not adapt to project type, no
game-specific block categories, no 3D path yet), **extension authoring
stops at metadata** (manifest/blocks declared but extension components do
not render in the designer/preview yet), and assorted polish items
(documentation staleness, name sanitization, settings sections). None of
these are UI reskins — they are functional completion items, and the ones
picked for this pass (i18n, palette adaptation, docs) are the highest
credibility-per-effort fixes.

## Existing Strengths (verified, keep)

- One canonical model consumed by canvas/blocks/codegen/runtime/AI/export — no forks.
- Block canvas: drag/snap, reporters, C-blocks, zoom/pan, minimap, search, keyboard, landing-grade visuals.
- Deterministic codegen + block↔line source map; code view shows real generated TS.
- Preview runtime executes the same IR (buttons, inputs, navigation, if/else, add).
- Extension pipeline: manifest v1, isolated build worker, sha256 artifacts, install registry, source tab, public shelf + install.
- Intelligence/DNA/Graph derived-only surfaces; project memory + intent injected into AI planning.
- Export honesty: 4 targets (html/apk/aab/windows project) with real zips; no fake binaries.
- Theme: light/dark/system with anti-flash, toggles present everywhere.
- Templates at professional standard (Coin Runner playable end-to-end).

## Critical Gaps

| # | Gap | Sev | Note |
|---|---|---|---|
| G1 | **i18n: none.** All UI strings hardcoded English; no key architecture, no switcher. | **P1** | Spec §30–31 demands EN+ID working switcher. → this pass |
| G2 | **App/Game studio identity**: palette identical for both; no game-flavored categories; creation wizard distinguishes but the builder doesn't. | **P1** | → this pass (palette adapts; deep game IR is a later engine milestone) |
| G3 | **Extension runtime**: installed extension components don't yet render in designer/preview; declared blocks are editable but skip codegen/preview with honest "unsupported" comments. | P1 | Architectural path exists (block registry); runtime provider is the next engine milestone. |
| G4 | **3D path absent.** Creation wizard lacks a 2D/3D choice for games. | P1 | Honest 3D foundation = own milestone (spec §5–6). Wizard gains the choice with honest scoping this pass. |
| G5 | README headline says "Phase 1: Landing Page & Platform Foundation" — stale for a 24-session product. | P2 | → this pass |
| G6 | Progress doc spread across STATUS.md sessions; no single IDEAVEN_PROGRESS.md checkpoint file. | P2 | → this pass |
| G7 | Name validation accepts markup-like strings (renders inert, looks broken). | P2 | (LAUNCH_AUDIT P2-2) |
| G8 | Rate limiters in-memory per process. | P2 | (LAUNCH_AUDIT P2-1) |
| G9 | No Playwright suite committed as runnable CI-style spec (harnesses are scripts, not CI). | P2 | scripts/e2e-launch-audit.mjs exists; extend gradually. |

## Domain Gaps (condensed, with severity)

- **App Studio**: palette structure is flat-ish (ui/variables/control/navigation/text/logic); spec's INPUT/LIST/NAVIGATION/MEDIA groupings and richer components (checkbox exists; radio/slider/select/datepicker absent) — **P2**; inspector is a single list, not sectioned accordions — **P2**.
- **Game Studio**: no scenes/sprites/collision IR — the engine milestone — **P1 (roadmap)**, not fakeable now.
- **2D**: landing demo + Coin Runner demonstrate the runtime pattern; a sprite/scene engine is the next milestone — **P1 (roadmap)**.
- **3D**: absent — **P1 (roadmap)**.
- **Block Editor**: strong; missing multi-select, block comments, function/procedure blocks — **P3**.
- **Code Editor**: generated-only view + custom screen `code` preserved; reverse code→blocks is guarded-by-design (unsupported = CODE-ONLY note) — matches spec §10 — **OK**.
- **Landing**: hero interactive demo now playable; needs explicit "Apps vs Games vs Extensions" explainer section — **P3**.
- **Dashboard**: extensions section landed; projects IA solid — **OK**.
- **Theme**: tokens semantic; light theme audited via sweep; contrast spot-checks pass — **OK/P3**.
- **i18n**: G1 — **P1**.
- **Accessibility**: focus-visible + aria on core flows; block canvas keyboard exists; full WCAG AA audit pending — **P2**.
- **Responsive**: landing/explore fixed; builder remains desktop-first by design (spec-compliant) — **OK**.
- **Export**: honest 4-target menu; macOS/iOS/Linux targets should appear as "Not available yet" rows for completeness — **P3**.
- **Preview**: real runtime; game-preview physics lives in the landing demo + Coin Runner template (model-driven game runtime = next engine milestone) — **P1 (roadmap)**.
- **AI**: changeset pipeline + memory/intent context; agent roles/sandbox are 5.0 backlog — **P2 (roadmap)**.
- **Marketplace/Community**: publications + public extension shelf; forums absent — **P3 (roadmap)**.
- **Production/Launch risks**: single-process API, no backups/CI (tracked in LAUNCH_AUDIT P2/P3) — **P2**.

## Priority order for this pass

1. **G1** — real i18n (EN/ID + switcher + key architecture on priority surfaces).
2. **G2** — palette adapts to project type (App/Game identity in the builder).
3. **G4 (partial)** — game creation wizard gains a 2D/3D choice with honest scoping (2D today, 3D foundation marked "foundation next").
4. **G5/G6** — README rewrite + IDEAVEN_PROGRESS.md + PRODUCT_MODEL + DESIGN_SYSTEM docs.
