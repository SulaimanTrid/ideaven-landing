# Local development on this Windows machine

Environment-specific notes for running Ideaven locally. The repository
defaults (`apps/api/.env.example`, `apps/web/.env.example`) stay unchanged;
the machine-specific values live in the gitignored `.env` / `.env.local`
files.

## Toolchain (portable, user-scoped — no admin required)

| Tool       | Location                        | Version  |
| ---------- | ------------------------------- | -------- |
| Node.js    | `C:\Users\ACER\tools\node-v22.23.2-win-x64` | 22.23.2 |
| pnpm       | on the Node PATH (npm -g)       | 11.22.0  |
| Go         | `C:\Users\ACER\tools\go`        | 1.26.7   |
| PostgreSQL | `C:\Users\ACER\tools\pgsql`     | 17.4-1   |
| Data dir   | `C:\Users\ACER\tools\pgdata`    |          |

Every shell needs the tools on PATH before running pnpm/go:

```bat
set "PATH=C:\Users\ACER\tools\go\bin;C:\Users\ACER\tools\node-v22.23.2-win-x64;%PATH%"
```

## Port 8080 is taken on this machine

`AgentService.exe` (a local Windows service) listens on 8080, so the Ideaven
API runs on **8081** here:

- `apps/api/.env` → `API_ADDR=:8081`
- `apps/web/.env.local` → `NEXT_PUBLIC_API_URL=http://localhost:8081`

## PostgreSQL

The dev cluster uses `scram-sha-256` auth. Superuser `postgres` / local dev
password, app role per the default DSN: `ideaven` / `ideaven` (CREATEDB — the
API auto-creates the `ideaven` database on first start).

```bat
:: start (if not running)
C:\Users\ACER\tools\pgsql\bin\pg_ctl.exe -D C:\Users\ACER\tools\pgdata -l C:\Users\ACER\tools\pgdata\server.log start

:: stop
C:\Users\ACER\tools\pgsql\bin\pg_ctl.exe -D C:\Users\ACER\tools\pgdata stop
```

## Running

```bat
:: terminal 1 — API (http://localhost:8081)
cd apps\api && go run .\cmd\api

:: terminal 2 — web (http://localhost:3000)
cd apps\web && pnpm dev
```

Email is handled by the dev log mailer: reset/verification links are printed
to the API console (search for `dev mailer`), no SMTP needed.

## Gotchas

- Don't run `pnpm build` while `pnpm dev` is serving — both write `.next`;
  the dev server starts serving "Internal Server Error". Stop dev first.
- `set /p VAR=<file` in cmd strips nothing and fails silently in chained
  commands; prefer PowerShell for scripted API tests.
