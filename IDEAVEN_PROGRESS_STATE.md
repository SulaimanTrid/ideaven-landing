# IDEAVEN PROGRESS STATE — portable development handoff

> Regenerate/update this file at the END of every implementation session.
> The repository is the source of truth; this file only points at it.

CURRENT_DATE: 2026-09-14
CURRENT_COMMIT: 2d2f270 (base) + this session's uncommitted tilemap-paint slice
CURRENT_BRANCH: main

CURRENT_OBJECTIVE:
IDEAVEN 2D Game Engine expansion — PHASE F (Tilemap, SYSTEM 4). The 0/3
checkpoint from the resume prompt (tilemap painting / E2E / gates) is now
3/3 VERIFIED.

COMPLETED:
- Tilemap core entity (session 39, verified this session): tilemap type in
  the registry, canonical `tiles` prop ("col,row:tile;…"), design-canvas
  cell rendering, model persistence.
- Tilemap painting tools (this session): Select/Paint/Erase toolbar group
  when a tilemap is selected; click paints a cell, drag paints a stroke,
  Erase removes; every cell commits through `actions.updateProps` (canonical
  model, undo, autosave). Grid bounds clamp input; crosshair cursor.
- Per-cell collision for real (this session): preview + published pages +
  exported runtimes land the player on painted cells only (empty cell =
  air); tilemap touch enter/stay/exit events are per-cell too.
- Preview tilemap rendering fixed: `ENTITY_SHAPES` now includes `tilemap`
  (before this, preview rendered an empty div — found by the E2E).
- Export parity: exported HTML/Android/Windows sceneTick renders cells and
  resolves landing per cell. Runtime-proven (rest at 712 on cell vs 744 on
  floor).
- E2E: `scripts/e2e-tilemap-paint.mjs` — 19/19 (real UI path: palette add →
  tools → click-paint → drag-stroke → model via API → erase → reload
  persistence → preview landing assertion; 0 console errors).
- `scripts/e2e-scene-gameplay.mjs` trace regex updated to the session-38
  "collision enter/exit" vocabulary — 21/21 green.
- Gates: `tsc --noEmit` clean; production `next build` green; `go vet ./...`
  clean; full `go test -count=1 ./...` green (10/10 packages, live
  PostgreSQL); STATUS.md updated (session 40 entry).

PARTIALLY_COMPLETE:
- Tilemap SYSTEM 4 overall: single tile type per tilemap (tileColor prop).
  No tile-palette picker (multi-tile painting), no fill tool, no rule
  tiles, no multiple tilemap layers. Each is a separate future slice.
- 2D engine wider roadmap (PHASE G–J): lighting (5), sprite shape (6),
  pixel-perfect camera (7), camera behaviors (8), sorting layers (9),
  prefabs (10), particles (18), input abstraction (19), animation state
  machine (20), debug overlays (21), atlas/slicing/pivot deepening (1C–1F),
  skeletal foundation (2B) — NOT_STARTED.
- Export touch events for solid entities (platform/tilemap) fire in the
  preview runtime but not in the exported sceneTick (pre-existing gap,
  shared with platforms — honest limitation, unchanged this session).

IN_PROGRESS: nothing (slice boundary — clean handoff point).

BLOCKED: none.

NEXT_TASK:
Pick ONE slice next, in this order:
1. Tile-palette picker (multi-tile painting: N tile types per tilemap,
   palette UI in the toolbar, tile values >1 in `tiles`, per-tile colors)
   — smallest completion of SYSTEM 4.
2. Rule tiles (auto-tiling neighbors) — depends on the palette above.
3. Camera behaviors (SYSTEM 8): follow target, smoothing, bounds, shake —
   editor fields + scene-stage + export parity in one vertical slice.
Then continue per the priority order in the resume prompt / STATUS.md §47.

FILES / MODULES TO CONTINUE FROM:
- apps/web/src/app/builder/[id]/builder/scene-canvas.tsx (paint gesture,
  SceneTool type)
- apps/web/src/app/builder/[id]/builder/canvas.tsx (toolbar tools group)
- apps/web/src/lib/project-model/scene.ts (tile helpers — single source)
- apps/web/src/components/runtime/scene-stage.tsx (per-cell solids +
  touch events; re-exports parseTiles)
- apps/api/internal/project/export.go (exported scene engine: ENTITY_TYPES,
  tilemapCellRects, buildScene tilemap case, sceneTick per-cell landing)
- scripts/e2e-tilemap-paint.mjs (extend for multi-tile/rule-tile slices)

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

## Session 40 (2026-09-14)
DATE: 2026-09-14
COMMIT: (working tree on 2d2f270; tilemap-paint slice)
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
