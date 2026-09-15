# IDEAVEN PROGRESS STATE — portable development handoff

> Regenerate/update this file at the END of every implementation session.
> The repository is the source of truth; this file only points at it.

CURRENT_DATE: 2026-09-16
CURRENT_COMMIT: cf1d9d1 (feat(2d): tile palette — multi-tile painting end to end)
CURRENT_BRANCH: main

CURRENT_OBJECTIVE:
IDEAVEN 2D Game Engine expansion — PHASE F (Tilemap, SYSTEM 4). The 0/3
checkpoint (painting / E2E / gates) is VERIFIED, and the tile-palette
multi-tile painting follow-up slice is complete (session 41).

COMPLETED:
- Tilemap core entity (session 39, verified in 40): tilemap type in the
  registry, canonical `tiles` prop ("col,row:tile;…"), design-canvas
  cell rendering, model persistence.
- Tilemap painting tools (session 40): Select/Paint/Erase toolbar group;
  click paints, drag paints a stroke, Erase removes; every cell commits
  through `actions.updateProps` (canonical model, undo, autosave).
- Per-cell collision for real (session 40): preview + published pages +
  exported runtimes land the player on painted cells only; tilemap touch
  enter/stay/exit events are per-cell.
- Tile palette — multi-tile painting (session 41): `palette`
  "value:#hex;…" canonical prop; toolbar swatch row picks the tile value
  the Paint tool writes; per-tile colors render on design canvas, preview,
  published pages, AND the exported HTML/Android/Windows runtime
  (`tileColorAt` in both scene.ts and export.go). Registry default palette
  has 4 entries.
- E2E: `scripts/e2e-tilemap-paint.mjs` — 24/24 (adds: tile-2 swatch pick →
  paint → data-tile="2" + palette color on canvas AND preview, model
  carries "4,2:2"). 0 console errors. Export HTML embeds palette + values.
- Gates (session 41): tsc clean; production build green; go vet clean;
  go test -count=1 ./... 11/11 packages green; gameplay E2E 21/21.

PARTIALLY_COMPLETE:
- Tilemap SYSTEM 4: palette editing is a text field (no color-picker UI);
  all tile values are solid (no per-value collision flags); no rule tiles
  (neighbor auto-tiling); no multiple tilemap layers.
- 2D engine wider roadmap (PHASE G–J): lighting (5), sprite shape (6),
  pixel-perfect camera (7), camera behaviors (8), sorting layers (9),
  prefabs (10), particles (18), input abstraction (19), animation state
  machine (20), debug overlays (21), atlas/slicing/pivot deepening (1C–1F),
  skeletal foundation (2B) — NOT_STARTED.
- Export touch events for solid entities fire in the preview runtime but
  not in the exported sceneTick (pre-existing gap, unchanged).

IN_PROGRESS: nothing (slice boundary — clean handoff point).

BLOCKED: none.

NEXT_TASK:
Pick ONE slice next, in this order:
1. Rule tiles (neighbor-aware auto-tiling on paint) — extends the palette
   with rule variants; needs per-neighbor cell inspection in the paint
   commit path.
2. Camera behaviors (SYSTEM 8): follow target, smoothing, bounds, shake —
   editor fields + scene-stage + export parity in one vertical slice.
Then continue per the priority order in the resume prompt / STATUS.md §48.

FILES / MODULES TO CONTINUE FROM:
- apps/web/src/app/builder/[id]/builder/scene-canvas.tsx (paint gesture,
  SceneTool type, activeTile prop, per-tile glyph colors)
- apps/web/src/app/builder/[id]/builder/canvas.tsx (toolbar tools group +
  tile swatch row, activeTile state)
- apps/web/src/lib/project-model/scene.ts (tile helpers incl. palette:
  parseTilePalette / tileColorAt / tilemapPaletteValues)
- apps/web/src/lib/project-model/registry.tsx (tilemap defaults incl.
  palette prop + palette text field)
- apps/web/src/components/runtime/scene-stage.tsx (per-cell solids +
  touch events; per-tile colors; re-exports parseTiles)
- apps/api/internal/project/export.go (exported scene engine: ENTITY_TYPES,
  tilemapCellRects, tileColorAt, buildScene tilemap case, sceneTick
  per-cell landing)
- scripts/e2e-tilemap-paint.mjs (24 checks; extend for rule-tile slices)

