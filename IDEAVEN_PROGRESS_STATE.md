IDEAVEN PROGRESS STATE — portable development handoff

> Regenerate/update this file at the END of every implementation session.
> The repository is the source of truth; this file only points at it.

CURRENT_DATE: 2026-10-04
CURRENT_COMMIT: see `git log -1` (TASK 64 commit, pushed to origin/main)
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

CURRENT_OBJECTIVE:
TASK 64 (Real Extension Engine + Runtime Providers + Palette Integration)
is COMPLETE and verified (session 64): the full install → validate →
register → palette → configure → save → render → preview → published →
export flow is real and honest. Durable per-install enable/disable
(migration 057, owner-scoped PATCH); uninstall safety with server-counted
usage; global-slug dedupe (uniqueSlug); ONE palette registration owner in
BlocksWorkspace honoring enabled state + ideaven:extensions-changed; runtime
skips ext: blocks honestly (toast + persistent Runtime-trace line, once per
type); FIXED dead vocabulary — the runtime now dispatches the Screen
"initialize" event at run start; diagnostics INFO + export validation
always flag ext: blocks; installedVersion surfaced ("vX installed / vY
published"). e2e-task64 34/34 (0 console errors); 26-suite sweep 24 PASS
(task62 61/61 solo after a contention flake; community = documented legacy
drift); all gates green (tsc, go vet, go test ./... incl. ai+credits,
next build, build:vinext, verify-cf-preview 12/12).

FILES / MODULES TO CONTINUE FROM:
- apps/api/internal/extension/extension.go (InstalledExtension + enabled +
  installedVersion; SetInstallEnabled; InstallUsage; uniqueSlug)
- apps/api/internal/extension/handler.go (installedWire — the installed
  list is a FLAT Extension[] with enabled/installedVersion on each row;
  do not re-wrap as {extension, enabled})
- apps/api/migrations/057_extension_install_enabled.sql
- apps/web/src/app/builder/[id]/builder/blocks-mode.tsx (BlocksWorkspace
  owns THE extension registration effect — keep the enabled filter + tick)
- apps/web/src/lib/project-model/runtime.ts (ext: skip → toast + onTrace;
  dispatch(null, "initialize") at run start — keep the skip Set above it)
- apps/web/src/lib/project-model/diagnostics.ts (ext: INFO diagnostic)
- apps/web/src/app/builder/[id]/builder/export-button.tsx (validateModel
  flags ext: types ALWAYS — exports never bundle providers)
- apps/web/src/components/extensions/extensions-client.tsx (state chips,
  toggle, uninstall confirm with real usage, version drift line)
- scripts/e2e-task64-extension-engine.mjs (34 checks — TASK 64 gate;
  derives the real slug from the API)
- scripts/run-regressions-t64.mjs (26-suite regression sweep runner)
- docs/TASK64_EXTENSION_ENGINE.md + docs/STATUS.md section 71

KNOWN HONEST LIMITS / QUEUED:
- Extension components/methods/events are declared but unavailable at
  runtime (warned at import, skipped honestly at runtime, flagged in
  diagnostics and export). Real providers are a later phase.
- Manifest dependencies stay informational (not package-resolved).
- e2e-community.mjs legacy drift (STATUS §68) — needs a rewrite task.
- Mode strip left-aligns when overflowing (deliberate TASK 63 fix).

NEXT_TASK:
STOP - awaiting explicit approval per the TASK 64 directive. Queued:
TASK 65 onward.
