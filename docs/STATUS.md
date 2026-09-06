# Ideaven Roadmap Status Report

**Date:** 2026-08-30
**Scope:** Full architecture and implementation audit of this repository against the
master development roadmap, plus the work completed across the implementation
sessions so far (project system → builder → blocks engine → runtime).

## 1. What this repository actually is

- pnpm monorepo: `apps/web` (Next.js 15 App Router, React 19, Tailwind v4),
  `apps/api` (Go, stdlib + pgx, PostgreSQL), `packages/ui`, `packages/config`.
- The bundled README (`Phase 1: landing page`) is stale. The code has progressed
  well beyond it: authentication, accounts/profile, the project system, and the
  Ideaven Builder with Design/Blocks/Code/Preview modes are all implemented.
- The master roadmap's `/home/parrot/Ideaven` path refers to the original dev
  machine; the canonical copy on this machine is
  `C:\Users\ACER\Desktop\Projek IDEAVEN\ideaven-landing-v1`.

## 2. Phase status (master roadmap numbering)

| # | Phase | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | Authentication | ✅ Complete | Register/login/logout/me, verify-email, forgot/reset password, hashed session tokens, rate limits, origin guard, integration tests |
| 2 | User Profile & Account | ✅ Complete | PATCH /api/profile, change password (revokes other sessions), settings pages (profile/security/account), avatar, bio |
| 3 | Project System / Dashboard | ✅ Complete (session 1) | projects table + full CRUD API, Projects page with search/sort/filter/archive/delete/duplicate, ownership enforcement |
| 4 | Project Creation Flow | ✅ Complete (session 1) | App/Game → method → details wizard; blank creation real; template/AI honestly marked "Coming soon" |
| 5 | Ideaven Project Model | ✅ Foundation (session 1) | Versioned schema v1 (screens/components/navigation/variables/assets) stored as canonical JSONB document; validation engine for the model |
| 6 | Builder / Workspace shell | ✅ Foundation (session 2) | Full-viewport builder at `/builder/[id]`: top bar (identity, Design/Blocks/Code modes, save status, undo/redo), screens panel, palette, device-framed zoomable canvas, layer tree, properties inspector |
| 7 | Visual UI Builder (Design mode) | ✅ Foundation (session 2) | 14 real component types (registry-driven), palette click-to-add + HTML5 drag-and-drop, nesting, reorder, duplicate, delete, per-component property/style editing — all mutating the canonical model |
| 7b | Block engine + editor | ✅ Foundation (session 3) | Structured block IR in the model (screen-level logic.handlers), Blocks mode with handler list / stack editor / palette / variables, per-component events, deterministic block→TypeScript codegen in Code mode, Design↔Blocks bridge in the inspector |
| 7c | Block execution + live preview | ✅ Foundation (session 4) | Direct IR interpreter (`lib/project-model/runtime.ts`): variables, component state, show-message toasts, screen navigation; interactive Preview mode with device frame, Restart-run, navigation simulation; if/else support end to end (model, editor, codegen, runtime) |
| 7d | Code → Model sync | ✅ Foundation (session 5) | Editable Code mode backed by the real TypeScript compiler frontend: parse diagnostics with line/column, full-subset conversion to blocks (bidirectional), custom-code storage (`screen.code`) for anything outside the subset, block→line source map from the generator |
| 7e | Real code editor + diagnostics | ✅ Foundation (session 6) | Monaco editor in Code mode (spec §27: no fake textarea) with in-editor parse-error markers; bottom Diagnostics panel (errors/warnings/info, "No errors 🎉" healthy state, click-to-source navigation into Blocks/Code); deterministic model diagnostics (dangling refs, missing navigate targets, unknown variables, empty screens) |
| 8 | Design System | ◐ Partial | Web tokens + @ideaven/ui primitives exist; project-level theme system for user projects pending |
| 9 | Block Programming Engine | ◐ Covered by 7b | Free-form wire canvas intentionally deferred; structured stack editing over the same IR ships first |
| 10 | Text Code Editor | ◐ Partial | Code mode shows generated TypeScript from the blocks; hand-editing + code→model sync is the next code milestone |
| 11 | Block ↔ Code | ◐ Partial | Model→Code generation is deterministic and live; reverse direction deferred and never faked |
| 12 | Live Preview | ✅ Foundation (session 4) | Real execution of the block IR with working interactions |
| 13 | Save / Autosave | ✅ Foundation | Editor autosave (1.5 s debounce) via PUT model; version history pending |
| 14–17 | Validation / Error detection / Runtime testing | ⬜ Missing | Model validation + save-path guards exist; diagnostics engine is next |
| 18–26 | AI system, routing, generation, credits | ◐ Foundation (session 7) | Provider-agnostic router (OpenAI/Anthropic wire formats, keys server-side only), structured context builder, Ask AI panel with validated closed-vocabulary changesets applied as one undoable commit, `ai_usage` accounting rows, mock-ai dev server, 8 handler tests |
| 27–29 | Free quota, credit packs, usage control | ◐ Foundation | Every AI request is recorded verifiably in `ai_usage`; quotas/packs/pricing not yet built |
| 30–31 | APK build system | ⬜ Missing | — |
| 32 | Templates | ⬜ Missing (honest placeholder) | — |
| 33–35 | Community, public pages, remix | ⬜ Missing (honest placeholders) | — |
| 36–37 | Versioning, undo/redo | ◐ Partial | In-session undo/redo done; persistent version history pending |
| 38–48 | Performance/security/observability/responsive/a11y/i18n/SEO/errors/DB integrity/assets/search | ◐ Baseline | Security posture (sessions, CORS, origin guard, rate limits, ownership) and a11y are strong; the rest grows with features |
| 49 | Professional empty state | ✅ Complete | Dashboard empty state kept and reused |
| 50 | Final quality pass | ◐ Ongoing | Every session's testing has found and fixed real bugs (see below) |

## 3. Work completed in session 1 (Phases 3-5: Project System, Creation, Model)

### Backend (apps/api)

- `migrations/005_projects.sql` — `projects` table: UUID id, owner FK with
  cascade, name, owner-scoped unique slug, description, type
  (app/game), status (draft/published/archived), visibility
  (private/unlisted/public), thumbnail, canonical `model` JSONB +
  `model_version`, timestamps, `last_opened_at`, recency indexes.
- `internal/project` — new domain package in the house style:
  - `model.go` — versioned Project Model v1 (`InitialModel`, `ValidateModel`:
    schema version, unique screen/component IDs incl. nesting, start screen
    existence).
  - `store.go` — owner-scoped queries only; list with search (ILIKE
    name/description), status filter, sort (updated/created/name/opened),
    pagination + total; partial metadata update; open touch; delete.
  - `service.go` — validation (name ≤80, description ≤280, enums), slug
    generation with collision retry, duplicate ("(Copy)" naming, fresh ID +
    slug, resets to private draft), not-found semantics that never leak
    existence (404 for foreign *and* malformed IDs via UUID shape check).
  - `handler.go` — session-derived identity only (no client-supplied owner),
    thin wire types; list responses omit the model document.
  - `integration_test.go` (handler-level tests against PostgreSQL) +
    `model_test.go` (pure unit tests).
- Routes: `POST/GET /api/projects`, `GET/PATCH/DELETE /api/projects/{id}`,
  `POST /api/projects/{id}/duplicate`, `POST /api/projects/{id}/open`; 20/min
  limiter on creation; `routeMethods` helper so multi-method paths share one
  RFC-correct 405 fallback.
- Shared `httpx.DecodeJSON` extracted from the auth package (bounded,
  content-type-strict JSON decoding for every current and future domain).

### Frontend (apps/web)

- `types/project.ts`, `projectApi` in `lib/api.ts` (incl. DELETE),
  `lib/use-projects.ts` (debounced search, stale-response guard,
  loading/error/reload), `lib/format.ts` (relative dates).
- `components/dashboard/project-card.tsx` — library card with status badge,
  type art, stretched-link open affordance, menu actions.
- `components/dashboard/modal.tsx` (accessible dialog) and `menu.tsx`
  (keyboard-safe dropdown) primitives.
- `/dashboard/projects` — full library page: search, status tabs (Active /
  Archived / All), sort, skeleton/error/empty states, rename dialog, delete
  confirm dialog, duplicate, archive/restore.
- `/dashboard/projects/new` — 3-step creation wizard; Template and AI options
  are visible but disabled ("Coming soon") — never faked.
- Project workspace + Home dashboard now list real recent projects and keep
  the original empty state with the block motif when none exist.

### Bugs found by testing and fixed (session 1)

1. **Route conflict panic** — registering `/api/projects` with two methods via
   the single-method `route()` helper duplicated the 405 fallback and panicked
   the mux at startup. Fixed with `routeMethods` (shared fallback, sorted
   Allow header).
