# TASK 54 — REAL 3D PHYSICS FOUNDATION
**Collider + Rigid Body + Gravity + Trigger + Collision — model → editor → preview → published → export**

Status: **FUNCTIONAL / TESTED** (E2E 24/24, regressions green, builds green)
Session: 53 (2026-09-26). Commit: none (no git binary on this machine — uncommitted on top of e91459a).

---

## 0. What this task is

A small, deterministic, **model-driven** physics core for 3D projects:

- entity props carry the physics configuration (canonical scalar props — no
  schema change; the Go API already stores free prop maps);
- the scene carries gravity (`gravityX/gravityY/gravityZ` on screen styles);
- the runtime simulates it in a **fixed timestep** (1/120 s, ≤ 4 catch-up
  steps) inside the existing mount-stable 3D rAF loop;
- the exported game ships a **vanilla JS mirror** of the same solver so
  preview, published, and export behave identically;
- trigger events ride the **existing `touches-` handler vocabulary** — no new
  event architecture, no new block kinds.

No physics library is imported anywhere. The supported pairs (box/box,
sphere/sphere, box/sphere) are exactly what a compact world-aligned AABB +
closest-point solver handles; that keeps exported games dependency-free and
the three runtimes perfectly aligned.

## 1. Canonical model (unchanged shape, new scalar props)

Entity props (per `cube3d` / `sphere3d` / `plane3d`):

| prop | values / range | default |
|---|---|---|
| `bodyType` | `none` \| `static` \| `dynamic` | `none` |
| `colliderType` | `none` \| `box` \| `sphere` | `none` |
| `colliderSizeX/Y/Z` | 0.01–1000 (world units × entity world scale) | 1 |
| `colliderRadius` | 0.01–1000 (× largest world-scale axis) | 0.5 |
| `isTrigger` | boolean | false |
| `gravityEnabled` | boolean | true |
| `mass` | 0.01–10000 | 1 |

Scene styles: `gravityX` (0), `gravityY` (−9.81), `gravityZ` (0), clamped
±100. **Collider convention: collider dimensions multiply the entity's world
scale** — the same convention the editor gizmos show, the web runtime
simulates, and the export simulates. A cube scaled 8/1/8 with collider size
1/1/1 has an 8×1×8 collider matching its mesh.

Physics state (positions, velocities, grounded) is **transient runtime
state** — nothing is ever written back to the model.

## 2. Solver (`apps/web/src/lib/physics3d.ts`)

`PhysicsWorld.step(dt)` — one fixed step:

1. **Integrate** dynamic bodies: gravity → velocity → position
   (triggers and statics skip integration).
2. **Colliders** derived per body via `colliderFromBody` (world-aligned AABB
   half-extents, or sphere radius scaled by the largest world axis).
3. **Narrow phase** `overlapBetween`:
   - box/box — minimum-translation axis;
   - sphere/sphere — center distance vs radius sum;
   - sphere/box — closest point on the box to the sphere center (with the
     center-inside-box fallback push-out).
4. **Resolution** (dynamic vs solid): positional correction split by
   **inverse mass** (static = infinite mass → moves 0; heavier bodies move
   less), velocity corrected along the contact normal (no bounce), collider
   center refreshed after correction.
5. **Grounded**: a contact with `ny > 0.5` (gravity −Y) marks the dynamic
   body grounded for that step.
6. **Triggers**: no physical response; overlapping (body, trigger) pairs get
   `enter` (first overlap), `stay` (subsequent), `exit` (pair broken) events
   through the step callback.

Limits (`PHYSICS_LIMITS`): max 64 bodies, fixedDt 1/120 s, ≤ 4 catch-up
steps per frame, gravity ≤ 100/axis, collider ≤ 1000, mass ≤ 10000.

## 3. Runtime wiring

### Preview + published (web `Viewport3D`)
- Physics **seeds once per mount** (`key={runId}` — restart remounts) from
  the canonical props + derived world matrices (center + world scale).
- One **mount-stable rAF loop** reads refs (`screenRef`, `getPropsRef`,
  `runtimeEmitRef`, `modeRef`) — React re-renders never re-seed or re-arm
  the loop; meshes are rebuilt fresh per frame from the canonical model +
  hierarchy world matrices + live runtime props (block `set-property`
  changes color/visibility live).
- Dynamic bodies render at their simulated world positions (translation
  overridden in the world matrix; rotation/scale inherited).
- Trigger events dispatch through the **existing emit path**:
  `emit(componentId, "touches-<triggerId>")` on enter,
  `"touches-exit-<triggerId>"` on exit — the same handler vocabulary as 2D
  scene triggers, so Blocks handlers work unchanged.
- Observability (runtime-only DOM attributes on the canvas):
  `data-physics-bodies` (JSON: id, y, grounded, trigger),
  `data-trigger-overlaps` (`body|trigger` pairs joined by `|`),
  `data-physics-grounded` (any dynamic grounded).

### Exported game (vanilla mirror in `export.go`)
- `parsePhysicsConfig` / `parseSceneGravity` / `colliderHalfExtents` /
  `overlapBetween` / `physicsStep` / `seedPhysicsBodies` — direct JS mirror
  of physics3d.ts (sphere-aware).
- `render3DScene` is **idempotent**: a rerender for the SAME screen
  (e.g. a trigger handler ran) only refreshes meshes/camera — it never
  rebuilds the canvas (which would re-seed physics and teleport bodies)
  and never stacks rAF loops (monotonic run-id stops superseded loops).
