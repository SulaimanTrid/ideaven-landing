# TASK 64 — Real Extension Engine + Runtime Providers + Palette Integration

Status: **FUNCTIONAL / TESTED** (dedicated E2E 34/34; full regression sweep +
gates recorded in STATUS §71)
Session: 64 (2026-10-04).

---

## 1. What TASK 64 adds (and what it does NOT add)

The extension engine is now real end to end: an imported manifest is
validated, registered, built into a .AIX by the isolated extbuild worker,
published, installed, and its blocks appear in the Blocks palette under the
extension's own name — inserted through the real palette, saved as
namespaced references in the canonical model, honestly skipped (and
reported) by the runtime while disabled, reversible via Enable/Disable, and
uninstallable with a server-counted usage safety check.

There is still exactly ONE extension engine, ONE registry, ONE block
registry, ONE project model, ONE preview runtime. TASK 64 extended the
existing architecture (Go extension store + RegistrySnapshot + block-registry
+ `ideaven:extensions-changed`); it added no second engine, no second
runtime, and no bundled extension code into projects.

## 2. Install state is real (Go + migration)

- **Migration 057** (`057_extension_install_enabled.sql`):
  `extension_installs.enabled BOOLEAN NOT NULL DEFAULT true`. Enable/Disable
  is a durable per-user DB state, not client UI sugar.
- `Store.Installed` returns `[]InstalledExtension` (extension + enabled).
- `Store.SetInstallEnabled` — the UPDATE is owner-scoped; 0 rows →
  ErrNotFound (you cannot flip someone else's install).
- `Store.InstallUsage(ownerID, slug)` — counts THIS owner's projects whose
  model references `ext:<slug>:` (the same namespaced types Blocks mode
  saves). The uninstall dialog shows this real number; it is never guessed
  client-side.
- `Service.Create` now dedupes slugs: slugs are GLOBALLY unique, so a
  duplicate NAME used to hit the unique index as a 500. `Store.uniqueSlug`
  probes base-2..50 and the create flow returns 201 with `weather-beacon-ext-2`
  etc. (the E2E derives the real slug from the API — it never assumes).

## 3. Honest wire contract (root-cause fix #1)

`GET /api/me/extensions` originally wrapped each row as
`{"extension": …, "enabled": …}` while BOTH clients (palette registration,
dashboard) read a flat `Extension[]` with `enabled` on the row — fields were
`undefined`, so palette registration silently no-oped. The handler now wires
`installedWire{ ExtensionWire; Enabled }` (embedded fields flatten in
encoding/json), matching the client contract. A silent no-op became
impossible by construction.

Routes: `PATCH /api/extensions/{id}/install` (`{enabled}`) and
`GET /api/extensions/{id}/usage` (`{projects}`). Web `api.ts` gained
`setInstallEnabled` and `usage`; `Extension.enabled?: boolean` documents the
installed-state flag.

## 4. Palette integration — ONE registration owner (root-cause fix #2)

`BlocksWorkspace` owns extension registration (it was split between a
mounting effect and a memo key that never bumped, so the palette computed
its vocabulary BEFORE the async install list resolved):

- Fetch installed → for each: `enabled === false` → `forgetExtensionBlocks`
  (stale vocabulary never lingers) → else `registerExtensionBlocks(slug,
  name, manifest.blocks)` → bump ONE `extensionsTick`.
- The tick re-keys the Blocks canvas AND is the memo key for the palette's
  vocabulary (`allStatementDefs` / `allExpressionDefs` / byExtension groups).
- The dashboard dispatches `ideaven:extensions-changed` on every install /
  enable / disable / uninstall; a live builder updates without reload.

Extension blocks are namespaced `ext:<slug>:<type>` — they can never collide
with built-ins or each other. They render in the palette under the
extension's own name with the same real icon system as built-ins (category
fallback SVG, never a blank square) and are searchable through the palette's
existing search (I1) — no second index.

## 5. Live blocks run through the real flow (C-sequence)

A real user flow is asserted: add a handler in the left rail (the palette
correctly keeps statements disabled — "Select a handler first" — until a
handler is selected), then click the extension block; the namespaced type is
committed into the canonical model, survives save + reload, and the model
stays the single source of truth. Projects store the REFERENCE (namespaced
type), never the package.

## 6. Runtime honesty — skip, trace, and the Initialize fix (root-cause fix #3)

- `executeBlock` intercepts `ext:` types: no fake execution, no invented
  behavior. The skip is reported ONCE per run per type — as a toast AND a
  persistent line in the Runtime trace panel (`"ext:…" skipped — extension
  disabled or not installed`).
