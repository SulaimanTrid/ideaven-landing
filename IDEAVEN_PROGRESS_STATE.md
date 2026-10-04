IDEAVEN PROGRESS STATE — portable development handoff

> Regenerate/update this file at the END of every implementation session.
> The repository is the source of truth; this file only points at it.

CURRENT_DATE: 2026-10-04
CURRENT_COMMIT: see `git log -1` (TASK 66 commit, pushed to origin/main)
PUSHED: YES — https://github.com/SulaimanTrid/ideaven-landing.git
CURRENT_BRANCH: main

TOOLCHAIN (Windows):
- node: ideaven-v7\tools\node-v24.21.0-win-x64 (put on PATH)
- git: ideaven-v7\tools\mingit\cmd (MinGit portable)
- go: ideaven-v7\tools\go\bin (the API/extbuild worker shells out to `go`)
- postgres: ideaven-v7\tools\pgsql\bin (data: ideaven-v7\tools\pgdata), port 5432
- playwright suites: PLAYWRIGHT_MODULE=../../tools/e2e-runner/node_modules/playwright/index.js
- local stack: PostgreSQL (5432) + apps/api (API_ADDR=:8090 via
  scripts/start-local-api.ps1 or scripts/restart-api-dev.ps1) +
  `npx next dev -p 3000` in apps/web (scripts/start-web-dev.ps1).
- DO NOT run `next build` while `next dev` is live (corrupts .next).
- Do NOT run `go test ./...` while an E2E sweep is running (API contention
  flakes timing-sensitive suites; observed twice).

CURRENT_OBJECTIVE:
TASK 66 (Real Preview + Published + Export Parity + Runtime Integrity) is
COMPLETE and verified (session 66). The runtime architecture is one
canonical model with two runtime faces — the web React runtime
(editor/preview/published via LiveApp) and the export's vanilla mirror —
now PROVEN equivalent: the block vocabulary is 1:1 (34 cases per side) and
the parity suite runs the SAME authored projects in preview, on published
pages, and inside the ACTUAL exported HTML artifacts executed from disk in
a real browser. THREE real export-runtime bugs were found and fixed:
undeclared `animCommands` (every exported 2D scene was dead — the loop
threw every frame), the `emitterSims` module-scope crash, and the export
camera following authored props instead of the live player; plus an
emit-rerender race that dropped interactions. Export honesty: ext: skip
reported, initialize dispatched, startup error surface, embedded
ideaven-manifest (deterministic, no secrets), canonical ValidateModel
before every export (422, no artifact), magic-byte artifact verification
in the dialog, and THE capability matrix (lib/capabilities.ts, 8×6) wired
to per-target notes. One shared RuntimeBoundary guards preview + published
with honest RUNNING/FAILED states. e2e-task66 66/66 (0 console errors);
30-suite sweep green after fixing a task64 suite locator bug (34/34 solo;
community = documented legacy drift); all gates green (tsc, go vet,
go test ./..., next build, build:vinext, verify-cf-preview 12/12).

FILES / MODULES TO CONTINUE FROM:
- apps/api/internal/project/export.go (the standalone vanilla runtime —
  keep it semantically identical to the web runtime; animCommands/
  emitterSims are MODULE-scoped; the camera follow reads the LIVE player;
  emit uses scheduleRerender; validatedExportModel gates all exports;
  buildExportManifest embeds ideaven-manifest)
- apps/web/src/lib/capabilities.ts (THE capability matrix — one source;
  update it AND both runtime faces together when capabilities change)
- apps/web/src/components/runtime/runtime-error-boundary.tsx (ONE boundary
  reused by preview + published — do not add a second)
- apps/web/src/app/builder/[id]/builder/preview-mode.tsx (run state chip
  data-preview-state; try/catch in start; boundary wraps the surface)
- apps/web/src/components/runtime/live-app.tsx (published runtime state +
  same boundary)
- apps/web/src/app/builder/[id]/builder/export-button.tsx (magic-byte
  artifact verification; per-target capability notes)
- scripts/e2e-task66-runtime-parity.mjs (66 checks — TASK 66 gate; runs
  exported artifacts from disk)
- scripts/run-regressions-t66.mjs (30-suite regression sweep runner)
- docs/TASK66_RUNTIME_PARITY.md + docs/STATUS.md section 73

KNOWN HONEST LIMITS / QUEUED:
- The export runtime is a deliberate vanilla mirror: new blocks must land
  on BOTH faces (web + export) — the parity suite is the guardrail.
- Custom TypeScript remains code-only (stored verbatim, not executed by
  runtimes); extension providers remain a later phase (TASK 64 honesty).
- Android/Windows export shells ship without stored assets by design.
- e2e-community.mjs legacy drift (STATUS §68) — needs a rewrite task.
- /start checks the session client-side via the real auth provider.

NEXT_TASK:
STOP - awaiting explicit approval per the TASK 66 directive. Queued:
TASK 67 onward.
