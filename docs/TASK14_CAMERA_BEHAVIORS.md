# TASK 14 — 2D Camera Behaviors (Follow, Smoothing, Bounds, Shake)

Status: **IMPLEMENTED & VERIFIED**. This is the evidence sheet: model, runtime
semantics, editor, blocks, export parity, tests, and browser verification.

## 1. One source of truth

The runtime camera is a real entity in the canonical Project Model
(`type: "camera"`, a Game Entities palette item). One component holds the
whole configuration:

| Prop | Meaning | Default |
|---|---|---|
| `x, y, width, height` | the viewport rect the camera frames on the design stage | 0, 0, 390, 844 |
| `followEnabled` | follow the target entity | true |
| `followTarget` | target component id (stable entity ID) | "" (static) |
| `smoothing` | 0 = instant snap; larger eases harder; clamped 0–0.95 | 0.12 |
| `boundsEnabled` | clamp the viewport inside the world rect | true |
| `minX, minY, maxX, maxY` | world bounds (normalized: inverted values swap) | 0, 0, 2000, 1200 |
| `shakeDuration`, `shakeStrength` | defaults used by shake triggers | 0.25 s, 8 px |

Runtime camera **position** is runtime-local state (a ref inside the game
loop): it never writes to the model, never persists, and never creates
history entries. Only configuration changes go through the normal
`updateProps` commit path (undo/redo/autosave for free).

The same configuration drives every surface — editor overlay, preview
runtime, published pages (which reuse `SceneStage`), and the standalone
export (the vanilla engine in `export.go` implements the identical
follow → smooth → clamp → shake pass). There is no second camera system and
no runtime-only camera state that diverges from the model.

## 2. Runtime semantics (`scene-stage.tsx`, mirrored in `export.go`)

Per frame, after player physics:

1. **Drain block commands** — `camera-shake` blocks push a bounded envelope
   (remaining time, total, amplitude) into `runtime.cameraCommands`; the
   loop drains it. Shake is transient runtime state only.
2. **Follow** — the desired position centers the target entity's rect in the
   viewport. Targets are stable component ids; a target that no longer
   exists holds the last position and logs one trace line ("camera target …
   no longer exists — holding position"). It never crashes or silently
   dereferences a missing entity.
3. **Smoothing** — deterministic, frame-rate-independent exponential
   approach: `alpha = 1 − (1 − smoothing)^(dt·60)` (`cameraApproachFactor`
   in `scene.ts`). The same input timeline always produces the same camera
   path; no frame-dependent randomness.
4. **Bounds** — the viewport (not just its center) is clamped inside the
   world; an axis smaller than the viewport pins to its min edge, so empty
   space never shows unless the world itself is smaller. Inverted bounds are
   normalized at read time (`cameraConfig`), never undefined behavior.
5. **Shake** — a sine envelope `strength · (timeLeft/total) · sin(phase)`
   (38 Hz, slight y-frequency offset) that decays to exactly zero. Repeated
   shakes RESTART the envelope; offsets can never accumulate, and NaN is
   impossible (all inputs are finite-guarded).

The world renders inside a `data-camera-world` container translated by the
camera; the player's world clamps follow the camera bounds when enabled (the
player may walk to the world edge, not the viewport edge) and fall back to
the viewport exactly as before when no camera/bounds exist. HUD controls
stay fixed outside the world container.

## 3. Editor

- **Design stage**: the camera renders as a dashed viewfinder outline
  (`data-camera-viewport`) with its name; it is selectable/draggable like
  every entity. When bounds are on, the world rectangle draws as a dashed
  overlay (`data-camera-bounds`) — derived from the same props the runtime
  reads, one quiet overlay, not noise.