- **Real product bug found by the suite**: the Blocks left rail offers a
  Screen "Initialize" event, but `createRuntime` NEVER dispatched it — the
  vocabulary was dead. The runtime now dispatches
  `dispatch(null, "initialize")` once when a run starts (traced like every
  dispatch; the skip set is initialized before this first dispatch so
  first-run extension skips cannot hit a TDZ). "When Screen Initialize" is
  now real for every project, not just extensions.

## 7. Diagnostics + export truthfulness

- Model diagnostics (collapsed by default, TASK 60 behavior unchanged) list
  every `ext:` block with an INFO: *"runs only while its extension is
  installed and enabled — the preview reports a skip when it can't run."*
- Export validation ALWAYS flags `ext:` types: *"N unsupported block type(s)
  will be skipped by the generated runtime: ext:…"*. Exports never bundle
  extension providers; previously an ENABLED extension silenced the warning
  even though the generated runtime still skips the block (root-cause fix
  #4). The exported runtime skips the ext block exactly like the live
  preview — the saved reference stays untouched.
- Code generation keeps its honest `// unsupported block type "ext:…" —
  skipped by the generator` comment; it does not invent code.

## 8. Enable / Disable / Uninstall — the lifecycle (D/E/U sequences)

- **Disable** (dashboard toggle → PATCH): the card flips to a real DISABLED
  state chip; the Blocks palette drops the extension's blocks on the next
  visit (forget, not hide); the preview honestly reports the skip; the
  project's saved references are untouched (D5).
- **Re-enable** restores palette + behavior (E-sequence).
- **Uninstall**: the confirm dialog shows the REAL server-counted usage
  ("used by N of your projects"); cancel keeps everything (F2); confirming
  removes the install + palette vocabulary while project data keeps its
  saved references (honestly unavailable until reinstall) (U1–U3).

## 9. Isolation, permissions, multi-tenancy

- Draft/unpublished extensions of user B never appear in user A's shelves
  (H1 uses a real second session).
- Install/uninstall/enable endpoints are owner-scoped (session user); usage
  counts are scoped to the requesting owner.
- The manifest contract is validated client-side BEFORE anything is created
  (duplicate block types, unsupported format, nothing-to-import all rejected
  with reasons — G1–G3) and server-side again (format 1, unique ids, known
  kinds, 512 KB cap). Nothing is registered on validation failure.
- The extbuild worker stays an isolated process (NDJSON pipeline events);
  a failed build stops the pipeline and surfaces the real error, registering
  nothing.

## 10. AI awareness without invention

The AI reads the same canonical model JSON everyone else does: an `ext:`
type it cannot resolve appears as an unknown block. There is no extension
API surface for the AI to invent providers from — Ask AI may see the
reference, never fabricate behavior. (Documented design; no new AI surface
added in TASK 64.)

## 11. Honest scope notes

- Extension components/methods/events remain declared-but-unavailable at
  runtime: the import dialog already warns about this; the runtime skip, the
  diagnostics INFO, and the export warning say it again at every surface
  where it matters. No provider pretends otherwise.
- Manifest dependencies stay informational (validated, stored, surfaced —
  not resolved against a package ecosystem).
- The extensions dashboard, registry snapshot dependency resolution, and
  worker isolation are unchanged architecture from earlier tasks; TASK 64
  verified them through the new checks rather than rebuilding them.

## 12. Verification

- **New E2E** `scripts/e2e-task64-extension-engine.mjs` — 34/34, 0 console
  errors: A1–A4 real import dialog pipeline (file → validate → inspection →
  register → build → publish → install), B1–B2 palette integration + real
  icon, C1–C2 real handler + insert + persistence, D1–D5 disable flow +
  runtime honesty, E1–E2 re-enable, F1–F2 uninstall usage safety, G1–G3
  validation rejections, H1 cross-user isolation, I1 palette search, J1 ×5
  responsive (390→1440), K1–K2 published/Explore truth, L1 diagnostics
  honesty, M1 export honesty, U1–U3 real uninstall completing the lifecycle.
- **Regression sweep** (§47): 26 suites — results in STATUS §71 (task62
  failed once under sweep-time API contention from the parallel Go test run
  and passes 61/61 solo; re-verified).
- **Go**: `go vet` clean; `go test -count=1 ./...` all ok — including
  `internal/ai` (AI regression) and `internal/credits` (ledger + dedupe).
- **Web**: `tsc --noEmit` clean; `next build` + `build:vinext` + CF preview
  verification recorded in STATUS §71.
