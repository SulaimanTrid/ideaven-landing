IDEAVEN PROGRESS STATE â€” portable development handoff

> Regenerate/update this file at the END of every implementation session.
> The repository is the source of truth; this file only points at it.

CURRENT_DATE: 2026-10-04
CURRENT_COMMIT: see `git log -1` (TASK 62 commit, pushed to origin/main)
PUSHED: YES â€” https://github.com/SulaimanTrid/ideaven-landing.git
CURRENT_BRANCH: main

TOOLCHAIN (Windows):
- node: ideaven-v7\tools\node-v24.21.0-win-x64 (put on PATH)
- git: ideaven-v7\tools\mingit\cmd (MinGit portable)
- go: ideaven-v7\tools\go\bin
- postgres: ideaven-v7\tools\pgsql\bin (data: ideaven-v7\tools\pgdata), port 5432
- playwright suites: PLAYWRIGHT_MODULE=../../tools/e2e-runner/node_modules/playwright/index.js
- local stack: PostgreSQL (5432) + apps/api (API_ADDR=:8090 via
  scripts/start-local-api.ps1; REBUILD the exe with scripts/rebuild-api.ps1
  after editing export.go â€” the running binary serves the export template)
  + `npx next dev -p 3000` in apps/web.
- DO NOT run `next build` while `next dev` is live (it corrupts .next).
- In export.go templates every literal % must be escaped %% (fmt Sprintf).

CURRENT_OBJECTIVE:
TASK 62 (Real 2D Game Engine Core + Professional 2D Authoring) is COMPLETE
and verified (session 62): sprite asset picker + canonical pivot/flip
(one render formula, all surfaces), visual tile palette editor with
per-tile solid/pass collision flags (legacy palettes stay solid), flood
fill/erase-fill (one gesture one undo), six-class rule tiles (cross/T/
straight/corner/end/isolated; export mirror), camera pixel-snap, 2D
multi-select (ctrl+click + marquee) with group move/duplicate/delete/align
as ONE-commit ops, z-order shortcuts through moveComponent, debug overlays
(default OFF), grid toggle, Play/Stop, flat GameObject list, scene
duplicate/reorder, sheet slicing in Asset Studio. e2e-task62 61/61; 20
regression suites green; all gates green.

FILES / MODULES TO CONTINUE FROM:
- apps/web/src/lib/project-model/scene.ts (spriteOrientation/
  spriteTransformStyle, tileIsSolid/tilemapSolidCellRects, autoTileFactor
  6-class, cameraConfig.pixelSnap)
- apps/web/src/components/runtime/scene-stage.tsx (flip/pivot render, solid
  collision, pixel-snap camera)
- apps/web/src/app/builder/[id]/builder/scene-canvas.tsx (fill tools,
  multi-select/marquee/align, debug overlays, pivot-aware glyphs)
- apps/web/src/app/builder/[id]/builder/inspector.tsx (SpriteTexturePanel,
  SpritePivotPanel, TilePalettePanel, Z-order section)
- apps/api/internal/project/export.go (ALL mirrors â€” rebuild exe after edit!)
- scripts/e2e-task62-2d-engine-core.mjs (61 checks â€” the TASK 62 gate)
- docs/TASK62_2D_ENGINE_CORE.md + docs/STATUS.md section 69

KNOWN HONEST LIMITS / QUEUED:
- e2e-community.mjs legacy drift (see STATUS Â§68) â€” needs a rewrite task.
- Tilemap editor LOCK, prefab ecosystem, camera dead-zone/zoom: deferred
  (documented in docs/TASK62_2D_ENGINE_CORE.md Â§6).
- Straight-run autoTile shading (0.88) is a visible upgrade for existing
  autoTile projects (stored data unchanged).

NEXT_TASK:
STOP - awaiting explicit approval per the TASK 62 directive. Queued:
TASK 63 onward.