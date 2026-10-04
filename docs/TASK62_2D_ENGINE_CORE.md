# TASK 62 — Real 2D Game Engine Core + Professional 2D Authoring

Status: **FUNCTIONAL / TESTED** (dedicated E2E 61/61; full regression sweep +
gates recorded in STATUS §69)
Session: 62 (2026-10-04).

---

## 1. The 2D foundation (inspected, not rebuilt)

The engine was already real: scene model + Player/Platform/Coin/Enemy/
Trigger/Sprite/Tilemap/Camera/Light/Emitter entities, AABB gameplay physics,
input abstraction, sprite animation + state machine, 2D lighting, particles,
sorting layers, Asset Studio, published runtime and exported shells. TASK 62
extends each of these — zero second systems (§0).

## 2. Gaps addressed (root causes verified in code)

1. **Sprite texture required typing `asset:<id>` by hand** — the only path
   was a raw text field.
2. **No pivot / flip** — sprites could not anchor rotation or mirror.
3. **Tile palette editing was a raw text field** (`value:#hex;…`).
4. **All painted tiles were unconditionally solid** — no decorative tiles.
5. **Rule tiles had 3 classes** (4/3/≤2 neighbors) — no end/straight/T
   distinction.
6. **No tile fill tool** — region work was click-by-click.
7. **No 2D multi-selection, alignment, z-order shortcuts, debug overlays,
   grid toggle, play button, or a game-object list.**
8. **Scenes could not be duplicated or reordered.**
9. **No pixel-safe camera mode.**

## 3. What was built (all canonical-model driven)

### Sprite workflow (§7–§13)

- **Asset picker** (`inspector.tsx` SpriteTexturePanel): project image
  assets as thumbnail cards with name + MEASURED pixel dimensions (read from
  the decoded image, not guessed); the current texture is highlighted and
  named; actions Choose/Replace/Clear; commits `asset:<id>` through
  `updateProps`. No id typing. The URL text field remains as an advanced
  option for external images.
- **Pivot** (`SpritePivotPanel`): presets Center/Top/Bottom/Left/Right
  (`pivotX/pivotY` 0..1 canonical props) — the anchor for rotation and the
  fixed edge for flips, rendered by ONE formula (`spriteTransformStyle` in
  scene.ts) shared by design canvas, preview runtime, published pages, and
  the export engine. Numeric fields remain in Properties.
- **Flip X / Flip Y** (`flipX/flipY` canonical props): mirrored at render;
  the source asset is never mutated.
- **Rotation/scale** stay on the existing transform architecture.
- **Animation/state machine**: the existing panels remain authoritative —
  TASK 62 adds no parallel engine.

### Tilemap authoring (§15–§21)

- **Visual palette editor** (`TilePalettePanel`): swatch rows with a real
  color picker, add tile, remove tile, reorder ◀▶, and per-tile collision
  flags — persisted ONLY through the canonical `palette` string, extended to
  `value:#hex:solid|pass` (pre-TASK-62 palettes without a third field stay
  solid — zero migration, zero behavior change for old projects).
- **Collision flags** (`tileIsSolid` / `tilemapSolidCellRects` in scene.ts +
  export.go mirror): solid tiles block the player and fire touch events;
  `pass` tiles render as decoration only. Verified live: the player rests on
  a solid run and falls through the same run once it is flipped to `pass`.
- **Flood fill** (scene-canvas `fill`/`erasefill` tools): bounded BFS over
  the tilemap grid, contiguous matching region, malformed data normalized by
  the existing parse, ONE commit per gesture = one undo entry (proven by
  undo/redo restoring the exact tile string).
- **Rule tiles** (`autoTileFactor` upgraded): 4-neighborhood mask → six
  classes — cross (4) 0.72, T (3) 0.80, straight (2 opposite) 0.88,
  corner (2 adjacent) / end (1) / isolated → base color. Derived variant is
  deterministic at render; stored tiles stay base values; export.go ships
  the identical function.
- **Layers**: multiple tilemaps in one scene ARE the layers — each is a
  canonical entity with its own name/palette/tiles/sorting layer/visibility;
  ordering uses the existing sorting-layer pipeline; visibility uses
  `visible`. No separate layer storage (per §15). A per-tilemap editor LOCK
  was deferred (§47 note).

### Camera (§22–§23)

- **Pixel snap** (`pixelSnap` canonical camera prop): the runtime camera
  rounds to whole pixels after ease+clamp (deterministic, no subpixel
  jitter; smooth follow untouched; authored data never mutated). Export
  mirror identical. Verified live via `data-camera-y` being an integer
  while following a falling player.

### Editor workflow (§24–§32, §37, §40)