2. **CORS blocked DELETE** — the preflight `Access-Control-Allow-Methods` list
   omitted DELETE, so every browser delete silently failed as a network error.
   Found by the GUI test, fixed in `middleware/cors.go` with a regression test.
3. **Garbage project IDs returned 500** — non-UUID IDs hit a Postgres cast
   error; now validated by shape and answered with 404.
4. **`Open` returned a stale row** — response was built before
   `last_opened_at` was written; now re-fetched after the touch.

## 4. Work completed in session 2 (Builder foundation + Design mode)

### Backend (apps/api)

- `PUT /api/projects/{id}/model` — the single write path for the canonical
  model from every editor surface. Validates the document against schema v1
  (unique screen/component IDs including nesting, start screen existence) and
  rejects type mismatches with the project. Body cap 1 MB; foreign projects
  answer 404; `updated_at` bumps on every save.
- Screen-level `styles` (e.g. background) added to the model schema as an
  optional v1 field (backward compatible).
- Integration tests: valid save + persistence round-trip, five invalid-model
  rejections, missing-model body, foreign-user 404.

### Frontend (apps/web)

- **Route**: the builder lives at `/builder/[id]` (own layout: `RequireAuth`
  without the marketing or dashboard chrome, `noindex`). "Open" from the
  library, Home cards, and creation flow all land there.
- **Model layer** (`src/lib/project-model/`):
  - `registry.tsx` — 14 real component types in three categories (Layout:
    Column/Row/Container/Card/Spacer/Divider; UI: Text/Button/Icon/Image;
    Input: Text Input/Password Input/Checkbox/Switch) with defaults and
    inspector schemas. Nothing is in the palette that cannot render.
  - `ops.ts` — pure immutable model operations (insert/move with
    descendant-cycle guard, duplicate with ID regeneration, update with
    undefined-clears semantics, screens add/rename/delete/set-start).
  - `use-history.ts` — snapshot undo/redo; each operation is one entry.
- **Builder UI** (`app/builder/[id]/builder/`): top bar (back, project name,
  type, honest mode switcher, undo/redo, save status: Saved / Saving… /
  Unsaved changes / Save failed with retry); screens panel (switch, add,
  inline rename, set start, delete except last); palette; device-framed
  canvas (Phone/Tablet/Desktop, fit + zoom); recursive canvas renderer; layer
  tree (select, expand/collapse, reorder, duplicate, delete, drag-to-canvas);
  properties inspector (per-type fields, screen background when nothing is
  selected).
- **Autosave**: dirty-model detection → 1.5 s debounce → PUT; beforeunload
  guard and flush-on-tab-hide; manual Save button; failed saves show an error
  state with retry (never silently lose work).
- Palette items double as click-to-add (targeted at the selected container or
  screen root) — an accessible alternative to dragging.

### Bugs found by testing and fixed (session 2)

1. **CORS preflight missing methods** — DELETE was missing first, then PUT,
   so browser deletes/saves failed as network errors. The list is now derived
   from a single `allowedMethods` source with a regression test.
2. **Builder was trapped inside the dashboard shell** — moved to a dedicated
   `/builder/[id]` layout so the editor owns the viewport.
3. Multi-method route registration panicked the mux (`routeMethods` fix);
   garbage IDs → 404.

## 5. Work completed in session 3 (Blocks engine — Builder 2.0 Milestone 3)

### Model (both sides)

- Screen-level `logic.handlers[]` added to the canonical model: each handler
  binds a component event (or a screen event) to a body of structured
  blocks. Blocks carry id/kind (statement|expression)/type, `inputs`
  (literals and references), `slots` (nested expressions), and `children`
  (nested statement bodies) — the tree structure is the connection graph.
- Server validation: unique handler IDs, named events, block trees with
  handler-scoped unique IDs, non-empty slot expressions. **Dangling
  component references are accepted by design** — deleting a component must
  not destroy the blocks that referenced it; diagnostics flag them instead.
- Vocabulary (all executable, all codegen-mapped): statements set-property,
  set-variable, show-message, navigate, if; expressions text, number,
  get-property, get-variable, join, equals.

### Builder

- **Blocks mode**: handler list per screen (create from any component's real
  events or screen events; missing-component handlers flagged in red), stack
  editor with per-statement move/delete, nested if-bodies with click-to-
  target insertion, expression slot chips (literal / get-property /
  get-variable / join / equals) with inline editors, project variables panel.
- **Code mode**: deterministic block→TypeScript generation
  (`lib/project-model/codegen.ts`) rendered as a generated view with an
  explicit "the model is the source of truth" banner. Hand-edited code is a
  later milestone; nothing pretends otherwise.
- **Design↔Blocks bridge**: the inspector lists the selected component's
  events with handler counts and jumps straight into Blocks mode.
- Top-bar mode switcher is fully live — all three modes operate on the same
  in-memory model through the same commit path, autosave, and undo/redo.

### Bugs found by testing and fixed (session 3)

