# TASK 55 — REAL 3D MATERIAL + LIGHTING FOUNDATION
**Base-color material + point/directional lights + ambient + per-face N·L shading — model → editor → preview → published → export**

Status: **FUNCTIONAL / TESTED** (dedicated E2E 42/42 with pixel evidence, 12 regression suites green, all gates green)
Session: 54 (2026-09-26). Commit: none (no git binary on this machine — uncommitted on top of e91459a).

---

## 0. Reconnaissance result (what existed)

- `Mesh3D` (render3d.ts): id/kind/color/visible/position/rotation/scale + optional
  world `matrix` (TASK 53). Face colors were the mesh's hex string, filled flat.
- No material abstraction, no 3D light calculations anywhere.
- World matrices reach the renderer as `Mesh3D.matrix`; the export mirrors
  the renderer in vanilla JS (`draw3D` + `meshFaces3DWorld`).
- The 2D light (SYSTEM 5) is a composite overlay (veil + screen-blend
  gradients) in the 2D pipeline — conceptually referenced for conventions
  (hex validation, ranges, diagnostics), never coupled.
- **The Canvas 2D software rasterizer CAN be extended**: lighting is computed
  per visible face before the fill — no renderer replacement (Task 51's
  architecture decision stands; no Three.js/WebGL).

## 1. Canonical material

- **baseColor** = the entity's existing `color` prop (one source of truth;
  no duplicate storage). Parsed/sanitized: valid `#rgb`/`#rrggbb` hex only,
  safe fallback to the mesh default on malformed data.
- **roughness: UNAVAILABLE. metalness: UNAVAILABLE.** The rasterizer shades
  flat faces — a per-pixel BRDF would require replacing the renderer. Per
  the directive, they are documented here and NO controls are exposed
  (verified: the E2E asserts no Roughness/Metalness labels exist).
- Material section in the mesh inspector (Base Color) + honest explainer.

## 2. Canonical light (`light3d` entity)