- **Inspector**: Follow target (checkbox), **Target entity** (a select of
  the screen's real entities — new `entity` field type; no raw ids), 
  Smoothing with a plain-language explainer paragraph, bounds fields, and
  shake defaults. Decimal fields (smoothing, seconds) commit decimals; px
  fields stay integers.
- Editor navigation zoom/scale remains editor-only (`PreviewMode` scale and
  the scene canvas grid); it never writes camera configuration.

## 4. Blocks & code

Two real blocks (category Media), both mapping to runtime semantics —
nothing decorative:

- `shake camera for {duration}s with strength {strength}` → queues a bounded
  shake envelope; codegen emits `api.shakeCamera(duration, strength)`.
- `set camera target to {componentId}` → retargets the camera entity's live
  `followTarget` (a component picker); codegen emits `api.setCameraTarget(...)`.

Follow/smoothing/bounds are also reachable through the existing
`set-property` block on the camera entity — the runtime reads camera props
live each frame, so retargeting mid-run works with no new machinery.

## 5. Diagnostics (`diagnostics.ts`)

- **error** — `Camera target "…" no longer exists. Pick another entity in
  the Camera's Inspector, or set Target entity to None.` (component-targeted).
- **warning** — `Camera bounds are inverted (min greater than max) — the
  runtime swaps them, but fix them in the Camera's Inspector.`

## 6. Tests

- **`scripts/e2e-camera.mjs` — 34/34 passed, 0 console errors.** Covers:
  editor overlay + bounds rect; inspector fields and values; decimal commit
  + undo/redo of camera configuration; Blocks palette entry; deleted-target
  diagnostic; inverted-bounds diagnostic; preview world container; initial
  clamped framing; finite coordinates; follow during a walk; real smoothing
  lag; shake firing on a Quake-style coin touch; viewport clamp at the world
  boundary (camX ≈ 1610 with world 2000/viewport 390); clean shake end and
  no idle drift (≤3px over 900 ms); restart re-snap; model persistence of
  configuration + handler; published page follow/clamp/shake; export HTML
  shipping the camera engine + compiled block; zero console/page errors.
- Regressions (STEP 26): `e2e-tilemap-paint.mjs` **29/29** (tilemap painting,
  erase, multi-tile palette, rule tiles/auto-tile, per-cell collision,
  persistence, preview parity) and `e2e-scene-gameplay.mjs` **21/21**
  (collision, gravity, publish, export, HUD) — tilemap and gameplay are
  untouched by the camera work.
- `go vet ./...` clean; `go test -count=1 ./...` all 11 packages green
  (the Go model validator is type-agnostic — camera props ride the open
  props map, and the exported engine compiles as part of the api build).
- `tsc --noEmit` clean.

## 7. Browser verification (Step 25, manual — in-app browser, Indonesian UI)

Created a game project from the Coin Runner template through the UI, added a
Camera from the palette, selected it, set **Target entity = Player 1** via
the picker, smoothing 0.2, saved ("Tersimpan"), opened Blocks, opened the
"when Player 1 Touches Coin 1" handler and clicked the
"shake camera for ＿s with strength ＿" palette block into the stack
(0.4 s / 8 px), saved. In Preview: walked right — the camera followed
(camX 0 → 91.3, settling exactly at the ideal follow position); walked into
Coin 1 — `data-camera-shake` fired (sampled at player x ≈ 134.9, inside
Coin 1's overlap zone); after the envelope the flag cleared and the camera
returned to the clamped follow position (x = 0) with no residue. Mode
switching (Design → Code → Blocks → Preview) with error collectors
installed captured **zero** console errors/unhandled rejections.

## 8. Honest limitations

- The camera entity is one per screen in practice (`cameraOf` takes the
  first); multi-camera switching is not a thing yet.
- Runtime camera zoom is not a feature — editor zoom and runtime viewport
  stay separate by construction (STEP 16 satisfied by not mixing them).
- Vertical following works, but the template scenes are mostly horizontal;
  vertical worlds are exercised only through the y-clamp checks.
- The exported runtime is a hand-ported mirror of the preview loop by
  architecture (vanilla JS in `export.go`); it is behavior-tested by the
  e2e's export checks plus publish-page parity, not by a shared code file.
