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

## Session 34 addition (IDEAVEN 4.0 completion pass)

- `docs/IDEAVEN_4_COMPLETION_AUDIT.md`: evidence matrix for M0–M56 with
  per-milestone STATUS/FILES/TESTS/BROWSER/LIMITATIONS. Roadmap table
  re-statused (M4/M15/M30/M38/M39/M41 were already delivered by later
  work).
- M5 Command Palette closed: in-builder universal search (screens,
  components, handlers, blocks, variables, assets) with context jumps.
- M30 Asset Intelligence delivered: owner-scoped report (dimensions from
  image headers, decoded memory, usage, orphans, hints) + Assets panel
  section. Project↔asset decoupled via AssetMediaSource interface.
- Status: 4.0 NOT fully complete — see the audit doc for the honest
  matrix; 5.0 READINESS: NO.

## Session 35 addition (IDEAVEN 5.0 completion pass)

- `docs/IDEAVEN_5_COMPLETION_AUDIT.md`: per-phase matrix 5A–5O with named
  gaps (5A was ✅; 5B core + 5L dedupe now delivered; 6.0 READINESS: NO).
- 5B Context Engine: `assembleContext` — ranked/budgeted/sanitized/
  deterministic AI context assembly with injection defenses and secret
  redaction (7 tests). Old unranked assembler removed (single pipeline).
- 5L: 60s duplicate-command idempotency dedupe (3 tests) — retries never
  double-burn AI credits.

## Session 36 addition (IDEAVEN 6.0 completion pass)

- `docs/IDEAVEN_6_COMPLETION_AUDIT.md`: per-phase matrix 6A–6O.
- 6J Project Package portability COMPLETE: owner-only backup zip
  (metadata + model + assets) + import-as-new-project with asset id
  remapping through the validated asset path. Export menu target +
  Projects-page import button. `TestProjectPackageRoundTrip` green;
  browser flow 5/5.
- Status: 6.0 NOT fully complete — 6B collaboration/orgs and 6C backend
  studio are the largest missing builds; others partial with named gaps
  (see audit doc). 7.0 READINESS: NO.

## TASK 12 addition (AI Credit Purchase Flow — contextual popup + real ledger)

- Contextual purchase flow (docs/TASK12_CREDIT_PURCHASE.md): when the
  server blocks an AI action, the response is a structured HTTP 402
  (AI_INSUFFICIENT_CREDITS) carrying safe metadata (remaining, required,
  packBalance, freeRemaining, purchaseAvailable) — the client never
  trusts its own balance as authoritative.
- Server: migration 022 adds `credit_packages` (single server-
  authoritative definition, seeded with the packs the pricing page
  described) and `credit_purchases` (commerce audit trail; status
  pending → succeeded | failed | cancelled; UNIQUE (provider,
  provider_transaction_id) idempotency backstop). credit_grants source
  gained `purchase`. New internal/credits package: PaymentProvider
  boundary (CreateCheckout/Verify), Service (packages, purchase intent,
  Settle), handlers (GET /api/credits/packages, POST
  /api/credits/purchases, GET /api/credits/purchases/{id}, POST
  /api/credits/webhook/{provider}).
- Settlement is exactly-once: the credit_grants row and the status
  transition commit in ONE transaction behind FOR UPDATE; replays,
  second events for a settled intent, late contradicting events,
  failures, and cancellations grant nothing (all tested).
- No payment provider ships yet: PAYMENT_PROVIDER unset means honest
  "coming soon" (packages listed, buy disabled, no fake checkout, no
  fake credits). The ledger is unchanged as the single balance source —
  a verified purchase writes the SAME credit_grants rows the operator
  CLI writes.
- Builder: Ask AI panel + top bar carry the live balance badge; empty
  balance turns the button into "Credits empty" (still clickable →
  opens the purchase modal); 402 opens the contextual modal
  automatically (needs/have numbers, packs, popular flag, per-credit
  price); success offers "Continue with AI", which re-runs the
  interrupted request ONLY on explicit user confirmation. Extension
  build-fix surface wired to the same modal. Hosted-checkout return
  (?purchase=…) resumes polling of the server-verified result.
- Pricing page now renders the same server package definition (no
  second hardcoded copy). i18n: all credits.* strings in EN + ID
  (package taglines stay server data, untranslated by design).
- Gates: go vet clean; full go test -count=1 ./... green (12 packages);
  tsc --noEmit clean; browser verified: Flow A (AI runs, ledger
  decrements, badge refresh), Flow B (zero balance → auto modal, honest
  unavailable, no fake credits), dark/light themes, 390px bottom sheet,
  Escape/focus restore, Indonesian localization.
- Platform: fixed Windows builds of the API (Unix-only syscall in the
  extension build worker moved to worker_posix.go/worker_windows.go;
  worker env keeps TMP/TEMP/SystemRoot/COMSPEC). No behavior change on
  Unix.

## TASK 14 addition (2D Camera Behaviors — follow, smoothing, bounds, shake)

- The runtime camera is a real entity in the canonical model
  (type "camera", Game Entities palette): followEnabled/followTarget/
  smoothing/boundsEnabled/min-max XY/shakeDuration/shakeStrength live in
  one component's props; every surface (editor overlay, preview, published
  pages, export) derives behavior from them. No second camera system, no
  runtime-only camera state that diverges from the model.
- Runtime semantics (`scene-stage.tsx`, mirrored 1:1 in the vanilla export
  engine): follow target by stable component id (missing target → hold
  position + one honest trace, never a crash), deterministic frame-rate-
  independent smoothing `1−(1−s)^(dt·60)`, viewport clamped inside
  normalized world bounds (inverted bounds swap; small axis pins to min
  edge), and a bounded sine-decay shake envelope (38 Hz) that restarts on
  re-trigger, decays to exactly zero, and cannot accumulate or produce NaN.
- Runtime position never touches the model; only configuration changes go
  through updateProps (undo/redo/autosave). Player world clamps follow the
  camera bounds when enabled; HUD stays fixed outside the world container.
