IDEAVEN PROGRESS STATE — portable development handoff

> Regenerate/update this file at the END of every implementation session.
> The repository is the source of truth; this file only points at it.

CURRENT_DATE: 2026-10-04
CURRENT_COMMIT: see `git log -1` (TASK 67 commit, pushed to origin/main)
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
TASK 67 (QA + Security + Performance Hardening) is COMPLETE and verified
(session 66). Every security claim was traced to implementation + test.
Hardening applied: P1 zip-bomb budget on package import (per-entry 32MB +
64MB total + 512 entries — probed with a real bomb), P2 AI operation batch
cap (100), P2 rate limiters on extension build/SSE (10/min), exports
(10/min) and community votes/reports (30/min). Three new suites on shared
fixtures (scripts/fixtures-task67.mjs): security-hardening 59/59 (IDOR
across every resource, malformed/oversized/deep input, traversal
filenames, malicious/bomb packages, extension ownership, AI/credit
integrity, XSS inert, session lifecycle, rate limits, secret scans,
concurrency), performance 19/19 with MEASURED baselines
(scripts/artifacts-task66/perf-baseline.json — 2D 1000 entities and 3D
100 authored bodies render; 64-body physics bound documented), and
full-journey 27/27 (four complete real-UI journeys). Release readiness
matrix: docs/RELEASE_READINESS.json (13 dimensions PASS except
ACCESSIBILITY/I18N PARTIAL; no FAIL/BLOCKED; no open P0/P1). 33-suite
sweep: 30 PASS in-sweep (perf+journey green solo twice — contention
flakes; community = documented legacy drift). All gates green (tsc,
go vet, go test ./..., next build, build:vinext, verify-cf-preview 12/12).

FILES / MODULES TO CONTINUE FROM:
- apps/api/internal/project/package.go (zip budget constants +
  readZipFile(zf, budget) — keep the limits when touching imports)
- apps/api/internal/ai/operations.go (maxOperations = 100)
- apps/api/internal/server/server.go (buildLimiter/exportLimiter/
  voteLimiter wiring)
- scripts/fixtures-task67.mjs (shared fixtures — reuse, do not duplicate
  model JSON)
- scripts/e2e-task67-security-hardening.mjs (59 checks)
- scripts/e2e-task67-performance.mjs (baselines; perf-baseline.json)
- scripts/e2e-task67-full-journey.mjs (27 checks, four journeys)
- docs/TASK67_QA_SECURITY_PERFORMANCE.md (threat model + triage)
- docs/RELEASE_READINESS.json (THE readiness matrix — update with
  evidence when states change)
- docs/STATUS.md section 74

KNOWN HONEST LIMITS / QUEUED:
- ACCESSIBILITY/I18N release dimensions are PARTIAL (no automated a11y
  auditor; deep builder strings on the translation roadmap; nonce-CSP for
  the Next app planned — documented in next.config.ts).
- e2e-community.mjs legacy drift (STATUS §68) — needs a rewrite task.
- In-memory per-IP rate limits are per-instance (single-node deployment).
- 3D physics caps at 64 bodies (TASK 54 design bound, documented).
- Custom TypeScript code-only; extension providers not executed (TASK 64/66
  honesty, unchanged).

NEXT_TASK:
STOP - awaiting explicit approval per the TASK 67 directive. Queued:
TASK 68 onward.