VERIFICATION COMMANDS (this machine):
- PostgreSQL: ~/.local/ideaven-pg/bin/pg_ctl -D ~/.local/ideaven-pg/data
  -l ~/.local/ideaven-pg/log.txt -o "-p 5432 -k $HOME/.local/ideaven-pg/run
  -c listen_addresses=127.0.0.1" start
- API: cd apps/api && go build -o /tmp/ideaven-api ./cmd/api &&
  DATABASE_URL="postgres://ideaven:ideaven@127.0.0.1:5432/ideaven?sslmode=disable"
  API_ADDR=":8090" /tmp/ideaven-api
- Web: cd apps/web && NEXT_PUBLIC_API_URL=http://localhost:8090 npx next dev -p 3000
- E2E: install playwright@1.62.1 into /tmp/iv-pw (matches the cached
  chromium-1234 in ~/.cache/ms-playwright), then:
  PLAYWRIGHT_MODULE=/tmp/iv-pw/node_modules/playwright/index.js
  node scripts/e2e-tilemap-paint.mjs
- Go tests: cd apps/api && go test -count=1 ./... (needs PostgreSQL up)
- Production build: STOP `next dev` first, rm -rf apps/web/.next, then
  npx next build (documented repo rule — never build while dev serves).

SESSION LOG:

## Session 41 (2026-09-16)
DATE: 2026-09-16
COMMIT: cf1d9d1 — feat(2d): tile palette — multi-tile painting
CURRENT PHASE: 8.0 / 2D Game Engine — PHASE F, SYSTEM 4 (Tilemap)
CURRENT FEATURE: Tile palette — multi-tile painting
COMPLETED THIS SESSION:
- canonical `palette` prop + registry default (4 tiles) + text field
- toolbar swatch row; Paint writes the selected tile value
- per-tile colors on design canvas, preview, published pages, and the
  exported runtime (tileColorAt in scene.ts AND export.go)
VERIFIED THIS SESSION: E2E 24/24 (multi-tile assertions incl. preview
palette color + model "4,2:2"); export HTML embeds palette + tile values;
gameplay E2E 21/21; tsc clean; next build green; go vet clean;
go test 11/11 packages.
TEST RESULTS: go test -count=1 ./... → ok 11/11 packages (live PostgreSQL).
E2E RESULTS: tilemap-paint 24/0/0; scene-gameplay 21/0.
KNOWN LIMITATIONS: palette editing is a text field; all tile values solid;
no rule tiles; no multiple layers; export solid-touch events pre-existing
gap (platforms included).
CURRENT BLOCKERS: none. NOTE: /tmp on this machine is wiped between boots
— keep the playwright install command handy (below) and build the API
binary to $HOME, not /tmp.
NEXT EXACT TASK: rule tiles (auto-tiling) or camera behaviors (SYSTEM 8);
see STATUS.md §48.

## Session 40 (2026-09-14)
DATE: 2026-09-14
COMMIT: 35fd4a1 — feat(2d): tilemap painting workflow + honest per-cell collision
CURRENT PHASE: 8.0 / 2D Game Engine — PHASE F, SYSTEM 4 (Tilemap)
CURRENT FEATURE: Tilemap painting + honest per-cell collision
COMPLETED THIS SESSION:
- paint/erase tools (click + drag stroke) committing canonical tiles
- per-cell collision in preview/published/export + per-cell touch events
- preview tilemap cell rendering fixed (ENTITY_SHAPES)
- exported runtime cell rendering + per-cell landing (runtime-proven)
- scripts/e2e-tilemap-paint.mjs (19/19) + gameplay E2E regex fix (21/21)
- gates: tsc clean, next build green, go vet clean, go test 10/10 green
VERIFIED THIS SESSION: see COMPLETED; evidence in STATUS.md §47.
TEST RESULTS: go test -count=1 ./... → ok 10/10 packages (live PostgreSQL).
E2E RESULTS: tilemap-paint 19 passed / 0 failed / 0 console errors;
scene-gameplay 21/21.
KNOWN LIMITATIONS: single tile type; no palette/fill/rule tiles/layers;
export solid-touch events pre-existing gap (platforms included).
CURRENT BLOCKERS: none.
NEXT EXACT TASK: tile-palette picker (multi-tile painting) — extend the
toolbar tools group with a tile selector, store tile values >1 in `tiles`,
per-tile colors in EntityGlyph/EntityView/export buildScene, extend
scripts/e2e-tilemap-paint.mjs with a second tile type assertion, then run
tsc + build + go test.