- Editor: dashed viewfinder glyph + world-bounds overlay from the same
  props; Inspector exposes Follow target, a real entity picker ("Target
  entity", new `entity` field type), smoothing with a plain-language
  explainer, bounds, and shake defaults. Decimal-aware number fields.
- Blocks: `shake camera for {duration}s with strength {strength}` (bounded
  envelope via runtime.cameraCommands) and `set camera target to
  {componentId}` (live retarget) — both with deterministic codegen
  (`api.shakeCamera` / `api.setCameraTarget`). Follow/smoothing/bounds also
  reachable via set-property on the camera entity (read live per frame).
- Diagnostics: deleted follow target (error, component-targeted) and
  inverted bounds (warning); the runtime normalizes, never crashes.
- Export parity: `export.go`'s vanilla engine implements the identical
  follow/smooth/clamp/shake pass and compiles both camera blocks.
- Tests: `scripts/e2e-camera.mjs` 34/34 (follow, smoothing lag, bounds
  clamp at camX≈1610 for a 2000-world/390-viewport, shake fire + clean
  end + no idle drift, restart re-snap, undo/redo, persistence, deleted-
  target + inverted-bounds diagnostics, published parity, export parity,
  0 console errors). Regressions green: e2e-tilemap-paint 29/29 (rule
  tiles + collision intact), e2e-scene-gameplay 21/21, go test -count=1
  ./... 11/11 packages, tsc clean.
- Manual Step 25 pass (Indonesian UI): Coin Runner project → Camera added
  via palette → Target entity = Player 1 → smoothing 0.2 → shake block
  clicked into the Coin 1 touch handler → preview: camera followed, shake
  fired at the coin, ended cleanly at the clamped follow position; zero
  console errors across mode switches. See docs/TASK14_CAMERA_BEHAVIORS.md.

## Session 42 addition (2D engine — rule tiles + sorting layers verified; machine migration)

- The repository moved to a new machine mid-flight; the working tree carried
  several completed-but-unrecorded sessions on top of the tile-palette docs
  commit: TASK 12 (credit purchase) and TASK 14 (camera behaviors, e2e 34/34)
  were recorded above, while RULE TILES (auto-tiling) and SORTING LAYERS
  (SYSTEM 9 / TASK 15) existed in code with no record — the sorting session
  had been cut off mid-edit. This session verified all of it end to end.
- Worker env fix (found by the migration): the extension build worker's env
  whitelist dropped `LocalAppData`, which the Windows Go toolchain needs to
  locate its default GOCACHE; extension tests failed with "build cache is
  required, but could not be located". workerEnv now matches case-insensitively
  and keeps LocalAppData/AppData/UserProfile (no behavior change on Unix).
- Camera handle completion: the cut-off session made the camera viewport
  click-through (pointerEvents none) but left an invisible 8×8 hit chip;
  completed as a visible name-chip handle (data-camera-handle="true") and
  retargeted e2e-camera.mjs to select the camera through the chip.
- Verified: tsc clean; next build green; go vet clean; go test -count=1 ./...
  green (12/12 packages with tests, live PostgreSQL); E2E e2e-sorting 19/19
  (NEW — first verification of TASK 15: sorted editor order, "Show order"
  overlay, Layer Manager with delete protection + reorder + undo, tie-breaks,
  dangling-layer diagnostic + World fallback, preview/published/export
  parity, persistence), e2e-tilemap-paint 29/29 (rule tiles: interior/edge/
  corner shading identical on canvas and preview), e2e-camera 34/34,
  e2e-scene-gameplay 21/21. 0 console errors across all suites.
- Honest: NO git binary on this machine — everything since the tile-palette
  docs commit (e91459a) is uncommitted. Machine-specific run notes moved to
  docs/LOCAL-DEV-WINDOWS.md (ideaven-v7\tools portable node 24 / go 1.27.1 /
  PostgreSQL 16.9; E2E API on :8090; PLAYWRIGHT_MODULE must be a relative
  path because ESM dynamic import rejects C:\ specifiers).
- Next: lighting (SYSTEM 5) per the 2D engine priority order.

## Session 43 addition (2D engine — rule tiles completion slice, requested as TASK 15)

- The requested rule-tiles task was executed as a CONTINUATION: inspection
  confirmed the derived-shading architecture already in place (4-neighbor
  rule — interior ×0.72 / edge ×0.86 / ≤2 base — over the canonical `tiles`
  + `autoTile` props, identical in scene.ts and export.go). No second
  architecture was built; the slice verified the design against the spec and
  filled the real gaps: user-understanding UX and deep E2E coverage.
- Inspector explainer added (inspector.tsx, following the existing camera/
  sorting explainer convention): which tiles participate, what they react to,
  what happens when neighbors change; the Auto-tile edges checkbox is proven
  to really control rendering.
- e2e-tilemap-paint.mjs 29 → 44 checks, all green, 0 console errors: neighbor
  reaction in both directions (paint restyles the survivor base→edge at the
  3rd neighbor; erase reverts it), EXACT undo/redo of canvas and canonical
  tiles, reload persistence of the rule-tiled region with the same variants,
  preview parity, and the model keeping BASE values + the autoTile flag (no
  baked variants — derive-at-render decision recorded in STATUS.md §50).
- Gates: tsc clean; next build green; go vet clean; go test 12/12 packages
  (live PostgreSQL); regressions e2e-scene-gameplay 21/21, e2e-camera 34/34,
  e2e-sorting 19/19.
- Honest: the repo's internal "TASK 15" is sorting layers (e2e-sorting.mjs
  header) — this slice is the user-requested rule-tiles task; noted in
  STATUS.md §50. Still no git binary on this machine, so everything remains
  uncommitted (suggested message in IDEAVEN_PROGRESS_STATE.md).
- Next: lighting (SYSTEM 5) per the 2D engine priority order.

## Session 44 addition (PHASE A — anti-slop, design constitution, motion foundation)

- Anti-slop integrated per its documented skills path: all six skills +
  contrast-check.py in `.agents/skills/` (byte-exact curl from upstream),
  `AGENTS.md` created with the antislop pointer block + repo verification
  rules. Exact method, verification, and the shadowing check recorded in
  `docs/ANTI-SLOP.md`. Chosen over the Codex plugin path (no Codex CLI on
  this machine — the documented fallback applies).
- `docs/DESIGN.md` rewritten as the full visual constitution (A–O):
  typography hierarchy, spacing rhythm, surface hierarchy, radius/border/
  shadow strategy (audited from code), icon treatment, color roles, accent
  discipline, data-viz language, editor + game-studio languages, 3D-studio
  direction (honest: not built), responsive behavior, accessibility, and
  the ONE motion system.
- Motion foundation: tokens only in globals.css @theme (durations instant/
  micro/quick/standard/deliberate/emphasis; easings enter/exit/press/
  spatial) → Tailwind v4 generates duration-*/ease-* utilities and the
  default transition character for all 226 existing hover transitions.
  `.press` adds fast compression owning one coherent transition list.
  Existing reveal/skip-link/anim classes rewired to tokens (same values).
- Slice: `packages/ui/src/button.tsx` (54 usages) → duration-quick + press.
- E2E `scripts/e2e-motion.mjs` NEW 11/11 (computed tokens, real press
  compression + release, reveal emphasis token, reduced-motion collapse);
  caught one real bug during development: `*/` inside a CSS comment broke
  globals.css parsing (500) — fixed.
- Gates: tsc clean; next build green; tilemap 44/44 + gameplay 21/21
  regressions green; 0 console errors.
- Next: PHASE B full UI/copy audit (prioritized findings list), then 2D
  lighting (SYSTEM 5). Commit still blocked (no git on machine).

## Session 45 addition (2D engine SLICE 1 — Input Abstraction + motion-stray sweep)

