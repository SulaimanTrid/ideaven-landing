# LAUNCH AUDIT — IDEAVEN

Living launch-hardening checklist. Created 2026-09-06 (session 22) because
the audit file referenced by the hardening directive did not exist — the
findings below come from a real sweep, not assumptions. Fix order is strict:
P0 → P1 → P2 → P3. Every issue: reproduce → root cause → smallest safe fix →
regression test → targeted tests → typecheck → build → update this file.

**Verification baseline (sweep of 2026-09-06):** 23 pages × console/pageerror/
HTTP≥400 sweep clean; API adversarial probes correct (404 shape, 400
malformed/CT, 413 oversize, login rate-limit 429 after 8 fails, weak-password
400, private-asset 404, unpublished public page 404, builder-missing-project
message); stored `<script>` project name renders as inert text (React
escaping; zero dialog executions); web 404 page works; full Go suite 8/8;
`tsc` clean; production build green.

## P0 — launch blockers

_No P0 issues found in the sweep._ (Verified: no crashes, no data-loss
paths, no executable injection, authorization enforced on probed endpoints.)

## P1 — major issues (current fix batch)

### P1-1. `/explore` horizontal overflow on mobile (449px) — REGRESSION

- **Status:** FIXED
- **Reproduce:** 390px viewport → `document.scrollWidth - clientWidth = 449`
  (screenshot `mobile-_explore.png`: type filter runs off-screen).
- **Root cause:** session-21 regression — the explore type filter row became
  a single non-wrapping `flex` strip when the universal 10-type vocabulary
  landed; 11 chips ≈ 990px exceed a 390px viewport.
- **Fix:** `flex-wrap` on the filter container (smallest change; keeps every
  type reachable without hidden scroll content).
- **Regression test:** committed `scripts/e2e-launch-audit.mjs` (mobile
  overflow assertion for `/`, `/dashboard`, `/explore` + page sweep) —
  passes with overflow 0 after the fix.

## P2 — polish (next batch, not started)

- P2-1. Rate limiters are in-memory per process — restarts reset counters
  and multi-instance deployments get independent counts (documented; fix =
  shared store, e.g. Postgres, when deploying beyond one process).
- P2-2. Project names accept markup-like strings (`<script>…` renders inert,
  but looks broken in cards). Consider rejecting/trimming angle brackets at
  validation. (Defense in depth only — no execution path exists.)

## P3 — backlog

- P3-1. `scripts/e2e-projects.ps1` is a stale Windows-era script; the live
  verification path is the committed `scripts/e2e-launch-audit.mjs`. Remove
  or port it.
- P3-2. Operational launch prerequisites outside the product code (from
  STATUS.md "Remaining"): real backups, CI, production serving story
  (`next dev` runs today), Android SDK for APK builds. Tracked, not hidden.

## Fixed log

| Issue | Fixed in | Verified by |
|---|---|---|
| P1-1 explore mobile overflow | session 22 | `scripts/e2e-launch-audit.mjs` (0px overflow), screenshot |
