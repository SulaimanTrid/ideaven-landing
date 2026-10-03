# TASK 58 — BUILDER SHELL + VIEWPORT + ICONOGRAPHY INTEGRITY

Status: **FUNCTIONAL / TESTED** (dedicated E2E 35/35, 15 regression suites green, all gates + Cloudflare build green)
Session: 58 (2026-10-03). Commit: (this session) — pushed to origin.

---

## 1. Root causes discovered (inspect-first findings)

1. **Viewport scaling (§3)** — the app/game canvas had TWO overlapping scale
   mechanisms: an outer spacer sized `frame × scale` AND the inner
   `data-screen-frame` div carrying its own `transform: scale()`. The Device
   Frame bezel (26px/axis phone, 34px tablet, monitor + stand for desktop)
   was never part of either measurement, so the reserved space was smaller
   than the visual unit → clipping, detached content, and the "strange phone
   preview when zoomed down". The game branch scaled the SCREEN inside a
   native-size bezel — exactly the directive's forbidden "separately scale
   nested screen and frame".
2. **3D shell leakage (§2/§7)** — the is3d branch rendered INSIDE the device
   spacer with the Phone/Tablet/Desktop presets, zoom and orientation chrome
   still visible: a type="3d" project opened as an app-device frame.
3. **Block icons (§9)** — `BLOCK_ICON_PATHS` covered only 15 of the 34
   built-in block types; 19 real built-ins (TextToSpeech speak, TinyDB,
   animations, camera ops, canvas ops, location, notifier, web-get, burst,
   boolean, …) rendered the generic `FALLBACK_ICON` square, and extension
   blocks had no category fallback at all.
4. **Header/nav collision (§6)** — the header was one `overflow-x-auto` row
   with `justify-between`; at narrow widths the nav slid under the IDEAVEN
   logo area.
5. **390px page overflow** — the Diagnostics strip header forced the builder
   shell to 418px (28px overflow) at 390px.
6. **Palette mixing (§13)** — a 3D project's palette surfaced Game Entities
   AND app UI/Layout/Storage groups next to 3D Objects.

## 2. Fixes

### Viewport scaling — ONE scale owner (canvas.tsx)
- The rendered unit (frame + bezel + shell chrome) is **measured** at native
  size via `offsetWidth/offsetHeight` (transform-invariant) with a
  ResizeObserver (`unitRef`/`unitSize`).
- The layout spacer reserves exactly `measured × scale`; the unit itself
  carries the single `transform: scale()` with origin top-left. The screen
  inside stays native — no nested scaling anywhere.
- Structure: viewport stage → scaled device unit (frame+bezel) → native-size
  screen → native-size content. Fit recomputes from the measured unit, so
  25/50/75/100%/Fit all stay aligned, inside the surface, aspect-preserved.
- Orientation flips the frame dims (presentation only — `model.settings.
  preview`, never the project model's content).

### Project-type integrity (model.type authoritative)
- 3D projects now get their OWN full-surface shell: `Viewport3D` fills the
  editor, a `3D SCENE · <screen>` identity chip replaces device chrome, and
  Phone/Tablet/Desktop presets + zoom/orientation controls are REMOVED for
  3D (`data-mode-identity="3d-scene"` for tests). Device presets are APP-only
  chrome (game keeps the dark stage + orientation).
- Verified: type="3d" no longer opens as an app device frame; game reads as a
  dark 2D scene (`scene · <name>` chip); all three shells persist across
  reload — routing derives from `model.type` only.

### Header (top-bar.tsx)
- Header is a fixed 3-zone flex: brand group `shrink-0` (reserved space),
  mode nav `min-w-0 flex-1 overflow-x-auto` (scrolls internally, centered),
  actions `min-w-0 flex-1 overflow-x-auto justify-end` (scroll internally).
  No absolute positioning; the logo can never be overlapped; 3D labels stay
  readable; project name/type shown ≥ lg.

### Diagnostics strip (390px overflow)
- The tab row now scrolls horizontally instead of pushing the shell to 418px
  (`scrollWidth` back to exactly 390 at the narrowest width).

### Block icons (blocks-visual.tsx) — same canonical registry
- 19 new hand-drawn paths (same stroke language): boolean (toggle),
  burst-particle (rays), camera-shake, camera-set-target (crosshair),
  canvas-clear / canvas-draw-circle (framed canvas), clock-now,
  location-latitude / longitude (globes), location-request (pin),
  notifier-alert (bell), play/stop-animation (framed transport),
  set/trigger-animation-param (frame + sliders/bolt), tinydb-get / tinydb-store
  (cylinder + arrows), tts-speak (speech + waves), web-get (globe).
- `blockIconPath()`: explicit type icon → **category fallback** (ui/variables/
  control/navigation/text/logic/audio/media/storage/connectivity/sensors —
  extension blocks get a meaningful symbol) → generic square only for truly
  unknown types. ONE registry; no second icon architecture.

### Discovery + empty states (real canonical actions)
- 3D empty scene: "Create your first 3D object [Cube][Sphere][Plane]" —
  buttons call `actions.insertNew` (the palette's canonical insertion).
- 2D game empty scene: "Create your first game object [Player][Sprite][Platform]".
- Palette: a 3D project surfaces ONLY "3D Objects" (no Game Entities, no app
  UI groups); a game project surfaces "Game Entities" (no 3D Objects).

## 3. Verification

- `scripts/e2e-builder-shell-integrity.mjs` — **35/35, 0 console errors**:
  three shells route correctly by model.type (and persist across reload),
  3D has no app-device controls + gizmo toolbar + identity chip, empty-state
  buttons perform canonical insertions (API-verified), palette groups per
  type, ZERO generic fallback squares across the live Blocks palette,
  22 required built-ins render real icons (label→svg path assertions),
  fit/50%-ish/100%/landscape measured-rectangle checks (inside surface,
  bezel-inclusive aspect preserved), responsive 390/768/1024/1280 (no page
  overflow, logo+nav visible, no overlap).
- Regressions (15 suites): 3d-character-controller 35, 3d-material-lighting
  42, 3d-transform-gizmos 34, 3d-physics 24, 3d-foundation 18, 3d-hierarchy
  17, tilemap 44, input-actions 32, camera 34, 2d-particles 22, state-machine
  20, 2d-lighting 19, sprite-animation 18, scene-gameplay 21, sorting 19,
  motion 11. (expectProp in the lighting suite now polls the API past the
  autosave debounce — test-harness race fixed, not an app change.)
- Gates: tsc clean; go vet clean; go test 11/11; `next build` exit 0
  (Vercel); `build:vinext` exit 0 (Cloudflare).

## 4. Known limitations

- Bezel-inclusive aspect is asserted with the measured frame (26px phone
  bezel per axis) — a future bezel redesign updates one constant in the E2E.
- The builder remains a compressed desktop shell at 390px (no dedicated
  mobile editor, per directive); palette/inspector drawers are hidden below
  md/lg as before — palette remains reachable via Blocks mode rail.
- Extension blocks still cannot ship custom icons (category fallback only).
- Commit: this session's commit is pushed; no git binary issues (MinGit
  portable at tools/mingit).

### Next exact task

STOP per the directive — await explicit approval before TASK 59.
