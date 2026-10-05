IDEAVEN PROGRESS STATE — portable development handoff

> Regenerate/update this file at the END of every implementation session.
> The repository is the source of truth; this file only points at it.

CURRENT_DATE: 2026-10-04
CURRENT_COMMIT: see `git log -1` (TASK 68 queue-completion commit, pushed to origin/main)
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
  flakes timing-sensitive suites; observed repeatedly).

CURRENT_OBJECTIVE:
TASK 68 queue (approved queue completion, session 66c) is COMPLETE: the
previously PARTIAL release-readiness dimensions are now PASS. Community
suite rewritten against the current page (30/30 — the STATUS §68 drift is
cleared); accessibility auditor shipped (e2e-task68-accessibility 16/16,
14/14 surfaces structurally clean; fixed the real finding — builder had
no h1, added an sr-only page heading); i18n completed on the remaining
surfaces (extensions dashboard fully keyed ~40 ext.* keys EN+ID; dash.*
cards wired); a REAL CSP ships on every web route, verified by
e2e-task68-csp 6/6 with zero violations across all critical surfaces
including Monaco CDN Code mode (the verification caught and fixed two
real violations pre-ship). RELEASE_READINESS.json: every dimension PASS,
p0/p1 blockers empty. All suites green with CSP live (community, a11y,
CSP, task64 34/34, task65 49/49, task67-security 59/59) and all gates
green (tsc, next build, build:vinext, verify-cf-preview 12/12).

FILES / MODULES TO CONTINUE FROM:
- apps/api/internal/project/package.go (zip budget constants +
  readZipFile(zf, budget) — keep the limits when touching imports)
- apps/api/internal/ai/operations.go (maxOperations = 100)
- apps/api/internal/server/server.go (buildLimiter/exportLimiter/
  voteLimiter wiring)
- apps/web/next.config.ts (THE CSP — keep allowances documented; a
  nonce-based script policy is the next step)
- scripts/e2e-task68-accessibility.mjs (16 checks — a11y gate; add new
  surfaces to SURFACES + builder modes when built)
- scripts/e2e-task68-csp.mjs (6 checks — CSP gate; every new CDN/origin
  allowance must appear here as a zero-violation proof)
- scripts/e2e-community.mjs (30 checks — rewritten against the CURRENT
  page; search label + global-feed-aware assertions)
- scripts/fixtures-task67.mjs (shared fixtures — reuse, do not duplicate)
- docs/TASK68_QUEUE_COMPLETION.md (what the queue did + what stays out)
- docs/RELEASE_READINESS.json (THE readiness matrix — all PASS now;
  update with evidence when states change)
- docs/STATUS.md section 75

KNOWN HONEST LIMITS / QUEUED:
- Extension runtime providers, custom TypeScript execution in runtimes,
  AI-generated starting projects, and the prefab ecosystem remain OUT —
  each needs its own directive with designed semantics (documented in
  docs/TASK68_QUEUE_COMPLETION.md); the capability matrix states them
  truthfully.
- CSP script-src still allows 'unsafe-inline'/'unsafe-eval' (Next inline
  bootstrap + dev tooling); nonce-based policy is the next step.
- The uninstall dialog's aria-label stays the literal "Confirm
  uninstall" (asserted by task64); translating it is a follow-up.
- In-memory per-IP rate limits are per-instance (single-node deployment).
- 3D physics caps at 64 bodies (TASK 54 design bound, documented).

NEXT_TASK:
Queue complete — awaiting the next directive from the owner.