- **Grid toggle** (authoring dots, editor preference); **Snap** unchanged.
- **Multi-selection**: ctrl/cmd+click toggles; MARQUEE sweep on empty stage;
  group move drags every member; group duplicate/delete are ONE pure op
  (`duplicateComponentsMany` / `removeComponentsMany`) = one undo entry; an
  alignment of the whole selection (6 modes over real bounds,
  `updateComponentsPropsMany`) is one commit.
- **Z-order shortcuts** (§27): Bring to front / Move forward / Move
  backward / Send to back — through the EXISTING `moveComponent` op (front =
  0, back = length accounting for the removal shift). No parallel z system.
- **Debug overlays** (§29): collision boxes, trigger areas, solid tile
  cells — editor toggles, ALL default OFF (§37); they read the same
  canonical props the runtime collides with.
- **Play/Stop/Reset** (§30): Play enters the live preview; Stop returns to
  authoring; Reset (Restart) re-seeds runtime state — authored model is
  never touched by a run (existing architecture).
- **GameObject list** (§32): an honest FLAT list (the scene model has no
  entity parenting — nothing faked) in back-to-front render order with type
  labels, hidden-state marker, per-row duplicate/delete; sits beside the
  canonical palette (insertion stays palette-driven, §6).
- **Scene management** (§5): add/rename/start/delete existed; TASK 62 adds
  **duplicate** (full copy right after the original) and **reorder**
  (earlier/later) — canonical ops `duplicateScreen`/`moveScreen`, start
  designation travels with the id.
- **Empty state** (§31): quick-create buttons + the guidance line
  "Build your scene → add graphics → add logic → press Play."
- **2D toolbar** (§40): tool group Select/Paint/Erase/Fill/Erase-fill;
  Snap; Grid; Sorting; debug toggles; orientation; Play; zoom cluster.
  Product actions (Save/Publish/Export/Assets/History) stay in the global
  toolbar — Export visibility is TASK 61's zoned toolbar, regression-guarded.

### Asset Studio (§9)

- **Sprite-sheet import + grid slicing** (`sprite-editor.tsx`): load a
  sheet image, set columns/rows/spacing/padding (cell size derived), live
  grid preview with the selected cell highlighted, then slice & save — each
  cell becomes its OWN canonical PNG asset (`<name>-r{row}-c{col}.png`)
  through the project asset API. No separate atlas engine; animation clips
  reference the sliced cells like any frames.

## 4. Error handling (§46)

- Malformed palette entries are skipped by the parsers (colors fall back to
  `tileColor`, flags default solid); invalid tiles normalized at parse;
  missing sprite frames fall back to the entity's static texture (existing
  SLICE-2 behavior, regression-guarded); malformed/malicious pixel data in
  the slicer is bounded by the image element's natural size. No fabricated
  graphics anywhere.

## 5. Persistence / undo / parity (§43–§45)

- Everything above persists through canonical project actions and survives
  save→reload exactly (E2E: pivot/flip/palette/flags re-read from the API
  after reload; undo/redo exactness asserted for fill, erase-fill, group
  delete, alignment).
- Preview / published / export parity: pivot+flip (transform+origin),
  rule-tile classes, solid-tile filtering, and pixel snap ship in the
  exported runtime (E2E asserts the markers AND the published page renders
  the pivot).

## 6. Known limitations / deferred (honest)

- **Tilemap layer LOCK** is deferred (visibility/ordering exist; lock is
  editor-only state that needs a home — documented, not faked).
- **Full prefab ecosystem** deferred (§33): duplicate-per-entity exists;
  linked instances need a design decision — not faked.
- **Dead-zone camera, camera zoom authoring**: the existing camera model
  doesn't carry them; exposed only what it supports (§22/§23 documented).
- **Inspector full collapse-restructure** (§36): the inspector gained
  clearly scoped sections (Sprite texture / Pivot & flip / Tile palette /
  Z order / Animation / State machine) but a full collapsible accordion
  redesign is deferred.
- **Straight-shade migration note**: projects using autoTile now see
  straight runs (2 opposite neighbors) shade at 0.88 where they previously
  kept base color — an intentional rule-tile upgrade; stored data is
  unchanged.

## 7. Verification

- `scripts/e2e-task62-2d-engine-core.mjs` — **61/61, 0 console/page
  errors**: identity, GameObject list, scene duplicate/reorder/start,
  asset picker (list/dimensions/assign/replace/clear), pivot preset + flips
  (model + computed-transform evidence + rotation-anchor proof), tile
  palette (add/color/solid toggle), paint, flood fill (bounded, one undo),
  erase-fill, rule-tile classes (end/straight/T distinct colors), live
  collision (solid lands, pass falls through — camera-position evidence),
  pixel-snap camera, multi-select + alignment + group delete/undo + marquee,
  z-order front/back, debug overlays OFF-by-default + on-demand, grid
  toggle, play/stop, persistence, publish + export parity markers, sheet
  slicing into real assets, five responsive widths.
- Regression sweep + gates: STATUS §69.
