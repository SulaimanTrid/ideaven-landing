# TASK 57 — REAL 3D CHARACTER CONTROLLER + INPUT (PLAYABLE 3D GAMEPLAY)

Status: **FUNCTIONAL / TESTED** (dedicated E2E 35/35 with real keyboard-driven gameplay, 14 regression suites green, all gates green)
Session: 56 (2026-09-27). Commit: none (no git binary on this machine — uncommitted on top of e91459a).

---

## 1. Objective

A designated 3D entity is the player: WASD/arrows move relative to the active
camera, Space jumps physics-driven, gravity/landing/walls come from the TASK 54
physics. Ground + Player + physics + input + movement + jump + collision =
a playable 3D scene — in Editor/Preview, Published, and Exported HTML with one
implementation.

## 2. Canonical data model

Authored props on the player entity (one representation; scalar props — no
schema change):

| prop | range (clamped) | default |
|---|---|---|
| `controllerEnabled` | boolean | false |
| `moveSpeed` | 0.1–100 | 5 |
| `acceleration` | 0–200 | 40 |
| `deceleration` | 0–200 | 60 |
| `jumpForce` | 0–50 | 6 |
| `airControl` | 0–1 | 0.4 |

Gravity participation reuses the TASK 54 `gravityEnabled` physics prop —
never duplicated. **Runtime-only state** (velocity, grounded, input vector,
speed) lives in the physics body / runtime loop and is NEVER persisted.
`maxSlopeAngle` is NOT implemented (axis-aligned AABB solver — no slope
resolution) and is NOT exposed.

## 3. Player designation & stability

`controllerEnabled: true` designates the player — no hidden Player object.
At most one controller is honored: the FIRST in model order (deterministic);
multiple enabled controllers raise a warning naming the used one. Zero
controllers → the scene renders normally with an info diagnostic; the runtime
never crashes.

## 4. Input integration (existing abstraction only)

The controller consumes FIVE semantic action slots — reusing the established
vocabulary (`move-left` / `move-right` / `jump`) plus `move-forward` /
`move-backward` — resolved from the screen's canonical `inputActions`
(rebindable in the existing Input Actions panel; an action with the slot's id
wins) with built-in 3D defaults for undefined slots: W/ArrowUp forward,
S/ArrowDown backward, A/ArrowLeft left, D/ArrowRight right, Space jump.
No parallel key-map system: the 3D runtime keeps a pressed-key set (runtime
mode only; cleared on blur/dispose) and derives the action state each frame —
the same pattern as the 2D scene runtime, over the same canonical action model.

## 5. Movement-space math

`inputVector = normalize(ix, iz)` (x = strafe right, z = forward; length ≤ 1 —
W+D can never exceed W). The basis comes from the ACTIVE camera3d's rotation
(the same entity/pick the renderer uses — no second camera): forward = the
camera's world −Z axis projected onto XZ and normalized (falls back to world
−Z if the camera looks straight down); right = forward × up. Movement =
`right·ix + forward·iz`, i.e. W walks away from the view, A/D strafe. A
grounded character controller only — no vertical input, no fly mode.

## 6. Velocity / physics integration (one authority)

Per FIXED step (1/120 s, inside the TASK 54 accumulator — no second loop):

1. The controller writes the body's horizontal velocity:
   accelerate toward `input × moveSpeed` with `acceleration × (grounded ? 1 :
   airControl)`; with no input, decelerate toward zero with `deceleration ×
   (grounded ? 1 : airControl)` — vector moveToward, NaN-safe.
2. Jump: if the jump edge is queued AND the body is grounded → `vy = jumpForce`
   (one physics-driven impulse per press edge; the edge expires with the
   frame, so holding Space cannot stack jumps and airborne presses are
   rejected).
3. The EXISTING `PhysicsWorld.step` integrates, applies TASK 54 scene gravity,
   resolves collisions, and recomputes grounded.

## 7. Ground, walls, collider

- Grounded = the TASK 54 contact state (ny > 0.5) — no fake grounded system.
  Standing: gravity adds vy, the resolver cancels it, positional correction
  prevents sinking (verified: rest stable, no endless downward drift).
