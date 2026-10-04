# TASK 66 — Real Preview + Published + Export Parity + Runtime Integrity

Status: **FUNCTIONAL / TESTED** (dedicated E2E 66/66; full regression sweep +
gates recorded in STATUS §73)
Session: 66 (2026-10-04).

---

## 1. Runtime architecture (verified, not assumed)

There is ONE canonical project model and TWO runtime faces of it — both
audited line-by-line this session:

```
Canonical Project Model (schemaVersion'd, API-validated)
        ↓
Runtime interpreter over the block IR + scene data
        ├── apps/web  runtime.ts + scene-stage / viewport-3d  (React)
        │     → Editor canvases read the model directly
        │     → Preview mode (builder)
        │     → Published pages (/p/<slug> via LiveApp)
        └── apps/api  export.go "standalone-vanilla/2" (vanilla JS mirror)
              → single-file HTML export
              → Android WebView project zip (same HTML)
              → Windows Electron project zip (same HTML)
```

There is no second preview system, no second published system, and no
second export system: each target consumes the same model through one of
the two runtime faces, and TASK 66's suite now proves the two faces behave
identically. The block vocabulary is 1:1 between them (verified by
enumerating every `case` on both sides: 34 block/expression types each).

## 2. Root causes found and fixed (the actual parity defects)

1. **`animCommands` was never declared in the export runtime.** Any exported
   2D scene threw `animCommands is not defined` EVERY FRAME — the exported
   2D game loop was completely dead (no physics, no input, no camera). No
   earlier suite ran an exported 2D scene, so this shipped silently. Fixed:
   declared at module scope; the suite now proves exported 2D physics,
   collision, and camera against preview and published.
2. **`emitterSims` was function-scoped inside `buildScene` but read at
   module scope by `sceneTick`** — the same crash class (the original
   duplicate `var` masked it). Fixed: module-scoped next to
   `particleCommands`.
3. **The export camera followed AUTHORED props, not the live player.**
   `sceneRect(componentProps[target])` never moves, so exported 2D cameras
   froze at the spawn framing while the player walked away — divergent from
   the preview, which tracks live state. Fixed: the camera follow reads the
   live player position (and falls back to authored rects for non-player
   targets).
4. **Export interaction race:** `emit()` rebuilt the entire DOM
   synchronously. An input blur firing "change" during mousedown replaced
   the button before the click could fire — the interaction was silently
   dropped. Fixed: rerenders are deferred to the next task
   (`scheduleRerender`), preserving event semantics.
5. **`ext:` blocks were silently ignored in exports** (no switch case, no
   default) while the web runtime reports the skip honestly. Fixed: the
   export reports the skip once per type with the SAME message as the
   preview, records it on `#root[data-extension-skipped]`, and the export
   manifest lists the extensions.
6. **The export never dispatched screen "initialize" handlers**, while the
   preview does since TASK 64. Fixed: initialize handlers run once at
   startup (all screens, model order, screen-level only — identical
   dispatch semantics).
7. **Exports had no startup error handling** — a broken project rendered a
   blank page. Fixed: startup is wrapped; failures show
   "Runtime could not start — <reason>" and set
   `#root[data-runtime-error]`; a window error handler surfaces runtime
   faults through the toast.

## 3. Preview lifecycle and integrity (§5–§8, §36–§37, §43–§44)

