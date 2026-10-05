# TASK 67 — QA + Security + Performance Hardening

Status: **FUNCTIONAL / TESTED / HARDENED** (security 59/59, performance 19/19,
full-journey 27/27; full sweep + gates recorded in STATUS §74)
Session: 66 (2026-10-04).

---

## 1. Threat model (who can do what, and what we assume)

| Actor | Capabilities | Trust level |
| --- | --- | --- |
| Anonymous visitor | Public pages (`/p/<slug>`, explore, community reads), `/api/public/*` | Untrusted |
| Authenticated user (session cookie) | Own projects/assets/extensions/AI credits, community writes, remix | Untrusted input, trusted identity |
| Project owner | CRUD on own resources, publish/export/backup | Untrusted content |
| AI provider (server-side) | Produces structured changesets over user prompts | Untrusted OUTPUT (validated schema) |
| Package/manifest uploads | Model + assets into the platform | Untrusted bytes (bounded, sniffed) |

Assumptions: single-node API (in-memory rate limits are per-instance),
cookies are HttpOnly + SameSite=Lax (+ Secure in production), passwords are
Argon2id (PHC format), sessions are selector/verifier pairs stored hashed.

## 2. Security findings & hardening applied this task

| # | Finding | Severity | Fix |
| --- | --- | --- | --- |
| 1 | `readZipFile` decompressed without bounds — a ≤32MB upload could be a zip bomb (gigabytes of RAM) | **P1** | Per-entry 32MB cap via `LimitReader`, total 64MB package budget, 512-entry cap; declared zip sizes treated as untrusted |
| 2 | AI changesets accepted unbounded operation batches | P2 | `maxOperations = 100`; oversized batches rejected wholesale (never partially applied) |
| 3 | Extension build (spawns the worker process) and exports (CPU-bound rendering) had no rate limits | P2 | `buildLimiter` (10/min) on build + SSE build, `exportLimiter` (10/min) on HTML/Android/Windows exports |
| 4 | Community vote/report endpoints were unthrottled | P3 | `voteLimiter` (30/min) on votes + reports |

No P0 findings: every cross-user probe failed safely (see §3), no plaintext
password storage, no secret in any artifact or public page, no traversal
escape, no partial import on validation failure.

## 3. Authorization / IDOR verification (§6–§7, §25–§26)

Automated probes (user B against user A's resources) — all fail with 4xx and
leave A's data untouched:
projects (GET/PATCH/PUT model/DELETE/duplicate/publish/export/package),
assets (upload into B's project, list B's assets), extensions (delete,
install-state PATCH, usage view), AI (command against B's project charges
nothing — the ownership check precedes any provider call or ledger write).

Session-less requests to protected resources answer 401; forged session
values answer 401; logout invalidates server-side (the same cookie then
answers 401); expired sessions are rejected at Authenticate and purged by
the hourly cleanup. Unpublished projects' asset bytes are NOT publicly
readable; published projects' assets serve anonymously (public-page
support) with `public` cache headers while owner reads use `private`.

## 4. Input validation & model hardening (§8–§10)

