# TASK 53 — 3D Scene Hierarchy + Parenting + Local/World Transform

Status: **FUNCTIONAL / TESTED** (hierarchy editing + derived world transforms
verified end to end; not PRODUCTION READY — no gizmo drag, no scene graph
optimizations, see limitations).

## Initial state

TASK 51 established the 3D foundation: flat entities with canonical local
transforms, a software renderer, and preview/published/export parity. There
was no parenting concept — every entity was a root. The 2D scene model does
have nested `children` arrays for container components, but the 3D path uses
flat root-level components; the hierarchy needed a canonical relationship
without duplicating the 2D nesting semantics.

## Canonical model

- The relationship is `component.props.parentId` (scalar string; absent/""
  = root entity). Child lists are DERIVED (never stored) — one source of
  truth, no duplicated hierarchy state.
- Local transforms (px/py/pz, rx/ry/rz, sx/sy/sz) remain the only authored
  data. World transforms are DERIVED as `parent.world × local` at
  evaluation time and NEVER written back into the model.
- No schema change: parentId is a scalar prop; the Go side stores props as
  free maps.

## Hierarchy evaluation (`apps/web/src/lib/hierarchy3d.ts`)

`computeWorldMatrices(components)` — deterministic, memoized recursion:
- Local matrix = composeTRS(local position, rotation degrees, scale).
- World = parent.world × local (translation, rotation, AND scale all
  compose — child world offsets inherit parent rotation and scale).
- Cycle/self-parent/missing-parent branches evaluate as ROOT entities
  (local == world): the runtime never recurses forever, never crashes, and
  the authored model is never mutated to hide the problem. Issues are
  reported via `HierarchyIssue` (self-parent / missing-parent / cycle /
  excessive-depth, hard limit 32 levels) and surfaced as warnings in the
  diagnostics panel.

## Renderer integration

`Mesh3D` gained an optional world `matrix` (column-major 4×4, mat4 helpers
in render3d.ts). `meshFaces` prefers the matrix and transforms every vertex
by it; the painter's sort, backface culling, and camera pass are unchanged.
Viewport3D derives the world matrices per frame from the canonical
components — no React state mutation, no stale caches.

## Editor

- **Hierarchy panel** (inside the 3D viewport, editor-only): derived tree
  with expandable/collapsible nodes, indentation, child counts, click-select
  (synchronized with viewport + inspector via the existing selection),
  hover-revealed Duplicate-subtree and Delete buttons. Keyboard accessible
  (aria tree/treeitem/expanded roles, focus-visible).
- **Inspector "Hierarchy" section** (for 3d entities): Parent picker
  (None + valid entities — self and descendants excluded so cycles are
  impossible through the UI; a deleted parent shows as a marked option),
  DERIVED world position (read-only), Duplicate subtree, Delete.
- **Delete semantics (documented choice)**: deleting an entity REPARENTS its
  children to the deleted entity's parent (never orphans, never silently
  destroys). Implemented in `ops.removeComponent3D` and communicated in the
  button title.

## Ops (`apps/web/src/lib/project-model/ops.ts`)

- `setParent3D`: guarded reparent (entity exists, parent exists, not self,
  not a descendant — the parent chain is walked so cycles are impossible
  through the op). One undoable commit.
- `duplicateHierarchy3D`: duplicates an entity WITH its parentId-based
  subtree — fresh ids, parent references remapped to the clones, the copy
  root becomes a standalone root. One undoable commit.
- `removeComponent3D`: delete with child reparenting to the grandparent.
  One undoable commit.

## Runtime parity

- **Preview/published** (`viewport-3d.tsx` runtime mode) and **editor** all
  evaluate the same hierarchy over the same canonical components.
- **Export**: `export.go` embeds `parentId` with the entity data and its
  vanilla engine gained `computeWorldMatrices3D`/`meshFaces3DWorld` — the
  same cycle-safe evaluation over the embedded model (all three export web
  targets; Android/Windows shells run the same standalone HTML).

## Verified (session 52)

- E2E `scripts/e2e-3d-hierarchy.mjs` 17/17, 0 console errors — hierarchy
  panel with derived child counts; hierarchy-click selects and opens the
  inspector; VISUAL evidence via pixel centroids: moving the parent moves
  the child's projected position, rotating the parent 90° re-orbits the
  child, the grandchild renders under a scaled parent; save + reload
  preserves parentId chains exactly; duplicate subtree adds a copied
  hierarchy root with remapped ids; deleting the parent reparents the
  child; a raw-model cycle raises a diagnostic with the runtime error-free;
  preview renders the hierarchy; export embeds parentId + evaluator.
- Regressions (11 suites): 3d-foundation 18/18, input-actions 32/32,
  tilemap 44/44, gameplay 21/21, camera 34/34, sorting 19/19, motion 11/11,
  sprite-animation 18/18, animation-state-machine 20/20, lighting 19/19,
  particles 22/22.
- tsc clean; go vet clean; go test 11/11 packages; next build green.

## Limitations

- World transform is read-only in the inspector (no world→local conversion
  for editing; the directive allows read-only derived values).
- No drag-and-drop reparenting (inspector picker + hierarchy panel are the
  interaction paths; DnD was optional).
- No hierarchy gizmo lines between parent and child in the viewport.
- Depth limit 32 levels (safety bound, documented).
- Palette/inspector labels follow the inspector's English-only convention.
- Commit pending: no git binary on this machine.