- **PLAY/RESTART/STOP exist and are honest.** Preview auto-starts a run on
  entry; Restart re-seeds all runtime state from the model (asserted: the
  player returns to the authored spot, navigation returns to the start
  screen); Stop leaves play mode (the unmount effect disposes timers and
  sensor listeners; `createRuntime`'s dispose is verified).
- **State isolation:** runtime state (variables, component props, player
  physics, animation elapsed, particles, camera) lives in the runtime
  instance and is re-seeded per run. Nothing in a run writes to the
  canonical model — saves only ever persist authored state.
- **No duplicate loops/listeners:** `start()` disposes the previous runtime;
  scene stages are keyed per run; repeated Restart ×3 does not accumulate
  canvases (asserted structurally, §65).
- **NEW: honest run state** (`data-preview-state`): `RUNNING` while the
  runtime is live, `FAILED` when it cannot start — never a fake status.
- **NEW: ONE runtime error boundary** (`components/runtime/
  runtime-error-boundary.tsx`) wraps the preview surface AND the published
  app. A fault inside a runtime (scene loop, node, 3D frame) is caught at
  the boundary, shown honestly with a retry, reported into the runtime
  trace, and opens the Diagnostics drawer (which stays collapsed by
  default). The Builder shell survives any single project's runtime fault.

## 4. Published runtime (§33–§35, §57–§59)

- Direct URL, refresh, and navigation all run the snapshot through LiveApp
  (the same React runtime as Preview) — no builder session, no local state.
- `data-runtime-state="running|failed"` on the published stage; a runtime
  that cannot start shows the real reason inline.
- Publish = save → validate → snapshot; **republish serves the latest saved
  canonical state** (asserted by the suite: an ext block added after the
  first publish only appears after "Republish latest" — §58).
- The published date shown is the real publication timestamp (§59).

## 5. Export pipeline (§29–§32, §45–§48)

- **Validation (§30):** `validatedExportModel` runs the canonical
  `ValidateModel` before HTML/Android/Windows exports; a fatal validation
  failure returns 422 with the real reason and produces NO artifact. Since
  the model PUT runs the same validator, invalid state cannot enter the
  store at all (proven by the suite: a broken start screen is rejected at
  the boundary with 400).
- **Manifest (§31):** every artifact now embeds
  `<script type="application/json" id="ideaven-manifest">` — format,
  schemaVersion, projectType, runtime id, screen/asset counts, referenced
  extension slugs, and detected capabilities. Deterministic (no timestamps),
  no secrets, no paths, no editor state (§50).
- **Download integrity (§46):** the export dialog verifies the artifact
  BEFORE declaring success — HTML must start with a doctype, zips with the
  PK magic; a wrong body is a FAILED build and nothing is offered for
  download.
- **Statuses (§45):** the existing stage pipeline maps honestly:
  preparing/validating (validate) → preparing dependencies (assets) →
  compiling (compile, real byte progress, no invented percentages) →
  packaging (verify → ready) / failed. There is no cancel control, so no
  CANCELLED state is faked.
- **Capability UX (§48):** the dialog shows the per-target honest notes
  from THE capability matrix when a target starts.

## 6. Capability matrix (§47) — one machine-readable source

`apps/web/src/lib/capabilities.ts` is THE matrix: capabilities (app-ui,
scene-2d, scene-3d, blocks, custom-code, extensions, assets, audio) ×
targets (editor, preview, published, export-html, export-android,
export-windows) → SUPPORTED / PARTIAL / UNSUPPORTED with a mandatory note
on every non-SUPPORTED cell. Consumers: the export dialog's per-target
notes and this document's tables. There is no second capability list.

Key truths the matrix encodes:
- **Custom TypeScript is CODE-ONLY**: authored, parsed, and stored verbatim;
  it is NOT executed by preview, published, or export (the runtimes execute
  the block IR). Stated everywhere custom code can be chosen.
- **Extension providers do not run yet** on ANY runtime target: ext: blocks
  are skipped with an honest report (preview toast + trace; published
  toast; export toast + data attribute).
- **Stored assets in desktop/Android exports are PARTIAL**: the HTML export
  points `asset:` refs at the API origin it was downloaded from (portable
  in production — derived from the request Host, never hardcoded
  localhost); the Android/Windows shells intentionally ship with an empty
  asset base, so stored images render as the honest placeholder.

## 7. Parity evidence (§61–§62, §53)

The suite runs the SAME authored project in preview, on the published page,
and INSIDE the actual exported HTML artifact (opened from disk in a real
browser — the strongest possible launch evidence), comparing semantics
through runtime attributes and rendered geometry, not screenshots:

- APP: text/input rendering, input → state, button → navigate (3-way),
  restart semantics.
- 2D: input → movement delta, platform landing (grounded), camera follow
  tracking movement (3-way), refresh determinism (player re-spawns at the
  authored spot).
- 3D: gravity (cube falls from authored 2.5), collision (rests grounded on
  the static floor) in preview, published, and export; controller/trigger
  observability attributes present everywhere.
- Extensions: honest skip in preview/published/export + manifest listing.

## 8. Security (§64) and data serialization (§50)

Artifacts embed the model + manifest + vanilla runtime only. The suite
asserts no `ideaven_session`, no Authorization headers, no machine paths
(`C:\Users`, `127.0.0.1:8090`) in HTML and Android zips. The manifest and
runtime carry no editor UI state, selection, diagnostics, or cursor data.

## 9. Versioning & migration (§51–§52)

The canonical model carries `schemaVersion` (`ModelSchemaVersion = 1`);
stored models keep their version and migrations upgrade them (canonical
migration path in `model.go`). The export manifest records the
schemaVersion it embeds, and `ValidateModel` rejects unsupported versions
at the boundary — old fields are never silently reinterpreted. Migration
coverage lives in `model_test.go` / `integration_test.go`.

## 10. Performance & memory (§40–§41, §65)

No new loops were added; the deferred rerender removes redundant synchronous
rebuilds. Cleanup is structural: runtime `dispose()` clears clock intervals
and the devicemotion listener; scene stages own their rAF loops and cancel
them on unmount (keyed per run); repeated preview restarts are asserted not
to accumulate canvases.

## 11. Known limitations (honest)

- The export runtime is a deliberate vanilla mirror (single-file, no
  framework). TASK 66 made it provably equivalent for the supported
  vocabulary; future block additions must land on BOTH faces (the suite's
  case-enumeration approach in the audit documents the 1:1 baseline).
- Custom TypeScript remains unexecuted outside Code mode (stored verbatim;
  code sync round-trips it). The matrix says so at every surface.
- Extension providers remain a later phase (TASK 64 honesty, unchanged).
- The Android/Windows shells ship without stored assets by design (a phone
  cannot reach the authoring API); external URLs work.
- `emit()`-triggered rerenders are deferred by one task in the export; the
  observable state settles on the next tick (imperceptible, tested).