- Reconciliation before building: sorting layers (SUBSYSTEM #4) already
  verified (§49), triggers/areas (#5) already exist (entity + per-cell touch
  enter/stay/exit, non-solid), runtime trace exists — none rebuilt. Input
  was the real gap: keyboard was hardcoded in scene-stage.tsx and export.go.
- Input Abstraction shipped as a model-driven vertical slice: optional
  `screen.inputActions` (`{id, name, keys[], enabled}`) with the
  sortingLayers convention — absent field = default set byte-identical to
  the old hardcoded keys (zero migration). Built-in player controls consume
  the reserved IDs move-left/move-right/jump. Editor: "Input actions" panel
  in the screen inspector (names, key bindings, enable, add/remove; one
  undoable commit via ops.updateInputActions). Runtime: device listeners →
  action state (pressed/justPressed, OS-repeat-proof), tick consumes edges
  (deterministic jump, cleared per tick), on-screen touch buttons route
  through the SAME action layer. Export: export.go mirrors the engine 1:1
  over the embedded model. Server: typed Screen.InputActions in model.go
  (mandatory — the PUT round-trip would otherwise strip bindings).
  Diagnostics: missing/disabled built-in action (on the player), keyless
  action, duplicate key.
- Motion-stray sweep (closes the visual audit): 8 ad-hoc values → motion
  tokens; export status dot → anim-pulse-dot; compile progress →
  anim-progress-x.
- Gates: tsc clean; go vet clean; go test 12/12 packages; next build green.
  E2E e2e-input-actions.mjs NEW 17/17 (rebind persistence, undo/redo of the
  action set, reload, preview move/jump/no-space-jump, published parity,
  export markers, diagnostics); regressions tilemap 44/44, gameplay 21/21,
  camera 34/34, motion 11/11; 0 console errors.
- Honest: keyboard bindings only (nothing claims mouse/touch-device
  bindings); "when action pressed" block deferred with a recorded dispatch
  design (global action → per-component handlers); this machine kills
  background processes under memory pressure — all gates completed across
  restarts, none skipped; commit still blocked (no git on machine).
- Next: SLICE 1b (action-pressed handler event), then SLICE 2 (sprite
  animation foundation).

## Session 46 addition (2D engine SLICE 1b — action-pressed handler event)

- "When [Action] pressed" shipped as a real edge-triggered event in the
  EXISTING handler architecture: event identity `action-pressed-<actionId>`
  (logical id, never keys — rebinds/renames never break handlers), offered
  in the blocks event picker from the same screen.inputActions data
  (screen-level or any entity), dispatched by
  runtime.dispatchActionPressed — live screen's screen-level handlers
  first, then component handlers in model order (nested included) — once
  per just-pressed edge, before physics; export.go mirrors the fan-out 1:1.
  i18n EN/ID for the event labels; trace rides the existing runtime trace.
- REAL pre-existing bug found and fixed: Go omitempty DROPS componentId for
  screen-level handlers, so after save+reload the client saw undefined and
  `undefined === null` never matched — every screen-level handler was dead
  after a round-trip. Normalized (componentId ?? null) in handlersFor, the
  new dispatcher, and the export mirror. Caught by the E2E (screen-level
  handler dispatched live but not after reload).
- Diagnostics: deleted-action reference warns (handler survives), disabled
  action warns.
- Gates: e2e-input-actions 17 → 32 checks, 32/32, 0 console errors
  (edge/hold/release/second-press semantics, multi-handler fan-out, visible
  set-property effect, published parity, export markers, broken-reference
  diagnostics, undo/redo through existing history); regressions tilemap
  44/44, gameplay 21/21, camera 34/34, sorting 19/19, motion 11/11;
  tsc clean; go vet clean; go test 12/12; next build green.
- Honest: mouse/gamepad bindings still absent (nothing claims them);
  "action held/value" conditions are future work; diagnostics "where" label
  still prints "Component undefined" for reloaded screen-level handlers
  (cosmetic, pre-existing); commit still blocked (no git on machine).
- STOP per directive — awaiting approval. Next queued: SLICE 2 (sprite
  animation foundation).

## Session 47 addition (2D engine SLICE 2 — Sprite Animation Foundation)

- Reconciliation: the Asset Studio authors SpriteDocs in localStorage and
  saves frames as REAL PNGs through the project asset API — so the bridge
  to runtime animation is asset refs, not a second frame store. PropsMap is
  scalar-only, so clips follow the tilemap string convention: per-entity
  `animations` prop ("id~name~fps~loop~f1,f2;…") + `animation` (active clip
  id). Frames reference the same "asset:<id>" refs as `src`.
- Runtime: playback state is a ref map (clip/elapsed/paused/done) advanced
  by dt in the scene tick — loop wraps, non-loop clamps and completes;
  blocks queue play/pause/restart/stop commands (camera-command pattern)
  drained against runtime state only; EntityView renders the current frame
  with a graceful fallback to the static src when a frame asset is missing.
  Blocks `play animation {clip} on {component}` / `stop animation on
  {component}`: registry + executeBlock + codegen (api.playAnimation/
  stopAnimation) + export runBody/tick.
- Editor: sprite inspector Animation section — clip CRUD, fps, loop,
  active-clip radio, frame thumbnails with reorder/remove, add-frame from
  the real asset library, editor-local Play/Pause/Restart preview (rAF).
- Export: parses the same clips from the embedded model, dt-based sceneTick
  playback, data-frame-ref-guarded img swaps, same command drain.
- Gates: e2e-sprite-animation NEW 18/18 (real PNG uploads via asset API,
  round-trip, panel UI, editor preview cycle, undo/redo verified against
  the model, actual preview/published animation, action-triggered clip
  switch, non-loop completion, export markers, missing-asset safety);
  regressions input-actions 32/32, tilemap 44/44, gameplay 21/21, camera
  34/34, sorting 19/19, motion 11/11; tsc clean; go vet clean; go test
  11/11 packages with tests (correcting earlier "12" miscounts); next
  build green.
- Honest: Asset Studio SpriteDoc unchanged (the bridge is saved frame
  PNGs via the existing pipeline); block vocabulary play/stop only
  (pause/restart exist in the command path, palette entries skipped to
  avoid speculative blocks); e2e-motion press check made load-robust
  (poll for transform) after one chain-tail flake; commit still blocked
  (no git on machine).
- STOP per directive — awaiting approval. Queued: SLICE 3 (animation state
  machine) or lighting/particles per master priority.

## Session 48 addition (2D engine SLICE 3 — Sprite Animation State Machine)

- States machine shipped as a canonical `animator` prop (string payload:
  S/P/T/D entries — states reference clip ids, parameters bool/number/
  trigger, transitions with from/To/priority/exitTime/conditions, default
  state). Deterministic evaluator in scene.ts (priority order → model order,
  at most ONE switch per tick, exit time = clip progress fraction, triggers
  fire once per pass).
- Runtime: built-in parameters (speed = |vx|, isGrounded = grounded) fed
  every tick from the player's ACTUAL physics; custom parameters fed by
  blocks; taken transitions drive the SLICE 2 player (clip switch, frame 0,
  state speed multiplier); PlayerView renders the machine's frame.
  Export.go mirrors everything over the embedded model (all three targets).
- Blocks: set-animation-param + trigger-animation-param (IR, executeBlock,
  codegen api.setAnimationParam/triggerAnimationParam, export runBody).
- Editor: sprite/player/enemy inspector "Animation state machine" panel —
  enable flow, states (name/clip/speed/default radio), typed parameters,
  transitions (from incl. Any State, priority, exit time, condition text
  `speed>0 && attack==1`), delete with transition cleanup; one undoable
  commit per edit.
- Diagnostics: missing clip reference, missing default state, dangling
  transitions, unknown condition parameters — runtime stays stable.
- Playable E2E (20/20): Idle (default) → Run (speed>0) → Idle (speed<=0)
  → Jump (isGrounded==0) → Idle (landing) → Attack (trigger via a dedicated
  Attack action) → Idle (non-loop completion, exit time 1) — through the
  real machine in preview, again after save+reload, on the published page,
  with the export carrying machine + evaluator + blocks.
- Gates: tsc clean; go vet clean; go test 11/11 packages; next build green;
  regressions input-actions 32, tilemap 44, gameplay 21, camera 34, sorting
  19, motion 11, sprite-animation 18 — all 0-fail.
- Honest: exit time is a progress fraction (no seconds-based/cross-fade);
  no set-state block (the machine is the only state authority); the editor
  is a structured list, not a node canvas; commit still blocked (no git).
- STOP per directive — awaiting approval.

## Session 49 addition (2D engine SYSTEM 5 — Real-time 2D Lighting)

- Lights now genuinely illuminate the rendered scene: a single world-anchored
  compositing layer inside the camera-translated world container — an ambient
  veil (screen styles color at opacity 1 − intensity) plus one screen-blended
  radial gradient per enabled point light. Real browser compositing whose
  output is the visible brightness of every world object (sprites, animated
  frames, colored shapes, tilemap cells), not decorative gradients.
- Canonical model: new `light` entity type (camera-pattern configuration
  entity: enabled/color/intensity/radius props, position from the transform;
  never collides, never fires touch events, excluded from export entity
  rendering) + ambient in the scene screen styles (ambientColor/
  ambientIntensity). All values clamp at parse (intensity 0–5, radius
  8–2000, ambient 0–1, invalid hex falls back) — documented limits: ≤ 8
  active lights. Go side stores props/styles as free maps (no schema change).
- Camera integration: the layer offsets by the camera origin (incl. shake)
  each frame — lights stay world-anchored while covering the viewport.
  Sorting untouched; animation untouched; HUD/preview chrome outside the
  world container stays unlit. Tilemap cells lit at render time (canonical
  tiles never baked).
- Editor: Light in the Game Entities palette + tree + canvas (glowing-dot
  handle + dashed radius-ring gizmo reflecting real config, pointer-events
  none, never exported); inspector fields via the generic renderer; screen
  Appearance gained Ambient color + intensity. Diagnostics: out-of-range
  intensity/radius, non-hex color, out-of-range ambient.
- No lighting blocks (no requested gameplay need; the SLICE 2/3 command
  pattern is the extension point).
- Gates: e2e-2d-lighting NEW 19/19 (gizmo, fields, edit+undo+redo vs model,
  ambient veil opacity 0.75 at 0.25, gradient 2×radius in color with screen
  blend, camera tracking, disable, tilemap-in-world, chrome unlit, clamps +
  diagnostics, published layer, export engine); regressions input-actions
  32, tilemap 44, gameplay 21, camera 34, sorting 19, motion 11,
  sprite-animation 18, state-machine 20 — all 0-fail; tsc clean; go vet
  clean; go test 11/11 packages; next build green.
- Honest: compositing illumination (no per-pixel normal maps or
  shadows/occlusion); directional/spot lights intentionally deferred; no
  lighting blocks; commit still blocked (no git on machine).
- STOP per directive — awaiting approval. Queued: particles.

## Session 50 addition (2D engine SYSTEM 18 — Real 2D Particle / VFX System)

- ONE particle architecture: `lib/project-model/particles.ts` — clamped
  config parsing (NaN/Infinity-proof, documented bounds: rate 0–500/s,
  lifetime 0.05–30 s, speed 0–2000, size 0–500, opacity 0–1, gravity ±2000,
  maxParticles 1–1000) + `ParticleSim` (accumulator-based continuous
  emission without drift, cone spawning direction±spread, dt aging, gravity,
  start→end size/opacity interpolation, swap-remove recycling, hard array
  bound). The new `emitter` scene entity holds the authored config; particle
  instances are runtime-only and never persisted.
- Rendering: ONE world-anchored bounded canvas per scene (imperative draw in
  the tick — no DOM nodes per particle, no React state per particle),
  EMISSIVE — drawn above the lighting layer (documented decision).
  data-particle-count observability attribute.
- Blocks: burst {count} particles on {emitter} — IR, executeBlock →
  particleCommands, codegen api.burstParticle, export runBody + tick drain.
- Export: vanilla mirror of the sim + canvas in buildScene/sceneTick — full
  parity across all three targets.
- Editor: emitter in palette/tree/canvas with direction-cone gizmo; all
  properties as generic inspector fields. Diagnostics: rate/lifetime/max
  particles out of range + non-hex color.
- Gates: e2e-2d-particles NEW 22/22 (persistence, gizmos, fields, edit +
  undo + redo, equilibrium at rate×lifetime, canvas pixel evidence, camera
  anchoring, bounded counts, burst spike + expiry, published parity, export
  engine, invalid-config stability); regressions input-actions 32, tilemap
  44, gameplay 21, camera 34, sorting 19, motion 11, sprite-animation 18,
  state-machine 20, lighting 19 — all 0-fail; tsc clean; go vet clean;
  go test 11/11 packages; next build green.
- Honest: no per-particle rotation or tinted textures (deferred with the
  offscreen compositing they require); emissive-only lighting mode; commit
  still blocked (no git on machine).
- STOP per directive — awaiting approval.

## Session 51 addition (TASK 51 — 3D Engine Foundation)

- The 3D path became REAL: project type "3d" (web union + Go vocabulary +
  migration 056 replacing projects_type_check — the DB constraint was the
  cause of a 500 on create), 3D entities cube3d/sphere3d/plane3d/camera3d
  with canonical scalar transform props (px/py/pz, rx/ry/rz, sx/sy/sz), and
  a custom software 3D renderer on Canvas 2D (lib/render3d.ts + vanilla
  mirror in export.go): perspective camera, near clipping, backface
  culling, painter's depth sort. No 3D library added (decision documented).
- Editor: Viewport3D (orbit navigation, grid, axes, click-select) replaces
  the 2D stage for 3d projects only; "3D Objects" palette category gated to
  3d projects; inspector transforms via generic fields — all undoable.
- Runtime parity: preview-mode and live-app (published) mount the SAME
  Viewport3D in runtime mode with the active camera3d; export embeds the
  vanilla mirror (draw3D/render3DScene over data-3d-canvas).
- Diagnostics: no camera / no active camera, FOV range, near ≥ far.
- REAL 3D evidence: pixel-sampled occlusion swap — the nearer cube's color
  wins the overlap; moving it behind the camera plane swaps the winner.
- Gates: e2e-3d-foundation NEW 18/18; regressions input-actions 32, tilemap
  44, gameplay 21, camera 34, sorting 19, motion 11, sprite-animation 18,
  state-machine 20, lighting 19, particles 22 — all 0-fail; tsc clean;
  go vet clean; go test 11/11 packages; next build green.
- Honest: FUNCTIONAL/TESTED, not PRODUCTION READY (no 3D gameplay/lights/
  materials/animation; painter's algorithm; no transform gizmo); labels
  follow the inspector's English-only convention; commit still blocked
  (no git on machine).
- STOP per directive — awaiting approval before TASK 52.

## Session 52 addition (TASK 53 — 3D Scene Hierarchy + Parenting + Local/World Transform)

- The 3D structural layer shipped on the canonical model: `parentId` prop
  (scalar, canonical — child lists DERIVED), local transforms authored,
  world transforms derived as parent.world × local via pure evaluation in
  `lib/hierarchy3d.ts` (memoized recursion, cycle/self/missing branches →
  root, depth limit 32, issues surfaced).
- Renderer: Mesh3D.matrix (world, column-major mat4) consumed by meshFaces;
  mat4 helpers in render3d.ts. The painter's pass/camera unchanged.
- Editor: Hierarchy panel in the 3D viewport (derived tree, expand/collapse,
  select synced, duplicate-subtree + delete hover buttons); inspector
  "Hierarchy" section — Parent picker (self+descendants excluded), read-only
  derived world position, Duplicate/Delete. Ops: setParent3D,
  duplicateHierarchy3D (id remap), removeComponent3D (children reparent to
  grandparent — documented delete semantics). Each one undoable commit.
- Export: vanilla hierarchy mirror (computeWorldMatrices3D + world-matrix
  vertex transform) over the embedded model — all web targets.
- Gates: e2e-3d-hierarchy NEW 17/17 (visual pixel-centroid evidence:
  parent move moves child, parent rotate 90° re-orbits child, grandchild
  under scaled parent, parentId persistence, duplicate remap, delete
  reparent, cycle diagnostic + runtime stability, preview parity, export
  markers); regressions 3d-foundation 18/18, input-actions 32/32, tilemap
  44/44, gameplay 21/21, camera 34/34, sorting 19/19, motion 11/11,
  sprite-animation 18/18, state-machine 20/20, lighting 19/19; tsc clean;
  go vet clean; go test 11/11 packages; next build green.
- Honest: world transform read-only (no world→local editing); no DnD
  reparenting; depth limit 32; painter's algorithm; English-only inspector
  labels; commit still blocked (no git on machine).
- STOP per directive — awaiting approval before TASK 54.

## Session 53 addition (TASK 54 — Real 3D Physics Foundation)

- Real, deterministic, model-driven 3D physics. Canonical scalar props
  (no schema change): bodyType none/static/dynamic, colliderType
  none/box/sphere, colliderSizeX/Y/Z, colliderRadius, isTrigger,
  gravityEnabled, mass; scene gravity gravityX/Y/Z in screen styles.
  Collider convention: collider dimensions × entity world scale (gizmos,
  web runtime, and export all agree).
- Solver `lib/physics3d.ts`: fixed timestep 1/120 s (≤ 4 catch-up steps),
  world-aligned box/sphere colliders, box/box min-translation +
  sphere/sphere distance + sphere/box closest-point, positional correction
  split by inverse mass (static = infinite), velocity correction along the
  normal, grounded on ny > 0.5, trigger enter/stay/exit via tracked pairs,
  bounded limits (64 bodies, gravity ≤ 100, mass ≤ 10000).
- Runtime: physics seeds ONCE per mount in the mount-stable 3D rAF loop
  (refs mirror the model — re-renders never re-seed); dynamic bodies render
  at simulated positions (translation overridden in the world matrix);
  trigger events dispatch via the EXISTING touches-/touches-exit- handler
  vocabulary; observability attributes data-physics-bodies /
  data-trigger-overlaps / data-physics-grounded on the canvas.
- Export (`export.go`): vanilla mirror (sphere-aware overlapBetween);
  render3DScene now IDEMPOTENT per screen (a trigger-handler rerender only
  refreshes meshes/camera — no mid-run physics re-seed, no rAF loop
  stacking; monotonic run-id stops superseded loops); exported meshes read
  runtime props so set-property shows in exported runs.
- Editor: collider gizmos (amber solid / dashed mint trigger, editor-only),
  Physics3DPanel (Body/Collider/Size/Radius/Trigger/gravity/Mass), scene
  gravity fields, mass + collider range diagnostics.
- Real regressions caught by the suites and fixed THIS session: (a) 3D
  preview had lost world matrices for non-dynamic meshes (hierarchy broken
  — caught by e2e-3d-hierarchy); (b) state-machine panel had been gated to
  `sprite` only (player/enemy lost it — caught by e2e-animation-state-
  machine); (c) the penetration split was mass-weighted instead of
  inverse-mass-weighted; (d) export emit() rerender could rebuild the 3D
  canvas mid-run (hang).
- Gates: e2e-3d-physics NEW 24/24 (fall from Y 5 sampled at 60 ms, lands
  y ≈ 0.5 without tunneling, grounded, stable rest, restart restores py 5,
  trigger overlap + handler recolor blue→rose ≥ 10 000 rose pixels,
  published parity, EXPORTED HTML run from disk lands + grounded with no
  page errors); regressions 12 suites green (3d-foundation 18, 3d-hierarchy
  17, input-actions 32, tilemap 44, gameplay 21, camera 34, sorting 19,
  motion 11, sprite-animation 18, state-machine 20, lighting 19, particles
  22); tsc clean; go vet clean; go test 11/11 packages; next build green.
- Honest: no rotation in collision response (world-aligned AABBs), no
  torque/friction/restitution/joints/raycasts, no physics debug overlay.
- STOP per directive — awaiting approval before TASK 55.

## Session 54 addition (TASK 55 — Real 3D Material + Lighting Foundation)

- Real material + lighting INSIDE the existing Canvas 2D software
  rasterizer — reconnaissance re-validated Task 51's architecture decision
  (per-face color computation before fill; no Three.js/WebGL, no DOM
  overlay, no second renderer/material/lighting system).
- Canonical material: baseColor = the mesh's existing `color` prop (hex-
  validated, safe fallback). Roughness/metalness UNAVAILABLE in a flat-fill
  rasterizer → documented, NO controls exposed (no fake UI).
- Canonical light: ONE new `light3d` entity — point | directional (both
  real), enabled/color/intensity (0–5)/radius (0.1–1000, the real point
  attenuation range). Uses the EXISTING transforms (rotation = emission
  direction for directional) and FULLY participates in the Task 53
  hierarchy. Explicitly non-physics (no collider/body; physics inspector
  gated to meshes via a T3D_TYPES/T3D_PHYSICS_TYPES split).
- Shading: per visible face during rasterization — base ×
  clamp01(ambient + Σ intensity·atten·max(N·L,0)·lightColor); geometric
  world-space face normals (viewer-oriented, degenerate-safe); point
  attenuation 1 − dist/radius; ambient from the existing ambientColor/
  ambientIntensity scene styles (3D defaults white × 1 → scenes without
  lights render pixel-identically to before). Max 8 active lights.
- Editor: light gizmos (marker + influence ring / direction arrow, dimmed
  when disabled, editor-only); collider gizmos now draw only for entities
  with an actual collider; Material section (Base Color) + Light fields +
  explainer; material/light/range/ambient diagnostics.
- Export: full vanilla mirror (parseLight3DProps/parseAmbient3D/
  resolveLights3D/shadeFace3D — identical equations, same hierarchy
  evaluation); the idempotent render3DScene refresh re-resolves lights.
- Gates: e2e-3d-material-lighting NEW 42/42 with pixel evidence — (A)
  exact base color + full repaint on a Material edit; (B) light on/off
  moves face luminance from the ambient floor to >60 and back; (C) light
  position changes face illumination (front face 15.5 → 178 when the light
  drops from above to level); (D) surface-orientation proof — equal-distance
  light in FRONT of a face lights it, BEHIND does not; plus hierarchy
  (parented light keeps the moved cube lit), persistence of every value,
  undo/redo, malformed-config diagnostics + stability, the 8-light
  boundary, 390px parity, exported HTML run from disk (lit, no errors);
  regressions 12 suites green; tsc clean; go vet clean; go test 11/11
  packages; next build green.
- Honest: flat per-face shading (no per-pixel pools on large quads), no
  shadows/specular/spot/area/probes, roughness/metalness unavailable,
  top-face sliver at typical cameras, pre-existing 390px chrome
  scrollWidth artifact (2D parity guarded), English-only inspector labels.
- STOP per directive — awaiting approval before TASK 56.

## Session 55 addition (TASK 56 — Real 3D Transform Gizmos)

- Real editor-side move/rotate/scale gizmos in the 3D viewport — real
  ray/pointer interaction, no visual fake, no new engine, no second
  transform/undo/scene system. Gizmos are editor-only: never in preview,
  published, exported HTML, or project data.
- Math (`lib/transform-gizmo.ts`, new, pure): exact pointer-ray unprojection
  through the active camera; MOVE = closest point between the pointer ray
  and the axis line (deterministic, no pixel-to-world multiplier), converted
  back to canonical LOCAL via the parent's inverted world matrix
  (`mat4Invert`, new, determinant-guarded) — hierarchy rules stay the only
  source of truth; ROTATE = ray∩ring-plane → wrap-safe delta on the matching
  canonical Euler axis (rx/ry/rz kept); SCALE = pointer projection on the
  axis' screen direction, per-axis start values, clamped 0.1–100, NaN-safe.
- Interaction: editor toolbar (Move/Rotate/Scale + Local/World) + W/E/R
  shortcuts; Escape cancels mid-drag (capture-phase, before the builder's
  Escape-deselect); picking uses the SAME projected geometry as drawing
  (`projectTransformGizmo`); drags preview hierarchy-aware without touching
  the model; pointer release commits ONE canonical `updateProps` = ONE undo
  entry; the camera never orbits while transforming.
- Wiring: `canvas.tsx` passes `onTransform` → `actions.updateProps` (the
  existing canonical action/undo pipeline — no new history system).
- Gates: e2e-3d-transform-gizmos NEW 34/34 (pointer-driven drags at the
  projected handle positions with model + pixel evidence: move X/Y/Z +
  rendered-centroid movement, one drag = one undo entry exact to 1e-6 +
  redo, rotate X/Y/Z rings + inspector parity, scale X/Y/Z + pixel growth +
  extreme-drag clamping, Local/World orientation change, parent-child
  semantics, inspector↔gizmo parity both directions, save/reload, Escape
  cancel, zero console errors); regressions 13 suites green (3d-foundation
  18, 3d-hierarchy 17, 3d-physics 24, 3d-material-lighting 42, input-actions
  32, tilemap 44, gameplay 21, camera 34, sorting 19, motion 11,
  sprite-animation 18, state-machine 20, 2d-lighting 19, 2d-particles 22);
  tsc clean; go vet clean; go test 11/11 packages; next build green.
- Honest: rotate rings map deltas to the matching local Euler axis (world-
  space ring drags on parented objects may differ visually); no depth axis,
  snapping, or multi-select; gizmo draws without mesh occlusion.
- STOP per directive — awaiting approval before TASK 57.

## Session 56 addition (TASK 57 — Real 3D Character Controller + Input)

- The first real 3D gameplay: a designated player entity moves (W/A/S/D +
  arrows, camera-relative), jumps (Space, physics-driven), falls, lands, and
  collides — in Preview, Published, and Exported HTML with ONE
  implementation. No new engine/physics/input/transform system anywhere.
- Canonical model: controller props on the player entity
  (controllerEnabled/moveSpeed/acceleration/deceleration/jumpForce/airControl,
  clamped at parse); gravity reuses the TASK 54 physics prop; runtime state
  (velocity/grounded/input) never persisted; maxSlopeAngle not implemented
  and not exposed.
- Player designation: first enabled controller wins (deterministic);
  diagnostics for multiple controllers, controller without a dynamic body,
  gravity disabled, all ranges, and a no-controller info note.
- Input: the EXISTING inputActions abstraction — five semantic slots
  (`move-forward`/`move-backward` join the established `move-left`/
  `move-right`/`jump`), resolved from the screen's canonical actions
  (rebindable) with built-in 3D defaults; runtime-only pressed-key set;
  editor shortcuts untouched.
- Movement: normalized input vector, basis from the ACTIVE camera's facing,
  velocity-based with acceleration/deceleration × airControl applied per
  fixed step BEFORE the existing PhysicsWorld.step — the controller decides
  velocities, the existing physics integrates/collides/resolves (one world,
  one timestep, one authority). Jump = one impulse per press edge while
  grounded (no hold-stacking, airborne rejected).
- Gates: e2e-3d-character-controller NEW 35/35 (real keyboard gameplay:
  W/S/A/D camera-relative displacement, solo speed = moveSpeed, normalized
  diagonals, deceleration to rest, gravity fall/land/grounded/stable rest,
  jump rise/return/no-hold-repeat/airborne rejection, wall blocking at the
  exact face + no tunneling, restart reset, save/reload, published movement,
  exported-run-from-disk movement + jump, no editor UI in runtime); 
  regressions 14 suites green (3d-foundation 18, 3d-hierarchy 17, 3d-physics
  24, 3d-material-lighting 42, 3d-transform-gizmos 34, input-actions 32,
  tilemap 44, gameplay 21, camera 34, sorting 19, motion 11, sprite-animation
  18, state-machine 20, 2d-lighting 19, 2d-particles 22); tsc clean; go vet
  clean; go test 11/11 packages; next build green.
- Honest: NOT IMPLEMENTED/DEFERRED — slopes, stairs, crouch/sprint, ledge
  climbing, swimming, ladders, double/wall jump, moving platforms, root
  motion, full 3D camera controllers, ragdoll, navmesh, advanced character
  animation, capsule colliders, touch controls, 3D camera follow. Box
  character collider (no fake capsule).
- STOP per directive — awaiting approval before TASK 58.

## Session 57 addition (Cloudflare Workers Web Deployment — Phase 1B)

- The Cloudflare failure (`npm error Unsupported URL Type "workspace:"`) came
  from automatic framework detection running npm against the pnpm workspace.
  Fixed WITHOUT touching the monorepo: an explicit, toolchain-generated
  Workers configuration inside apps/web so Cloudflare never runs detection
  again.
- `pnpm dlx vinext check` → 87% compatible, no blockers (partials documented:
  next/font/google CDN fonts; App Router strict-mode wrapping).
- `pnpm dlx vinext init --platform=cloudflare` generated: `apps/web/
  wrangler.jsonc` (Worker `web`, main = vinext/server/fetch-handler,
  nodejs_compat, assets dist/client, IMAGES binding), `apps/web/
  vite.config.ts` (vinext + @cloudflare/vite-plugin, rsc/ssr environments),
  `apps/web/.gitignore` (dist/.vinext/.wrangler), and scripts
  `dev:vinext`/`build:vinext`/`start:vinext`/`deploy:vinext` — existing
  dev/build/start/check untouched. react/react-dom 19.1.0→19.3.0 (vinext
  RSC requirement; next dev/build verified green on 19.3.0); "type":
  "module" added. `pnpm-workspace.yaml` allowBuilds placeholders completed
  (esbuild: true, workerd: true — sharp: false kept).
- workspace safety: `@ideaven/ui = workspace:*` INTACT; no duplication, no
  flattening; pnpm install from the repo root works.
- Verification: `build:vinext` exit 0 (32 routes); Workers preview
  (`start:vinext`, wrangler dev on :8787) verified in a real browser —
  scripts/verify-cf-preview.mjs 12/12 (landing/login/register/pricing/
  explore/docs render, header nav, builder route falls back without a
  backend, ZERO pageerror + ZERO hydration errors; the only console errors
  are API connection refusals — expected, the Go API is intentionally not
  deployed for Workers); `wrangler deploy --dry-run` exit 0.
- Full regression after the change: 15 E2E suites green (3D controller 35,
  material-lighting 42, gizmos 34, physics 24, foundation 18, hierarchy 17;
  2D: tilemap 44, input-actions 32, camera 34, particles 22, state-machine
  20, lighting 19, sprite 18, gameplay 21, sorting 19, motion 11); tsc
  clean; go vet clean; go test 11/11; next build exit 0 (Vercel untouched
  and authoritative).
- Also: created a manual test account via the auth API for the owner to try
  the 3D features (credentials shared in chat only — not committed).
- Honest: the Workers deployment has NO backend yet (auth flows fail there
  until the Go API phase — not faked); vinext 1.0.0-beta; real dashboard
  deploy pending Cloudflare account auth (deploy command: pnpm run
  deploy:vinext, root dir apps/web, no detection overrides). Rollback
  procedure in docs/CLOUDFLARE_WEB_DEPLOYMENT.md §12.
- STOP per directive — awaiting approval before Cloudflare Phase 2.

## Session 58 addition (TASK 58 — Builder Shell + Viewport + Iconography Integrity)

- Builder presentation layer fixed at root-cause level (no engine changes):
  ONE scale owner for the device viewport — the rendered unit (frame + bezel
  + shell) is MEASURED at native size (offsetWidth/Height, transform-
  invariant) and the layout spacer reserves exactly measured × scale while
  the unit carries the single transform; the screen inside stays native.
  Fixes clipping, detached content, and strange zoomed-down phones. The old
  structure scaled the SCREEN inside a native-size bezel (game branch) —
  the exact forbidden double scaling.
- Shell routing by model.type ONLY: 3D projects get a dedicated full-surface
  Viewport3D shell with a `3D SCENE · <screen>` identity chip and NO
  Phone/Tablet/Desktop presets or zoom/orientation chrome; device presets
  are APP-only; game keeps the dark stage + scene chip. Shells persist
  across reload.
- Header: fixed 3-zone flex (brand shrink-0 / nav flex-1 scrollable /
  actions flex-1 scrollable) — no logo/nav overlap from 390 to 1280px, no
  absolute-position workarounds.
- 390px page overflow root cause: the Diagnostics strip header forced the
  shell to 418px; its tab row now scrolls internally (scrollWidth exactly
  390 at the narrowest width).
- Block icons: BLOCK_ICON_PATHS covered 15/34 built-ins (19 rendered a
  generic square). Added 19 hand-drawn paths (tts-speak, tinydb get/store,
  play/stop/set/trigger animation, camera shake/target, canvas clear/draw,
  location globes/pin, notifier, web-get, burst, boolean) + per-category
  fallbacks for extension blocks. ONE resolution chain: explicit icon →
  category fallback → square (truly unknown only).
- Palette: 3D projects surface ONLY 3D Objects (no Game Entities, no app UI
  groups); game surfaces Game Entities without 3D Objects. Empty states:
  3D (Cube/Sphere/Plane) + game (Player/Sprite/Platform) quick-create
  buttons call actions.insertNew — the canonical insertion, API-verified.
- Gates: e2e-builder-shell-integrity NEW 35/35 (three shells route by
  model.type + persist across reload, 3D no app-device controls, empty-state
  canonical insertions, palette isolation, ZERO generic fallback squares
  across the live Blocks palette, 22 required built-ins render real icons,
  measured-rectangle fit/zoom/landscape checks, responsive 390/768/1024/1280);
  regressions 16 suites green (3d-character-controller 35, material-lighting
  42, gizmos 34, physics 24, foundation 18, hierarchy 17, tilemap 44,
  input-actions 32, camera 34, particles 22, state-machine 20, lighting 19,
  sprite 18, gameplay 21, sorting 19, motion 11); tsc clean; go vet clean;
  go test 11/11; next build exit 0; build:vinext exit 0.
- Honest: bezel-inclusive aspect assertions pin the current 26px phone bezel;
  builder at 390px is a compressed desktop shell (no dedicated mobile
  editor); extension blocks cannot ship custom icons yet.
- STOP per directive — awaiting approval before TASK 59.

## Session 59 addition (TASK 59 — Engine Launcher + Creation Hub)

- The three REAL creation engines now have an intentional front door: the
  Creation Hub at `/dashboard/projects/new` with three environment cards
  (Application / 2D Game / 3D Game) — icons, honest env labels (3D ENGINE ·
  FOUNDATION AVAILABLE), real capability chips, lightweight previews derived
  from the actual visual language, and Start actions.
- ROOT CAUSE FIXED: the old wizard's 3D choice stored a local flag that was
  never sent — users choosing 3D got type "game" projects; the stale "3D in
  development" notice is gone. `type` now flows canonically (app/game/3d)
  into `projectApi.create` and the loaded `model.type` decides the engine
  surface (no URL-only modes).
- Builder engine identity: `[ APP / 2D GAME / 3D GAME ]` chip
  (`data-engine-identity`, `engineIdentityLabel`) + environment menu — a
  CREATION NAVIGATOR: choosing another environment opens a confirm dialog
  and creates a NEW project (loading/disabled/error states); the current
  project is never mutated (screens JSON verified byte-identical in E2E).
- Duplicate prevention: `creatingRef` + disabled submit — one intent = one
  project (E2E double-activation verified); real errors stay on the hub with
  the environment preserved (injected-500 E2E).
- App empty state: Create your first component [Button][Text][Image] via
  `actions.insertNew`; game empty state consolidated into screenRoot.
- New `IconCube3D` (isometric cube, same stroke language) for the 3D engine
  identity.
- Gates: e2e-engine-launcher NEW 31/31 (hub, three cards, Start App/2D/3D →
  correct canonical types + builders, engine identity per type, reload
  persistence, cross-navigation safety, duplicate prevention, injected-500
  error handling, responsive 390–1280, keyboard Tab/Enter/Escape); 16
  regression suites green (shell-integrity 35, controller 35, lighting 42,
  gizmos 34, physics 24, foundation 18, hierarchy 17, tilemap 44,
  input-actions 32, camera 34, particles 22, state-machine 20, lighting 19,
  sprite 18, gameplay 21, sorting 19, motion 11); tsc clean; go vet clean;
  go test 11/11; next build exit 0; build:vinext exit 0.
- Honest: AI start remains Coming soon; 3D card claims Foundation available
  only; environment menu creates anonymous-name projects.
- STOP per directive — awaiting approval before TASK 60.

---

## SESSION 61 â€” TASK 61: Creation Visuals + Real Device Orientation + Responsive Builder Polish (2026-10-03)

- CreationPreview: ONE deterministic inline-SVG system for App/2D/3D in the
  real engines' visual language; wired into Creation Hub + Dashboard cards
  (3D projects no longer show the app glyph); labelled media (role=img);
  nothing invented, nothing that can 404. Asset contract documented
  (public/ideaven/creation-previews/ via the one component).
- Landscape fixed at the root: orientation-aware DeviceFrame (chrome
  repositions as one object) + two-axis, bezel-aware, stage-measured fit;
  ONE dimension source (VIEWPORT_SIZES); one scale owner preserved;
  orientation stays a preview setting.
- Toolbar root fix: actions zone is content-sized (shrink-0) â€” the measured
  77px collision at 1440 is gone; semantic groups + separators; Save/
  Publish/Export visually distinct with honest tooltips; 390px compaction
  (theme into the overflow menu, icon-only Save) with zero overflow.
- REAL bugs caught by geometry/sweep and fixed: flex-1 actions-zone
  leftward overflow (real collision), game-unit block-div measurement
  feedback loop (shell collapsed to a sliver at scale < 1), duplicated
  device dimension constants.
- Gates: task61 NEW 45/45; 22 suites green (incl. task60 47/47,
  shell 35/35, material-lighting 42/42, tilemap 44/44); launch-audit 20
  routes green with IV_COOKIE; tsc/go vet/go test -count=1/next build/
  build:vinext/verify-cf-preview 12/12 green. Four legacy suites' import
  pattern fixed so they actually run; e2e-community.mjs recorded as
  pre-existing drift (first 13 checks green; rest references UI the current
  page never had) â€” flagged for a rewrite task, not faked.
- STOP per directive â€” awaiting approval before TASK 62.
---

## SESSION 62 â€” TASK 62: Real 2D Game Engine Core + Professional 2D Authoring (2026-10-04)

- Sprite authoring: visual asset picker (thumbnails + measured dims +
  choose/replace/clear), canonical pivot (presets + numeric) and flip X/Y â€”
  ONE render formula across editor/preview/published/export.
- Tilemap: visual palette editor (color picker, add/remove/reorder, per-tile
  solid/pass flags in the canonical palette string), flood fill +
  erase-fill (bounded BFS, one gesture one undo), rule tiles upgraded to
  six neighborhood classes (cross/T/straight/corner/end/isolated), live
  collision flags (solid blocks, pass decorates) with export parity.
- Camera pixel-snap mode (canonical prop, whole-pixel rendering, export
  mirror). Editor workflow: ctrl+click multi-select, marquee, group
  move/duplicate/delete/align (ONE commit each), z-order shortcuts, debug
  overlays (default OFF), grid toggle, Play/Stop, flat GameObject list,
  scene duplicate/reorder, empty-state guidance. Asset Studio: sprite-sheet
  import + grid slicing into real PNG assets.
- Gates: task62 NEW 61/61; 20 regression suites green (incl. task60 47/47,
  tilemap-paint 44/44, shell 35/35); tsc clean; go vet clean (fixed a real
  unescaped-% in the new export template); go test -count=1 ok; next build
  0; build:vinext 0; verify-cf-preview 12/12.
- Honest: layer lock, prefab ecosystem, camera dead-zone/zoom deferred
  (documented); straight-run shading is a visible rule-tile upgrade.
- STOP per directive â€” awaiting approval before TASK 63.
---

## SESSION 63 â€” TASK 63: Beginner Workspace Navigation + Scrollable Editor Panels (2026-10-04)

- Mode strip: Alt+1..5 shortcuts, tooltips, underline active state;
  ROOT-CAUSE FIX â€” justify-center spilled overflowing tabs under the brand
  (measured click interception); now justify-start. One compact breadcrumb
  (project / ENGINE / MODE), pointer-events-none.
- Left panel: sticky palette search (label+type+category+aliases), folding
  categories persisted per project type (primary "Â· start here" open).
- Inspector: collapsible sections with aria state; independent rail scroll
  preserved across selection changes.
- Panel collapse rails (desktop) + palette/inspector drawers (390/768) with
  one-drawer rule, backdrop + window Escape close.
- Wheel routing proven three ways: 3D viewport wheel zooms the orbit;
  palette/inspector wheel scrolls those panels.
- Secondary toolbar tools compact below 2xl (measured 67px overflow at
  1280 fixed); Undo/Redo always inline.
- Gates: task63 NEW 42/42; 20+ suites green (incl. task60 47, task61 45,
  task62 61, shell 35, tilemap 44); tsc/go vet/go test -count=1/next
  build/build:vinext/verify-cf-preview 12/12 green.
- STOP per directive â€” awaiting approval before TASK 64.