- Project model PUT: strict typed JSON decode (unknown fields rejected by
  `DisallowUnknownFields`), 1MB body cap (`maxModelBody`), canonical
  `ValidateModel` (schema version, type vocabulary, screen/component ID
  uniqueness, start-screen existence). NaN/Infinity bodies are rejected by
  the decoder; deeply nested JSON rejected (Go's decoder depth); the same
  validator gates package imports and exports.
- Extension manifests: format-1 contract, duplicate block-type rejection,
  512KB cap (probed), kind vocabulary, worker-side validation.
- Malformed models cannot crash the builder/preview/published/export: the
  model can only enter through the validated PUT, and the runtimes were
  fault-isolated in TASK 66 (RuntimeBoundary + honest FAILED states).
- Serialization: no prototype-pollution sinks (no client-controlled
  `__proto__` merges); AI operation inputs are scalar-only; the export
  manifest is generated server-side from a closed struct.

## 5. Uploads & packages (§12–§13)

Uploads: multipart bounded (32MB), MIME sniffed + allowlisted (only real
image bytes serve), `X-Content-Type-Options: nosniff`, ETag/sha256 caching,
filenames sanitized (traversal probes: `../../`, `..\\`, absolute, drive
paths — stored names contain no separators or `..`), ownership rides the
project (an asset ID alone grants nothing). Packages: import is bounded and
validated BEFORE creation (broken model ⇒ nothing imported); no filesystem
extraction (zip entries are read into memory by ID-keyed map — zip-slip by
name is structurally impossible); decompression budget added this task.

## 6. AI security & credits (§15–§17)

Closed operation vocabulary; unknown/malformed ops reject the WHOLE
response; operation batch capped (100); provider output treated as untrusted
(fence-stripping, re-parse, validate). Authorization precedes provider
calls (unauthenticated 401, cross-user 4xx — nothing charged). Credits:
dedupe window (60s, sha256 of user+project+prompt+context) prevents
double-charge on retries/replays; the ledger records only complete draws
(failed validation charges nothing); concurrent commands leave a
consistent, non-negative ledger (probed ×5). `go test ./internal/ai` covers
the gate, dedupe, and ledger invariants.

## 7. SQL & API safety (§18)

All database access uses parameterized queries via pgx/database/sql — no
string-concatenated SQL anywhere in `apps/api` (verified by audit; the
community search paths use parameterized ILIKE). Rate limits (per IP,
fixed-window with sweeping buckets + `Retry-After`): login 10/min,
email flows 5/min, project create/import 20/min, uploads 30/min, community
writes 30/min, votes/reports 30/min, AI 10/min, extension builds 10/min,
exports 10/min. SecureHeaders on the API: `X-Content-Type-Options`,
`X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cache-Control:
no-store`, `CSP: default-src 'none'; frame-ancestors 'none'`. The Next app
sends nosniff/frame-DENY/referrer/permissions-policy; a nonce-CSP is
planned (documented in next.config.ts) — not blindly enabled.

## 8. XSS (§21)

Stored user text (project names, descriptions, components, community posts)
is rendered through React text nodes — never `dangerouslySetInnerHTML`.
The suite stores `<img onerror>` + `<script>` payloads in a project and a
community post and verifies nothing executes and the markup is escaped.

## 9. Performance baseline (§27–§34) — OBSERVED, dev machine

Recorded by `e2e-task67-performance.mjs` into
`scripts/artifacts-task66/perf-baseline.json`:

- Cold loads: landing ~2.1–3.4s, dashboard ~2.2–3.0s, builder (50 comps)
  ~2.8–4.6s, extensions dashboard ~2.0–3.1s.
- Preview cycle: start ~1.6s, stop→design ~0.8s, repeated ×3 ~4.1–4.2s.
- APP scaling (preview start): 10→2.6s, 50→2.8s, 100→2.9s, 250→3.2s.
- 2D scaling: 50→3.1s, 100→3.2s, 500→3.7s, **1000 entities → 3.9–4.6s**
  (all 1000 render to the stage).
- 3D scaling: 10→3.4s, 25→3.3s, 50→3.4s, 100 authored → 3.6s (**64 bodies
  simulated — the documented TASK 54 physics bound**).
- Extension/asset surfaces load in ~2.0–2.9s.

No optimization was performed without evidence; nothing in these numbers
warrants a renderer replacement. The 2D/3D curves are near-linear in
entity count with no cliff up to the tested bounds.

## 10. Memory & runtime safety (§35–§37, §65)

Runtime `dispose()` clears clock intervals and motion listeners; scene
stages cancel their rAF loops and listeners on unmount (keyed per run);
repeated preview stop/start does not accumulate canvases (asserted); the
shared RuntimeBoundary isolates runtime faults; TASK 66's parity suite
proves one active loop per surface for APP/2D/3D.

## 11. Concurrency & data loss (§40–§41)

Concurrent saves: both succeed, the stored model is one clean write (no
torn JSON). Concurrent publishes: both succeed, one public path. Concurrent
exports: all serve valid artifacts. Duplicate project creations: unique
IDs via the slug dedupe. Publish saves before snapshotting; export
validation prevents broken artifacts; the runtime never writes authored
state during preview.

## 12. Migration & backup/restore (§42–§43)

`schemaVersion` + `ValidateModel` + model migrations (covered by
`model_test.go`/`integration_test.go`); the export manifest records the
version it embeds. Package portability (export package → import as a NEW
project) re-validates the model, remaps `asset:` references to fresh asset
IDs through the sniffed insert path, and imports nothing on validation
failure.

## 13. Accessibility & i18n regression (§45–§46)

Keyboard paths, focus-visible outlines, aria-expanded/pressed/current on
tools/tabs/drawers/dialogs, and Escape/backdrop behaviors are asserted by
the task58/61/63/64 suites (all green in the sweep). i18n: EN/ID verified
on the public surfaces (task65 suite) and the i18n-audit passes; deep
builder strings remain on the documented translation roadmap.

## 14. Observability & logs (§47–§48)

Runtime observability is attribute-based (data-physics-bodies, data-camera-*
, data-player-*, data-preview-state, data-runtime-state,
data-extension-skipped) rather than console logs; the API logs request
errors via slog without credentials; the browser console stays clean
(suites assert zero unexpected console errors on every surface).

## 15. Triage (§50) & release readiness (§56)

- **P0: none.** **P1: 1 found → FIXED this task** (zip bomb budget).
- **P2: 3 found → FIXED this task** (AI batch cap; build/export limiters —
  plus the vote limiter at P3).
- **P3 (open, cosmetic/deferred):** e2e-community.mjs legacy drift
  (documented, flagged for a rewrite task); deep builder i18n; nonce-CSP
  for the Next app (planned); 3D physics 64-body bound (by design,
  documented in the capability matrix).
- Machine-readable release readiness: `docs/RELEASE_READINESS.json` —
  FUNCTIONALITY/SECURITY/PERFORMANCE/STABILITY/PREVIEW/PUBLISHED/EXPORT/AI/
  EXTENSIONS/APP/2D/3D = PASS; ACCESSIBILITY/I18N = PARTIAL (documented);
  no FAIL, no BLOCKED, no open P0/P1.

## 16. Suites added (reusing the existing Playwright infrastructure)

- `scripts/fixtures-task67.mjs` — shared fixtures (normal/empty app,
  populated 2D/3D, malformed, large, missing-asset) + API helpers.
- `scripts/e2e-task67-security-hardening.mjs` — 59 checks (§51's 36 areas).
- `scripts/e2e-task67-performance.mjs` — 19 checks + recorded baselines.
- `scripts/e2e-task67-full-journey.mjs` — 27 checks, four complete journeys
  through the real UI.
