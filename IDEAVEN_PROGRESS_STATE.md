IDEAVEN PROGRESS STATE â€” portable development handoff

> Regenerate/update this file at the END of every implementation session.
> The repository is the source of truth; this file only points at it.

CURRENT_DATE: 2026-10-03
CURRENT_COMMIT: see `git log -1` (TASK 61 commit, pushed to origin/main)
PUSHED: YES â€” https://github.com/SulaimanTrid/ideaven-landing.git
CURRENT_BRANCH: main

TOOLCHAIN (Windows):
- node: ideaven-v7\tools\node-v24.21.0-win-x64 (put on PATH)
- git: ideaven-v7\tools\mingit\cmd (MinGit portable)
- go: ideaven-v7\tools\go\bin
- postgres: ideaven-v7\tools\pgsql\bin (data: ideaven-v7\tools\pgdata), port 5432
- playwright suites: PLAYWRIGHT_MODULE=../../tools/e2e-runner/node_modules/playwright/index.js
- local stack: PostgreSQL (5432) + apps/api/ideaven-api.exe with API_ADDR=:8090
  (use scripts/start-local-api.ps1; API_ALLOWED_ORIGINS includes the wrangler
  preview origin) + `npx next dev -p 3000` in apps/web.
- DO NOT run `next build` while `next dev` is live: it overwrites .next and
  the dev server then fails with "Cannot find module './NNN.js'". Stop dev,
  build, delete .next, restart.

CURRENT_OBJECTIVE:
TASK 61 (Creation Visuals + Real Device Orientation + Responsive Builder
Polish) is COMPLETE and verified (session 61): ONE CreationPreview system
(deterministic inline SVG in the real engines' visual language) on the
Creation Hub and Dashboard cards; orientation-aware DeviceFrame so the
ENTIRE device presentation reflows in landscape; two-axis bezel-aware fit
measured on the central stage; ONE canonical dimension source
(VIEWPORT_SIZES); content-sized toolbar actions zone (measured 77px
collision removed), semantic groups, honest tooltips, 390px compaction
(theme into the overflow menu, icon-only Save). Root-cause fixes caught by
the new geometry E2E + sweep: flex-1 actions-zone leftward overflow, and
the game-unit block-div measurement feedback loop that collapsed the shell
at scale < 1. E2E e2e-task61-creation-visuals 45/45; 22 regression suites
green; launch-audit 20 routes green; tsc/go vet/go test -count=1/next
build/build:vinext/verify-cf-preview 12/12 green.

FILES / MODULES TO CONTINUE FROM:
- apps/web/src/components/visuals/creation-preview.tsx (TASK 61 ONE preview
  system; asset contract in its header comment)
- apps/web/src/components/builder/device-frame.tsx (orientation-aware chrome)
- apps/web/src/components/builder/viewport.tsx (canonical VIEWPORT_SIZES +
  viewportSize; passes orientation into DeviceFrame)
- apps/web/src/app/builder/[id]/builder/canvas.tsx (measured-unit one-scale
  owner; two-axis fit; inline-block game unit â€” do NOT revert to block)
- apps/web/src/app/builder/[id]/builder/top-bar.tsx (content-sized zones,
  semantic groups, overflow menu incl. theme below sm)
- apps/web/src/app/dashboard/projects/new/create-project-client.tsx
- apps/web/src/components/dashboard/project-card.tsx
- scripts/e2e-task61-creation-visuals.mjs (45 checks â€” the TASK 61 gate)
- scripts/e2e-task60-3d-editor-core.mjs (47 checks)
- docs/TASK61_CREATION_VISUALS_RESPONSIVE.md + docs/STATUS.md section 68

KNOWN HONEST LIMITS / QUEUED:
- e2e-community.mjs is a legacy audit with pre-existing drift: first 13
  checks pass; the rest reference community UI ("Search the community",
  Unanswered filter, # Game Dev channel) the shipped page never had â€”
  needs its own rewrite task (NOT faked).
- Builder at 390px stays a compressed desktop shell (DESIGN.md Â§N).
- App preview phone miniature is small on the wide 480x200 stage.

NEXT_TASK:
STOP - awaiting explicit approval per the TASK 61 directive. Queued:
TASK 62 onward.