1. **`findBlockIn` ignored expression slots** — edits to blocks nested in
   slots (e.g. a show-message's text) silently no-opped. Now walks children
   and slots.
2. **Label placeholder/key mismatch** — `navigate to {screen}` and
   `{component}.{property}` referenced non-existent input keys, so their
   editors never rendered. Fixed to `{screenId}` / `{componentId}`.
3. **Palette ignored the insert target** — "insert inside if" highlighted
   the target but palette adds still went to the body. Target lifted into
   builder context and honored by the palette.

## 6. Work completed in session 4 (Block runtime + live preview)

- **Block execution engine** (`lib/project-model/runtime.ts`) — a direct
  interpreter over the canonical block IR, not the generated code: one run
  holds fresh variable + component state seeded from the model; events are
  dispatched to handlers; set-property/get-property, set/get-variable,
  show-message (toast callback), navigate (screen change callback), and
  if/then/**else** execute for real.
- **if/else end to end**: `elseChildren` added to the block schema (Go +
  TS), validated server-side (duplicate IDs across branches rejected),
  editable in Blocks mode (dedicated else zone with click-to-target),
  emitted by codegen (`} else {`), and executed by the runtime.
- **Preview mode** (4th builder mode): device-framed (Phone/Tablet/Desktop)
  interactive rendering where buttons click, inputs type (text change and
  Enter events), checkboxes and switches toggle — each firing real events
  into the runtime. Toolbar: go-to-screen navigation simulation, screen
  badge, and Restart-run (fresh state). Edits in Design/Blocks restart the
  run so the preview always reflects the model.

### Bugs found by testing and fixed (session 4)

1. **Stale API binary** — the running api.exe predated the elseChildren
   schema, so its strict decoder rejected valid new-shape payloads as
   "not valid JSON". Caught by the E2E; the binary rebuild is now part of
   the exit gate.

## 7. Work completed in session 5 (Code → Model sync — bidirectional)

- **Editable Code mode**: the generated TypeScript is now an editing
  surface. "Sync to blocks" parses the buffer with the real TypeScript
  compiler frontend (`typescript` package — AST, never regex) via
  `lib/project-model/code-sync.ts`.
- **Three code states, per the spec**: VISUAL (whole screen matches the
  supported subset → the blocks are replaced in one undoable commit and the
  state badge returns to "Generated from blocks"), CODE-ONLY/MIXED (anything
  outside the subset is stored verbatim as `screen.code` in the canonical
  model — never destroyed, never approximated — with a "Custom code — visual
  representation unavailable" panel listing the offending line/column and
  snippet), and INVALID (parse errors surfaced with real diagnostics;
  nothing is committed).
- **Custom code safety**: generation never overwrites `screen.code`;
  removing it is an explicit user action that returns the screen to
  generated code. Blocks and custom code coexist safely (the blocks stay
  runnable in Preview while the custom code is authoritative for that
  screen's text).
- **Source map**: `screenToTypeScriptDetailed` now emits a block→line map
  alongside the code (the foundation for block↔code click navigation).
- **C#/C++**: documented adapter architecture only (see ARCHITECTURE.md) —
  no fake execution or parsing is claimed.

### Bugs found by testing and fixed (session 5)

1. **Codegen lost the function wrapper** — the source-map refactor dropped
   `export function register…(api: ScreenApi) {`, producing unparseable
   output that then poisoned a code→blocks sync. Caught by the GUI test's
   round-trip; the parse-then-verify flow also proved the safety rules
   worked (nothing was silently destroyed — the broken code was stored as
   custom until fixed).
2. **GUI project handler body was found empty** after an earlier session's
   damage; restored through the new code→blocks sync itself, which doubled
   as the end-to-end validation of the feature.

## 8. Work completed in session 6 (Real code editor + diagnostics — spec Phase 2)

- **Monaco in Code mode** (`@monaco-editor/react`, client-side): the fake
  textarea is gone — real syntax highlighting, line numbers, find/replace,
  and in-editor parse-error markers (red squiggles with line/column) via
  `monaco.editor.setModelMarkers` fed from the live parser.
- **Diagnostics panel** (bottom strip, collapsible, present in every mode):
  merges two sources —
  - deterministic **model diagnostics** (`lib/project-model/diagnostics.ts`):
    handlers referencing deleted components, navigate blocks targeting
    missing screens, set/get-variable on unknown variables, empty screens,
    empty handlers (info);
  - **code parse diagnostics** streamed from Code mode's debounced parser.
  Severity filters with live counts, the spec's "No errors 🎉" healthy
  state, and **click-to-source**: a model diagnostic jumps into Blocks mode
  with the owning handler/screen selected; a code diagnostic opens Code
  mode at the marker.
- This completes the spec's Phase 2 except the asset manager, which remains
  the next implementation item alongside the AI phase.

## 9. Verification performed (exit gates)

Session 1:

- `go vet ./...` clean; `go test ./...` green; `tsc --noEmit` clean;
  `next build` succeeds; live API E2E (`scripts/e2e-projects.ps1`); browser
  GUI walkthrough of the project system.

Session 2 (cumulative):

- `go vet ./...` clean; `go test ./...` green (project suite now includes the
  model-save path); `tsc --noEmit` clean; `next build` succeeds (29 routes,
  `/builder/[id]` included).
- E2E extended with the builder write path: valid model save (updated_at
  bumps), deep-structure persistence through GET (nested column > button),
  invalid schema/type rejections, foreign-user and anonymous 404/401.
- Browser GUI test of the builder: add components (click-to-add), nest a
  Checkbox in a Column, edit text via the inspector (canvas updates), style
  weight change, reorder (move up), duplicate, delete, per-screen isolation,
  set-start round trip, undo and redo, autosave to "Saved", hard reload —
  full model persists from the server.
- Not automatable here: native HTML5 drag in Chromium cannot be engaged by
  CDP mouse events, so the drag path itself was exercised only via
  click-to-add (same applyDrop pipeline). Verify drag manually in a real
  browser; the geometry/indicator code follows standard HTML5 DnD.

Session 3 (cumulative):

- `go vet ./...` clean; `go test ./...` green (block-logic validation suite
  added: handler IDs, events, block kinds, nested slot/children checks,
  dangling-reference acceptance); `tsc --noEmit` clean; `next build` succeeds.
- E2E extended to 24 checks: block-logic save with nested if/get-property/
  equals, screen-level handler and dangling component reference accepted,
  duplicate handler ID and unknown block kind rejected, deep persistence.
- Browser GUI test of Blocks mode: handler created from a real component
  event, statement blocks added and edited (message text, variable, number,
  navigate target), if-block with equals condition over a live component
  property, nested show-message inserted via click-to-target, Code mode
  generating the faithful TypeScript for the whole program, autosave to
  "Saved", hard reload — the complete block program persists and the
  inspector shows the handler count on the component.

Session 4 (cumulative):

- `go vet ./...` clean; `go test ./...` green (elseChildren validation suite:
  acceptance + duplicate-across-branches rejection); `tsc --noEmit` clean;
  `next build` succeeds.
- E2E extended to 27 checks: else-model save, else persistence through GET,
  duplicate block ID across branches rejected.
- Browser GUI test of Preview mode: run starts at the start screen; clicking
  the preview's Button executes the real handler — message toasts fired in
  order, the navigate block switched the preview to the Settings screen (the
  go-to select follows the runtime), Restart-run returned to Home with fresh
  state. The else branch of the interpreter is symmetric with the then
  branch (same code path) and is covered by the schema/codegen E2E; it is
  not exercised interactively because the test project's condition is static.

Session 5 (cumulative):

- `go vet ./...` clean; `go test ./...` green (screen.code acceptance);
  `tsc --noEmit` clean; `next build` succeeds (typescript added as a web
  dependency for the parser).
- E2E extended to 30 checks: custom screen code saved, persisted verbatim,
  and cleared.
- Browser GUI test of the bidirectional loop: the generated code was edited
  by hand (setVariable 10 → 25) and synced — the blocks updated (number
  block shows 25, server verified) with the "Synced." panel; an unsupported
  `while` loop triggered the custom-code path (stored verbatim, blocks
  untouched, honest conflict panel); removing the custom code returned the
  screen to generated code; Preview then executed the synced logic (click →
  toasts → navigation). The round trip also caught and contained a codegen
  regression via the safety rules.

Session 6 (cumulative):

- `tsc --noEmit` clean; `next build` succeeds (`@monaco-editor/react` added;
  the Monaco runtime loads client-side so the server bundle stays lean).
- Browser GUI test: Monaco renders in Code mode (textarea gone); typing
  `browser.alert("boom")` produced 6 real compiler diagnostics with
  line/column, red squiggles in the editor, and live rows in the Diagnostics
  panel; undo returned the panel to "No errors 🎉"; deleting a referenced
  variable surfaced the deterministic model error, and clicking it navigated
  into Blocks mode with the owning handler highlighted; undo restored the
  healthy state.

## 10. Work completed in session 7 (Ask AI — found in the working tree, verified on this machine)

Session 7's code was already present but undocumented when the project moved
to this Linux machine; this recovery session audited it file-by-file and
verified it end to end rather than rewriting it.

### Backend (apps/api)

- `internal/ai` — `POST /api/ai/command`: session auth, provider-agnostic
  router (`AI_PROVIDER=openai|anthropic`, `AI_API_KEY`, `AI_BASE_URL`,
  `AI_MODEL`; keys never leave the server; nil provider answers
  AI_NOT_CONFIGURED honestly), compact client-built context items, a system
  prompt with a closed operation vocabulary, and strict changeset parsing
  (markdown-fence tolerant, unknown ops rejected, 502 on provider failure).
  Every request is recorded in `ai_usage` (migration 006).
- `cmd/mock-ai` — development-only OpenAI-compatible stub so the full
  pipeline runs without a real key. Never for production.

### Frontend (apps/web)

- `lib/project-model/ai-apply.ts` — pure changeset application: ref chaining
  for AI-declared placements, prop/style routing by registry membership,
  skipped-operation reporting, and a final client-side model validation that
  rejects the whole changeset if the result is invalid.
- `lib/project-model/ai-validate.ts` — client mirror of the server's
  structural model validation.
- `builder/ask-ai-panel.tsx` — the assistant surface: structured context per
  screen (never the whole project), suggestions, proposed-changes preview,
  explicit apply/cancel, one undoable commit.

### Verification added by this session

- `go test ./internal/ai` (8 tests: unconfigured provider, session gate,
  validated ops, unknown-op rejection, fence tolerance, provider failure,
  usage row, provider loading).
- Live E2E on this machine with the mock provider: register → create project
  → save model → `POST /api/ai/command` returned the expected changeset;
  anonymous requests are 401.

## 11. Machine migration notes (previous Windows machine → this Linux machine)

- The copied `node_modules` was incomplete (pnpm's store layout did not
  survive the copy; `csstype` was missing, which masqueraded as dozens of
  React `CSSProperties` type errors, and the `.bin` shims were Windows
  `.ps1` files). Fixed with a clean `pnpm install --frozen-lockfile`.
- PostgreSQL is provided user-scoped (no root available):
  `~/.local/ideaven-pg` (PostgreSQL 16.4 portable binaries) listening on
  `127.0.0.1:5432`, user/db `ideaven` (trust auth). Restart with
  `~/.local/ideaven-pg/bin/pg_ctl -D ~/.local/ideaven-pg/data -l ~/.local/ideaven-pg/log.txt -o "-p 5432 -k $HOME/.local/ideaven-pg/run -c listen_addresses=127.0.0.1" start`.
- With the database up, all integration tests now actually run on this
  machine (52 had been silently skipping): auth, project, asset, and ai
  suites are green.
- `docs/LOCAL-DEV-WINDOWS.md` remains the previous machine's reference; the
  portable-toolchain pattern it documents is what the Linux setup above
  mirrors.

## 12. Work completed in session 8 (Asset manager — spec Phase 2 completion)

### Backend (apps/api)

- `migrations/007_assets.sql` — the `assets` table: UUID id, project FK with
  cascade, kind, name, sniffed mime, size, `BYTEA data`, created_at, and a
  per-project recency index. Binaries live here, never in the model document
  (the model holds only `{id, kind, name}` references, as schema v1 always
  reserved).
- `internal/asset` — new domain package in the house style:
  - `store.go` — owner-scoped queries only; every read joins `projects` and
    matches the session's owner, so an asset ID alone never grants access
    (missing row, foreign project, and malformed ID all collapse to
    ErrNotFound).
  - `service.go` — MIME detection from the bytes themselves
    (`http.DetectContentType` — the client's type is never trusted), PNG/
    JPEG/WebP/GIF only (SVG deliberately rejected: undetectable and a
    stored-XSS vector when served inline), 2 MiB per-file cap, 50 assets
    per project ceiling, name fallback/trim.
  - `handler.go` — `POST/GET /api/projects/{id}/assets` (multipart upload
    with bounded reading, list without bytes), `GET /api/assets/{id}/raw`
    (authenticated image source; sniffed Content-Type, nosniff, private
    immutable caching), `DELETE /api/assets/{id}`; 30/min upload limiter;
    project-authorizer passthrough so foreign projects answer the project
    service's own 404.
- Routes wired in `server.go`; `go vet` clean; 9 integration tests
  (upload/list/raw byte-exactness, owner scoping, unsupported type,
  oversize, missing file field, anonymous, non-multipart, delete + raw
  404 after, 50-asset ceiling) — all green.

### Frontend (apps/web)

- `lib/api.ts` — `assetApi` (list / multipart upload / remove) and
  `imageUrl()`: `"asset:<id>"` resolves to the API's authenticated raw
  endpoint (same-site cookies ride along); external URLs pass through.
- `builder/assets-panel.tsx` — the Assets panel (top-bar "Assets" toggle,
  available in every mode): multi-upload with per-file feedback, thumbnail
  list with size/type, "+ Image" inserts an image component bound to
  `asset:<id>` as one undoable commit, "Use in selected" rebinds the
  selected image component, delete removes server row + model reference.
- `renderer.tsx` / `preview-mode.tsx` — image components resolve
  `asset:` sources in Design and Preview alike.
- `diagnostics.ts` — a warning for images whose `asset:` reference is no
  longer in the model (deleting an asset never silently rewrites
  components; the panel/diagnostics surface it instead).

### Verification (session 8)

- `go vet ./...` clean; full `go test -count=1 ./...` green against live
  PostgreSQL (auth, project, asset, ai, middleware, database, handler).
- `tsc --noEmit` clean; `next build` succeeds.
- Live E2E: empty list → upload a generated 1×1 PNG → metadata correct
  (name from the file, mime sniffed image/png) → raw bytes byte-identical
  with correct headers → anonymous raw/list 401 → text upload 415 → model
  referencing `asset:<id>` saves (200) → delete 204 → raw 404 afterwards.

## 13. Work completed in session 9 (Version history — server-side snapshots)

The spec's AI-safety rule ("before applying AI changes, create a project
snapshot") needs snapshots the client cannot fake: in-session undo dies with
the tab. Model saves now snapshot server-side.

### Backend (apps/api)

- `migrations/008_project_versions.sql` — `project_versions`: UUID id,
  project FK with cascade, the model JSONB document, size, created_at, and
  a per-project recency index.
- `internal/project/versions.go` — Version store/service/handler in the
  house style: `UpdateModel` now records the new state after every changed
  save (failures are logged, never block the save), identical consecutive
  saves are deduped, and the per-project history is pruned to the newest
  20. Routes: `GET /api/projects/{id}/versions` (metadata only, newest
  first) and `GET /api/projects/{id}/versions/{versionId}` (full document).
  Ownership rides the project like assets; foreign projects, missing
  versions, and malformed IDs all answer 404.

### Frontend (apps/web)

- `lib/api.ts` — `versionApi.list/get`.
- `builder/history-panel.tsx` — the History slide-over (top-bar "History"
  button, available in every mode): timeline of snapshots with relative
  times and sizes; "Restore" confirms, then commits the stored model as one
  undoable step — the normal autosave persists it, and the restore becomes
  the newest snapshot. Nothing is overwritten in place.
- `builder/top-bar.tsx` / `builder.tsx` — History toggle alongside Assets
  and Ask AI.

### Bugs the tests caught (session 9)

1. **Dedupe never matched** — snapshots live in `jsonb`, which re-serializes
   with Postgres's own key order and whitespace, so byte-comparing the
   stored document against freshly marshaled JSON in Go always differed.
   The equality check now happens in Postgres (`model = $2::jsonb`).
2. **Malformed version IDs returned 500** — a raw Postgres cast error.
   Version IDs are now shape-checked and answered with 404, matching the
   project-ID discipline.

### Verification (session 9)

- `go vet` clean; full `go test -count=1 ./...` green (5 new version tests:
  save→list, restore content, owner scoping + anonymous, unknown IDs,
  20-version prune cap).
- `tsc --noEmit` clean; `next build` succeeds (28 routes).
- Live E2E: two saves → 2 versions; identical re-save → still 2; newest
  snapshot holds the latest content; garbage/missing version 404; anonymous
  401; foreign list 404.

## 14. Work completed in session 10 (AI credits + AI-labelled snapshots)

### AI credits (roadmap: usage & cost control / free quota)

- `internal/ai/credits.go` — an honest, **derived** balance: `GET /api/ai/credits`
  reports `{usedToday, dailyLimit, remaining, resetsAt}` computed from the
  `ai_usage` ledger itself (nothing stored, so it cannot drift from what
  actually happened). Only successful completions count — a provider outage
  must not drain a user's allowance, and ledger errors fail open on the
  guard while still being recorded. `DailyFreeCommands = 20`.
- `POST /api/ai/command` now enforces the allowance **before the provider is
  ever called**: exhausted sessions get `429 AI_CREDITS_EXHAUSTED` with the
  reset time. No top-ups/pricing yet — the ledger is the scaffold they will
  build on.
- Ask AI panel: a balance chip (`17/20 free`) in the header that refreshes
  after every command, turning red at zero.
- Tests: 5 new (fresh allowance, session gate, counting, exhaustion 429,
  failed calls don't drain); live E2E confirmed 20/20 → 19/20 after one
  command → 0/20 with 429 when seeded full.

### AI-labelled snapshots (AI safety / rollback)

- `migrations/009_version_origin.sql` — `project_versions.origin`
  (`edit` | `ai`, default `edit`).
- `PUT /api/projects/{id}/model` accepts an optional closed-vocabulary
  `origin` field; anything else is a 400 that saves nothing. The builder
  sets `pendingOriginRef` only when an AI changeset is applied (Ask AI is
  the only caller passing it — asset registration and restores label as
  normal edits), and the autosave consumes it exactly once.
- History panel: AI saves show "AI change applied" with a sparkle marker and
  a hint that the entry below is the pre-AI state — "undo AI change" now
  survives the server, the tab, and the session.
- Tests: origin labels end to end + unknown-origin rejection; live E2E
  confirmed edit→`edit`, ai→`ai`, bogus→400 with no snapshot.

### Verification (session 10)

- `go vet` clean; full `go test -count=1 ./...` green (13 ai tests, 27
  project tests).
- `tsc --noEmit` clean; `next build` succeeds (28 routes).

## 15. Work completed in session 11 (machine migration + credits surface + AI Auto-Fix)

### Environment (new Linux machine)

- The repo arrived from Windows with dead `node_modules` (junctions do not
  survive the copy) and no toolchains. Node v22.14.0 and Go 1.24.4 now live
  in `~/.local/opt` (no root on this machine); pnpm 11.22.0 via corepack;
  PATH exports appended to `~/.bashrc`. Dependencies reinstalled for Linux —
  the lockfile is unchanged.
- PostgreSQL is not installed here yet, so DB-backed Go tests skip (by
  design); pure unit tests and builds run.

### AI credits — account-settings surface (finishes session 10's milestone)

- `lib/api.ts` — `AICredits` extended to the full server shape
  (`freeRemaining`, `packBalance`); new `aiApi.creditActivity()` and the
  `AICreditActivityEntry` type.
- `components/settings/credit-history.tsx` — balance grid (used today /
  free remaining / pack balance / reset time) plus the merged ledger feed:
  grants as `+N` with expiry, usage days as pack draws or "within the free
  allowance", with honest loading/error/empty states.
- `settings/account` — the "AI credits" card below Account.

### AI Auto-Fix + Re-check (roadmap 17) and block-edit ops (roadmap 15)

- Closed vocabulary grew by two operations, server-validated and applied
  client-side: `deleteHandler` (screenId + handlerId) and `updateBlockInput`
  (screenId + handlerId + blockId + input key + scalar value) — the AI can
  now repair dangling navigate/set-property/set-variable references instead
  of only reporting them.
- `internal/ai/ai.go` Operation struct carries `handlerId`/`blockId`/
  `input`/`value`; `operations.go` validates them (scalars only);
  `prompt.go` documents both ops and the fix strategy rule (smallest safe
  change per diagnostic kind). 5 new pure validation tests
  (`operations_test.go`) run without a database.
- `lib/project-model/ai-apply.ts` — both ops applied via the existing
  `removeHandler`/`setBlockInput` helpers, with unknown-ID skip reporting;
  the duplicated `AIOperation` interface now re-exports the canonical type
  from `types/project.ts`.
- Ask AI panel — current diagnostics (model + code, capped at 20) ride
  along as a `diagnostics` context item on every command; the panel accepts
  a seeded prompt (run once, then released).
- Diagnostics panel — "Fix with AI" button seeds a fix request (errors +
  warnings, capped at 10) into the Ask AI pipeline: same preview → apply →
  one-step-undo path as any AI change.
- Re-check: after applying, the turn reports the recomputed diagnostic
  counts against the applied model ("Re-check: 0 errors, 1 warning remain.")

### Verification (session 11)

- `go vet` clean; `go build ./...` ok; `go test ./internal/ai/` green
  (DB-backed tests skip without PostgreSQL; the 5 new tests are pure).
- `tsc --noEmit` clean; `next build` succeeds (28 routes).

## 16. Work completed in session 12 (Publishing + Explore gallery; full suite green on this machine)

### Environment

- A portable PostgreSQL 16.4 (Zonky binaries, no root) now lives in
  `~/.local/opt/pg` with its cluster in `~/.local/opt/pgdata`; start it with
  `~/.local/opt/pg/bin/pg_ctl -D ~/.local/opt/pgdata -o "-p 5432" -l ~/.local/opt/pgdata.log start`.
  The whole DB-backed suite runs against it (trust auth matches the test
  DSNs).

### Legacy bugs the suite caught (session 12)

1. **AI ledger activity tests never ran** — `newTestHandler`'s test router
   never registered `/api/ai/credits/activity`, so both activity tests
   always answered 404. The route is registered; the tests now pass.
2. **Usage days ranked above same-day grants** — `recentActivity` pinned
   usage-day entries at 23:59, so the (future) end-of-day timestamp outranked
   a grant made earlier the same day. Usage buckets now pin to the day's
   start: an instant always ranks above its own day bucket.

### Publishing (roadmap 19)

- `migrations/011_publications.sql` — `publications` (project PK, model
  JSONB snapshot, published_at), a partial index on published slugs, and a
  unique index finally enforcing slug uniqueness (the slug generator's
  random suffix made collisions theoretical until now).
- `internal/project/publish.go` — `POST /api/projects/{id}/publish`
  snapshots the owner's current model and marks the project published +
  public (tx: insert-or-replace snapshot, then status flip; foreign/unknown
  IDs 404). `POST /api/projects/{id}/unpublish` deletes the snapshot and
  returns to draft (unpublishing a draft is a no-op success). Anonymous
  reads: `GET /api/public/projects/{slug}` serves the snapshot only for
  projects still `published` — editing after publish never changes the live
  page until a republish; `GET /api/public/projects` is the newest-first
  gallery feed (bounded `?limit=`).
- Web: `components/runtime/runtime-node.tsx` — the interactive runtime
  renderer extracted from Preview mode, now shared; `preview-mode.tsx`
  consumes it unchanged in behavior. `components/runtime/live-app.tsx` —
  the public execution surface (runtime + toast + restart, phone frame).
- `app/p/[slug]/page.tsx` — server-rendered public page from the snapshot
  (dynamic, 404 when not published), with metadata and the "Built with
  Ideaven" badge. `lib/api.ts` — anonymous `publicApi.project/list` plus
  authenticated `projectApi.publish/unpublish`.
- Builder: a Publish button in the top bar (popover: publish / open live
  page / republish latest / unpublish). Publishing saves first — the
  snapshot is what the user is looking at.
- `app/explore/page.tsx` — the placeholder is now the real gallery:
  server-rendered feed of published projects linking to their live pages,
  honest empty state with a build CTA.
- Known limitation (honest): image components bound to stored project
  assets (`asset:<id>`) don't render for anonymous visitors — the raw
  endpoint is session-guarded and stays that way. External image URLs
  render fine; making stored assets publicly readable for published
  projects is a deliberate follow-up.

### Verification (session 12)

- Full `go test -count=1 ./...` green against live PostgreSQL for the first
  time on this machine (auth, project incl. 6 new publish tests, asset, ai,
  middleware, database, handler).
- `go vet` clean; `tsc --noEmit` clean; `next build` succeeds — `/p/[slug]`
  and `/explore` are dynamic routes.
- Live E2E over real HTTP (running API): register → create → save model →
  publish (published + public + publicPath) → anonymous snapshot fetch →
  gallery listing → unknown slug 404 → unpublish (back to draft, public
  page 404 immediately) → cleanup delete 200.

## 17. Work completed in session 13 (milestone completion pass — every remaining page real)

### Backend (apps/api)

- `internal/project/templates.go` (roadmap 4/32) — three built-in templates
  as real, validated models: Sign-in Starter (two screens, navigate + join
  greeting), Product Landing (hero/cards/CTA layout), Quiz Starter (if/else
  answer check). `GET /api/templates` lists them; `POST /api/projects`
  accepts `template` and applies its model (type-checked).
- `internal/project/publish.go` (roadmap 20/28/33–35) — publications now
  carry the author (JOIN users). New anonymous routes: creator pages
  (`GET /api/public/creators/{username}`), platform stats
  (`GET /api/public/stats`, real row counts), and the remix loop
  (`POST /api/public/projects/{slug}/remix`, session required → fresh draft
  with attribution in the description).
- `internal/project/export.go` (roadmap 26/30–31) — `GET /api/projects/{id}/export/html`
  renders the model into one standalone HTML file with an embedded
  vanilla-JS interpreter of the block IR (render, events, variables,
  navigate, if/else, toasts; images resolve via the API base for published
  projects). `GET /api/projects/{id}/export/android` writes a complete
  Android WebView project (Kotlin activity, Gradle KTS files, manifest, the
  export as assets/index.html, README, and a GitHub Actions workflow that
  builds a debug APK without a local SDK).
- `internal/asset` — stored images of a **published** project are now
  publicly readable (join on `status = 'published'`); unpublishing cuts
  access off immediately. Private assets stay 401 to anonymous callers.

### Frontend (apps/web)

- Creation wizard: the template method is real (picker with real models;
  `CreateProjectRequest.template`); `dashboard/templates` is a working
  gallery — "Use this template" creates the project and opens the builder.
- `/community`: stats strip (creators/projects/publications), latest
  publications, and the remix-loop explainer. `/creators/[username]`: public
  creator page. `/p/[slug]`: author byline linking to the creator page plus
  a remix button (anonymous visitors route to login with `?next=`).
- `/explore`: client-side search + app/game filter over the live feed.
- `/pricing`: the real free tier (20 AI commands/day, ledger-derived) and
  credit packs described honestly as designed-but-not-yet-sold (payment
  integration pending). `/learn` + `/learn/[slug]`: six lessons matching the
  actual product. `/docs`: developer reference — model schema, block
  vocabulary, ScreenApi, HTTP API table, AI changeset rules.
- Builder: Export button (standalone HTML / Android project download),
  alongside Publish.
- Visual fixes found in the live pass: the public page rendered a duplicate
  header (custom header removed; badge moved into the byline), the public
  API omitted the author on snapshots (added), and text inside the white
  device frames inherited the page's light color in Preview/Public/Design —
  all three surfaces now default to dark ink inside the frame.

### Environment note (session 13, post-verification fix)

- Opening the site in a normal browser later hit a 500 on `/builder/...`
  (`Cannot find module './799.js'`): the production `next build` had been run
  into the same `.next` directory while the dev server was writing to it,
  corrupting the dev server's webpack chunks. Fixed by stopping dev, deleting
  `apps/web/.next`, and restarting. Rule: never run `next build` while
  `next dev` is serving from the same checkout — or verify with a temporary
  `distDir`/separate checkout instead.
- Local run on this machine (no root): PostgreSQL first
  (`~/.local/opt/pg/bin/pg_ctl -D ~/.local/opt/pgdata -o "-p 5432" -l ~/.local/opt/pgdata.log start`),
  then API (`DATABASE_URL=postgres://ideaven:ideaven@127.0.0.1:5432/ideaven?sslmode=disable API_ADDR=:8090 go run ./cmd/api` in apps/api),
  then web (`NEXT_PUBLIC_API_URL=http://localhost:8090 next dev` in apps/web).

### Verification (session 13)

- Full `go test -count=1 ./...` green (7/7 packages) against live PostgreSQL,
  including new tests: templates validity, remix, creator page, stats,
  exports (HTML content + zip layout + auth), public asset serving lifecycle.
- `tsc --noEmit` clean; `next build` succeeds (33 routes).
- Live two-server pass on this machine (API :8090, web :3000): seeded two
  creators + four published template projects, then visually verified via
  browser: landing, explore (search/filter/cards), community (stats),
  published app (author byline, remix button, runtime interaction — clicking
  "Get started" navigates to the sign-in screen), lesson page, pricing,
  creator page, docs, dashboard, template gallery, and the builder with
  Publish/Export and a clean Diagnostics panel.

### Session 13 follow-up (user-reported issues)

1. **500 on /builder in a normal browser** — production `next build` had been
   run while the dev server was serving the same `.next`, corrupting chunks.
   Fixed by stopping dev, deleting `.next`, restarting. Documented as a rule.
2. **Ask AI / Assets / History panels docked below Diagnostics on desktop**
   (`lg:static` made them squeezed flex items in the column layout). All
   three are now consistent full-height slide-overs (z-50) on every
   breakpoint — always above the Diagnostics bar.
3. **Projects page showed "0 projects" for creators with published work** —
   the "Active" tab sent `status=draft`, hiding published projects. New
   server filter value `active` (= draft + published); the UI's Active tab
   and default now use it.
4. **Test on your phone** — the Publish popover now shows a QR code of the
   live public page: scan to run the real app on a phone instantly (the
   honest, install-free companion for now).
5. **Narrow-screen builder** — the top bar scrolls horizontally instead of
   overflowing; Publish/Export popovers are width-capped.

### Session 14 — IDEAVEN 2.0 Phase A (theme system + extension data model)

- `IDEAVEN_2_ROADMAP.md` created: existing-systems map, reusable layers,
  gaps, dependency graph, phases A–H, testing requirements, risks, and the
  block-editor architecture audit (visual canvas decision: edit the same IR
  via a derived view-model; codegen/runtime/AI untouched).
- **Global theme system (2.0-I)**: semantic tokens (canvas/panel/card/line/
  ink/fog/mist + new surface/surface-strong/code) moved to runtime CSS vars
  with `@theme inline`; Light values defined; `color-scheme` follows. 29
  files of hardcoded `bg-white/[0.0x]` chrome utilities replaced with
  surface tokens. `ThemeProvider` (light/dark/system, persisted in
  localStorage, system listener) + anti-flash bootstrap script in the root
  layout; `ThemeToggle` in the site header (desktop + mobile menu); new
  Settings → Appearance page.
- **Extension data model (2.0-B)**: `migrations/012_extensions.sql`
  (extensions + immutable extension_versions, unique slugs); new
  `internal/extension` package — manifest contract v1 (components/methods/
  events/blocks/dependencies, server-side validation, unique ids, kind +
  semver checks), store/service/handlers, routes
  (`/api/extensions` CRUD + `/versions`), 3 integration tests
  (lifecycle, manifest validation, ownership). Web: `types/extension.ts`,
  `extensionApi` client, dashboard "Extensions" registry page (create/list/
  delete live over the API; Studio editors are Phase B and are labelled as
  such, not faked).
- Fixed en route: duplicate `route()` fallbacks on one path panic the mux —
  versions route uses one `routeMethods` call (the code's own documented
  rule).

### Verification (session 14)

- `go test -count=1 ./...` green (8/8 packages incl. the new extension
  suite) on live PostgreSQL with migration 012 applied.
- `tsc --noEmit` clean; `next build` green (dev server stopped first).
- Browser: theme toggle switches the whole site to Light and persists
  across reloads; extensions page creates "Remote Control" (slug +
  versioned manifest) live as maya.

## 18. Remaining (honest)

- Real APK binaries need an Android SDK or the included GitHub Actions
  workflow; the exported project is ready either way.
- Credit pack checkout needs a payment provider; the ledger behind it is
  done and the pricing page states this.
- Advanced 2D/3D, C#/C++ targets, and deeper community features (comments,
  follows) remain future work; nothing on the site pretends otherwise.


**Publishing hardening or Community (roadmap 20/33–35)**: public asset
serving for published projects, profile pages listing a creator's
publications, or the APK build foundation (roadmap 30) — the latter needs
an Android SDK decision on this machine first.

## 19. Work completed in session 16 (3.0 roadmap + M1 Project Intelligence)

IDEAVEN 3.0 ("The Creation OS") started: `IDEAVEN_3_ROADMAP.md` maps all
30 milestones with reusable/missing/dependency columns; M1 is delivered.

### M1 — Project Intelligence

- **Server** `apps/api/internal/project/intelligence.go`:
  `GET /api/projects/{id}/intelligence` (owner-only, 404/401 enforced) →
  derived-only report over the canonical model — counts (screens,
  components by type, handlers, blocks, variables, assets, asset bytes,
  handlers wired), navigation edges harvested from navigate blocks (each
  edge carries handlerId/blockId provenance), issues with
  severity (critical/attention/info) × dimension (build/architecture/
  performance/accessibility/security/dependency/runtime), and seven health
  roll-ups. Unknown set/get-variable names are flagged server-side with
  full provenance. The walk never mutates the model.
- **Web** builder "Insights" mode (top-bar switcher): counts strip, seven
  health cards (colored Healthy/Attention/Critical), screen flow (valid
  navigation edges, ends clickable), issue list with severity filter and
  click-through — handler-bearing issues jump to Blocks mode with the
  handler selected, others open Design on their screen. Types in
  `types/intelligence.ts`; client fetch via `projectApi.intelligence()`.
- **Fixed en route**: the top-bar mode switcher rendered insights as a
  second "Preview" button (label fall-through); ghost-navigation issues
  lost their handler/block provenance; unknown variables were counted for
  health but never reported as issues.

### Verification (session 16)

- `go test -count=1 ./...` green (8/8 packages, intelligence suite
  extended: edge provenance, variable issue, ≥3 criticals) on live
  PostgreSQL; `tsc --noEmit` clean; `next build` green (dev stopped first,
  dev restarted after).
- Browser (Playwright/Chromium, logged-in session): Insights renders counts
  + 7 health cards + screen flow + 5 issues on a seeded fixture project;
  clicking the ghost-navigation issue lands in Blocks mode on the offending
  handler with the deleted-target navigate and `ghostVar (deleted)` blocks
  visible; Diagnostics panel stays consistent (6 diagnostics).

### Environment notes (session 16)

- Login API takes `identifier` (email **or** username), not `email`.
- `PUT /api/projects/{id}/model` body is `{"model": …}` (origin optional:
  ""/edit/ai) and decoding is `DisallowUnknownFields` — block `kind` is
  required, unknown JSON fields reject with INVALID_REQUEST_BODY.
- This session has no in-app-browser tool; visual verification used
  Playwright + chromium-headless-shell in `/tmp/iv-pw` (cookie injection,
  1440px viewport, full-page screenshots). The ZCode Electron binary
  refuses `--headless` and quits under its single-instance lock — not a
  viable CDP host.
- API restart needs `DATABASE_URL=postgres://ideaven:ideaven@127.0.0.1:5432/ideaven?sslmode=disable API_ADDR=:8090`
  (defaults would bind :8080); sessions started with `setsid nohup env …`.

**Next up (3.0)**: M2 — AI Project Agent + Change Preview (multi-step plan,
universal diff, apply-selected), building on the Ask AI changeset pipeline.

## 20. Work in session 16b (4.0 kickoff — M0 Architecture Audit)

IDEAVEN 4.0 spec received (M0–M56). Supersedes the 3.0 milestone numbering
(same project, same rules). Delivered:

- `IDEAVEN_4_ARCHITECTURE_AUDIT.md` — stack, architecture, canonical model,
  completed/partial systems, tech debt, risks, sync model, AI integration,
  build/export, marketplace, i18n/a11y state.
- `IDEAVEN_4_ROADMAP.md` — M0–M56 mapped with status/base/dependencies;
  execution order; milestone rule (one at a time, STOP after each).
- Key mapping: 4.0's M1 (Core Project Intelligence) is **already delivered**
  (3.0 M1, session 16) — the roadmap records it as done instead of
  duplicating it. First new implementation target: **M2 Project Graph**.

### Verification (M0)

- Audit grounded in a live repo survey (routes/pages/migrations/packages
  counts, component inventory) — no behavior changed, nothing to rebuild.
- Suite stays green from the session-16 pass; no code touched in M0.

## 21. Work in session 17 (2.0 Phase 2 — True visual blocks / code blocks)

User directive: finish 2.0 Phase 2 (the Scratch-style "code blocks" phase),
then keep clearing unfinished milestones across roadmaps. Phase 2 delivered:

- **`blocks-canvas.tsx`** — a real block canvas over the same IR: hat block
  (the handler), statements with puzzle tabs, C-block arms (then/else) with
  snap strips always present between/inside statements, draggable reporter
  sockets (values move between sockets; palette reporters drop in), zoom
  (ctrl+wheel at cursor + toolbar 50–200%), pan (background drag + wheel),
  minimap with viewport rect and click-to-jump, block selection with
  keyboard shortcuts (Del deletes, ↑/↓ moves, Esc deselects, Ctrl+Z/Ctrl+Y
  undo/redo via the shared history), shortcut help popover.
- **Drag & drop done honestly**: HTML5 DnD with a typed payload
  (`blocks-editors.tsx`); moving a subtree composes remove+insert through
  the pure IR ops and commits as ONE undoable step; drops into a block's
  own subtree are rejected (cycle guard); same-array index adjustment keeps
  order stable. Palette items are drag sources AND click-to-append.
- **`block-registry.ts`** — installed extensions' manifest blocks join the
  vocabulary namespaced `ext:<slug>:<type>` (registered on Blocks-mode
  entry from `extensionApi.installed()`); palette groups them under the
  extension's name. Codegen/preview skip unknown types with a visible
  "unsupported block type" comment — no silent pretending.
- Removed the obsolete click-to-insert `insertTarget` mechanism (context,
  builder plumbing, palette) — drag/click covers it.
- Fixed en route: palette drags didn't reveal drop targets (drag kind is
  now detected on the canvas root via `dataTransfer.types`, immune to
  timing); hat text truncated under its delete button; strip timing made
  deterministic by rendering snap strips always.

### Verification (session 17)

- `tsc --noEmit` clean; `next build` green (dev stopped first, restarted
  after).
- Playwright/Chromium pass on the live two-server setup: statement drag
  from palette snaps into the stack (block count +1), reporter drags into a
  value socket (equals pill appears), zoom 100→120% via toolbar, minimap
  renders with viewport rect, palette search filters ("navig" → 1 button),
  ArrowDown reorders, Delete removes, Ctrl+Z restores — zero page errors.
- Fixture model restored after testing via the API (PUT model).

**Next**: continue clearing unfinished milestones in dependency order —
4.0 M2 Project Graph (also serves 3.0), then Health Center / AI Agent per
the 4.0 roadmap.

## 22. Also in session 17 (4.0 M2 Project Graph + M3 Project DNA)

Continuing the user directive to clear unfinished milestones, after Phase 2:

### M2 — Project Graph ✅

- `lib/project-model/graph.ts`: derived graph (screen/component/handler/
  block/variable/asset/extension nodes; contains/wires/navigates/writes/
  reads/uses-asset/provides edges) + `relationshipsOf()` inspector queries.
- Insights → **Project map** tab (`project-map.tsx`): Project tree +
  relationship inspector; rows jump into the builder (screen→Design,
  handler/block→Blocks).
- Browser-verified: variable → "WRITTEN BY" → jump to Blocks; image
  component → "USES ASSET" (incl. ghost asset); 0 console errors.

### M3 — Project DNA ✅

- Server `GET /api/projects/{id}/dna` (`internal/project/dna.go`,
  `TestProjectDNA`): purpose, architecture (counts/types/start/empty/
  navigation map), variables with real write/read counts, assets with
  orphan detection, events used, extension slugs from `ext:<slug>:<type>`
  blocks; health dimensions reuse the M1 intelligence pass (reports always
  agree).
- Web: Insights **DNA** tab (`types/dna.ts`, `projectApi.dna`, `DnaView`),
  fetched lazily; purpose card, counts, architecture, state usage, orphan
  assets, events, extensions, colored health chips.

### En route fixes / notes (session 17)

- `go run` children now live under `~/.cache/go-build/…-d/api` (no
  "exe/api" in the path) — restart scripts must kill by port/PID, not the
  old pattern; API restart needs the full env (DATABASE_URL + API_ADDR).
- Playwright text assertions must account for Tailwind `uppercase`
  (innerText reflects the transformed text).

### Verification (session 17, consolidated)

- `go test -count=1 ./...` green 8/8 (incl. new TestProjectDNA and the
  extended intelligence suite); `tsc --noEmit` clean; production
  `next build` green (dev stopped first, restarted after).
- Browser passes (Playwright/Chromium): blocks canvas (drag/snap, reporter
  sockets, zoom, minimap, search, shortcuts), Project map (tree +
  relationships + jump), DNA tab (all sections) — zero page errors.
- Both servers live: web :3000, API :8090.

**Next**: 4.0 M6 — AI Project Agent (inspect/plan/test/validate/review loop
over the existing Ask AI changeset pipeline), then M7 Change Preview.

## 23. Work in session 18 (5.0 kickoff — M0 audit + Phase 5A complete)

IDEAVEN 5.0 spec received (M0–M256, phases 5A–5O). Per its START rule,
M0 ran first, then Phase 5A was implemented because no blocker existed.

### M0 — Architecture audit (5.0)

- `IDEAVEN_5_ARCHITECTURE.md`: sources of truth table, what M1–M4 already
  have vs missing (honest deltas), architectural constraints
  (DisallowUnknownFields, mux rules, go-run child paths, credit metering),
  AI security boundaries, and the no-i18n limitation (M216 unsatisfiable
  until the localization layer exists).
- `IDEAVEN_5_ROADMAP.md`: phases 5A–5O mapped with reusable/missing work
  and the phase rule.

### Phase 5A — Architecture + Project Intelligence ✅

- **M5 Project Memory** (the real new work): migration `014_project_memory`;
  `internal/project/memory.go` — closed categories (9), 500-char limit,
  50-rule cap, owner-check on every path; routes GET/POST
  `/api/projects/{id}/memory`, DELETE `…/memory/{memoryId}`;
  **AI consumption**: the command handler loads the caller's rules via an
  ownership-enforced JOIN and `buildUserMessage` injects a "Project rules
  (must be respected)" section into every plan — server-side, so it holds
  regardless of client context.
- **M3 delta**: Project map search input + kind filter chips
  (component/handler/variable/asset/extension).
- Web: `types/memory.ts` (labels for the 9 categories), `projectApi`
  memory methods, Insights **Memory** tab (`memory-panel.tsx`) with
  Remember form, category chips, delete, spec-style empty state.
- Fixed en route: project Service now keeps its `*sql.DB` handle (memory
  queries are raw SQL like the extension domain); ApiError import comes
  from `types/auth`, not `lib/api`.

### Verification (session 18 / Phase 5A report)

- Tests: `go test -count=1 ./...` green 8/8 (new `TestProjectMemory`:
  lifecycle, closed categories, foreign 404 on list/add/delete, anonymous
  401, unknown-id 404). `tsc --noEmit` clean. Production `next build`
  green (dev stopped first, restarted after).
- Browser (Playwright/Chromium, live two-server): Memory tab shows a
  seed rule created over the API, UI add ("Never modify the auth screen.")
  and delete both land in PostgreSQL, zero console errors; map search
  "button" filters rows, asset kind filter isolates assets.
- Reused systems: project Service/Handler patterns, httpx envelope,
  migration runner, builder-context tab scaffolding, Insights tab shell.
- Known issues: none open. AI-rule injection is asserted at the code path
  level (ownership JOIN + message build); an end-to-end provider-level
  assertion awaits the mock-provider test extension in 5C.
- Files: `migrations/014_project_memory.sql`, `internal/project/memory.go`,
  `memory_test.go`, `service.go` (db field), `server.go` (routes),
  `integration_test.go` (harness), `internal/ai/ai.go` (+projectRules),
  `internal/ai/context.go` (rules section), web: `types/memory.ts`,
  `lib/api.ts`, `memory-panel.tsx`, `insights-mode.tsx`,
  `project-map.tsx`.

**Next phase**: 5B — Context Engine (M6 memory confirmation UX, M7
universal project context, M8 prioritization + budgets).

## 24. Work in session 19 (6.0 kickoff — M0 audit + Phase 6A first slice)

IDEAVEN 6.0 spec received (M0–M354, phases 6A–6O, "Global Creator + Cloud
Platform"). Per its START rule, M0 ran first; Phase 6A began (no critical
blocker) and its storage slice is delivered. Honest note carried in the
audit: **5.0 is only partially delivered (5A of 5A–5O)** — later 6.0 phases
assume the rest of 5.0 lands too.

### M0 — 6.0 gap audit

- `IDEAVEN_6_ARCHITECTURE.md`: per-area state table (the headline: asset
  binaries lived as BYTEA rows — no hashes, no filesystem, the exact
  coupling 6.0 M2/M5 forbid), reusable infrastructure, security-sensitive
  areas, identified migrations.
- `IDEAVEN_6_ROADMAP.md`: phases 6A–6O with base/new work and the phase
  rule (M343–M345: never mark cloud/deploy/billing complete on UI alone).
- `IDEAVEN_6_DECISIONS.md`: DEC-1 storage adapter with lazy DB→disk
  backfill (no big-bang migration); DEC-2 immutable caching + ETag; DEC-3
  image processing deferred honestly (no half-featured compression);
  DEC-4 sync engine waits for the 6B collaboration model; DEC-5 commerce
  stays locked until the full checklist.

### Phase 6A slice — Storage foundation (M4/M5/M6) ✅

- `internal/storage/storage.go`: `Adapter` interface + `LocalAdapter`
  (`.data/assets/<project_id>/<asset_id>`, ID-only paths with traversal
  guards, temp-file + rename atomic writes, 0600/0700 perms).
- Migration `015_asset_storage.sql`: `assets.sha256` column.
- Asset service: uploads compute sha256, mirror bytes to the adapter
  (best-effort — the DB row stays the record of truth); reads try the
  adapter first, fall back to DB bytes and lazily backfill (hash + file);
  delete removes row then file.
- Serving: strong `ETag: "<sha256>"`, `If-None-Match` → 304, public assets
  now `Cache-Control: public, max-age=31536000, immutable` (owner responses
  keep `private…immutable`; the audience split — private bytes never in
  shared caches — is preserved).
- `AssetWire` now exposes `sha256`.

### Verification (session 19 / Phase 6A interim report)

- Tests: `go test -count=1 ./...` green 8/8, including the new
  `TestAssetStorageAdapterAndETag` (hash on wire + adapter file bytes +
  ETag + 304 + lazy backfill after file removal + delete-cleans-file) —
  all pre-existing asset tests unchanged and green (backward compatible).
- Build: API compiles and runs live (`go vet ./...` clean; server restarted
  with migration 015 applied on boot). Web untouched this slice — the last
  verified production build stands.
- Live two-server pass: upload → file appears under
  `.data/assets/<project>/` with matching sha256; raw GET carries ETag;
  conditional revalidation returns 304; delete (204) removes both row and
  file (directory left empty).
- Reused systems: migration runner, asset ownership/authorization pattern,
  httpx envelope, extension `.data` storage precedent, config conventions.
- Security verification: paths derive only from DB IDs (traversal-guarded),
  MIME allowlist/magic-byte validation untouched, ownership checks
  unchanged, audience-scoped caching preserved, no existence leak on the
  public path.
- Known issues: none open for this slice. Remaining 6A work (M8, M9,
  M10–M12, M7 re-verify) is scoped in the roadmap with decisions 3/4.
- Files: `internal/storage/storage.go` (new), `migrations/015_asset_storage.sql`
  (new), `internal/asset/{service,store,handler,integration_test}.go`,
  `internal/server/server.go`, plus the three 6.0 documents.

**Next phase**: finish Phase 6A (avatars M9 via the asset pipeline, then
the sync engine M10–M12 per DEC-4), then 6B Collaboration + Organizations.

## 25. Work in session 20 (7.0 kickoff — M0 audit + Phase 7A slice 1)

IDEAVEN 7.0 spec received (M0–M429, phases 7A–7W, "The Universe"). Per its
START rule, M0 ran first; Phase 7A began (no blocker) with slice 1.

### M0 — 7.0 gap audit

- `IDEAVEN_7_ARCHITECTURE.md`: the honest baseline table (4.0 delivered
  M0–M3 + blocks canvas + AIX core; 5.0 M0+5A; 6.0 M0+6A storage slice),
  the mapping of existing systems onto the 7.0 core concepts, the
  duplicate-systems check (clean — everything derives from the one model),
  and the migrations/blockers for 7A.
- `IDEAVEN_7_ROADMAP.md`: phases 7A–7W with an explicit **dependency
  column** naming which 4/5/6 backlog each phase wraps (DEC-4: 7.x never
  re-implements the substrate).
- `IDEAVEN_7_DECISIONS.md`: DEC-1 Brain tab inside Insights (no competing
  page); DEC-2 intent is user-authored, separate from derived DNA; DEC-3
  universal project `type` waits for its own compatibility pass; DEC-4 the
  dependency-column rule; DEC-5 knowledge base extends graph.ts/
  intelligence.go, never forks them.

### Phase 7A slice 1 — Project Intent + Project Brain ✅

- Migration `016_project_intent` (one row per project, FK cascade).
- `internal/project/intent.go`: owner-scoped GET (absent row = empty
  intent) + PUT upsert with 500-char caps; `IntentLinesForAI`.
- AI planner now receives a "Project intent:" section (ownership-enforced
  JOIN) next to "Project rules" on every Ask AI plan.
- Insights gains a fifth tab **Brain** (`brain-panel.tsx`): the editable
  intent form (goal/audience/platforms/constraints/success) with saved
  feedback — user-authored purpose, never derived.
- Fixed en route: intent GET+PUT as two `route()` calls on one path
  triggered the documented mux duplicate-fallback panic — replaced with
  one `routeMethods` (the code's own standing rule, re-learned live).

### Verification (session 20 / Phase 7A interim report)

- Tests: `go test -count=1 ./...` green 8/8 (new `TestProjectIntent`:
  empty-on-fresh, full round-trip, upsert-replace semantics, foreign 404
  on get+set, anonymous 401). `tsc --noEmit` clean. Production
  `next build` green (dev stopped first, restarted).
- Browser (Playwright, live two-server): Brain tab opens, three fields
  filled and saved ("Saved — the AI will use this."), values persist after
  a full reload, zero console errors. API restarted clean with migration
  016 applied on boot.
- Security: intent reads/writes JOIN on `projects.owner_id`; length caps;
  upsert limited to the five text fields; no secret surface.
- Files: `migrations/016_project_intent.sql`, `internal/project/intent.go`
  + `intent_test.go`, `internal/server/server.go`, `internal/ai/{ai,context}.go`,
  web: `types/intent.ts`, `lib/api.ts`, `brain-panel.tsx`,
  `insights-mode.tsx`, plus the three 7.0 documents.
- Known issues: none open for this slice. Remaining 7A work is scoped in
  the roadmap (universal `type`, knowledge-base starter, DNA identity).

**Next**: Phase 7A remainder (universal project `type` migration, then the
knowledge-base starter), interleaved with the 5.0/6.0 backlog per the
dependency column.

## 26. Work in session 21 ("lanjutkan semua" — universal types + command center)

Continued the stacked backlog in dependency order: two verified slices.

### A — Universal project types (7.0 M7, closes part of 7A) ✅

- Migration `017_project_types`: the `projects.type` check constraint now
  carries the 10-type vocabulary (app, game, website, backend, api,
  database, experience, extension, tool, education).
- Server: one `typeVocabulary` map backs both create validation and
  `ValidateModel` (the second check was found by the new test — project
  creation passed but the initial model PUT still rejected non-app/game).
- Web: `ProjectType` union extended; `lib/project-meta.ts` adds
  `projectTypeLabel()` and replaces every binary `=== "game" ? "Game" :
  "App"` ternary across project cards, explore, public pages, creator
  pages, builder top-bar, and template gallery; creation flow gains
  "More kinds" chips under the two flagship cards plus an honest
  "no templates for this type yet" state; explore filters list all types.
- Tests: new `TestUniversalProjectTypes` (all 8 new types create+persist,
  invalid type 400); old tests that used "website" as their invalid-type
  fixture updated to "hologram".
- Browser E2E: guided flow chip "Website" → "NEW WEBSITE" chip → blank →
  named → created → project list shows `website | Portfolio Site`.

### B — Command Center, Ctrl+K (4.0 M5 palette half; 7.0 M44/M263) ✅

- `components/command-palette/command-palette.tsx` mounted in the
  dashboard layout and inside the builder session — one platform-chrome
  component, context-aware via pathname: navigation commands (projects,
  templates, extensions, explore, community, learn, docs, pricing,
  settings), lazy-loaded project search (Enter opens the builder),
  builder-only commands (mode switches via the real buttons, Assets,
  Ask AI), and theme toggle.
- Keyboard model: Ctrl+K toggle, ↑/↓ move, Enter runs, Esc closes,
  hover-syncs selection; grouped, filtered results with type hints.
- Browser E2E: open → search "star" → Enter lands in the project's
  builder; palette exposes builder commands there; "blocks" switches the
  mode (aria-current verified); theme toggles both ways through the
  palette and it reopens afterwards; Esc closes; explore shows new-type
  filters — zero console errors. (En route finding: assertions must wait
  for hydration before real-keyboard tests; a mid-test crash also taught
  the theme-toggle label flips with `resolved` — both test artifacts, the
  instrumented re-run proved close/run/reopen correct.)

### Verification (session 21, consolidated)

- `go test -count=1 ./...` green 8/8 (incl. the new universal-types
  suite); `tsc --noEmit` clean; production `next build` green (dev
  stopped first, restarted after); both servers live.
- Security: no new endpoints; type validation tightened to a closed list
  server-side (constraint + Go), so unknown types cannot be persisted.
- Files: `migrations/017_project_types.sql`, `internal/project/{model,service}.go`
  + tests, web `lib/project-meta.ts` (new), `types/project.ts`,
  `components/command-palette/command-palette.tsx` (new),
  `app/dashboard/layout.tsx`, builder.tsx, create-project-client.tsx,
  explore/page.tsx, project-card.tsx, template-gallery.tsx, top-bar.tsx,
  public/creator pages.

**Next (dependency order)**: knowledge-base starter + DNA identity fields
(7A remainder), then 5B context engine, then 6A remainder (avatars, sync).
