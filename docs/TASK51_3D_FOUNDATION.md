# TASK 51 — 3D Engine Foundation

Status: **FUNCTIONAL / TESTED** (vertical slice; not PRODUCTION READY — no
gameplay, physics, or material system yet, see limitations).

## Initial state

The 3D path was an honest "foundation in development" placeholder: a wizard
choice existed, no 3D scene representation, no 3D entity, no renderer, no
runtime. The 2D engine (through SYSTEM 18) was fully verified; nothing 3D
could be created, rendered, or exported.

## Architecture discovered

- Canonical model: scalar props on components (Go stores props as free
  maps) — new config needs no schema change.
- Renderer: DOM for 2D (scene-stage) — no WebGL/canvas 3D path existed.
- Runtime surfaces: builder design canvas, preview-mode, published
  (`live-app.tsx`), exported standalone HTML (export.go inline vanilla JS).
- Entity registry gates the palette by project type ("game" category only
  for game projects).

## Renderer decision

**Custom software 3D renderer on Canvas 2D** (`apps/web/src/lib/render3d.ts`,
mirrored as inline vanilla JS in the export template). No 3D library was
added: the foundation's primitives (cube/sphere/plane) are exactly what a
software renderer handles; three.js would add a large dependency to every
bundle AND require a bundling pipeline inside the export template, which
ships inline vanilla JS. The renderer is REAL 3D: full perspective camera
transform (position/rotation/FOV/near/far), per-vertex world transform
(scale → rotate XYZ → translate), near-plane clipping, backface culling,
and painter's-algorithm depth sorting — nearer geometry genuinely occludes
farther geometry (proven by pixel-sampled occlusion swap in the E2E).

## Canonical model

- Project type **"3d"** joins the vocabulary (web union, Go typeVocabulary,
  migration 056 replacing the `projects_type_check` constraint,
  `InitialModel` gives a "Scene 1" screen).
- 3D entities are components with scalar transform props:
  `px/py/pz`, `rx/ry/rz` (degrees), `sx/sy/sz`, `color`, `visible`.
  Types: `cube3d`, `sphere3d`, `plane3d`, `camera3d`.
- `camera3d`: `fov` (20–120, clamped), `near`, `far`, `active` (one active
  camera is authoritative; the runtime falls back to the first camera, then
  to a default view, with diagnostics).

## Files changed

- `apps/api/migrations/056_project_type_3d.sql` (new)
- `apps/api/internal/project/model.go` (Type3D + vocabulary + InitialModel)
- `apps/api/internal/project/export.go` (vanilla 3D renderer mirror +
  rerender branch for `type === "3d"`)
- `apps/web/src/types/project.ts`, `apps/web/src/lib/project-meta.ts`
  ("3d" type + "3D Scene" label)
- `apps/web/src/lib/render3d.ts` (new — the renderer)
- `apps/web/src/lib/project-model/registry.tsx` (4 entity defs, "3d"
  category, ENTITY_TYPES)
- `apps/web/src/lib/project-model/blocks.ts` (category label "3D Objects")
- `apps/web/src/app/builder/[id]/builder/palette.tsx` (category gating)
- `apps/web/src/app/builder/[id]/builder/canvas.tsx` (is3d → Viewport3D)
- `apps/web/src/app/builder/[id]/builder/preview-mode.tsx`,
  `apps/web/src/components/runtime/live-app.tsx` (3d runtime branch)
- `apps/web/src/components/runtime/viewport-3d.tsx` (new — viewport component)
- `apps/web/src/lib/project-model/diagnostics.ts` (camera/FOV/near-far)

## Behavior

- **Editor**: 3D projects open the real 3D viewport (orbit navigation with
  drag, grid, axis indicator, click-select with violet outline, palette
  inserts, inspector transforms — all undoable commits).
- **Preview/published**: the SAME renderer runs with the scene's active
  camera3d (no gizmos/grid).
- **Export**: the standalone HTML embeds the entity/camera data and a
  vanilla mirror of the renderer (`draw3D`/`render3DScene`), drawn on a
  `data-3d-canvas` canvas. All three export web targets carry it; the
  Android/Windows shells run the same standalone HTML.

## Verified (session 51)

- E2E `scripts/e2e-3d-foundation.mjs` 18/18, 0 console errors — including
  REAL 3D evidence: two overlapping cubes sampled by pixels — the nearer
  cube's color wins the overlap, and moving it behind the camera plane
  swaps the occlusion to the other cube.
- Regressions (10 suites): input-actions 32, tilemap 44, gameplay 21,
  camera 34, sorting 19, motion 11, sprite-animation 18,
  animation-state-machine 20, lighting 19, particles 22 — all 0-fail.
- tsc clean; go vet clean; go test 11/11 packages; next build green.

## Limitations / unsupported

- No lighting, shadows, textures, physics, gameplay loop, or animation in
  3D yet — foundation only.
- Painter's algorithm (no z-buffer): correct for convex separated
  primitives; intersecting meshes may sort imperfectly.
- No transform gizmo (inspector editing is the interaction path).
- Palette/inspector labels follow the inspector's English-only convention.
- Android/Windows exports embed the same standalone HTML (3D included);
  no native 3D acceleration claim.
- Commit pending: no git binary on this machine.