- Walls: the resolver removes the normal velocity component and corrects
  position — the player stops at the wall and slides along it (E2E: forward
  into the wall stops at pz ≈ −2.0 = wall face −2.5 + half 0.5; no tunneling).
- Character collider = the existing supported box collider with a documented
  character-body configuration (dynamic body + collider + gravity). NO fake
  capsule was added to claim support.

## 8. Editor

- **Controller (3D player)** inspector section (meshes): Enabled, Move speed,
  Acceleration, Deceleration, Jump force, Air control — canonical, undoable,
  autosaved. Notes explain camera-relative movement, the gravity/collider
  requirements (Physics section), and Input Actions bindings. Max slope angle
  deliberately absent.
- **Diagnostics** (3D block): multiple controllers (names the honored one),
  controller without a dynamic body/collider, controller with gravity
  disabled, moveSpeed/jumpForce/acceleration/deceleration/airControl outside
  range, and an info note when a 3D scene has no controller.
- Editor/runtime keyboard isolation: gameplay listeners exist in runtime mode
  only; editor W/E/R (gizmos) and builder shortcuts are untouched.

## 9. Observability

Runtime canvas attributes (diagnostics only, never source of truth):
`data-3d-player` (honored player id), `data-controller-enabled`,
`data-controller-grounded`, `data-controller-speed` (horizontal speed), and
`data-physics-bodies` now carries x/y/z per body (web AND export — identical).

## 10. Parity & loop safety

- Exported HTML mirrors the controller in vanilla JS (`applyController3D`,
  `parseController3DProps`, `resolveControllerKeys3D` — same math, same
  defaults, same per-fixed-step order) with window key listeners installed
  once per run; `data-physics-bodies` carries x/y/z identically.
- Preview restart (key={runId}) remounts: fresh physics world, fresh pressed
  set, one loop, one controller instance — restart tests verify the authored
  start transform, zero speed, and no listener/loop leaks.
- Performance: the controller adds O(bodies) work per fixed step; no
  allocations per face, no React state per step.

## 11. Verification — scripts/e2e-3d-character-controller.mjs — 35/35, 0 console errors

A: project/viewport/player/inspector/enabled/values-persist. D: gravity fall,
landing (y ≈ 0.5), grounded true, stable rest. B/C: W/S/A/D real displacement
in the correct directions (physics-bodies x/z evidence), solo-W speed ≈
moveSpeed 5, diagonal normalized (≈5, not 7.07), release decelerates to
speed 0.00. E: Space jump rises physics-driven and returns; holding Space =
single apex (no stacking); airborne re-press rejected. F: wall blocks forward
movement at the exact face position, no tunneling, ground unmoved. G: restart
restores py 3 / speed 0 / grounded lifecycle, simulation still live. H:
controller config persists; preview behaves after reload. I: published runtime
moves the player; exported HTML run from disk moves AND jumps; no editor-only
UI (toolbar/hierarchy/transform-mode) appears in the published runtime.

## 12. Regressions + gates

3d-foundation 18/18, 3d-hierarchy 17/17, 3d-physics 24/24, 3d-material-
lighting 42/42, 3d-transform-gizmos 34/34, input-actions 32/32, tilemap
44/44, gameplay 21/21, camera 34/34, sorting 19/19, motion 11/11,
sprite-animation 18/18, animation-state-machine 20/20, 2d-lighting 19/19,
2d-particles 22/22. tsc clean; go vet clean; go test 11/11 packages;
production next build green.

## 13. Honest limitations (NOT IMPLEMENTED / DEFERRED)

Slopes, stairs, step offset, crouch/sprint/prone, ledge climbing, swimming,
ladders, double/wall jump, moving platforms, root motion, full third-/first-
person camera controllers, ragdoll, navmesh, advanced character animation,
capsule colliders, mobile/touch gameplay controls. The active camera does not
follow the player (the authored camera stays fixed — TASK 14 follow behaviors
are 2D-only; 3D follow is future work). Rotation toward movement direction
was intentionally left out to keep the transform authority singular.

### Next exact task

STOP per the directive — await explicit approval before TASK 58.
