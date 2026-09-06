# IDEAVEN — Progress Checkpoint

Last verified: 2026-09-06 (session 25). Full session log:
[`docs/STATUS.md`](docs/STATUS.md).

## Feature status (directive §3 vocabulary)

| Capability | Status |
|---|---|
| Landing + hero playable demo | TESTED |
| Auth/sessions/publishing/remix | TESTED |
| Projects (versions, restore, templates) | TESTED |
| Block canvas (Scratch-style over IR) | TESTED |
| Codegen + source map + code view | TESTED |
| Preview runtime + device frames | TESTED |
| Extensions (author/build/install/palette) | TESTED |
| Export web/apk/aab/windows-projects | TESTED |
| Intelligence/DNA/Graph/Memory/Brain | TESTED |
| i18n EN/ID (priority surfaces) | FUNCTIONAL (coverage expanding) |
| Game Studio identity (Scenes, adaptive palette) | FUNCTIONAL (deepening) |
| 2D scene canvas (dark stage, grid, scene HUD, Scenes terminology) | FUNCTIONAL (visual foundation; entity/sprite IR next) |
| 3D path | PLANNED (honest wizard status) |
| Extension component runtime in preview | DESIGNED (registry ready) |
| Marketplace/commerce | PLANNED |

## Completed (verified)

- Auth (sessions, verify, reset, rate limits) · Projects (versioned model
  history, restore, duplicate, archive, publish/remix, templates).
- Blocks: Scratch-style canvas over the canonical IR (drag/snap, reporters,
  C-blocks, zoom/pan, minimap, search, keyboard, adaptive palette order),
  deterministic codegen + source map, runtime preview in device-framed
  emulators (phone/tablet/desktop).
- AI: plan→preview→apply changesets, credits, project memory + intent
  injected into plans.
- Extensions: manifest v1 + Source tab, isolated AIX build worker (sha256),
  public shelf with install → blocks appear in the palette, guided manifest
  errors.
- Intelligence: derived-only report (7 health dimensions), DNA, Project
  Map, Insights (Health/Map/DNA/Memory/Brain).
- Export: Web HTML, Android APK/AAB projects + CI workflows, Windows
  Electron project — honest about where compilation happens.
- Theme: light/dark/system, anti-flash, toggles in header/sidebar/builder.
- i18n (session 25): key-based EN/ID architecture, provider, language
  switcher (header/sidebar), priority surfaces translated (site nav,
  workspace nav, dashboard home, builder modes, extensions).
- 5 professional templates incl. playable Coin Runner.

## Partial

- Game engine: model-driven gameplay exists in templates/landing demo
  (hardcoded per-template); a general sprite/scene/collision IR is the next
  engine milestone. Palette adapts by project type today.
- 3D: wizard choice exists with honest "foundation in development" status;
  no 3D runtime yet.
- Extension runtime: installed extension components render as honest
  "unsupported" placeholders in designer/preview; runtime providers are the
  next extension milestone.
- Accessibility: focus-visible + aria on core flows; full WCAG AA audit
  pending.
- i18n coverage: priority surfaces translated; deep editor strings
  (inspector, panels) still English — keys ready.

## Session 26 addition (9.5 directive — GAME 2D materially different)

Game projects now design against a **dark scene stage** (dot-grid, violet
border, `SCENE · <name>` HUD chip, "Scenes" terminology) while app projects
keep the white device canvas — the editor shell visibly differs by project
mode. Verified live: game builder shows SCENES + scene HUD; website builder
keeps SCREENS + white device, no HUD.

## Known limitations

- Single-process API (in-memory rate limits), no backups/CI (LAUNCH_AUDIT
  P2/P3).
- Export binaries compile where the toolchains live (gradle/CI,
  electron-builder) — the platform emits ready-to-build projects, never
  faked binaries.

## Next

Per [`IDEAVEN_7_ROADMAP.md`](IDEAVEN_7_ROADMAP.md) dependency columns +
GAP_ANALYSIS priorities: game scene/sprite IR milestone, extension runtime
providers, i18n coverage expansion, accessibility audit.
