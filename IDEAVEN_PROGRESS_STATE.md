IDEAVEN PROGRESS STATE â€” portable development handoff

> Regenerate/update this file at the END of every implementation session.
> The repository is the source of truth; this file only points at it.

CURRENT_DATE: 2026-10-04
CURRENT_COMMIT: see `git log -1` (TASK 63 commit, pushed to origin/main)
PUSHED: YES â€” https://github.com/SulaimanTrid/ideaven-landing.git
CURRENT_BRANCH: main

TOOLCHAIN (Windows):
- node: ideaven-v7\tools\node-v24.21.0-win-x64 (put on PATH)
- git: ideaven-v7\tools\mingit\cmd (MinGit portable)
- go: ideaven-v7\tools\go\bin
- postgres: ideaven-v7\tools\pgsql\bin (data: ideaven-v7\tools\pgdata), port 5432
- playwright suites: PLAYWRIGHT_MODULE=../../tools/e2e-runner/node_modules/playwright/index.js
- local stack: PostgreSQL (5432) + apps/api (API_ADDR=:8090 via
  scripts/start-local-api.ps1) + `npx next dev -p 3000` in apps/web.
- DO NOT run `next build` while `next dev` is live (corrupts .next).

CURRENT_OBJECTIVE:
TASK 63 (Beginner Workspace Navigation + Scrollable Editor Panels) is
COMPLETE and verified (session 63): mode strip with Alt+1..5 shortcuts,
tooltips, underline active state and justify-start overflow (root-cause fix
for tabs spilling under the brand); one compact breadcrumb (project /
ENGINE / MODE, pointer-events-none); palette search + collapsible
categories persisted per project type; collapsible inspector sections with
preserved rail scroll; desktop panel collapse rails; palette/inspector
drawers (390/768) with one-drawer rule + Escape; 3D wheel zoom routing
proven; blocks wheel-pan/zoom + beginner hints; secondary toolbar tools
compact below 2xl fixing a measured 67px overflow at 1280; Undo/Redo
always inline. e2e-task63 42/42; 20+ suites green; all gates green.

FILES / MODULES TO CONTINUE FROM:
- apps/web/src/app/builder/[id]/builder/builder.tsx (workspace layout:
  collapse rails, drawers, Alt shortcuts, one-drawer rule)
- apps/web/src/app/builder/[id]/builder/top-bar.tsx (mode strip +
  breadcrumb + 2xl compaction)
- apps/web/src/app/builder/[id]/builder/palette.tsx (search + folding
  categories + localStorage)
- apps/web/src/app/builder/[id]/builder/inspector.tsx (Section is
  collapsible â€” do not revert to static headers)
- apps/web/src/app/builder/[id]/builder/scene-canvas.tsx (multi-select
  reset deps are [selectedId, screen?.id] â€” do not widen)
- apps/web/src/components/runtime/viewport-3d.tsx (3D wheel zoom)
- scripts/e2e-task63-workspace-navigation.mjs (42 checks â€” TASK 63 gate)
- docs/TASK63_WORKSPACE_NAVIGATION.md + docs/STATUS.md section 70

KNOWN HONEST LIMITS / QUEUED:
- e2e-community.mjs legacy drift (STATUS Â§68) â€” needs a rewrite task.
- Mode strip left-aligns when overflowing (deliberate fix).
- Category persistence per browser; inspector section state session-local.

NEXT_TASK:
STOP - awaiting explicit approval per the TASK 63 directive. Queued:
TASK 64 onward.