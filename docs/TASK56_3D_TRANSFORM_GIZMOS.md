# TASK 56 — REAL 3D TRANSFORM GIZMOS (MOVE / ROTATE / SCALE)

Status: **FUNCTIONAL / TESTED** (dedicated E2E 34/34 with real pointer-driven drags, 13 regression suites green, all gates green)
Session: 55 (2026-09-26). Commit: none (no git binary on this machine — uncommitted on top of e91459a).

---

## 1. Objective

A selected 3D entity can now be manipulated DIRECTLY in the 3D editor viewport
through real move/rotate/scale gizmos. The gizmos are editor-only, perform real
ray/pointer interaction, and write to the canonical project model through the
existing action/update/undo pipeline. No second renderer, no second transform
representation, no second undo stack; Three.js/WebGL were not needed.

## 2. Architecture (what was reused)

- `render3d.ts` — the gizmos draw through the SAME camera projection as the
  scene (`projectTransformGizmo` shares the translate→rotate→focal-divide
  math; screen-constant sizing: world length = dist·px/focal).
- `viewport-3d.tsx` — one rAF loop still drives everything; the gizmo draws
  after the scene in EDITOR mode only.
- `hierarchy3d.ts` — parent chains evaluate exactly as before; the gizmo
  converts results back through the parent's INVERTED world matrix
  (`mat4Invert`, new, determinant-guarded).
- Canonical model + `actions.updateProps` → `history.commit` — ONE undoable
  commit per completed drag.
- Gizmos are editor-only: absent from preview, published, exported HTML, and
  project data. Nothing in `export.go` changed.

## 3. Transform interaction math (`lib/transform-gizmo.ts`, new, pure)

- **Pointer ray**: exact unprojection of a canvas pixel through the active
  camera (`screenToWorldRay`) — the inverse of the renderer's projection.
- **MOVE**: closest point between the pointer ray and the axis line (standard
  two-line closest-point solve, parallel-guarded). The world delta along the
  axis converts to canonical LOCAL position via `parentWorldInv × worldPos`
  — for unparented objects local = world; for parented objects the hierarchy
  rules stay the only source of truth. No pixel-to-world multiplier.
- **ROTATE**: pointer ray ∩ the ring's plane (through the object center,
  normal = the chosen axis) → planar angle via an orthonormal in-plane basis
  → wrap-safe delta (`angleDelta`) applied to the matching canonical Euler
  axis (X ring → rx, Y → ry, Z → rz). The Euler representation is kept; no
  quaternions were introduced.
- **SCALE**: pointer projection onto the axis' screen direction → factor
  over the drag-start projection → each axis scales from its own start
  value (uniform grip multiplies all three), clamped 0.1–100, NaN/Infinity
  safe — no zero-scale singularity.
- **Spaces**: LOCAL orients handles on the object's world-matrix rotation
  columns (its local axes in world space); WORLD orients them on the world
  axes. Verified: with ry 45 the local X handle is tilted while the world X
  handle stays horizontal.
- If gizmo math fails (singular parent matrix, near-parallel ray, behind-
  camera origin) the drag is refused or cancelled and the previous transform
  is preserved — malformed data can never corrupt the model.

## 4. Interaction model

- A small editor toolbar (bottom-left of the viewport): Move / Rotate /
  Scale + Local / World. Keyboard: **W / E / R** switch modes, **Escape**
  cancels an active drag. Capture-phase keydown so a drag's Escape cancels
  BEFORE the builder's global Escape-to-deselect; typing in inputs never
  switches modes. `data-transform-mode` / `data-transform-space` on the
  viewport shell + `data-gizmo-handles` (the projected handle geometry the
  renderer itself uses) make the state observable for E2E.
- Picking: pointerdown tests distance to the projected handle segments /
  ring points / center grip (same geometry as drawn — pick and draw can
  never disagree). A hit starts the drag with pointer capture; a miss falls
  through to the existing orbit/selection behavior.
- During a drag the selected entity PREVIEWS its new transform (the frame
  loop composes the hierarchy with the drag's local values — hierarchy-aware
  rendering); the camera never orbits while transforming.
- **Commit-once**: pointer release issues ONE `updateProps` through the
  builder pipeline = ONE undo entry. Undo restores the exact pre-drag
  transform; Redo the exact post-drag transform (verified to 1e-6).
  Escape simply discards the drag — nothing was committed, so cancellation
  is exact by construction.
- Inspector ↔ gizmo parity both ways: drags update the canonical model so
  the inspector shows the dragged value; inspector edits move the gizmo.

## 5. Object types & physics safety

- Works for cube3d / sphere3d / plane3d / camera3d / light3d (any transform-
  bearing entity). Only transform fields are ever written — camera fov/near/
  far/active and light semantics are untouched.
- Physics (TASK 54) is unaffected: gizmos are editor-mode only (no physics
  world exists there); preview remounts and re-seeds deterministically from
  the canonical transform. No duplicate worlds, no extra rAF loops.

## 6. Verification — scripts/e2e-3d-transform-gizmos.mjs — 34/34, 0 console errors

A: project opens, viewport visible, cube visible, gizmo renders (3 handles).
B: Move default; X/Y/Z handle drags change px/py/pz AND the cube's rendered
centroid visibly moves; one drag = one undo entry (exact restore) + redo.
C: E switches to Rotate; X/Y/Z ring drags change rx/ry/rz; inspector rotation
matches the gizmo result.
D: R switches to Scale; X/Y/Z scale drags change sx/sy/sz (pixel count grows
on X); extreme drag stays finite and clamped.
E: Local vs World handle orientation differs for a rotated object (and the
world X handle is horizontal); the object renders correctly throughout;
data-transform-space reflects the selector.
F: parent-child created; moving the parent moves the child's world position;
a gizmo drag on the child changes the child's LOCAL transform only — the
parent is unchanged.
G: gizmo → inspector parity; inspector → gizmo parity (gizmo follows an
inspector edit); save/reload preserves the transform and re-attaches the
gizmo.
H: Escape mid-drag preserves the pre-drag transform; zero console errors.

## 7. Regressions + gates

3d-foundation 18/18, 3d-hierarchy 17/17, 3d-physics 24/24, 3d-material-
lighting 42/42, input-actions 32/32, tilemap 44/44, gameplay 21/21, camera
34/34, sorting 19/19, motion 11/11, sprite-animation 18/18, animation-state-
machine 20/20, 2d-lighting 19/19, 2d-particles 22/22. tsc clean; go vet
clean; go test 11/11 packages; production next build green.

## 8. Limitations / future work

- Rotate rings map the drag delta onto the matching LOCAL Euler axis; for a
  parented object dragged in WORLD space the visual direction may differ
  from the world ring (documented simplification — exact for unparented
  entities, which is the primary editor case).
- No screen-space depth axis, no snapping/grid increments, no multi-select
  (single selection per the directive), no gimbal handling beyond the
  deterministic Euler mapping.
- The gizmo draws over scene geometry (editor UI layer) without occlusion
  against meshes — standard for flat editor overlays; handles dim when
  another axis is active to keep readability.
- Commit still blocked: no git binary on this machine.

### Next exact task

STOP per the directive — await explicit approval before TASK 57.
