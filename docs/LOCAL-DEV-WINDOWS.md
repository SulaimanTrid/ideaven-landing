# Local development on this Windows machine

Environment-specific notes for running Ideaven locally. The repository
defaults (`apps/api/.env.example`, `apps/web/.env.example`) stay unchanged;
the machine-specific values live in the gitignored `.env` / `.env.local`
files. (Rewritten for the current machine in session 42, 2026-09-21 —
the repo moved from `C:\Users\ACER\tools` to the portable `ideaven-v7\tools`
bundle.)

## Toolchain (portable, user-scoped — no admin required)

| Tool       | Location (relative to `ideaven-v7\`) | Version |
| ---------- | ------------------------------------ | ------- |
| Node.js    | `tools\node-v24.21.0-win-x64`        | 24.21.0 |
| Go         | `tools\go`                           | 1.27.1  |
| PostgreSQL | `tools\pgsql`                        | 16.9    |
| Data dir   | `tools\pgdata`                       |         |
| Playwright | `tools\e2e-runner\node_modules\playwright` | 1.63.0 |

Browsers for Playwright live in `%LOCALAPPDATA%\ms-playwright`
(chromium-1243, matching playwright 1.63.0).

Every shell needs the tools on PATH before running node/go/npx:

```bat
set "PATH=C:\Users\Jendela 10\Downloads\Projek IDEAVEN\ideaven-v7\tools\go\bin;C:\Users\Jendela 10\Downloads\Projek IDEAVEN\ideaven-v7\tools\node-v24.21.0-win-x64;%PATH%"
```

## No git on PATH (as of session 42)

`where git` fails on this machine. The working tree has uncommitted sessions
on top of `e91459a` — install git (or restore PATH) before committing. See
`IDEAVEN_PROGRESS_STATE.md` for the pending batch and a suggested message.

## Ports

`apps/api/.env` sets `API_ADDR=:8081` (leftover from the old machine where
8080 was taken by AgentService.exe). The E2E convention is **:8090**: the
E2E scripts hardcode `http://localhost:8090`, and a real environment
variable beats the `.env` file (config.Load), so:

- E2E: start the API with `API_ADDR=:8090` and the web dev server with
  `NEXT_PUBLIC_API_URL=http://localhost:8090`.
- Ordinary dev (no E2E): just `go run .\cmd\api` (:8081 per `.env`) and
  `pnpm dev` — `.env.local` already points at 8081.

## PostgreSQL

Dev cluster auth is `scram-sha-256`; app role per the default DSN:
`ideaven` / `ideaven` (CREATEDB — the API auto-creates the `ideaven`
database on first start).

```bat
:: start (if not running) — from ideaven-v7\tools
pgsql\bin\pg_ctl.exe -D pgdata -l pg.log -o "-p 5432 -c listen_addresses=127.0.0.1" start

:: stop
pgsql\bin\pg_ctl.exe -D pgdata stop
```

## Running

```bat
:: terminal 1 — API (E2E convention: :8090)
cd apps\api
go build -o "%USERPROFILE%\ideaven-api.exe" .\cmd\api
set "DATABASE_URL=postgres://ideaven:ideaven@127.0.0.1:5432/ideaven?sslmode=disable"
set "API_ADDR=:8090"
"%USERPROFILE%\ideaven-api.exe"

:: terminal 2 — web (http://localhost:3000)
cd apps\web
set "NEXT_PUBLIC_API_URL=http://localhost:8090"
npx next dev -p 3000
```

Email is handled by the dev log mailer: reset/verification links are printed
to the API console (search for `dev mailer`), no SMTP needed.

## E2E

Playwright 1.63.0 is installed in `ideaven-v7\tools\e2e-runner`. Run the
scripts from the repo root with a RELATIVE module path — ESM dynamic import
rejects `C:\` specifiers on Windows:

```bat
set "PLAYWRIGHT_MODULE=../../tools/e2e-runner/node_modules/playwright/index.js"
node scripts\e2e-sorting.mjs
node scripts\e2e-tilemap-paint.mjs
node scripts\e2e-camera.mjs
node scripts\e2e-scene-gameplay.mjs
```

Expect: sorting 19, tilemap-paint 29, camera 34, scene-gameplay 21 checks,
0 console errors — all green as of session 42.

## Gotchas

- Don't run `next build` while `next dev` is serving — both write `.next`;
  stop dev first and remove `.next` before building.
- The extension build worker needs `LocalAppData`/`AppData`/`UserProfile` in
  its environment on Windows (default GOCACHE discovery) — kept by
  `workerEnv` in `apps/api/internal/extension/build.go`. If extension build
  tests fail with "build cache is required", that whitelist regressed.
- Prefer PowerShell for scripted API tests (`set /p VAR=<file` in cmd fails
  silently in chained commands).
- Windows Go toolchain env names are mixed-case (`SystemRoot`, `ComSpec`,
  `LocalAppData`); match case-insensitively when filtering environments.