- The exported physics loop sets the same three observability attributes
  and dispatches trigger events through the export's existing
  `emit()`/handler path.
- `parseMeshes` reads **runtime props** (`componentProps`) so exported runs
  reflect `set-property` changes too.

## 4. Editor

- **Collider gizmos** (`drawColliderGizmos`, editor-only): wireframe box
  (12 edges) / sphere (3 rings) around every entity with a collider — amber
  for solids, dashed mint for triggers. Visualization only, never exported.
- **Physics inspector** (`Physics3DPanel`): Body select, Collider select,
  Size X/Y/Z (box) or Collider radius (sphere), Trigger checkbox,
  Affected-by-gravity checkbox, Mass field — canonical props, one undoable
  commit per edit. Shown for all 3D mesh entities.
- **Scene gravity** fields (X/Y/Z) in the scene-screen inspector.
- **Diagnostics**: out-of-range mass (`0.01–10000`) and collider
  size/radius (`0.01–1000`) raise warnings naming the runtime clamps.

## 5. Verification

### Playwright E2E — `scripts/e2e-3d-physics.mjs` — 24/24, 0 console errors

Real physics, measured through the observability attributes and canvas
pixels (player: dynamic 1×1×1 at py 5; ground: static 8×1×8 top at 0;
elevated trigger band the player falls through; camera pulled back):

1. physics configuration persists in the canonical model (PUT/GET round-trip);
2. collider gizmos render in the 3D editor;
3. physics inspector exposes Body / Collider / Trigger controls;
4. preview renders the 3D scene;
5. **player falls under gravity** (Y sampled every 60 ms from ~5);
6. **player lands ON the ground without penetrating** (rest y ≈ 0.5 = ground top + half extent);
7. **no tunneling** (min sampled Y > 0.35 — never passes through);
8. **grounded becomes true** after landing;
9. **player stops moving downward** (rest stable ±0.05 over 1.2 s, still grounded);
10. preview exposes `data-physics-grounded`;
11. trigger overlap detected while the player passes through the zone;
12. **trigger event dispatched through the existing handler architecture** —
    the `touches-e-zone` handler's `set-property` recolors the player
    blue→rose; ≥ 10 000 exact rose pixels, blue residue < 1 % (antialiasing);
13. restart restores the authored start position (poll sees y ≈ 5 again);
14. restart clears runtime grounded state;
15. out-of-range mass/collider raise diagnostics;
16. publish succeeds for a 3d project;
17. published page renders the 3D scene;
18. published physics: player rests on the ground, grounded observable;
19. export embeds physics configuration;
20. export ships the physics engine (sphere-aware solver);
21. export ships trigger events via emit;
22. **exported game run directly from disk: vanilla physics lands the
    player** (y ≈ 0.5, grounded);
23. exported game exposes the grounded observability attribute;
24. exported game runs without page errors.

### Regressions (12 suites, all green)

3d-foundation 18/18, 3d-hierarchy 17/17, input-actions 32/32,
tilemap-paint 44/44, scene-gameplay 21/21, camera 34/34, sorting 19/19,
motion 11/11, sprite-animation 18/18, animation-state-machine 20/20,
2d-lighting 19/19, 2d-particles 22/22.

### Gates

tsc `--noEmit` clean; `go vet ./...` clean; `go test -count=1 ./...`
11/11 packages; production `next build` green (dev server stopped, `.next`
removed first).

## 6. Real regressions found + fixed by this task's suites

1. **Hierarchy world matrices lost in the 3D preview** — the physics
   restructure of `buildFrameMeshes` only applied `mesh.matrix` to dynamic
   bodies; parented statics rendered at local transforms (caught by
   e2e-3d-hierarchy pixel-centroid checks). Fixed: every mesh renders
   through its derived world matrix; dynamic bodies only override
   translation.
2. **State-machine panel gating narrowed** — the panel was gated to
   `def.type === "sprite"` only, hiding it on `player`/`enemy` entities
   (caught by e2e-animation-state-machine). Restored to
   `ANIMATION_ENTITY_TYPES`.
3. **Mass split was mass-weighted, not inverse-mass-weighted** — a heavier
   dynamic body would have been pushed MORE than a lighter one. Both the
   web solver and the export mirror now split by `1/mass`.
4. **Export rerender killed the physics run** — `emit()` unconditionally
   rerenders; for 3D scenes that rebuilt the canvas mid-run (re-seeding
   bodies, stacking rAF loops — a hang). `render3DScene` is now idempotent
   per screen with a monotonic run-id.

## 7. Honest limits (not built in this task)

- World-aligned AABBs only: **no rotation in collision response** (rotated
  colliders approximate their AABB; rotated visuals still render correctly
  and dynamic-body translation stays exact).
- No rigid-body rotation/torque, no friction/restitution coefficients,
  no joints/constraints, no raycasts, no character controller.
- Sphere colliders are true spheres in the solver, but rendered primitives
  are faceted (lat/long quads) — collider and visual agree on radius, not
  on tessellation.
- Export mirror parity is per-behavior verified but not line-by-line
  identical source (vanilla JS mirror of the TS).
- No physics debug overlay in preview yet (observability attributes only).
- Commit still blocked: no git binary on this machine.

### Next exact task

STOP per the directive — await explicit approval before TASK 55.
