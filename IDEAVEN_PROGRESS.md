# IDEAVEN — Progress Checkpoint

Last verified: 2026-09-06 (session 26). Full session log:
[`docs/STATUS.md`](docs/STATUS.md).

## Execution discipline (binding charter, 2026-09-06)

Every session on this repository follows these non-negotiables (enforced by
review against `docs/STATUS.md` + the LAUNCH_AUDIT harness):

- CONTINUE, never replace: one repo (SulaimanTrid/ideaven-landing), one
  canonical model, one editor, one block system.
- INSPECT → ROOT CAUSE → SMALLEST SAFE FIX → TEST → BROWSER VERIFY → record.
- Feature states use the closed vocabulary: PLANNED / DESIGNED /
  PARTIALLY IMPLEMENTED / FUNCTIONAL / TESTED / PRODUCTION READY.
- No fake anything: builds, exports, AI output, scores, stats, runtime
  behavior, publish states. Unsupported = labeled Coming Soon / Unsupported /
  Experimental with a reason.
- Advanced TypeScript stays CODE-ONLY; never force it into blocks.
- DONE = UI + state + logic + persistence + validation + error handling +
  security + a11y + tests + browser verification, where applicable.
- TypeScript compiling ≠ done. Screenshot ≠ done. User-flow verification is
  the gate.
- End of every batch: files changed, user-visible improvements, root causes
  of fixed bugs, tests/builds run, browser verification, remaining
  limitations — recorded in docs/STATUS.md.

## Feature status (directive §3 vocabulary)

| Capability | Status |
|---|---|
| Landing + hero playable demo | TESTED |
| Auth/sessions/publishing/remix | TESTED |
| Projects (versions, restore, templates) | TESTED |
| Block canvas (free multi-script workspace, park/attach, pointer DnD with connection previews, run drags, positions persisted on the model) | TESTED |
| Codegen + source map + code view | TESTED |
| Preview runtime + device frames | TESTED |
| Extensions (author/build/install/palette) | TESTED |
| Export web/apk/aab/windows-projects | TESTED |
| Intelligence/DNA/Graph/Memory/Brain | TESTED |
| i18n EN/ID (priority surfaces) | FUNCTIONAL (coverage expanding) |
| Game Studio identity (Scenes, adaptive palette) | FUNCTIONAL (deepening) |
| 2D scene canvas (dark stage, grid, scene HUD, Scenes terminology) | FUNCTIONAL (visual foundation; entity/sprite IR next) |
| Audio blocks (play/stop sound — real asset playback, honest warnings) | FUNCTIONAL |
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

## Session 26 addition (TASK 03 — block editor is now real visual programming)

The Blocks canvas was rebuilt from a rigid one-handler stack into a free
multi-script workspace over the same canonical IR: handlers are placeable
scripts (positions persisted on the model via `logic.positions`), blocks can
be detached and parked freely (`logic.parked`, runs keep Scratch "grab takes
what's below" semantics), pointer drags show live insertion lines / arm
highlights / socket highlights, duplicate + Ctrl+D, palette is context-aware
("For <component>" pre-wired group, variable search boost, readable category
labels, per-block icons). New REAL vocabulary: change-variable, play-sound,
stop-sound (Audio category) — codegen, code→blocks parse-back, preview
runtime, and the Go export runtime all execute them; unresolvable sounds warn
instead of faking playback. Verified end-to-end in the browser on the Coin
Runner acceptance example (build → insert → disconnect → park → reconnect →
undo/redo → save → reload → positions and structure persist → preview score
reacts). Fixed en route: hidden hover buttons intercepting drags, idle strips
covering parked runs, and the canvas viewport being silently scrollable.

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

## Session 29 addition (TASK 07 — Community)

- Community rebuilt from a gallery listing into a creator ecosystem:
  channels (# general/help/showcase/game-dev/app-dev/extensions/beginner-zone),
  questions + discussions, answers with upvotes and an accepted answer,
  tags, search/sorts (latest/popular/unanswered/trending), reports,
  soft-delete-own-posts. Migration 020; new internal/community domain;
  all counts derived from rows — nothing faked; Challenges honestly
  "coming soon".
- Deterministic project thumbnails: /api/public/projects/{slug}/thumbnail.svg
  renders the published model's start screen as a wireframe (no stock
  images, ETag-cached, deterministic). Used by community feed cards,
  /explore, and the Fresh projects sidebar.
- /p/[slug] gained a Discussions section; /community/ask attaches real
  published projects; remix works from community surfaces.
- New status rows: Community core (channels/questions/answers/votes/accept/
  reports) TESTED; project discussion linkage TESTED; thumbnails TESTED.
- Harness: scripts/e2e-community.mjs — 30 browser checks, 0 console errors.

## Session 30 addition (TASK 08 — 2D Game Studio)

- THE coin-collision bug root-caused: model-driven games had NO gameplay
  runtime (no entities, no collision, no touch events — the template
  simulated coins with click-buttons). Fixed by building the 2D scene IR:
  entities (player/platform/coin/enemy/trigger/sprite) as canonical-model
  components with transform+collider props; a screen with entities is a
  scene.
- Real game loop in preview AND published pages AND exported HTML/AAP/Win:
  input → movement → gravity → AABB collision → edge-triggered
  `touches-<id>` events → user's blocks → score/HUD → render. Runtime
  trace strip makes every collision/handler dispatch visible. Restart
  re-seeds from the model.
- Scene editor: drag-move, resize, rotate, duplicate/delete, grid+snap,
  inspector transform fields; Blocks mode offers "when X touches Y"
  handlers; new `boolean` expression block across the whole pipeline.
- Coin Runner template is now a real playable scene (player + platforms +
  6 touch-collected coins + win-at-6). Landing hero TopBar shows the live
  score (orphan state fixed).
- Status rows: 2D scene/sprite IR + collision gameplay — TESTED
  (scripts/e2e-scene-gameplay.mjs, 21/21). Enemy AI / sprite textures —
  PLANNED (honest).

## Session 31 addition (TASK 09 — 2D Asset Canvas)

- Dedicated Asset Studio at /builder/[id]/asset-studio: pixel-art sprite
  editor (Select/Pencil/Eraser/Line/Rect/Circle/Fill/Eyedropper/Text,
  Flip/Rotate/Scale/Duplicate/Delete/Crop, brush sizes, grid 8-64, zoom
  25-800% + Fit, undo/redo), layers (visibility/lock/rename/reorder),
  frames (add/duplicate/delete, thumbnails, FPS, play/pause/loop, live
  preview), 16-swatch palette.
- Saves are REAL: frame PNGs and horizontal sprite sheets upload through
  the existing project asset API (server-sniffed PNG, asset library rows).
  No GIF — not implemented, not claimed.
- 2D Game Studio integration: scene entities gained a Texture prop
  (asset:<id>) rendered in design canvas, preview, published pages, and
  the exported game — drawn sprites become playable graphics end to end.
- Mobile: tool tray + collapsible inspector sheet, 0 overflow at 390px.
- Status rows: 2D asset canvas TESTED (scripts/e2e-asset-studio.mjs,
  25/25); sprite textures in scenes TESTED; onion skin/tile placement
  PLANNED.