- ONE new entity type, category "3d": `type` = **point | directional** (both
  genuinely implemented), `enabled`, `color` (hex), `intensity` (0–5),
  `radius` (0.1–1000 — REAL: it is the point light's attenuation range).
- Uses the EXISTING transform system: position for point lights; rotation
  = emission direction for directional (shines along the entity's −Z, the
  camera convention). No second transform system.
- **Hierarchy (Task 53): lights participate fully.** World position =
  `parent.world × local` via the existing `computeWorldMatrices` — verified:
  a light parented to a cube with local offset stays attached when the cube
  moves (the front face stays lit after the move; if the light were left
  behind its radius could not reach the face).
- **Explicitly non-physics**: no collider, no body — `seedPhysicsBodies`
  skips it (no bodyType) and `Physics3DPanel` is gated to mesh types only
  (T3D_PHYSICS_TYPES split). Verified: no Body/Collider controls on lights.

## 3. Lighting model (inside the rasterizer)

Per visible face, computed during rasterization (no DOM overlay, no post
pass — the visible mesh pixels themselves are lit):

```
finalChannel = baseChannel × clamp01( ambient + Σ_l diffuse_l )
ambient      = ambientIntensity × ambientColor            (scene styles)
point l      = intensity × clamp01(1 − dist/radius) × max(N·L, 0) × lightColor
directional  = intensity × max(N·(−direction), 0) × lightColor   (no falloff)
```

- **Face normals are geometric**: cross product of world-space face edges,
  safely normalized (degenerate → unlit), oriented toward the viewer
  (two-sided) so visible faces always shade correctly. Surface orientation
  genuinely changes the response (verified: equal-distance light in FRONT of
  a face lights it; the same distance BEHIND does not — N·L, not distance).
- **Bounded multi-light**: max 8 active lights (`MAX_LIGHTS`, enforced at
  resolution AND accumulation); > 8 raises a diagnostic and renders stably.
- **NaN/negative/overflow safe**: every term clamped; malformed data cannot
  produce broken canvas values.
- **Backward compatibility**: no lights + default ambient (white × 1) →
  output pixel-identical to the pre-TASK-55 renderer (all exact-color
  regression assertions still pass).

## 4. Ambient

Scene-level `ambientColor` / `ambientIntensity` — the EXISTING scene-style
keys (shared with the 2D ambient UI, which already shows for scene screens).
3D defaults: white × 1 → new scenes stay visible, nothing is black by
default, no hidden fake light. The ambient fallback in the inspector is
project-type aware (#ffffff for 3d).

## 5. Editor

- **Light gizmos** (`drawLightGizmos`, editor-only): position marker +
  influence-radius ring for point lights; direction arrow for directionals;
  disabled lights draw dimmed. Visualization only; never exported.
- Collider gizmos now draw only for entities with an actual collider
  (previously every entity got a box — fixed as part of keeping lights clean).
- Inspector: LIGHT fields via the canonical registry (Name/Position/Rotation/
  Type/Enabled/Light color/Intensity/Radius) + a semantics explainer;
  MATERIAL section (Base Color) for meshes; roughness/metalness deliberately
  absent.

## 6. Preview / published / export

- Preview and published use the SAME web Viewport3D path; lights resolve
  through `getProps` so runtime `set-property` changes to lights/materials
  show live.
- Export (`export.go`): full vanilla mirror — `parseLight3DProps`,
  `parseAmbient3D`, `resolveLights3D` (world positions through the SAME
  hierarchy evaluation as meshes), `shadeFace3D` with IDENTICAL equations.
  `render3DScene`'s refresh path re-resolves lights/ambient (runtime light
  edits reach exported pixels without a rebuild). Verified by RUNNING the
  exported HTML from disk (lit front face, no page errors).

## 7. Diagnostics

Non-hex light color, non-hex material base color, unknown light type,
intensity outside 0–5, radius outside 0.1–1000, more than 8 enabled lights
("the renderer uses the first 8"), ambient intensity outside 0–1. All via
the existing diagnostics architecture; runtime stays stable under malformed
configs (verified in the E2E).

## 8. Verification — scripts/e2e-3d-material-lighting.mjs — 42/42, 0 console errors

Pixel evidence (directive §25):
- **A (material)**: unlit cube renders its EXACT base color (>500 exact
  pixels); changing Base color via the inspector repaints the mesh
  (rose >500, blue ≈0).
- **B (light on/off)**: enabling the point light lifts the cube's front-face
  region luminance from the ambient floor to >60; disabling drops it back
  (Δ >15).
- **C (light position)**: light HIGH → front face dark (15.5); light LEVEL →
  front face saturated (178) — the illumination distribution follows the
  light's position.
- **D (surface orientation)**: light in FRONT of the front face (dist d)
  lights it (>60); the equal-distance light BEHIND does not (Δ >15) —
  proves N·L depends on surface orientation, not distance.

Plus: persistence round-trip of every value; UI edits commit (verified via
model GET after each edit); undo/redo on a light property; parenting
persists; preview, published, and exported-from-disk all render the lit
scene; malformed configs diagnosed + stable; 10 lights render stably with
the excessive-light diagnostic; 390px mobile renders with no overflow
beyond the 2D builder baseline; zero console errors throughout.

## 9. Regressions + gates

3d-foundation 18/18, 3d-hierarchy 17/17, 3d-physics 24/24, input-actions
32/32, tilemap 44/44, gameplay 21/21, camera 34/34, sorting 19/19, motion
11/11, sprite-animation 18/18, animation-state-machine 20/20, 2d-lighting
19/19, 2d-particles 22/22. tsc clean; go vet clean; go test 11/11 packages;
production next build green (dev stopped, `.next` removed).

## 10. Honest limits

- **Flat per-face shading** — one color per face from its center; large
  faces (e.g. an 8×8 ground quad) cannot show per-pixel falloff pools.
  This is the software-rasterizer trade-off; per-pixel light maps would
  require the renderer replacement the directive told us to avoid.
- The cube's top face is a sub-pixel-to-few-pixel sliver at typical camera
  angles (backface culling + projection) — face-lighting evidence uses the
  front face.
- Roughness/metalness unimplemented (no controls, no fake values).
- No shadows, no specular highlights, no light cookies, no spot/area lights,
  no environment probes — none claimed anywhere in the UI.
- Builder chrome has a pre-existing ~28px scrollWidth artifact at 390px
  (identical on 2D projects, invisible to element probing; the 3D builder
  adds nothing to it — asserted in the E2E as a parity guard).
- Inspector labels are English (the established inspector convention);
  commit still blocked (no git binary on this machine).

### Next exact task

STOP per the directive — await explicit approval before TASK 56.
