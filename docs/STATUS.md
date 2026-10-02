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

## 27. Work in session 22 (LAUNCH HARDENING — audit + P1 batch)

Directive: harden for launch, fix P0→P1→P2→P3 with per-issue process. The
referenced `LAUNCH_AUDIT.md` did not exist, so it was created from a real
sweep first (23-page browser sweep incl. console/pageerror/HTTP≥400,
adversarial API probes, mobile-viewport overflow checks, XSS render check,
404 flows), then the current priority batch was executed.

### Audit results (recorded in LAUNCH_AUDIT.md)

- **P0: none found.** No crashes, data-loss paths, executable injection
  (stored `<script>` name renders inert via React escaping — fixture
  deleted after verification), auth bypasses, or broken 404/error flows.
  API probes all correct: 404 envelope, 400 malformed JSON / wrong
  content-type / weak password, 413 oversize, login 429 after 8 fails,
  private-asset + unpublished-public 404s, missing-project builder message.
- **P1-1 (fixed): `/explore` horizontal overflow 449px on 390px viewports**
  — session-21 regression: the universal 10-type filter strip did not
  wrap. Smallest fix: `flex-wrap` on the filter container.
- P2/P3 recorded, not started (in-memory rate limiters, markup-like names
  accepted, stale `e2e-projects.ps1`, operational prerequisites).

### Regression harness (new, committed)

`scripts/e2e-launch-audit.mjs` — repeatable launch gate: sweeps 17 pages
for console/page errors and failed requests, asserts zero horizontal
overflow at 390px for `/`, `/dashboard`, `/explore`. Playwright is not a
repo dependency; point `PLAYWRIGHT_MODULE` at an installed copy. Current
run: **clean (exit 0)**, `/explore` overflow 0px.

### Verification (session 22)

- Targeted: the harness (above) before/after the P1-1 fix.
- `tsc --noEmit` clean; production `next build` green (dev stopped first,
  restarted); both servers live; Go suite untouched (no API changes).
- Files: `LAUNCH_AUDIT.md` (new), `scripts/e2e-launch-audit.mjs` (new),
  `apps/web/src/app/explore/page.tsx` (one-class fix).

**Next batch**: P2 (rate-limit shared store decision, name sanitization)
only when the next hardening run starts; feature work otherwise continues
per the 7.0 roadmap dependency column.

## 28. Work in session 23 (user feedback round — six fixes)

User tested localhost in their own browser and reported six issues. All
six root-caused, fixed, and browser-verified; production rebuilt.

1. **Landing demo was a static diorama** (player never moved). Rewritten as
   a real playable mini-platformer (`hero/editor/preview-canvas.tsx`):
   gravity + platform collisions + coin pickup + CLEAR state, ←/→/↑/WASD
   keys captured only while running (never hijacks page scroll when idle),
   plus on-screen ◀/⤒/▶ touch buttons. Verified: holding → moves the player
   (x 58 → 162 → 250 via touch button).
2. **Blocks canvas restyled to the landing visual language**: solid vivid
   category fills with dark text (was dark tinted cards), connect notch +
   bump on every block, solid dome hat, dark-translucent value sockets/
   chips/inputs, solid palette swatches. The editor now matches the
   showcase blocks on the landing page.
3. **Extension manifest rejected Java source with a raw JSON error.** Added
   a **Source tab** to the Extension Studio: authored code (Java/Kotlin/
   anything) persists on the extension (migration `018_extension_source`),
   flows through create/update/wire, and the manifest save error now
   detects source-like text and says exactly where to paste it. Verified:
   source prefilled from API, saves, guided error shows.
4. **Export menu expanded to compile targets**: Web .html, Android APK
   (`?format=apk` → assembleDebug project+workflow), Android AAB
   (`?format=aab` → bundleDebug), and a Windows Electron project
   (`/export/windows`, builds a portable .exe via electron-builder on a
   desktop machine). Honesty rule kept: the server emits ready-to-build
   projects + CI; it never fakes signed binaries. All four endpoints
   verified live with real zips.
5. **Theme toggle was invisible on the workspace/builder.** The existing
   cycle toggle (Light → Dark → System, System default = auto-detect,
   matches the OS live) is now mounted in the dashboard sidebar, the
   mobile workspace bar, and the builder top-bar. Verified: System →
   Light → Dark cycling flips `data-theme`.
6. **Preview parity** (user: "preview should match the design"): the
   builder Preview and the exports all render from the same runtime over
   the canonical model (verified equivalent in earlier sessions); the
   landing demo now also runs real physics, closing the "fake demo" gap
   between marketing and product.

### Verification (session 23)

- `go test -count=1 ./...` green 8/8 (extension source plumbing included);
  `tsc --noEmit` clean; production build green (fresh BUILD_ID); launch
  audit harness clean against the production server; live checks: export
  apk/aab/windows zips download with the right content, extension source
  round-trips, theme cycles, demo player moves.
- Ops note: repeated "swallowed commands" root-caused — `pkill -f "next dev"`
  matches the calling shell's own command line and kills it; kill by
  port-PID instead.

**Next**: P2 hardening items and the phase-gated roadmap backlog (7A
remainder, 5B context engine, 6A avatars/sync).

## 29. Work in session 24 (second user feedback round — four upgrades)

1. **Professional templates**: the 3 existing starters rebuilt to
   agency-grade standard (brand tokens, gradient heroes, nav bars, pricing,
   footers, screen-level backgrounds, working validation/feedback logic)
   plus two new ones — **Coin Runner** (a real 3-screen game: menu →
   tap-to-catch with live score HUD → results, win at 6) and **Tasks App**.
   Required a new block expression: **`add`** (a + b) across the whole
   stack — editor vocabulary, codegen, preview runtime, and the standalone
   export runtime — so `score = score + 1` is real, not string-joined.
2. **Emulator device frames**: preview mode wraps the screen in realistic
   bezels — phone (side buttons, speaker slit, punch-hole camera, home
   indicator), tablet (camera + buttons), desktop (monitor + stand).
3. **Extensions for everyone**: new public endpoint
   `GET /api/public/extensions` (published-only, creator usernames, real
   install counts); the Extensions page is now three shelves — **Explore**
   (browse + one-click install, "✓ In your palette" state), **Installed**
   (uninstall), **Yours** (create form + Studio links). Installing is
   wired to the existing palette flow: installed blocks appear in the
   builder's ⬡ section.
4. **Dashboard home Extensions section**: yours / installed / published
   counters (fail-soft) with a link into the registry.

### Verification (session 24)

- Suite 8/8 (template models validated incl. new add-expression); tsc
  clean; production build green (BUILD_ID NqlULSkK6…); launch-audit clean
  against production.
- Browser E2E: Coin Runner created from the gallery → builder → Preview
  (phone frame) → PLAY → two coins caught → **SCORE 2** with the HUD
  updating; desktop frame + stand render; extensions Explore shows the
  public shelf with install buttons; dashboard counters live; 0 console
  errors.

**Next**: P2 hardening items; roadmap backlog per dependency columns.

## 30. Work in session 25 (master realignment — gap analysis + i18n + studio identity)

Directive: realign to the 9.5/10 product bar. Phase 0/0.1 first, then the
highest-credibility corrections.

### Phase 0.1 — Gap analysis

`docs/IDEAVEN_PRODUCT_GAP_ANALYSIS.md`: honest P0–P3 map. **P0: none.**
Top P1s picked for this pass: G1 i18n (none existed), G2 App/Game studio
identity (palette did not adapt), G4-partial (no 2D/3D game choice).
P1-kept-for-roadmap (honest, not fakeable now): general game scene/sprite
IR, 3D runtime, extension component runtime providers.

### Implemented (session 25)

1. **Real i18n (EN/ID)** — key architecture (`lib/i18n/dictionaries.ts`:
   nav/dash/builder/ext/common groups), `I18nProvider`
   (localStorage → browser language → English fallback), `LanguageSwitcher`
   (site header ×2, dashboard sidebar), translations applied to site nav,
   workspace nav, dashboard home, builder top-bar (modes, Publish/Export/
   Assets/History/Ask AI/Save/Saved via the split button components),
   extensions page + shelves. **Verified live**: EN→ID switch changes nav
   ("Projects"→"Proyek"), headings ("Welcome back"→"Selamat datang
   kembali"), builder modes ("Design/Blocks"→"Desain/Blok") and buttons
   ("Publish/Save"→"Publikasikan/Simpan"); persists across navigation;
   auto-detect picks up the device language (headless en-US → English,
   system locale id → Indonesian).
2. **Adaptive palette** — game projects surface navigation/variables/
   control (gameplay-oriented) categories first; app projects lead with UI.
   Same IR, no fake blocks.
3. **Honest 2D/3D game choice** in the creation wizard: Game → "2D or 3D?"
   — 2D fully available; 3D shows the amber "foundation in development"
   status card (spec §69/70 compliant: coming-soon with explanation).
4. **Fixed en route**: double `DashboardShell` wrapping on extensions/
   templates/studio pages (two stacked fixed sidebars — caused real click
   interception on the sidebar controls); removed the inner shells.
5. **Docs**: README headline rewritten (no longer "Phase 1 landing page");
   `IDEAVEN_PROGRESS.md` (single checkpoint file);
   `docs/IDEAVEN_PRODUCT_MODEL.md`; `docs/IDEAVEN_DESIGN_SYSTEM.md`.

### Verification (session 25)

- `tsc` clean; production build green (BUILD_ID Gw-0ZV2… + follow-ups);
  launch-audit harness clean against production; Go suite 8/8.
- Browser E2E: two-way language switching with persistence, builder fully
  translated, dashboard/extensions translated, switcher reachable
  (double-shell bug fixed and removed).

**Next (per gap analysis)**: G3 extension runtime providers, game
scene/sprite IR milestone, i18n coverage expansion, a11y audit, P2
hardening items.

## 31. Work in session 25b (Task 02 — Extension Studio manifest/source UX)

- Manifest tab rebuilt: title "Manifest JSON", explanation that the manifest
  is *information* while code lives in the Source tab (with a jump link),
  Format document / Reset to example / Copy buttons, a REAL-schema example
  (`{format:1, methods:[…]}` — verified to load AND save server-side), live
  validation (✓ valid badge, or "Manifest validation failed. Line N, column
  M — …" with beginner guidance and source-code detection pointing to the
  Source tab), and a Manifest-vs-Source explainer.
- Source tab upgraded: line-number gutter synced to content, Tab inserts
  indent, two real Java snippet inserts (component skeleton, @SimpleFunction
  stub) — every insert is real text, no fake IntelliSense.
- Double DashboardShell removed from extensions/templates/studio pages
  (stacked fixed sidebars intercepted sidebar clicks).
- Fixed en route: a failed `next build` corrupted `.next` under the running
  server (ChunkLoadError) — clean rebuild rule re-applied; recorded as
  LAUNCH_AUDIT P3-3.
- Verified (browser E2E, production): example loads/validates/saves;
  guided Java-paste error with line/col + Source pointer; gutter counts
  lines; snippets insert real Java; Tab indent; source saves; 0 console
  errors. Known limitation: no full syntax highlighting/IntelliSense yet —
  snippets + gutter are real and honest; highlighting overlay listed for
  the next polish pass.

## 32. Work in session 26 (TASK 03 — Block editor: from rigid stack to real visual programming)

Directive: rebuild the block editor's interaction quality without touching the
canonical model. The editor felt like a rigid top-to-bottom stack (one handler
at a time, HTML5 drag between fixed strips); it now behaves like a genuine
Scratch-style visual programming environment over the same IR.

### Model (canonical, backward-compatible)

- `ProjectModelLogic` gains optional `parked: Block[][]` (runs detached on the
  canvas — visible drafts, never code-generated or executed) and `positions:
  Record<id, {x,y}>` (canvas px per handler script / parked run). Mirrored into
  the Go API (`Logic.Parked [][]Block`, `Logic.Positions map[string]Position`)
  so layouts survive save/reload/other devices; validator now checks ID
  uniqueness across handler bodies AND parked runs, non-empty parked runs, and
  finite/ranged position coordinates (NaN/Inf cannot round-trip through JSON).
  Old models stay valid (both fields optional; schema version unchanged).
- New pure ops in `blocks.ts`: `locateRun`, `moveRun` (grabbed statement +
  the run below it — Scratch semantics; cross-handler, cycle-guarded,
  same-array index adjustment), `parkRun`, `splitParkedRun`, `moveParked`,
  `attachParked`, `addParked`, `removeParked`, `duplicateAttached`,
  `duplicateParked`, `setScriptPosition`; `createBlock`/`createRegistryBlock`
  accept preset inputs (context palette pre-wires componentId/variable name).
- `commitModel` no longer clears the handler selection on every commit (only
  for `origin:"ai"` changesets) — palette context survives canvas gestures.

### Vocabulary (real, end to end)

- New statement blocks: `change-variable` ("change variable N by E"),
  `play-sound` ("play sound S"), `stop-sound` ("stop all sounds"); new
  category `audio` (fuchsia #e879f9) + readable `CATEGORY_LABELS` for the
  palette. Each block has deterministic codegen
  (`api.changeVariable("score", 1)`, `api.playSound("coin.wav")`,
  `api.stopSound()`), code→blocks parse-back (code-sync), preview-runtime
  execution, AND execution in the Go export runtime (web/apk/windows HTML).
  play-sound resolves real media: `asset:` refs, project asset library by
  name, or external URLs; unresolvable sounds warn once per run — never a
  fake playback. Honesty note: the directive's "when player touches coin"
  is represented as the real coin-click event until the game scene/sprite IR
  milestone lands (a touch event with no collision runtime would be fake).

### Canvas (rewritten `blocks-canvas.tsx`)

- Free multi-script workspace: every handler renders as a placeable script;
  parked runs render at their positions; both persist. Auto-layout (measured,
  flowing) only for scripts with no stored position — first open never writes
  the model.
- Pointer-based drag controller (`blocks-dnd.tsx`): press → 5px threshold →
  ghost (rendered inside the plane, zoom-correct) → drop resolved against
  `[data-dz]` zones (strips, container arms, value sockets, free canvas =
  park). Dragging an attached statement carries the run below it; grabbing a
  mid-run parked block splits the run; Escape or a missed pointer cancels
  with everything put back. Every gesture is exactly one undoable commit.
- Live connection feedback: all insertion strips reveal mint guide lines
  during statement drags, the active insertion point brightens and grows,
  container arms highlight, value sockets highlight during reporter drags
  (filled sockets accept drops too — the displaced expression parks under
  the pointer). Dropping on free canvas parks; dropping outside the canvas
  or on chrome cancels gracefully.
- Block design: stroke icons per block type (`blocks-visual.tsx`), semantic
  category colors, hover/selected/connection states, hats draggable to move
  whole scripts (live echo), duplicate (⧉ button / Ctrl+D), delete, move
  up/down, zoom/pan, minimap now drawn from real script/parked rects,
  Ctrl+F focuses palette search, Del deletes, arrows reorder.
- Palette (`blocks-side.tsx`): context-aware "For <component>" group with
  pre-wired blocks when a component handler is selected, per-extension
  groups, searchable category labels, variable-name search boost ("score"
  surfaces set/change/get-variable pre-wired), icons on every item.
- Fixed en route (all real bugs found by browser E2E): (1) hidden hover
  action buttons (opacity-0) still hit-tested and intercepted drags through
  overlapping content — now `pointer-events-none` until visible; (2) idle
  insertion strips (z-10) intercepted grabs over parked runs — now
  pointer-events only during statement drags; (3) parked runs now render
  above scripts (z-20); (4) the canvas viewport was a programmatic scroll
  container (`overflow-hidden`), so focus/scrollIntoView silently shifted
  every overlay — now `overflow-clip` (pan stays transform-based).

### Verified (browser E2E, dev server, real pointer gestures)

- Acceptance example built live on the Coin Runner Play screen: drag "change
  variable score by 1" from palette into the coin handler, wire the number
  reporter into the amount socket, drag "play sound" in underneath, type
  coin.wav. Then: drag it out (whole tail run detaches, parks as one stack),
  reconnect (reattaches in order), cross-script run move, undo/redo of the
  move (atomic), Ctrl+D duplicate, Del delete, hat drag to a new position,
  search "sound" → play/stop sound.
- Persistence: autosave ("Saved") → hard reload → script position (348,172),
  block structure, coin.wav, amount=1 all restored; parked-run positions
  equally restored.
- Code mode shows `api.changeVariable("score", 1)` + `api.playSound("coin.wav")`
  with source map; Preview runtime executes them for real (score 0→4 across
  two coin clicks — the new block runs beside the template's own +1 logic).
- `tsc --noEmit` clean; production `next build` green; Go suite green
  (project + auth packages; new model tests cover parked/positions validation
  and JSON round-trip).

### Known limitations (honest)

- Drag from palette is pointer-based; the ghost only renders once the drag
  crosses into the canvas viewport (it lives inside the plane).
- No marquee multi-select; Scratch-style run-dragging covers the common case.
- Extension container blocks cannot host nested statements yet (container
  resolution is built-in-only, same as before this batch).
- "When player touches coin" waits for the scene/sprite IR milestone (touch
  without a collision runtime would be dishonest).

## 33. Acceptance-audit round (session 26b — evidence-driven fixes)

A full acceptance audit re-ran the complete user flow in the browser with
console capture. Additional REAL defects found and fixed:

1. **set-property / get-property component selector never rendered** — the
   block label placeholder `{component}` did not match the input key
   `componentId`, so the editor rendered a dead `{component}` placeholder
   since the block vocabulary was introduced (visible in old snapshots).
   Labels now use `{componentId}`; the dropdown renders (verified: HUD
   component + Text property wired on a rebuilt coin handler).
2. **Focus pan re-ran on every re-measure** — the pan-into-view effect
   depended on `[selectedHandlerId, measured]`, so background size updates
   yanked the viewport back to the selected handler and fought Reset view.
   Now it pans only when the selection actually changes.
3. **Empty handler bodies could not receive drops** — the single insertion
   strip of an empty stack collapsed to ~0 width. Strips now have min-w-40.
4. **Canvas viewport was programmatically scrollable** (`overflow-hidden`),
   so focus()/scrollIntoView silently shifted every overlay while the pan
   transform looked unchanged. Now `overflow-clip`.
5. **Hidden hover buttons intercepted drags; idle strips covered parked
   runs; parked runs rendered under scripts** — pointer-events gated to
   visibility, strips only hit-testable during statement drags, parked runs
   z-20.
6. **Grabbing near a block's input/select panned the canvas** — the drag
   guard returned without stopping propagation; now it swallows the event.
7. **Audio assets were not uploadable** (asset allow-list was images-only),
   making play-sound permanently warn. WAV/MP3/OGG now upload (kind
   "audio"); verified end-to-end: upload coin.wav → click the coin in
   Preview → `new Audio("/api/assets/{id}/raw").play()` is called and the
   score increments.
8. **React conflicting-style console warning** — `border` shorthand mixed
   with `borderBottom` overrides on the hat block; shell styles now use
   longhand only. The Next dev overlay "1 Issue" badge cleared; a fresh
   session with interactions captures zero console errors/warnings.

Incident recorded: running `next build` while `next dev` was serving
corrupted `.next` (500s, MODULE_NOT_FOUND) — the known P3-3 pitfall; fixed
by stopping dev, `rm -rf .next`, restart. Never build while dev serves.

Test-state note: mid-audit, several template filler blocks on the Play
screen were misplaced by harness drags aimed with stale coordinates under
overlapping scripts (drop targets resolve against the topmost script —
Scratch-like). All blocks were accounted for in the model at all times (no
silent loss found in op re-review); the affected handlers were rebuilt and
re-wired through the UI during this round.

## 34. Work in session 27 (TASK 04 — Application Studio: real app creation workflow)

Directive: make APP projects genuinely feel like app projects — structured,
UI-first, component-driven, honest about every capability boundary.

### Component registry (metadata-driven, `registry.tsx`)

Categories are now the application palette the directive names: **User
Interface** (ui), **Layout**, **Storage & Database**, **Connectivity**,
**Sensors**, **Media & Animation** — every palette section renders from
`CATEGORY_ORDER` + `COMPONENT_DEFS`; no capability is hardcoded into random
UI files. New defs carry `designed?: reason` — the palette renders those
tiles disabled with their reason as the tooltip: CloudDB, File, WebDB,
Activity Starter, Bluetooth Client/Server, Player, ImageSprite. Real new
components (registry + renderer + inspector + runtime):

- **ListView** — items from a model prop (one per line), click sets
  `selection` and fires `itemClick`; renders for real in design, preview,
  published page, and the exported runtime.
- **Notifier** — non-visible; `Notifier show alert` block drives the toast.
- **Horizontal/Vertical Scroll, Table Arrangement** — real containers
  (overflow-x/y, CSS grid columns prop) in all renderers.
- **TinyDB** — blocks `TinyDB save {key} as {value}` / `TinyDB value {key}`;
  runtime = real localStorage namespaced per project
  (`ideaven-tinydb:<projectId>:<namespace>:<key>`); export runtime = the
  same localStorage in the WebView/standalone page.
- **Web** — block `Web get {url}` performs a real fetch in preview and in
  the exported runtime; the response lands on the component (read via
  get-property); non-https URLs are rejected with a message.
- **Clock** — real `setInterval` timer per enabled Clock (interval prop,
  dispose on run restart), `Timer` event; `current date & time` expression.
- **Location Sensor** — `LocationSensor request location` uses real
  geolocation (permission-gated); latitude/longitude expressions read live
  props; failures surface honest messages.
- **Accelerometer** — real DeviceMotion stream (x/y/z props, shake event at
  magnitude threshold); absent sensors simply never fire — no simulated
  readings.
- **Text to Speech** — `TextToSpeech speak {message}` via real
  speechSynthesis (preview + export runtime).
- **Canvas** — a real interactive surface: preview/published/export render
  actual `<canvas>` elements (touch sets lastX/lastY + fires `touch`);
  `Canvas clear` / `Canvas draw circle x y r color` paint on it through the
  runtime's canvas registry.
- **Sound** — non-visible component over the verified play-sound/stop-sound
  audio pipeline.

All new blocks round-trip: codegen emits `api.storeValue/getValue/webGet/
notify/speak/now/latitude/longitude/requestLocation/canvasClear/drawCircle`,
code→blocks sync parses each back, and the Go export runtime executes every
one (localStorage/fetch/speechSynthesis/geolocation/toast/canvas).

### App Studio surface

- **Device frame in Design mode**: app projects now design inside the real
  phone shell (bezel, punch-hole camera, side buttons, rounded screen,
  home indicator) — the game stage stays the dark scene canvas. Phone /
  Tablet / Desktop presets unchanged.
- **Screen setting: Scrollable** (screen inspector checkbox) — honored in
  design canvas, preview, published page, and the exported runtime.
- **Import Extension (builder entry)** — palette → Extensions → Import
  Extension: file/paste manifest → client validation (format 1, name,
  block kinds, duplicates, nothing-to-import) → metadata inspection (name,
  blocks/methods/events/components/dependencies counts) → install runs the
  real lifecycle: register → build .AIX (isolated worker; honest log line
  on failure) → publish → install. Errors surface verbatim (e.g. the
  server's "only published extensions can be installed", unresolvable
  dependency build failures). Verified: install succeeded and the
  extension's blocks appeared in Blocks mode under ⬡ TetrisBoard Tools.
  Fixed en route: the palette's vocabulary memo was computed once at mount,
  so freshly registered extension blocks never appeared (now keyed on an
  extension tick from the workspace level).
- **Export pipeline** — the Export menu now runs a real per-target
  pipeline: Preparing project (saves dirty state first, validates the
  model — start screen, screen count, unsupported block warnings) →
  Preparing dependencies (real asset inventory) → Compiling (indeterminate
  bar — the server does not report percentages, so none are faked) →
  Packaging (real streamed bytes; `x KB / y KB` when Content-Length is
  known) → Build complete + Download with the actual size. Failures stop
  the pipeline, list issues, and open Diagnostics. Targets unchanged and
  honest: Web .html (runs anywhere), APK/AAB (gradle project + CI workflow
  builds the binary), Windows (electron project + electron-builder).
- **Publish flow** — Draft → validate → confirm: the dialog runs the same
  model validation and shows the checklist; Publish is disabled while
  validation errors exist. Snapshot + public page + QR + unpublish were
  already real and unchanged.

### Fixed en route (audit of this round)

- `set-property`/`get-property` component dropdown never rendered (label
  placeholder `{component}` ≠ input key `componentId`) — labels fixed;
  verified by wiring the HUD text property through the UI.
- Focus pan re-ran on background re-measures and fought Reset view — now
  selection-change only.
- Empty handler bodies had a ~0-width drop strip — min-width added.
- Canvas viewport was programmatically scrollable (overlay drift) —
  overflow-clip.
- Grabbing near a block input/select panned the canvas — event swallowed.
- Hidden hover buttons intercepted drags; idle strips covered parked runs
  (from the Task 03 round, re-verified here).
- React conflicting-style warning (border shorthand + borderBottom mix) —
  longhand only; the Next dev overlay "1 Issue" badge cleared.
- Audio asset uploads (WAV/MP3/OGG) accepted by the API so play-sound is
  usable end to end (verified: `new Audio(.../assets/{id}/raw).play()` on
  coin click, score increment in the Coin Runner).

### Verification (browser, production build on :3001, API :8081)

- Fresh Tasks App project: palette sections + designed tiles confirmed in
  the DOM; TinyDB/Notifier/Clock added and wired through the UI (drag,
  click-add, socket wiring, inspector toggles); Preview executed TinyDB
  (localStorage `lastTask` writes), Clock timer (interval fires, handler
  dispatch confirmed, "tick" toast), Notifier toast.
- Exported-artifact test (the same runtime users ship): the exported HTML
  loaded in an iframe — clicking "+ Add to list" executed TinyDB
  (`ideaven-tinydb:Tasks App…:lastTask = "Call the bank"` in localStorage),
  the exported runtime contains every new block case, and the exported
  model carries the audio asset reference.
- Export pipeline on the Web target: Build complete ✓, all stages, real
  size in the download link. Publish: validation checklist + enabled
  Publish. Import Extension: full lifecycle green.
- `tsc --noEmit` clean; production build green; Go project + asset suites
  green.

### Known limitations (honest, by design this round)

- CloudDB/File/WebDB/ActivityStarter/Bluetooth/Player/ImageSprite are
  designed-disabled with reasons (see registry) — no fake previews.
- TTS/Web/Canvas preview spot-checks were exercised through the exported
  artifact and code paths; the in-editor synthetic-input harness proved
  flaky for controlled inputs (an unrelated interaction-race investigation
  is open) — manual browser verification recommended as follow-up.
- Extension components (manifest `components`) render as designed state in
  the canvas until the extension runtime providers milestone.
- Concurrent-edit clobbering: two writers (API + open editor) last-write-
  wins; flagged for the versioning phase.

### Verification addendum (session 27 close-out)

The full runtime chain was re-verified live in Preview on the Tasks App with
every hook armed (speechSynthesis.speak, fetch, canvas 2d fill):

- Typing a task and clicking "+ Add to list" executed the whole handler:
  TinyDB wrote `lastTask = "final run value"` to localStorage, the Notifier
  raised the "Task saved ✓" toast, TextToSpeech called
  `speechSynthesis.speak("hello from ideaven")` (3/3 clicks), Web.get
  performed a real network fetch to `https://example.com`, and Canvas drew a
  red circle (pixel at 0,0 = rgb(255,117,117) via getImageData).
- A Web.get without a Web component now warns ("Add a Web component to the
  screen first") instead of silently no-oping.
- Console sweep across Blocks/Code/Preview/Design switches: 0 errors, 0
  warnings, 0 rejections. Model persistence re-verified after reload (all
  components + 6-block handler + URL intact).

## 35. Work in session 28 (verification pass of the in-flight extension build pipeline)

The working tree carried an undocumented batch: the extension build pipeline
v2 — `POST /api/extensions/{id}/build/stream` (SSE: every real worker state
and log line flushed live), `GET /api/extensions/{id}/builds` history over
migration `019_extension_builds`, `internal/extsrc` (extension source
builder), `internal/extension/fix.go` (repair service), and the web Build
panel + extension templates (`extension-templates.ts`). This session audited
and gated it rather than rewriting anything.

### Bug found by the suite and fixed

1. **BuildStream sent no `text/event-stream` header** — `controller.Flush()`
   was called before the SSE headers were set, so the flush committed a bare
   200 and the subsequent `w.WriteHeader(200)` was superfluous (clients saw
   an empty Content-Type; `TestBuildStreamSuccessConflictFailureRetry`
   failed). Headers are now set before the flush, which commits the status;
   the not-streamable JSON error path is preserved because a failed Flush
   writes nothing.

### Verification (session 28)

- `go vet ./...` clean; full `go test -count=1 ./...` green 9/9 packages
  (incl. `extsrc`, the build-stream suite, and the fix-service tests) on
  live PostgreSQL; `tsc --noEmit` clean; production `next build` green
  (dev servers were stopped — the P3-3 rule).
- PostgreSQL restarted via `~/.local/opt/pg/bin/pg_ctl` (it was down).

**Next**: browser E2E of the streamed Build panel UX, then commit this
batch; after that the roadmap backlog (game scene/sprite IR, extension
runtime providers, i18n coverage, a11y audit).

## 36. Work in session 29 (TASK 07 — Community becomes a real creator ecosystem)

Directive: turn the gallery-style community page into a creator ecosystem
(questions, answers, showcase, channels) with original IDEAVEN UI, real
thumbnails, and zero fake activity.

### Backend (apps/api)

- `migrations/020_community.sql` — `community_posts` (question/discussion in
  a closed 7-channel vocabulary, tags TEXT[] with GIN index, optional
  published-project attachment, soft delete), `community_replies` (soft
  delete), `community_votes` (one vote per user per target, CHECK keeps
  every row aimed at exactly one target), `community_reports` (closed
  reasons; stored for moderation — no fake public moderation surface).
- New `internal/community` package in the house style: Feed/Get/Replies with
  **every count derived at query time** (reply_count, upvote_count,
  viewer_voted) so numbers can never drift from the rows; filters for
  channel/kind/tag/query/sort (latest, popular, unanswered, trending — all
  server-side)/projectSlug/hasProject; anonymous reads, session-gated
  writes; only the asker can accept an answer (or clear it); authors
  soft-delete their own posts/replies; tags normalized (lowercase, deduped,
  2–24 chars `[a-z0-9-]`, max 5); attachment validated against
  published projects server-side. `GET /api/community/summary` aggregates
  trending tags, helpful creators (by real accepted answers), per-channel
  counts, and platform totals — nothing invented, empty lists stay empty.
- **Deterministic project thumbnails**: `GET /api/public/projects/{slug}/
  thumbnail.svg` renders a wireframe of the published snapshot's actual
  start screen (component-typed shapes, layout flow, brand palette chosen
  by slug hash). No stock imagery, no user text in SVG (injection-proof),
  ETag + immutable-style caching; republish changes the snapshot and the
  image. `PublicationSummary` now carries the (optional) custom thumbnail.
- Routes: `/api/community/feed|summary|posts|report`, posts/{id} (GET+DELETE
  via one `routeMethods` — two `route()` calls panicked the mux, the code's
  own documented rule, caught at live startup), replies, votes, accept.
- Tests: 4 new integration suites (question lifecycle incl. accept
  permissioning + toggle semantics + summary aggregation, ownership/soft
  delete, published-project attachment + thumbnail determinism/404,
  reports + tag normalization).

### Frontend (apps/web)

- `lib/api.ts` — `communityApi` (feed/post/createPost/deletePost/replies/
  votes/accept/report/summary), types, `publicationThumbnailUrl()`,
  `API_BASE_URL` exported; `PublicationSummary.thumbnail`.
- `/community` rebuilt as the three-column ecosystem: left sidebar (Home,
  Questions, Unanswered, Projects, the 7 channels with real counts,
  Extensions link, Challenges — honestly labelled "coming soon" with an
  explanation, no fake list), center feed with search + Latest/Popular/
  Trending sorts, post cards (kind chip, Answered badge, tags, author, real
  upvote toggle, answer count), showcase posts embed the attached project
  with its deterministic thumbnail + Open + Remix; right sidebar (trending
  tags, fresh projects with thumbnails, helpful creators, all real or
  honestly empty). Mobile is feed-first: horizontal channel chips, sidebars
  stack, verified zero horizontal overflow at 390px.
- `/community/ask` — question/discussion form with channel picker, tags,
  and a real "attach one of your published projects" select (server
  verifies ownership+published); anonymous visitors get a sign-in prompt.
- `/community/post/[id]` — answers with upvotes, accept/unaccept (asker
  only), delete-own (post + answer), report dialog (closed reasons),
  sign-in-aware answer composer. Server render is anonymous by design; the
  client refetches viewer state on mount so author controls appear without
  faking anything to anonymous visitors.
- `/p/[slug]` gained a **Discussions** section: real posts attached to the
  project plus a "Start a discussion" CTA; `/explore` cards now render the
  deterministic thumbnails (previously gradient placeholders).
- `ProjectThumb` degrades to an honest "No preview" panel if the SVG ever
  fails — never a fake screenshot.

### Bugs found by testing and fixed (session 29)

1. **BuildStream SSE headers** (carried from session 28's suite run):
   headers set after first Flush → clients never saw `text/event-stream`.
2. **Duplicate mux fallbacks** on `/api/community/posts/{id}` panicked the
   server at startup (live catch; tests bypassed the route helper).
3. **pgx TEXT[] scan** — database/sql returns arrays as strings; fixed with
   a constrained-format `tagList` scanner (tags can never contain commas).
4. **NULL project_slug scan** and **uuid/text NULLIF** casts in reports.
5. **Vote toggle logic** — delete-then-reinsert never removed a vote;
   now delete-if-exists else insert (verified by test + E2E toggle).
6. **Derived-table WHERE** referenced outer aliases (`p.`) that don't exist
   outside the subquery → 500 on every feed call; rewritten against the
   projection columns, visibility (deleted_at) moved into the base query.
7. **Viewer state on SSR post pages** — server render is anonymous by
   design, so author/upvote state was stale; client refetch on mount.

### Verification (session 29)

- `go vet` clean; full `go test -count=1 ./...` green 10/10 packages on
  live PostgreSQL; `tsc --noEmit` clean; production `next build` green
  (dev stopped first, `.next` cleaned, dev restarted after).
- New permanent harness `scripts/e2e-community.mjs` (Playwright, points at
  PLAYWRIGHT_MODULE like the launch-audit harness): **30 checks, all
  passing, 0 console errors** — anonymous home (3 columns, honest empty
  state, real thumbnails), ask → post → answer → upvote (both targets) →
  accept flow across two sessions, delete/report controls, search, sorts,
  unanswered filter, channel filters, Answered badge, helpful creators,
  trending tags, remix from community into the builder, public-page
  Discussions section, and mobile 390px usability.
- Servers left running for the user: web :3000, API :8090.

**Next**: extension runtime providers (extension components still render as
designed placeholders in preview), game scene/sprite IR, i18n coverage for
the new community surfaces, then the accessibility audit.

## 37. Work in session 30 (TASK 08 — 2D Game Studio: real gameplay loop + scene creation)

Directive: fix "player touches coin → coin remains, score stays 0" by
root-cause, and make the 2D Game Studio a real scene-creation experience.

### Root cause (verified in code, not guessed)

The platform had **no gameplay runtime for model-driven games at all**: the
canonical model had no scene/entity layer, the block vocabulary had no
touch/collision event, the runtime interpreted only UI events (click/change/
enter/timer…), and the Coin Runner template simulated gameplay with
**buttons caught by click**. "Player touches coin" could never fire by
construction — the pipeline INPUT → MOVEMENT → COLLISION → EVENT → LOGIC →
SCORE → UI → RENDER did not exist beyond the hardcoded landing demo. (The
landing demo's own collision was real; its hero top-bar simply never
rendered the orphan `score` state it received.)

### Canonical model (zero schema migration — fully backward compatible)

- Game entities are **real components** (registry category `game`, game
  projects only): `player`, `platform`, `coin`, `enemy`, `trigger`, `sprite`
  — transform props (x/y/width/height/rotation), color, visible, plus
  first-class collider fields (collider on/off, trigger-only, collision
  layer). A screen containing any entity **is a scene**; old screens
  (button-based Coin Runner) keep rendering as flow — nothing breaks.
- New expression block `boolean` (true/false literal) across the whole
  pipeline: vocabulary, slot editor, runtime, codegen, code→blocks
  parse-back, and the Go export runtime. (Previously `true`/`false`
  round-tripped as text — a latent honesty bug this task surfaced.)

### Runtime — the real loop (`components/runtime/scene-stage.tsx`)

INPUT (←/→/↑ WASD/space + on-screen touch buttons) → MOVEMENT (velocity,
gravity, stage clamping) → COLLISION (AABB vs solids: landing resolution;
edge-triggered overlap vs trigger entities) → EVENT (dynamic
`touches-<targetId>` dispatched into the existing block runtime) → LOGIC
(the user's own blocks: score += 1, hide coin via set-property visible,
win-condition navigate) → UI UPDATE (runtime props) → RENDER (per-frame).
Restart re-seeds everything from the model (fresh runtime + stage remount).
Diagnostics: new `onTrace` runtime hook + a collapsible **Runtime trace**
strip in Preview logging every event dispatch and every collision →
"collision detected → event fired → handlers executed" is visible in the UI.

### Editor — scene creation (Design mode)

- `scene-canvas.tsx`: entities on the stage with select, drag-move, corner
  resize (scale), rotation rendering, duplicate ⧉ / delete ✕ buttons, grid
  dots, and a Snap toggle (10px). Every gesture commits once through the
  shared model path (undo/redo + autosave inherit).
- Inspector edits entities generically from registry propFields (X/Y/W/H/
  rotation/color/visible/collider/layer/trigger).
- Blocks mode: handler creation offers **"when <entity> touches <other>"**
  for scene entities (dynamic event names, labeled with target names on the
  hat blocks and in the handler list).
- Diagnostics fix found en route: set/get-property references now resolve
  across the whole model (the runtime always allowed cross-screen
  set-property — the old screen-scoped check false-positived on the
  template's score→results wiring).

### Everywhere the model runs

- Published pages (`live-app.tsx`) play scene screens with the same loop.
- **Exported HTML/APK/Windows**: the Go export runtime gained the scene
  engine (input, gravity, AABB, edge-triggered touches, boolean eval) —
  verified by actually playing the exported HTML in a browser: walk → touch
  → coin hides → score 1, zero console errors. Fixed en route: stage sized
  from clientWidth/Height (percentage height inside a min-height parent
  collapsed to 0 and clipped everything), and duplicated HUD rendering.

### Template + landing

- Coin Runner rebuilt: Play is now a real 390×844 scene — player, floor,
  four platforms, six coins, HUD — with per-coin `touches` handlers (hide →
  score+1 → HUD update → win at 6 → fill the results score → navigate).
- Landing hero: TopBar now renders the live SCORE chip (the previously
  orphaned state), matching the in-canvas HUD.

### Bugs found by testing and fixed (session 30)

1. Stale API process served old templates after rebuild — kill by port PID
   (pkill patterns also matched the calling shell; documented pitfall again).
2. Web rebuilt under a live `next start` broke chunk hashes (P3-3 rule) and
   a build without `NEXT_PUBLIC_API_URL` broke all client API calls — both
   re-learned the hard way, both gated after.
3. Scene entity click deselected (pointerdown selected; the bubbling click
   hit the canvas-root deselect) — stopPropagation on entity clicks.
4. Export scene stage collapsed to 0 height (percentage inside min-height
   parent) and HUD text rendered twice — both fixed and re-verified.

### Verification (session 30)

- `go vet` clean; full `go test -count=1 ./...` green 10/10 on live
  PostgreSQL; `tsc --noEmit` clean; production `next build` green.
- New permanent harness `scripts/e2e-scene-gameplay.mjs`: **21/21 checks**
  — scene design canvas + entities, inspector transform fields, drag-move
  persisted to the canonical model (verified via API round-trip), touch
  handlers in Blocks, real preview gameplay (walk → collision → coin hides
  → score 2 on the two-coin walk path → jump → restart resets score/coins/
  position), published page gameplay, export engine content, landing score
  chip. Screenshots verified visually (preview + exported HTML).
- Servers left running for the user: web :3000, API :8090.

**Next**: enemy behaviors/patrol AI on the scene IR, sprite textures
(ImageSprite honesty note updated), camera/parallax for larger stages, then
the deferred i18n/a11y backlog.

### Session 30 acceptance-audit addendum (evidence-driven fixes)

The final audit re-ran the complete flow as a USER building a game from
scratch (not just the template), and fixed two real defects it surfaced:

1. **Scene-entity drag silently dropped** — the container's conditional
   React pointer props raced the pointerdown re-render (selection commit vs
   first pointermove), so drags occasionally never committed. Drags now use
   window-level pointer listeners for the gesture's lifetime; commit is
   exactly one updateProps per gesture. Verified: added coin moved
   (120,520) → (230,750), snapped to the 10px grid, persisted.
2. **Unnamed entities made handlers indistinguishable** ("Touches coin"
   × 7). Entities gained a Name prop (registry field + defaultProps +
   `componentLabel` precedence), and the Coin Runner template names every
   entity (Player 1, Platform 1–5, Coin 1–6). Handler UI now reads
   "Touches Coin 3" / "Touches Bonus" after a user rename.

Audit flow verified end to end with fresh evidence: palette-add a coin →
rename it in the inspector → drag it onto the walk path → duplicate (8 in
model) → delete (7) → create a touch handler through the Blocks UI
("Player 1 · Touches Bonus") → **hard reload** → all edits persist →
preview walks the path → **the UI-created handler fires on the real
collision** (trace: `event p-player:touches-c-coin-… → 1 handler`) →
score increments → restart resets. Console audit unfiltered: the only
error on any surface is the pre-existing anonymous /api/auth/me 401 probe
(identical on /pricing). `scripts/e2e-scene-gameplay.mjs`: 21/21 on the
final build.

## 38. Work in session 31 (TASK 09 — 2D Asset Canvas: the Asset Studio)

Directive: a dedicated 2D asset creation workspace — sprites, tiles,
animation frames — clean and focused, with the results flowing into the
project's real asset library and the 2D Game Studio.

### New workspace

- Route `/builder/[id]/asset-studio` (inherits the builder's auth layout),
  reachable from the Assets panel's "🎨 Asset Studio" button and directly
  by URL. Doc id rides the query string via history.replaceState so reloads
  and bookmarks return to the work (router.replace proved unreliable for
  same-route query updates — found by E2E, fixed with a pure URL update).
- `lib/sprite-doc.ts` — the sprite document model: frames of pixel layers,
  each layer a PNG data URL (compact, lossless); localStorage persistence
  per project; canvas helpers for compositing, flip (layer or selection),
  90° rotation, nearest-neighbour scale, flood fill, eyedropper, Bresenham
  lines, and horizontal sprite-sheet composition.

### Editor (`components/asset-studio/sprite-editor.tsx`)

- Tools: Select (marquee), Pencil (brush 1–4), Eraser, Line, Rectangle,
  Circle (drag-preview overlay), Fill (exact-match flood), Color picker
  (eyedropper over the composite), Text (rasterized monospace).
- Transform: Flip H/V (whole layer or selection), Rotate 90° steps, Scale
  ×2/÷2 (whole active layer, nearest-neighbour), Duplicate selection,
  Delete selection, Crop document to selection (all frames).
- Zoom 25%–800% + Fit; pixel grid with 8/16/32/64 presets; layers with
  visibility/lock/rename inline/reorder/delete; frames with add-empty/
  duplicate/delete, thumbnails, FPS (1–24), play/pause/loop and a live
  64px preview; undo/redo (25 steps, Ctrl+Z/Y); 16-swatch palette +
  color input; keyboard shortcuts per tool.
- **Export (real formats only)**: PNG per frame, every frame as separate
  PNGs, horizontal sprite-sheet PNG — saved into the project's real asset
  library through the existing multipart asset API (server MIME sniffing
  applies), plus direct PNG downloads. No GIF: none implemented, none
  claimed.
- Mobile: the tool rail becomes a horizontally scrollable tray, the
  inspector becomes a collapsible full-height sheet (default collapsed),
  header wraps — verified 0 horizontal overflow at 390px.

### 2D Game Studio integration

- Scene entities gained a **Texture** prop (`src`: `asset:<id>` or URL).
  A textured entity renders its image (pixelated, object-fit fill) in the
  design canvas, the preview runtime, published pages, and the exported
  HTML/APK/Windows scene engine — drawn sprites become real game graphics
  end to end.

### Bugs found by testing and fixed (session 31)

1. Two silent no-op source patches (search/replace template mismatch) made
   it look like the doc-URL sync was implemented when it never was — caught
   by the E2E, fixed with an exact-text edit, and the lesson recorded:
   always verify patch effects, never trust the print statement.
2. Router URL updates: `router.replace` proved unreliable for same-route
   query changes; replaced with `history.replaceState` (no remount, no
   state loss — verified the URL survives reload).
3. Mobile header overflow (88px) — header now wraps.

### Verification (session 31)

- `go vet` clean; full `go test -count=1 ./...` green 10/10 on live
  PostgreSQL; `tsc --noEmit` clean; production `next build` green.
- New permanent harness `scripts/e2e-asset-studio.mjs`: **25/25 checks** —
  create sprite, draw (pencil/fill/circle), layers (3 defaults, visibility,
  add), frames (add/copy, 3 frames, play), save frame + sprite sheet into
  the asset library (verified via API: real PNG rows, raw bytes are PNG),
  doc persists after hard reload (name, frames, URL), entity texture
  accepted by the model API, rendered on the design canvas and in Preview,
  mobile usability. Editor screenshot verified visually.
- Servers left running for the user: web :3000, API :8090.

**Next**: onion-skin/ghost frames, tile-map placement of drawn tiles onto
scene stages, then the deferred i18n/a11y backlog.

### Session 31 acceptance-audit addendum (evidence-driven fixes)

The final audit re-ran the complete flow as a user (builder → Assets panel →
Asset Studio → draw → rename layer → 3 frames → save → texture a scene
entity → preview → mobile), and fixed one real defect it surfaced:

1. **Game-builder toolbar overflowed 26px at 390px** — the canvas toolbar
   (device presets + Snap + zoom, `shrink-0`) could not shrink. Both the
   design-canvas and Preview toolbars now scroll internally
   (`overflow-x-auto`); verified 0 document overflow afterwards.

Audit evidence (all fresh): console audit unfiltered — the only error on
/pricing (pre-existing) and the new studio route is the identical anonymous
`/api/auth/me` 401 probe; layer rename "Details"→"Aura" persisted into the
stored doc; frames "frame 3/3 · 8 fps" with play state; saved frame +
sprite sheet appear as real PNG rows (raw bytes verified PNG magic); HARD
RELOAD returned to the same doc (name, 3 frames, ?doc= intact); the saved
sheet textured Coin 1 via the model API and rendered on the design canvas
and in Preview; mobile: tool tray visible, inspector sheet opens, 0
overflow. `scripts/e2e-asset-studio.mjs`: 25/25 on the final build.

## 39. Work in session 32 (TASK 10 — real internationalization EN ↔ ID)

Directive: the language switch must be real — ONE setting drives ONE global
UI language, with account-level preference that follows the user across
devices.

### Account-level preference (server)

- `migrations/021_user_locale.sql` — `users.locale` ("" = unset).
- `PATCH /api/profile` accepts `locale` (closed vocabulary ""/en/id, field
  error otherwise) alongside the existing profile fields; `/api/auth/me`
  returns it; the session-store JOIN now carries `u.locale` (found by the
  new test — the old JOIN silently dropped the column).
- Test: `TestAccountLocalePersists` (patch → me → unknown-locale 400).

### Client resolution (web)

- `I18nProvider` (now inside AuthProvider): **account → local
  (localStorage) → browser → English**, gated on the auth status so the
  /me round-trip doesn't flash English. `setLocale` applies immediately
  (context re-render, no reload), writes localStorage, and — when signed
  in — PATCHes the account and updates the cached user.
- Provider order fixed: AuthProvider wraps I18nProvider so the account can
  be read.

### Coverage expansion (~190 new keys × 2 locales)

- **Landing**: hero (title/sub/CTAs, split-aware accent styling), final CTA.
- **Auth**: all five pages via a new `LocalizedAuthShell` client wrapper
  (server pages pass dictionary keys), plus the login/register/forgot/
  reset forms (field labels, placeholders, buttons).
- **Community** (TASK 07 surfaces, previously English-only): full
  conversion of the three-column home, post detail, ask form, and the
  public project page's Discussions section (extracted into a client
  `ProjectDiscussions` component so a server page can render translated).
- **Dashboard**: the welcome heading (missed by the session-25 pass),
  create button, empty state, verify-email banner, resend link.
- **Builder**: design canvas empty state, Snap toggle, preview toolbar
  (Restart run, Runtime trace, no-events state), Diagnostics header +
  healthy state, Assets panel (title, Asset Studio entry).
- **Errors**: `lib/i18n/errors.ts` maps the httpx error CODES to
  `errors.<CODE>` keys with verbatim fallback — server errors translate
  without the server knowing any language; applied to the community
  surfaces.
- **Block language**: new `block.*` keys — the word "when", event labels
  (Click → Diklik, Timer → Pengatur waktu, …), category labels, and core
  statement templates with identical {placeholder} tokens (the canvas
  parser is unchanged). `translatedBlockLabel/EventLabel/CategoryLabel`
  helpers fall back to English per label, so partial coverage is safe.

### Bugs found by testing and fixed (session 32)

1. Three silent no-op source patches (the recurring trap) — including the
   handler body struct, caught by the new test; all verified after.
2. The session JOIN dropped `users.locale` (found by the round-trip test).
3. The dashboard welcome heading was hardcoded (missed in session 25).
4. The language switcher existed only in the mobile drawer — and was
   rendered TWICE there. Now on the desktop header + drawer (single).
5. Game-builder toolbar overflowed 26px at 390px (from TASK 08's Snap
   chip) — toolbars now scroll internally.

### QA harness (acceptance requirement)

`scripts/e2e-i18n-audit.mjs` — the language audit: for each of 8 pages
(/, /login, /register, /dashboard, /community, /explore, /extensions,
/pricing) it captures **EN and ID screenshots**, checks horizontal
overflow in BOTH languages (Indonesian runs longer), asserts the content
actually differs, then toggles the switcher live (community heading
changes without reload) and verifies the ID preference survives a reload.
**26/26 green.** Plus `scripts/../tmp` account flow: switch → API shows
`locale: "id"` → a FRESH browser context (no localStorage) renders the
dashboard in Indonesian — cross-device proof.

### Verification (session 32)

- `go vet` clean; full `go test -count=1 ./...` green 10/10; `tsc --noEmit`
  clean; production `next build` green; i18n harness 26/26; account-locale
  cross-device flow green; ID dashboard screenshot verified visually.
- Known honest gaps: deep editor panels (Ask AI, History, Insights tabs),
  settings pages, and the decorative landing sections remain English — the
  dictionary architecture and QA harness make them incremental additions.
- Servers left running for the user: web :3000, API :8090.

### Session 32 acceptance-audit addendum (evidence-driven fixes)

The final audit walked the whole flow in ID and fixed four mixed-language
residues it surfaced:

1. The community subtitle replace had silently no-op'd (now keyed).
2. Channel labels (General/Help/…) — now dictionary-driven with fallback.
3. The community left-nav linked to a nonexistent `/extensions` route — the
   RSC prefetch 404'd on every community visit (caught in the console
   audit); now `/dashboard/extensions`.
4. Palette category headings + the scene-touch hat word — now translated
   ("menyentuh Coin 1").

Fresh audit evidence: dashboard live switch ("Welcome back." → "Selamat
datang kembali."), builder modes Desain/Blok/Kode/Pratinjau, "⌗ Snap
aktif", blocks canvas showing "ketika Player1 (Player) menyentuh Coin 1" +
"setel variabel score menjadi" + "jika … pindah ke layar Results" +
"Tidak ada error 🎉" (screenshot verified), community fully ID including
"Tanya atau bagikan", reload keeps ID, account locale syncs both
directions (`en` after switching back), dynamic project names untouched.
Console audit unfiltered on /pricing, /login, /explore, /community: only
the pre-existing anonymous `/api/auth/me` 401 probe — the /extensions 404
is gone. i18n harness: 26/26 on the final build.

## 40. Work in session 33 (TASK 11 — universal device/viewport frame system)

Directive: one coherent device/viewport presentation across every creation
surface — DEVICE FRAME for applications, VIEWPORT FRAME for games — with
orientation, safe areas, fit/zoom, and persistence. No duplicated shells.

### The universal system

- `components/builder/viewport.tsx` — **ViewportFrame**, the single frame
  implementation: `kind: "app"` renders the polished hardware frame
  (the existing DeviceFrame — reused, not forked); `kind: "game"` renders
  the dark viewport shell with corner instrumentation ticks, and on
  phone/tablet targets that shell rides inside the same hardware frame so a
  mobile game reads as a phone running the game. `viewportSize()` resolves
  Phone 390×844 / Tablet 834×1112 / Desktop 1280×800 / Custom 200–2000px,
  swapping width/height for landscape. `safeAreaInset()` + a hatched
  SafeAreaOverlay (labeled px bands) mark notch/status/gesture zones for
  app previews.

### Persistence

- Go: `ModelSettings.Preview *PreviewSettings` (device/orientation/safeArea/
  width/height) with closed-vocabulary + bounds validation
  (`validatePreviewSettings`) — optional, backward compatible, no migration.
  Test: `TestValidatePreviewSettings` (6 cases).
- Web: `ProjectModel.settings.preview` type, `ops.updatePreviewSettings`
  (one undoable commit), `actions.updatePreviewSettings`; Preview mode and
  the design canvas persist device/orientation/safe-area per project and
  restore them on open.

### Surfaces unified

- **Preview mode**: device chips (Phone/Tablet/Desktop/Custom) with i18n
  labels, orientation toggle (portrait/landscape, hidden for desktop),
  safe-area toggle (app screens), custom W×H inputs, a quiet zoom row
  (Fit/25/50/75/100% with a ResizeObserver-driven Fit), everything rendered
  through ViewportFrame.
- **Design canvas**: the same viewport settings; the TASK 08 ad-hoc scene
  frame is gone — game screens render through the unified ViewportFrame
  (corner ticks + hardware shell), orientation toggle in the toolbar.
- **Published page**: live-app renders through ViewportFrame (app hardware
  or game shell; safe-area overlay respects the project setting).
- **3D path** (honest): no 3D editor exists yet; the viewport system is the
  component it will consume — 3D preview defaults to the desktop viewport
  with switchable device previews when that milestone lands.

### Bugs found by testing and fixed (session 33)

1. Two more silent no-op patches (E2E sequencing + Go test anchor) — both
   caught by their own suites; fixed with verified edits.
2. Stale API binary rejected models carrying `settings.preview`
   (DisallowUnknownFields) — caught by the E2E persistence check; the API
   binary now restarts with every Go model change.

### Verification (session 33)

- `go vet` clean; full `go test -count=1 ./...` green 10/10; `tsc --noEmit`
  clean; production `next build` green.
- New permanent harness `scripts/e2e-viewport-system.mjs`: **14/14** — app
  hardware frame, safe-area overlay (47px) + model persistence, landscape
  844×390, desktop 1280×800, custom 900×700, zoom 50% scaling, custom
  viewport persistence across reload, game corner ticks (preview + design +
  published), game landscape, design-canvas unification.
- Regression: scene-gameplay 21/21 and asset-studio 25/25 still green.
- Screenshots verified visually: app safe-area bands, game landscape
  hardware shell.
- Known honest gaps: the landing demo keeps its own static phone shell
  (presentation-only, deliberately untouched); 3D consumes the system when
  the 3D milestone lands; zoom persistence is session-local (device/
  orientation/safe-area are project-persisted).
- Servers left running for the user: web :3000, API :8090.

## 41. Work in session 34 (IDEAVEN 4.0 completion pass — audit + M5 + M30)

Directive: complete the entire 4.0 roadmap. STEP 1 first: a full evidence
matrix for M0–M56 now lives in `docs/IDEAVEN_4_COMPLETION_AUDIT.md` — the
roadmap table was stale (sessions 17–33 had already delivered M4, M15,
M38-minimum, M39, M41-core; the matrix re-statuses every milestone with
files/tests/browser evidence and names every remaining gap).

### Completed this session

- **M5 universal search closed**: the Ctrl/Cmd+K palette indexes the OPEN
  project — screens, components (by type/label), handlers (with block
  counts), blocks (by translated label), variables, assets — and jumps
  with context (screen → Design, handler → Blocks with the handler
  selected) via a window event the builder session listens for. The
  palette stays platform-chrome (no builder context import).
- **M30 asset intelligence delivered**: `GET /api/projects/{id}/asset-
  intelligence` (owner-scoped) derives dimensions from real image headers
  (PNG/JPEG/GIF/WebP — no image library), decoded memory estimate, usage
  counts from the canonical model, orphan detection, and honest hints.
  The Assets panel renders the report (stored size, decoded MB, orphan
  count, per-asset dimensions/uses, top hints). Project↔asset stays
  acyclic via a narrow `AssetMediaSource` interface + adapter methods in
  the asset package. `TestAssetIntelligence` covers dimensions/uses/
  orphan/404/401.
- Bugs found by testing: React hook-order crash (usePathname inside an
  effect — minified error #321), a JSX block inserted outside the return
  (silent tsc pass → now verified at runtime), missing orphanCount
  increment, and a test-only import cycle (project↔asset).

### Verification (session 34)

- Full Go suite 10/10 green; tsc clean; production build green.
- Browser: palette finds "score" variable/handler and jumps with context;
  asset intelligence report renders real dimensions (32×32px), stored
  bytes, orphan count and hints in the Assets panel; 0 console errors.
- Per-milestone status/limitation detail: see
  `docs/IDEAVEN_4_COMPLETION_AUDIT.md`.

### 4.0 honest bottom line

COMPLETE: M0–M5, M15, M27(core), M38(min), M39, M41(core), M30.
PARTIAL-with-named-gaps: M6–M9, M11, M13–M14, M16–M20, M25–M26, M36–M37,
M42–M47, M51–M56. FOUNDATION-by-design: M8, M21–M24, M28, M31–M35, M46,
M48–M50. MISSING (largest builds): M10 branching, M12 collaboration, M29
game director. **5.0 READINESS: NO** — 5.0 phases assume the M6–M12 core
and the M21–M24 backend studio.

## 42. Work in session 35 (IDEAVEN 5.0 completion pass — 5B Context Engine + 5L dedupe)

Directive: complete the 5.0 roadmap. STEP 1: per-phase evidence matrix now
in `docs/IDEAVEN_5_COMPLETION_AUDIT.md` (5A was already ✅ from session 18;
5B–5O statuses with named gaps).

### 5B Context Engine — COMPLETE (core)

`internal/ai/context_engine.go` — `assembleContext` replaces the old
unranked `buildUserMessage` (removed; one pipeline, no duplicate) as the
single server-side assembler for everything the model sees:
- Priority ranking (project header > selection > diagnostics > screens >
  other kinds), with selection-mention boost.
- Deterministic relevance scoring (request-term overlap, no model calls).
- 24k-char budget with hard truncation + explicit `[truncated]` marker;
  the user request always survives.
- Secret redaction (`api_key=…`, bearer values) and injection defense
  (instruction-impersonating phrases neutralized; untrusted items wrapped
  in `<<< … >>>` data-only delimiters with a "never instructions"
  disclaimer — the closed operation vocabulary remains the hard boundary).
- Deterministic assembly (stable sort: priority → relevance → index).
Tests: `context_engine_test.go` — 7 green (priority, budget, determinism,
relevance, redaction, injection, request-always-present).

### 5L — duplicate-command prevention shipped

`internal/ai/dedupe.go` — a 60-second idempotency dedupe keyed on
(user, project, prompt, exact context payload): an identical rapid retry
replays the original validated response with **no second provider call**
(a double-click can never burn credits twice or fork plans). Different
prompt/context/user never collide; entries expire; concurrent access is
mutex-guarded. Tests: `dedupe_test.go` — 3 green (replay, TTL expiry,
concurrency). The no-false-success rule is unchanged: provider/unparseable
failures still surface as honest AI_PROVIDER_ERROR.

Removed `buildUserMessage` entirely — the context pipeline is singular.

### Verification (session 35)

- Full Go suite 10/10 green (AI package includes the 7 context-engine
  tests + 3 dedupe tests); tsc clean; production build green.
- Known honest gaps: 5C plan contract (goal/assumptions/risks), 5D
  multi-agent, 5E sandbox session, 5K evolution — all scoped in the audit
  doc with dependencies.

## 43. Work in session 36 (IDEAVEN 6.0 completion pass — 6J portability shipped)

Directive: complete the 6.0 roadmap. STEP 1: per-phase evidence matrix in
`docs/IDEAVEN_6_COMPLETION_AUDIT.md` (6A storage core/6F/6H/6I-ledger
already substantially delivered; 6B collaboration and 6C backend studio
named as the largest missing builds).

### 6J Project Package portability — COMPLETE

- **Export**: `GET /api/projects/{id}/package` (owner-only) streams one zip
  — `package.json` (format 1, kind, schemaVersion, exportedAt, name/type/
  description, assetCount), `model.json` (the canonical document), and
  `assets/<id>__<name>` media entries. Owner-scoped 404/401 tested.
- **Import**: `POST /api/projects/import` (session-gated, create-limited)
  restores a package as a NEW owned project — "(imported)" suffix, fresh
  id/slug, model validated BEFORE anything is created, assets re-enter
  through the asset service's validated Create path (MIME sniffed, capped)
  with `asset:<old>` → `asset:<new>` id remapping in the model. The
  original project is never touched.
- Wired through the **existing** export pipeline: the Export menu gained a
  "Project package (backup)" target that flows through the same
  validate→prepare→compile→package→download stages as every other target.
  The Projects page gained an "Import package" button (Projects → builder).
- Project↔asset stays acyclic (AssetMediaSource interface from M30).

### Bugs found by testing and fixed (session 36)

1. The classic mux conflict: `POST /api/projects/import` with a
   same-path 405 fallback conflicts with `GET /api/projects/{id}` —
   registered method-first without a fallback (documented pattern reused).
2. `AssetInserter` wired before `assetService` existed (nil reference) —
   reordered after the handler wiring.
3. Asset id remap produced `asset:asset:<id>` (inserter returned the full
   reference) — now returns the bare id.
4. The GET package route was lost in a later patch — caught by the browser
   flow (404 on the endpoint), restored and re-verified via curl + browser.
5. Download label for the package target read ".package" — now
   ".zip (project package)".

### Verification (session 36)

- Full Go suite 10/10 green; tsc clean; production build green.
- `TestProjectPackageRoundTrip`: export zip entries (package.json/
  model.json/asset), import creates a NEW project with remapped asset ids,
  foreign 404, anonymous 401.
- Browser: Export menu → package target → real pipeline → "Build complete ✓
  · Download .zip (project package)" → download event fires with a
  package-named zip; Projects page shows the import button. Regressions:
  scene-gameplay 21/21, asset-studio 25/25.

## 44. Session 37 (MASTER CROSS-VERSION AUDIT — verification, no new features)

- `docs/IDEAVEN_MASTER_COMPLETION_MATRIX.md`: all milestones 1.0→7.0
  re-statused against implementation (roadmap checkmarks treated as
  claims).
- `IDEAVEN_FINAL_MASTER_AUDIT.md`: per-version findings, product
  experience audit (fresh browser journeys: landing console sweep,
  signup→dashboard, app+game create→preview with real coin-collision
  scoring, blocks→code, extension shelf, export package, honest 3D
  wizard state), cross-version consistency (ONE of every core system,
  verified by fixed-string greps), honest scores (overall 8.3/10 — below
  the 9.5 bar because collaboration, backend studio, branching/sandbox,
  multi-agent, and 3D remain foundation/missing), and the final decision.
- Final gates re-run: Go suite 10/10 green, tsc clean, build artifact
  present, all 8 browser harnesses green (~160 checks).
- **DECISION: READY FOR BETA** (P0: none; P1: collaboration, 3D, data
  export). 8.0 not started.

## 45. Session 38 (2D Game Engine expansion — PHASE E physics slice, SYSTEM 3)

Directive: evolve the existing 2D foundation into a real 2D engine in
vertical slices. This session delivered **Phase E — the 2D physics
abstraction** as one complete vertical slice (model → registry → editor
fields → preview runtime → blocks UI), reusing the existing scene stage —
no second runtime, no second asset registry.

- **Per-entity physics (canonical props, no schema change)**: bodyType
  (dynamic/static/kinematic), gravityScale (−4..4), bounciness (0..1),
  friction (0..1). Defaults preserve previous behavior exactly.
- **Runtime** (`scene-stage.tsx`): gravity scale applies; grounded friction
  damps residual horizontal motion; landing reflects impact via
  bounciness (impacts > 120 px/s bounce, smaller impacts stop);
  static/kinematic bodies skip gravity.
- **Collision events upgraded**: enter (existing), exit
  (`touches-exit-<id>`), stay (`touching-<id>` throttled ~2 Hz) — all
  dispatched into the block runtime and surfaced in the Runtime trace.
- **Blocks UI**: handler creation offers enter/stay/exit per scene entity
  with human labels ("Touches Coin 1", "While touching Coin 1", "Stops
  touching Coin 1").
- **SYSTEM 16 verified**: delete works consistently for app, 2D-game
  template, and blank game projects (200 + gone), foreign 404, anonymous
  401 — no fix needed; existing architecture confirmed correct.

### Verified (session 38)

- Physics E2E 4/4: gravity+landing, collision enter traced, exit traced,
  stay throttling; tsc clean; full Go suite 10/10 green.
- Export runtime note (honest): exported HTML/Android/Windows still run
  the previous gravity model — gravityScale/bounciness/friction flow into
  the export sceneTick in the next slice (editor preview + published pages
  run the new physics today).

### Not done in this session (honest, per the delivery plan)

Tilemap (SYSTEM 4), lighting (5), sprite shape (6), pixel-perfect camera
(7), camera behaviors (8), sorting layers (9), prefabs (10), particles
(18), input abstraction (19), animation state machine (20), debug overlays
(21), atlas/slicing/pivot deepening (1C–1F), skeletal foundation (2B) —
each is a separate future slice per PHASE F–J.

### Session 38 addendum — export physics parity closed

The honest limitation from the physics slice is now closed: the exported
runtime (HTML/Android/Windows sceneTick) reads the player's gravityScale,
bounciness, and friction from the model props and applies the same math as
the editor preview (gravity scale, grounded friction damping, bouncy
landings). Verified: exported HTML with player gravityScale 0.4 jumps
floatier (player top 604px vs ground 744), exported JS carries
gravityScale/bounciness/friction, 0 page errors. SYSTEM 24 satisfied for
the physics slice — preview and export run the same physics.

## 46. Session 39 (2D engine — PHASE F slice: Tilemap core, SYSTEM 4)

- **Tilemap is a first-class scene entity**: `tilemap` type in the registry
  (cellSize/cols/rows/tiles "col,row:tile;…"/tileColor/collider), rendered
  on the design stage and in the preview runtime from the canonical props.
- **Runtime collision**: filled cells act as a coherent solid surface — the
  player lands on tile cells like a platform (per-cell landing resolution).
- **Persistence**: tilemap lives in the canonical model (props only — no
  schema change), saves/reloads with the project.
- **Verified**: `Tilemap Slice` E2E 3/3 — model save, design-canvas cell
  render, player lands on the tile surface in preview. tsc clean.
- **Export runtime**: tilemap rendering/collision not yet ported to the
  export sceneTick (same honest pattern as physics parity — next slice).
- **Not done (next slices)**: tile palette UI, painting/erase/fill tools,
  rule tiles, multiple layers, export parity.

Per the directive's slice rule, painting tools are the next tilemap slice.

## 47. Session 40 (2D engine — Tilemap painting tools + honest collision fix, SYSTEM 4 complete)

Resumed from the 0/3 checkpoint (tilemap painting / E2E / gates). The working
tree held a half-finished paint gesture (broken `onPointerDown`); the audit
also found that session 39's "per-cell landing" claim was **not true of the
code** — the runtime landed players on the tilemap's whole bounding box and
`ENTITY_SHAPES` never included `tilemap`, so preview never rendered cells at
all. This session made the slice genuinely real end to end.

- **Paint/Erase tools (editor)**: a Tilemap tools group (Select / Paint /
  Erase) appears in the canvas toolbar when a tilemap is selected; with
  Paint/Erase active, a pointer gesture on the tilemap edits cells instead
  of dragging — click paints, drag paints every crossed cell, Erase removes.
  Every cell change commits `tiles` through the normal `updateProps` path
  (canonical model, one undo step per cell, autosave). Grid bounds
  (cols/rows) clamp input; cursor becomes a crosshair; tools reset to
  Select when the selection leaves the tilemap.
- **Shared tile helpers** (`lib/project-model/scene.ts`): parseTiles /
  tilesToMap / tilesToString (row-major deterministic serialization) /
  tilemapCellRects / tilemapCellSize / tilemapGrid — one source of truth for
  the design canvas, preview, and published pages; `scene-stage` re-exports
  `parseTiles` for compatibility.
- **Honest per-cell collision (runtime)**: preview + published pages land
  players on individual painted cells (painted cell = solid, empty cell =
  air) and fire tilemap touch enter/stay/exit per cell overlap — no more
  invisible bounding-box platforms.
- **Preview rendering fixed**: `ENTITY_SHAPES` now includes `tilemap`, so
  cells actually render in Preview and on published pages (the E2E caught
  this — they never rendered before).
- **Export parity closed** (no remaining tilemap export gap): the exported
  HTML/Android/Windows sceneTick carries `tilemap` as an entity, renders
  painted cells, and resolves landing per cell. Runtime-proven: exported
  page player rests at top 712 on a painted cell (748−36) vs 744 on the
  floor — same math as the preview.
- **E2E**: `scripts/e2e-tilemap-paint.mjs` (19 checks) drives the real UI —
  palette add, tool engage, click-paint, drag-stroke, model assertions via
  the API, erase, hard-reload persistence, then Preview: the player moved
  above a painted strip lands ON the cells (bottom ≈ cell top), not the
  floor. 0 console/page errors. Also updated the stale collision-trace
  regex in `e2e-scene-gameplay.mjs` (21/21 green after the session-38
  "collision enter/exit" trace vocabulary).

### Verified (session 40)

- `tsc --noEmit` clean; production `next build` green (dev stopped first).
- `go vet ./...` clean; full `go test -count=1 ./...` green (10/10 packages)
  against live PostgreSQL.
- E2E: tilemap-paint 19/19, scene-gameplay 21/21; export landing proof above.
- Honest notes: single tile type per tilemap for now (tileColor prop); no
  tile-palette picker, no fill tool, no rule tiles / multiple layers yet —
  each stays a future slice. Painting is one undo step per cell.

### Next exact task

Rule tiles or the tile-palette picker (multi-tile painting), then the
camera behaviors slice (SYSTEM 8) — per the 2D engine priority order.

## 48. Session 41 (2D engine — Tile palette: multi-tile painting, SYSTEM 4 completion)

The follow-up slice from §47's next-task list: tilemaps now paint with
multiple tile types, palette-driven, end to end.

- **Palette prop (canonical)**: `palette` "value:#hex;…" on the tilemap
  (registry default 4 entries; editable as a text field). The `tiles`
  payload already carried per-cell tile values — painting now writes them.
- **Toolbar tile swatches**: with a tilemap selected, a swatch row shows
  each palette entry in its color; the active tile (aria-pressed, ring
  highlight) is what the Paint tool writes. The active value is clamped to
  the tilemap's own palette.
- **Per-tile rendering everywhere**: design canvas, preview, published
  pages, and the exported HTML/Android/Windows runtime all resolve each
  cell's color through the palette (fallback: the `tileColor` prop) —
  `tileColorAt` in scene.ts and `tileColorAt` in the export engine are the
  two implementations of the same rule.
- **E2E extended** (`e2e-tilemap-paint.mjs`, now 24 checks): pick "Tile 2"
  from the swatches → paint → the cell renders with `data-tile="2"` in the
  palette color on the design canvas AND in preview; the canonical model
  carries `4,2:2` through save. Export HTML verified to embed the palette
  + per-value cells.
- Gates: `tsc --noEmit` clean; production `next build` green; `go vet`
  clean; full `go test -count=1 ./...` green (11/11 packages) against
  live PostgreSQL; gameplay E2E regression 21/21.

### Honest notes (session 41)

- Palette editing is a text field ("value:#hex;…") — a color-picker editor
  UI is a future polish slice.
- All tile values are solid; per-value collision flags (e.g. non-solid
  decoration tiles) are a future slice.
- No rule tiles yet (neighbor-aware auto-tiling) — still the next tilemap
  slice after this.

### Next exact task

Rule tiles (auto-tiling on paint) or the camera-behaviors slice
(SYSTEM 8: follow/smoothing/bounds/shake) per the priority order.

## 49. Session 42 (resumed on a new machine â?? untracked sessions verified, worker env fixed)

The repository moved to a NEW machine mid-flight (old: C:\Users\ACER\tools,
node 22 / go 1.26.7 / pg 17.4; new: ideaven-v7\tools, node 24.21.0 /
go 1.27.1 / PostgreSQL 16.9, playwright 1.63.0 + chromium-1243 in
%LOCALAPPDATA%\ms-playwright via tools\e2e-runner). The working tree held
several completed-but-unrecorded sessions on top of the docs commit e91459a
(tile palette, cf1d9d1): TASK 12 (credit purchase flow) and TASK 14 (camera
behaviors) were recorded in IDEAVEN_PROGRESS.md only, while RULE TILES
(auto-tiling) and SORTING LAYERS (SYSTEM 9, TASK 15) existed in code with
no record at all — the sorting session was cut off mid-edit. Session 42
verified all of it end to end on the new machine.

- **Worker env fix (real bug, found by the migration)**: the extension build
  worker's env whitelist (internal/extension/build.go workerEnv) dropped
  `LocalAppData`, which is how the Windows Go toolchain locates its default
  GOCACHE — so TestExtensionBuildPipelineAndInstall and
  TestBuildStreamSuccessConflictFailureRetry failed with "build cache is
  required, but could not be located". Matching is now case-insensitive
  (Windows ships mixed-case names: SystemRoot, ComSpec, LocalAppData) and
  LocalAppData/AppData/UserProfile are kept. On Unix nothing changes (the
  extra names are simply absent from os.Environ()).
- **Sorting layers (SYSTEM 9) verified**: scripts/e2e-sorting.mjs (19 checks)
  drives the real UI — sorted editor order against a deliberately wrong model
  order, the "Show order" overlay, the Layer Manager (5 layers back-to-front,
  delete protection for used layers, reorder with undo), order-within-layer
  and stable model-index tie-breaks, the dangling-layer diagnostic with a
  World fallback that never breaks the runtime, then persistence, preview
  parity, published-page parity, and the export pipeline. 0 console errors.
- **Rule tiles verified end to end**: e2e-tilemap-paint.mjs now 29/29 — the
  3×3 block assertion proves interior (4 neighbors) shades darkest, edges
  (3) intermediate, corners (≤2) keep the base palette color, identical on
  the design canvas AND in preview (cellColorFor in scene.ts =
  autoTileColor in export.go).
- **Camera handle completion**: the cut-off session had made the camera
  viewport click-through (pointerEvents none — correct: a 390×844 viewport
  must not swallow clicks for the entities it frames) but left an invisible
  8×8 hit chip. Completed into a visible name-chip handle
  (data-camera-handle="true", re-enables pointer events, select/drag only
  via the chip) and retargeted e2e-camera.mjs to click it.
- **E2E on this machine**: PLAYWRIGHT_MODULE must be a RELATIVE specifier
  (ESM dynamic import rejects C:\ paths):
  `../../tools/e2e-runner/node_modules/playwright/index.js`. The API runs
  on :8090 for E2E (env var beats apps/api/.env's :8081) against the
  portable PostgreSQL in tools\pgdata.

### Verified (session 42)

- `tsc --noEmit` clean; production `next build` green (dev stopped first,
  .next removed).
- `go vet ./...` clean; full `go test -count=1 ./...` green (12/12 packages
  with tests) against live PostgreSQL — including internal/extension after
  the workerEnv fix.
- E2E: e2e-sorting 19/19 (NEW), e2e-tilemap-paint 29/29, e2e-camera 34/34,
  e2e-scene-gameplay 21/21. 0 console/page errors across all four.
- Machine migration documented in docs/LOCAL-DEV-WINDOWS.md.

### Honest notes (session 42)

- **No git binary on this machine**: everything since docs commit e91459a
  (tile palette session 41) — TASK 12, TASK 14, rule tiles, sorting layers,
  this session's fixes — is UNCOMMITTED in the working tree. Install git
  (or restore PATH) and commit as one feature batch; a suggested message is
  in IDEAVEN_PROGRESS_STATE.md.
- The camera acceptance scene's player sits INSIDE the camera viewport, so
  the click-through change is load-bearing there: clicking the player now
  selects the player, not the camera (previously the camera swallowed it).
- Lighting (SYSTEM 5), sprite shape (6) and pixel-perfect camera (7) have
  no code yet; the tilemap still has no fill tool, per-value collision
  flags, or multiple layers; palette editing is still a text field.

### Next exact task

Lighting (SYSTEM 5) per the 2D engine priority order — the next
not-started system after camera behaviors (8) and sorting layers (9).

## 50. Rule tiles / neighbor-aware auto-tiling — the requested TASK 15 slice (completed)

Requested as a continuation ("do NOT rebuild the tilemap system"). Inspection
found a rule-tile implementation ALREADY in place from the cut-off session
verified in §49 — so this slice verified the architecture against the task's
requirements and completed the genuinely missing parts instead of building a
second system. (Numbering note: the repo's internal "TASK 15" is sorting
layers; this entry covers the user-requested rule-tiles task.)

- **Implementation status**: COMPLETE via the existing derived-shading
  architecture. The canonical model already holds the rule configuration
  (`autoTile` boolean prop, registry default true) and the base tile values
  (`tiles` "col,row:tile;…"); the rendered variant is a PURE FUNCTION of the
  canonical state — `autoTileFactor`/`shadeHex`/`cellColorFor` in
  `apps/web/src/lib/project-model/scene.ts`, mirrored by `autoTileColor` in
  `apps/api/internal/project/export.go`. No baked variants, no cascade
  commits, no second architecture.
- **Decision — derive, don't bake**: the task allows "canonical resolved tile
  data when compatible with the existing architecture". Deriving at render is
  the compatible form: the model stores base values, every surface resolves
  identically, save/reload/duplicate/version-restore/publish/export survive
  by construction (it's plain props), and undo/redo is exact because a paint
  commits exactly one `tiles` string through `updateProps`. Recomputing
  "affected cells only" is inherent: each cell's variant is O(1) in its 4
  neighbors, recomputed only when those change.
- **Decision — 4-neighbor**: the shipped rule (interior = 4 painted neighbors
  shades darkest ×0.72, edge = 3 shades ×0.86, ≤2 keeps base) uses the 4
  orthogonal neighbors; kept as-is per "do not guess blindly / use the
  existing architecture". 8-neighbor blob auto-tiling remains a future slice.
- **Files changed**: `apps/web/src/app/builder/[id]/builder/inspector.tsx`
  (rule-tiles explainer in the component inspector, following the existing
  camera/sorting explainer convention — the inspector is English-only by
  existing convention: field labels, both prior explainers);
  `scripts/e2e-tilemap-paint.mjs` (29 → 44 checks). NO engine, model, or
  runtime code needed changes.
- **User-visible changes**: the tilemap inspector now explains rule tiles —
  which tiles participate (all of them while Auto-tile edges is on), what
  they react to (4 painted neighbors), and what happens when neighbors change
  (automatic restyle; base values stay exact). The Auto-tile edges checkbox
  is proven to work by the E2E (off = all cells render base, on = shading
  returns).
- **E2E (44/44, 0 console errors)** — all 29 prior checks kept, 15 added:
  ≤2-neighbor cells keep base; painting the 3rd neighbor restyles the
  survivor base→edge; a 1-neighbor cell stays base; the canonical model keeps
  `autoTile: true` + BASE values (no baked variants); undo restores the exact
  previous canvas state AND canonical tiles; redo restores the exact
  resulting state AND tiles; hard-reload persistence of the rule-tiled region
  with the same variants; erasing a neighbor reverts the survivor (model
  updated); the Auto-tile edges toggle really controls the rendering; preview
  renders the restyled cells exactly like the editor.
- **Gates**: `tsc --noEmit` clean; `next build` green (dev stopped first);
  `go vet ./...` clean; `go test -count=1 ./...` green (12/12 packages with
  tests, live PostgreSQL). Regressions: e2e-scene-gameplay 21/21,
  e2e-camera 34/34, e2e-sorting 19/19.
- **Browser verification**: the E2E drives real Chromium through the exact
  requested flow — open project → Scene → Tilemap → select rule tile → paint
  → paint adjacent tiles → observe automatic variant updates → undo → redo →
  save → reload → preview → verify gameplay (player lands on painted cells) →
  zero console errors. Mobile width: not applicable — the builder paint tools
  are desktop pointer tools and no responsive behavior was touched by this
  slice.
- **Known limitations**: the shading vocabulary is 3 variants (interior/
  edge/base); no per-tile rule variants or 8-neighbor blob auto-tiling; all
  tile values are solid (no per-value collision flags); no fill tool; no
  multiple tilemap layers; palette editing is still a text field.
- **Next exact task**: lighting (SYSTEM 5) per the 2D engine priority order.

## 51. PHASE A — anti-slop integration, design constitution, motion foundation

The master product evolution directive started with PHASE A (anti-slop +
DESIGN.md + motion foundation + one small vertical slice). Executed as one
slice on top of the verified TASK 15 state (§50).

- **Anti-slop integrated** (exact method recorded in `docs/ANTI-SLOP.md`):
  all six skills + `contrast-check.py` installed project-locally in
  `.agents/skills/` (byte-exact via curl from the upstream repo at main),
  the workspace scope the running agent documents for project skills AND the
  cross-tool convention (Codex/Copilot/Antigravity) — chosen over the Codex
  plugin path because no Codex CLI exists on this machine (the directive's
  documented fallback). `AGENTS.md` created at the repo root carrying the
  antislop pointer block plus the repo's own verification-gate rules.
  Verified: frontmatter intact, no user-scope shadowing, no duplicates;
  skills become visible to agents from their next session (discovery at
  session start).
- **Design constitution** (`docs/DESIGN.md`, rewritten): the landing-focused
  doc became the full A–O visual constitution grounded in audited code facts
  — typography hierarchy, spacing rhythm (marketing roomy vs tools dense),
  surface hierarchy (lightness stepping, not shadow stacking), radius
  strategy (audited: lg 142 / xl 56 / full 47 / md 29), border semantics
  (solid = physical, dashed = guide/projection, 2px violet = selection),
  near-zero shadow strategy, icon treatment, color roles + accent
  discipline, data-viz language (mono numerals, flat bars, no invented
  metrics), editor/game-studio visual language, 3D-studio direction (honest:
  not built yet), responsive behavior (builder stays pointer-first),
  accessibility constraints, and the ONE motion system below.
- **Motion foundation** (`apps/web/src/app/globals.css`): motion audit found
  297 motion references — 226 consistent `transition-colors` utilities but
  zero tokens (house bezier repeated inline, duration-300/200/500 ad hoc).
  Now tokens live only in `@theme`: durations instant 0 / micro 90 / quick
  160 / standard 240 / deliberate 420 / emphasis 700 ms; easings enter
  (the house settle curve, previously repeated 4×), exit, press, spatial.
  Tailwind v4 generates `duration-*` / `ease-*` utilities from them, and
  `--default-transition-duration/timing-function` give all 226 existing
  hover transitions the house character with zero per-component edits.
  The existing reveal/skip-link/anim classes were rewired to the tokens
  (same rendered values). A `.press` class adds fast compression
  (scale 0.97, micro + press curve) owning one coherent transition list so
  it composes with color transitions instead of clobbering them.
- **Vertical slice**: `packages/ui/src/button.tsx` — the shared Button
  primitive (54 usages product-wide) moved to `duration-quick` + `.press`.
  One file, whole-product press feedback and tokenized hover.
- **E2E** (`scripts/e2e-motion.mjs`, NEW, 11 checks, 0 console errors):
  computed styles prove tokens reach the browser (colors+transform list,
  0.16s quick hover, 0.09s micro press, house bezier curves); a real
  pointer press compresses to scale(0.97) and releases cleanly; entrance
  reveals carry the 700ms emphasis token and are visible; under emulated
  `prefers-reduced-motion` all durations collapse and reveals render
  visible immediately.

### Verified (session 44 / PHASE A)

- `tsc --noEmit` clean; production `next build` green (dev stopped first).
- E2E: e2e-motion 11/11 (NEW); regressions e2e-tilemap-paint 44/44,
  e2e-scene-gameplay 21/21 — 0 console/page errors.
- One real bug found and fixed by the E2E during development: a `*/` inside
  a CSS comment (`duration-*/ease-*`) terminated the comment and broke the
  globals.css parse — caught as a 500 page, fixed, covered by the suite.

### Honest notes (PHASE A)

- Full UI/copy audit (PHASE B of the directive) has NOT run yet — this
  slice only established the filter, the constitution, and the motion
  system it will enforce.
- Motion coverage is foundation-wide by default (hover transitions) plus
  the Button primitive; modals/sheets/popovers still carry ad-hoc values
  and migrate opportunistically as surfaces are touched.
- Commit still blocked: no git binary on this machine; everything since
  e91459a remains uncommitted (suggested message in
  IDEAVEN_PROGRESS_STATE.md).

### Next exact task

PHASE B — full UI/copy audit of the existing product against the anti-slop
gate + DESIGN.md, producing a prioritized findings list (fix in small
batches), before continuing 2D engine systems (lighting, SYSTEM 5).

## 52. 2D Engine SLICE 1 — Input Abstraction (model-driven actions) + motion-stray sweep

The advanced-gameplay directive ordered SLICE 1 (Input Abstraction) after
repository reconciliation. Reconciliation first: SORTING LAYERS (its
SUBSYSTEM #4) is already complete and verified (§49, e2e-sorting 19/19);
TRIGGERS/AREAS (#5) substantially exist (trigger entities + per-entity AND
per-tilemap-cell touch enter/stay/exit, non-solid by definition); a runtime
TRACE already exists (collision/system traces). None were rebuilt.

- **Model (canonical)**: `ProjectModelInputAction { id, name, keys[], enabled }`
  added as OPTIONAL `screen.inputActions` — the exact `sortingLayers`
  convention: absent field means the DEFAULT set applies, and the default set
  is byte-identical to the previously hardcoded keys (arrowleft/a,
  arrowright/d, arrowup/w/space), so every existing project behaves exactly
  as before with zero migration. The built-in player controls consume three
  reserved, stable IDs: `move-left`, `move-right`, `jump`. Keys are lowercase
  key names — the binding list is the only place a device appears.
- **Editor**: the screen inspector (scene screens) gained an "Input actions"
  panel mirroring the Layer Manager's conventions — name fields, per-action
  key binding fields (comma-separated, deterministic parsing), enable
  toggles, delete, add; built-in actions carry a "built-in" badge and their
  deletion warns in the button title. Empty list deletes the field →
  defaults restore. Every edit is one undoable commit
  (`actions.updateInputActions` → `ops.updateInputActions`).
- **Runtime (preview + published, shared scene-stage)**: device listeners
  translate keys into ACTION state (`pressed` map + `justPressed` edges); OS
  key repeat can never re-trigger an edge (the pressed guard absorbs it).
  The tick is the only consumer: velocity from held actions, jump consumed
  as a just-pressed edge inside the tick (deterministic, once per press,
  cleared at tick end), a real input trace ("input: Jump pressed"), and an
  honest one-time trace when a screen's custom set lacks the movement
  actions. The on-screen touch buttons now enter through the SAME action
  layer (§5.4 satisfied): the loop cannot tell a tap from a keydown.
- **Export parity**: `export.go`'s vanilla engine mirrors the semantics
  1:1 (DEFAULT_INPUT_ACTIONS + inputActionsOf + inputKeyIndex + pressed/
  justPressed consumed per tick), reading the actions from the embedded
  canonical model JSON. The exported Android/Windows runtimes share this
  template.
- **Server**: `model.go` gained the typed `Screen.InputActions []InputAction`
  — REQUIRED, not optional polish: the model PUT round-trips through the Go
  struct, and without the field every save would silently strip user
  bindings. `Enabled` marshals always (false is meaningful).
- **Diagnostics**: a scene with an explicit action set missing/disabling a
  built-in action warns (attached to the player component); an enabled
  action with no keys warns; a key bound to multiple actions informs. The
  default set never warns (it always satisfies the player).
- **Blocks**: deferred by design, not forgotten — the handler/event system is
  per-component while actions are scene-global; a "when action pressed"
  event needs a dispatch decision (emit to every entity carrying such a
  handler) before it can be real. Recorded as the immediate follow-up with
  that sketch; no speculative block shipped.
- **Motion-stray sweep (closing the visual audit)**: 8 ad-hoc values migrated
  to the motion tokens (site-header, loop, showcase ×2, create-project ×2,
  blocks-canvas transition-all → transition-[height] duration-micro), the
  export status dot now uses the house pulse rhythm (`anim-pulse-dot`) and
  the compile progress uses the house `anim-progress-x` sweep.

### Verified (session 45)

- `tsc --noEmit` clean; `go vet ./...` clean; production `next build` green
  (dev stopped first).
- `go test -count=1 ./...` green — 12/12 packages with tests, live
  PostgreSQL (includes internal/project with the new struct).
- E2E `scripts/e2e-input-actions.mjs` NEW: 17/17, 0 console errors — panel
  lists defaults; rebind Jump→j persists in the canonical model; undo
  restores the default set (field deleted) and redo restores the custom
  set; rebinding survives hard reload; preview: ArrowRight moves, the
  rebound j jumps, Space no longer jumps; published page: move-right moves
  the player; export embeds inputActions + the action engine; deleting a
  built-in action raises the diagnostic and the model drops it.
- Regressions: e2e-tilemap-paint 44/44, e2e-scene-gameplay 21/21,
  e2e-camera 34/34, e2e-motion 11/11 — 0 console/page errors.

### Honest notes (SLICE 1)

- Keyboard bindings only: mouse and touch-as-device bindings are not
  implemented and nothing in the UI claims them (the on-screen buttons are
  action sources, which IS the §5.4 contract).
- The action-event block ("when action pressed") is the named next step;
  "action held/value" conditions ride the same future dispatch.
- This machine kills background processes under memory pressure (it
  terminated the dev server/API/PostgreSQL mid-session several times); all
  gates above were run to completion across restarts — no gate was skipped.
- Commit still blocked: no git binary on this machine.

### Next exact task

SLICE 1b — the "when [Action] pressed" handler event (global-action →
per-component dispatch decision + codegen + export dispatch + E2E), then
SLICE 2 (sprite animation foundation) per the directive's order.

## 53. 2D Engine SLICE 1b — "when [Action] pressed" handler event

The input abstraction's event half: a REAL edge-triggered action event that
the runtimes dispatch into the existing block/handler architecture. No second
event bus, no separate registry — the handler lives in the canonical
`screen.logic.handlers` list exactly like every other event.

- **Event identity**: `action-pressed-<actionId>` — the handler stores the
  logical ACTION ID, never a physical key, so rebinding Jump from Space to W
  never touches handlers, and renaming an action never breaks one (ids are
  stable). Events are offered from the same `screen.inputActions` data the
  Input Actions panel edits — one source of truth.
- **Dispatch architecture** (global action → per-component fan-out):
  `runtime.dispatchActionPressed(actionId)` (runtime.ts) — the live screen's
  SCREEN-level handlers first, then component handlers in model order
  (nested components included); only components carrying a matching handler
  are visited, so zero-handler components never even trace. Returns the
  handler count. The scene loop calls it once per just-pressed edge, in
  action-set (model) order, before physics — script dispatch runs before
  physics per the documented tick order. `export.go` mirrors the same
  fan-out 1:1 over the embedded model (all three export targets).
- **Block mode**: the event picker lists "When {action} pressed" for every
  ENABLED action of the scene, for the screen and for every entity; labels
  resolve the action's display name (deleted actions render as
  "When "<id>" (deleted)"); handler-list labels resolve the same way.
  i18n: `block.event.action-pressed` + `block.event.action-pressed-named`
  in EN and ID.
- **REAL BUG FOUND AND FIXED (pre-existing, exposed by this slice)**: Go's
  `ComponentID *string json:"componentId,omitempty"` OMITS the field for
  screen-level handlers, so after save+reload the client saw
  `componentId: undefined` — and `undefined === null` never matched. Any
  screen-level handler was dead after a round-trip (screen events like
  initialize silently broken after reload). Fixed by normalizing
  `(handler.componentId ?? null)` in `handlersFor`, the new dispatcher, and
  the export mirror. The E2E caught it: the screen-level handler dispatched
  in the live builder but not after reload.
- **Diagnostics**: a handler reacting to a DELETED action warns ("will never
  fire … re-add the action or delete this handler"); a handler reacting to a
  DISABLED action warns. The handler itself is never erased.
- **Trace**: the dispatch rides the existing runtime trace
  ("event screen:action-pressed-jump → action handler", "event
  p-player:action-pressed-jump → 1 handler") — no second tracing system.

### Verified (session 46)

- E2E `scripts/e2e-input-actions.mjs` extended 17 → 32 checks, 32/32, 0
  console errors: picker lists the action event from the model; handler
  created through the REAL UI (undo removes it, redo restores it via the
  existing history); persisted in the canonical model; ONE press dispatches
  to BOTH handlers (exactly +2 trace lines) with the visible effect
  (set-property changed the HUD text); HOLDING fires nothing further (true
  edge trigger); RELEASING fires nothing (pressed-only); release+press
  dispatches again (+2); published page: movement AND the handler's visible
  effect work; export embeds inputActions + the fan-out dispatcher + the
  handler; deleting a built-in action warns (movement) and deleting the
  action a handler listens to raises the broken-reference diagnostic while
  the handler survives.
- Regressions: e2e-tilemap-paint 44/44, e2e-scene-gameplay 21/21,
  e2e-camera 34/34, e2e-sorting 19/19, e2e-motion 11/11 (one dev-mode
  console artifact on the first motion run — a page compiled mid-request —
  clean on re-run; not a product error).
- `tsc --noEmit` clean; `go vet ./...` clean; `go test -count=1 ./...` green
  (12/12 packages with tests, live PostgreSQL); production `next build`
  green (dev stopped first).

### Honest notes (SLICE 1b)

- Mouse/gamepad bindings still do not exist (nothing claims them); the
  action event fires for actions from ANY source that enters the action
  layer (keyboard + the on-screen buttons).
- "Action held / action value" conditions remain future work; only the
  pressed edge is a block event today.
- The screen-level `componentId: undefined` wire quirk is fixed at the three
  dispatch/matching sites; the diagnostics panel's "where" label still
  prints "Component undefined" for a reloaded screen-level handler
  (cosmetic, pre-existing, untouched).
- Commit still blocked: no git binary on this machine.

### Next exact task

STOP per the directive — await explicit approval. The queued next slice
remains SLICE 2 (sprite animation foundation).

## 54. 2D Engine SLICE 2 — Sprite Animation Foundation

Sprite animation is now a real runtime capability: a sprite entity can carry
animation CLIPS (ordered asset-frame refs, fps, loop), the runtimes animate
the displayed frame by elapsed time, and block/action logic can switch or
stop clips. No second asset/sprite/animation architecture was created — the
canonical string-payload convention carries the data.

- **Canonical representation**: per-entity props — `animations`
  ("id~name~fps~loop~frame1,frame2,…;…" — the same scalar-string convention
  as tilemap tiles/palette, since PropsMap is scalar-only) and `animation`
  (the active clip id played on run start). Frames are the entity's OWN
  asset refs ("asset:<id>" or URL) — identical format to `src`; Asset Studio
  PNGs become frames without duplicating a byte. Survives
  save/reload/duplicate/publish/export by construction (props only; the Go
  side stores props as a free map, so no schema change was needed).
- **Helpers** (`scene.ts`, one source of truth):
  parseAnimations/animationsToString (deterministic round-trip, fps clamped
  1–60), clipFrameIndex (elapsed-seconds × fps; looping clips wrap,
  non-looping clips CLAMP at the last frame and never silently restart),
  clipCompleted, activeAnimation (active id or first clip).
- **Runtime (preview + published, shared scene-stage)**: playback state is a
  runtime ref map (componentId → {clip, elapsed, paused, done}) seeded at
  run start; the tick advances `elapsed += dt` and derives the frame index —
  no per-render advancement, no setInterval. Non-looping clips mark
  completed and freeze on the last frame. Blocks queue
  play/pause/restart/stop commands (the camera-shake command pattern);
  the loop drains them against runtime state only — never the model.
  EntityView renders the clip's current frame (falling back to the
  entity's static src when a frame asset is missing — never a crash, never
  invented data).
- **Blocks**: real statements `play animation {animationId} on
  {componentId}` and `stop animation on {componentId}` (blocks.ts registry,
  runtime executeBlock, codegen `api.playAnimation/api.stopAnimation`,
  export runBody + tick drain) — full editor representation, canonical IR,
  codegen, runtime behavior, export behavior.
- **Editor UX**: the sprite inspector gained an Animation section — clips
  with name/fps/loop/active-radio, frame thumbnails with reorder
  (↑/↓) and remove, "add frame from assets…" (the project's real asset
  library), and an editor-local Play/Pause/Restart preview (rAF at the
  clip's fps). One undoable commit per edit; preview state never touches
  the model.
- **Export**: the exported runtime parses the same clips from the embedded
  model, seeds playback per scene, advances by dt in sceneTick, swaps the
  img src only when the frame actually changed (`data-frame-ref` guard),
  and drains the same play/stop commands (all three export targets — the
  Android/Windows shells run the same standalone HTML).

### Verified (session 47)

- E2E `scripts/e2e-sprite-animation.mjs` NEW: 18/18, 0 console errors —
  three REAL PNGs uploaded through the asset API; the animations string
  survives the model round-trip; the inspector lists both clips with real
  asset thumbnails; the editor preview cycles frames; a frame added
  through the panel undoes and redoes (verified against the canonical
  model); the preview sprite ACTUALLY animates (multiple distinct frame
  srcs over time); the SLICE 1b action path ("when Jump pressed") switches
  to the second clip; the non-looping clip completes and STOPS on its last
  frame; the published page animates; the export embeds clips + playback
  engine + the play-animation block; a missing frame asset produces no
  runtime error.
- Regressions: e2e-input-actions 32/32, e2e-tilemap-paint 44/44,
  e2e-scene-gameplay 21/21, e2e-camera 34/34, e2e-sorting 19/19,
  e2e-motion 11/11.
- `tsc --noEmit` clean; `go vet ./...` clean; `go test -count=1 ./...` green
  (11/11 packages with tests, live PostgreSQL — correcting earlier reports
  that said 12: the suite has eleven test-bearing packages); production
  `next build` green.

### Honest notes (SLICE 2)

- Editor playback state and clip authoring live in the entity inspector;
  the Asset Studio's localStorage SpriteDoc is UNCHANGED — the bridge to
  the runtime is the saved frame PNGs (upload → asset ref → clip frames),
  which is the existing asset pipeline, not a new one.
- The block vocabulary is play/stop only (pause/restart exist in the
  runtime command set and inspector preview; block definitions for them
  were skipped to avoid speculative palette entries — trivial to add on
  request since the command path already supports them).
- e2e-motion once flaked on the press-timing check when run last in a
  6-suite chain under memory pressure; the check now polls for the pressed
  transform (bounded wait) and is green repeatedly, solo and chained.
- Commit still blocked: no git binary on this machine.

### Next exact task

STOP per the directive — await explicit approval. Queued: SLICE 3
(animation state machine) or the remaining 2D systems (lighting, particles)
per the master priority order.

## 55. 2D Engine SLICE 3 — Sprite Animation State Machine

Animated sprites can now carry a real STATE MACHINE that automatically
switches between clips from actual game state — no frame manipulation, the
machine drives the SLICE 2 animation player. No second animation system: the
machine lives in one more canonical prop and reuses everything from SLICEs
1b/2.

- **Canonical representation**: the entity's `animator` prop — a
  deterministic string payload (same scalar-prop convention as
  animations/tiles) of prefixed entries: `S:<id>~<name>~<clipId>~<speed>`
  (states reference animation CLIPS by id — no frame duplication),
  `P:<name>~<type>~<initial>` (parameters: bool | number | trigger),
  `T:<from>~<to>~<order>~<exitTime>~<conds>` (transitions; `from` may be
  `*` = Any State; conditions join with `&&`, operators == != > >= < <=),
  `D:<stateId>` (default state). Survives save/reload/duplicate/publish/
  export by construction. Current state + parameter values are RUNTIME
  state, never model writes.
- **Helpers** (`scene.ts`): parseAnimator/animatorToString (deterministic
  round-trip; a missing default falls back to the first state),
  parseAnimatorConditions/animatorConditionsToString,
  animatorConditionSatisfied, evaluateAnimatorTransitions (pure, explicit
  priority order → model order tie-break, at most ONE switch per
  evaluation — no same-tick chains).
- **Runtime** (preview + published, shared scene-stage): the machine is
  parsed once per run into the entity's playback state; built-in parameters
  (`speed`, `isGrounded`) are fed EVERY tick from the player's actual
  physics (|vx|, grounded) — a machine can condition on them without
  declaring anything, and no physical key ever appears in the machine.
  Custom parameters are fed by blocks; triggers reset after each
  evaluation pass (fire-once semantics). A taken transition drives the
  SLICE 2 player: switch to the target state's clip, elapsed = 0, and the
  state's speed multiplies playback. The PlayerView now renders the
  machine's current frame instead of the color shape.
- **Blocks**: real statements `set animation parameter {name} of
  {componentId} to {value}` and `trigger animation parameter {name} of
  {componentId}` — IR (blocks.ts), runtime executeBlock, codegen
  (api.setAnimationParam / api.triggerAnimationParam), export runBody, and
  the tick drain handle them. State switching stays in the machine (no
  set-state block this slice — it would bypass transitions).
- **Editor UX**: the sprite/player/enemy inspector gained an "Animation
  state machine" section — enable flow (creates the machine with a default
  state), states (name, clip select from the entity's real clips, playback
  speed, default radio, delete with transition cleanup), parameters
  (typed, initial values, add/delete), transitions (from incl. Any State
  with a deleted-state marker, to, priority, exit time 0–1, deterministic
  condition text like `speed>0 && attack==1`). Every edit is one undoable
  commit. The panel renders for sprite, player and enemy entities.
- **Diagnostics**: a state referencing a missing clip; a missing default
  state (runtime falls back to the first state); transitions referencing
  deleted states; conditions reading unknown parameters (count as false).
  The runtime never crashes and never invents replacements.
- **Export**: the exported runtime parses the same machine from the
  embedded model, feeds the same built-ins from the real player physics,
  runs the identical deterministic evaluator, drains the same parameter
  commands, and applies the state's speed — full parity across all three
  export targets.

### Verified (session 48)

- E2E `scripts/e2e-animation-state-machine.mjs` NEW: 20/20, 0 console
  errors — eight real PNGs uploaded (four clips, distinct colors); the
  machine survives the round-trip; the panel lists states/parameters/
  transitions; the REAL playable flow: starts in Idle (default) → movement
  (speed>0) switches to Run → stopping returns to Idle → jumping enters
  Jump while airborne (Any-transition from Idle/Run) → landing returns to
  Idle → a dedicated Attack action fires the trigger → Any State → Attack
  (non-loop) → completion (exit time 1) returns to Idle → all of it again
  after save + reload → the published page runs the same machine → the
  export embeds the machine + evaluator + parameter blocks; a state
  referencing a missing clip raises a diagnostic and the runtime stays
  error-free.
- Regressions (7 suites): e2e-input-actions 32/32, e2e-tilemap-paint 44/44,
  e2e-scene-gameplay 21/21, e2e-camera 34/34, e2e-sorting 19/19,
  e2e-motion 11/11, e2e-sprite-animation 18/18.
- `tsc --noEmit` clean; `go vet ./...` clean; `go test -count=1 ./...`
  green (11/11 packages with tests, live PostgreSQL); production
  `next build` green.

### Honest notes (SLICE 3)

- Exit time is a progress FRACTION (0–1) of the current clip — seconds-based
  exit times and cross-fade blending are not represented (documented, not
  faked). Non-loop completion (exit time 1) works through real clip
  completion.
- No "set animation state" block: direct state writes would bypass
  transition semantics; the machine is the only state authority.
- The graph visualization is a structured list editor (states, parameters,
  transition rows) in the existing inspector design — not a node canvas;
  mobile reflow follows the existing inspector patterns.
- The parameter-block value slot is an expression; the panel edits
  initial values as text.
- Commit still blocked: no git binary on this machine.

### Next exact task

STOP per the directive — await explicit approval. Queued: skeletal
animation is out of scope until requested; the remaining 2D systems are
lighting and particles per the master priority order.

## 56. 2D Engine SYSTEM 5 — Real-time 2D Lighting

Lights now actually illuminate the rendered scene: an ambient veil darkens
the world and point lights brighten it back locally, composited over the
existing DOM renderer in preview, published, and export alike. No second
renderer, no WebGL, no decorative gradients — the pass is real compositing
whose output is the visible brightness of every world object.

- **Canonical representation**: point lights are a proper scene entity —
  new component type `light` (registry category Game Entities, following the
  camera's configuration-entity pattern: selectable/movable on the stage,
  never colliding, never firing touch events). Persisted props: enabled,
  color (#hex), intensity (0–5), radius (8–2000); position comes from the
  entity transform (rect center) — no second transform system. AMBIENT
  light lives in the scene screen's styles: `ambientColor` + `ambientIntensity`
  (0–1). Both survive save/reload/duplicate/publish/export by construction;
  the Go side stores props/styles as free maps, so no schema change.
- **Rendering semantics** (smallest real architecture for the existing DOM
  renderer): a single world-anchored compositing layer inside the
  camera-translated world container, offset each frame by the camera origin
  so it covers exactly the visible region — an ambient veil
  (screen.styles color at opacity 1 − intensity) plus one radial-gradient
  disc per enabled point light with `mix-blend-mode: screen`
  (additive over the veil). Ambient 1 → no veil (normal brightness);
  ambient 0.25 → the world darkens to 75% and a point light locally lifts
  and tints it. Everything beneath the veil in the world container is lit:
  sprites, colored shapes, animated frames, tilemap cells. HUD/preview
  chrome stays outside the world container → unlit.
- **Determinism & safety**: all values clamp at parse time (intensity 0–5,
  radius 8–2000, ambient 0–1, invalid hex colors fall back) — NaN/negative/
  unbounded light cannot exist. Documented limits: ≤ 8 active point lights,
  radius ≤ 2000. The layer derives per frame from configuration + camera —
  no light state is ever persisted, no per-light canvases, no React state
  churn (the layer re-renders with the existing per-frame tick).
- **Camera integration**: the layer is world-anchored (offset by the camera
  origin incl. shake), so lights stay attached to world objects as the
  camera follows the player. **Sorting untouched** (the layer renders after
  all entities without reordering anything). **Animation untouched**
  (lighting is an overlay; frame state is never read or written).
  **Tilemap**: cells sit inside the lit world container — the same light
  affects tiles at render time; canonical tile values never change.
- **Editor**: the Light entity renders in the palette + tree + canvas with a
  glowing-dot handle and a dashed RADIUS RING gizmo reflecting the real
  configured radius/color (editor-only, pointer-events none, never
  exported). The inspector exposes Enabled / Light color / Intensity /
  Radius via the generic field renderer. The screen inspector's Appearance
  section gained Ambient color + Ambient intensity (scene screens).
- **Diagnostics**: light intensity outside 0–5, radius outside 8–2000, a
  non-hex light color, and ambient intensity outside 0–1 all warn (the
  runtime clamps; nothing crashes).
- **Blocks**: none added (§20) — light toggling has no requested gameplay
  use yet; the command-path pattern from SLICE 2/3 is the obvious extension
  point when needed.

### Verified (session 49)

- E2E `scripts/e2e-2d-lighting.mjs` NEW: 19/19, 0 console errors — gizmo on
  the canvas; inspector fields; an intensity edit commits, undoes, and
  redoes against the canonical model; the lighting layer composites with
  ambient darkness opacity exactly 1 − intensity (0.75 at 0.25); the point
  gradient renders at exactly 2×radius in the light's color with screen
  blending; the layer tracks the moving camera; a disabled light removes
  only its gradient; the tilemap renders inside the lit world; preview
  chrome stays unlit outside the container; out-of-range values clamp
  safely AND raise diagnostics; the published page composites the same
  layer; the export ships the engine (layer + ambient + point parse).
- Regressions (8 suites): input-actions 32/32, tilemap 44/44, gameplay
  21/21, camera 34/34, sorting 19/19, motion 11/11, sprite-animation 18/18,
  animation-state-machine 20/20.
- `tsc --noEmit` clean; `go vet ./...` clean; `go test -count=1 ./...` green
  (11/11 packages with tests, live PostgreSQL); production `next build`
  green.

### Honest notes (SYSTEM 5)

- Point lights illuminate by compositing (screen blend over an ambient
  veil) — per-pixel normal-map shading and shadows/occlusion are not
  represented (nothing blocks light). Documented, not faked.
- Directional and spot lights intentionally not implemented (different
  architecture; the directive's smallest-useful set is ambient + point).
- Lights are excluded from sorting/collision by design; they draw no
  gameplay presence.
- The inspector labels follow the inspector's English-only convention
  (documented since the Input Actions slice).
- Commit still blocked: no git binary on this machine.

### Next exact task

STOP per the directive — await explicit approval. Queued: particles per
the master priority order.

## 57. 2D Engine SYSTEM 18 — Real 2D Particle / VFX System

Particles are a real runtime system: a new `emitter` scene entity holds the
authored configuration; a bounded simulation spawns, ages, and recycles real
particle instances each tick; the instances render to ONE world-anchored
canvas (emissive — drawn above the lighting layer). One architecture, shared
by the runtime, the editor preview, and the export engine.

- **Canonical representation**: the `emitter` entity's props — enabled,
  emissionRate (0–500/s), lifetime (0.05–30 s), speed (0–2000), direction
  (degrees, 0 = up), spread (0–360°), startSize/endSize (0–500),
  startOpacity/endOpacity (0–1), gravity (−2000–2000 px/s², independent of
  world gravity), color (#hex), maxParticles (1–1000), loop, burstCount,
  texture (optional asset ref — absent = colored circle; no new binary
  assets). Survives save/reload/duplicate/publish/export by construction.
- **Core simulation** (`lib/project-model/particles.ts` — ONE implementation,
  used by the runtime AND the editor preview, mirrored in vanilla JS for the
  export): `parseEmitter` (clamped, NaN/Infinity-proof) + `ParticleSim` —
  continuous emission through a TIME ACCUMULATOR (fractional emission
  carries across frames; no drift), cone spawning (direction ± spread/2),
  age += dt, velocity += gravity·dt, position += velocity·dt, size/opacity
  interpolated start→end over the lifetime, swap-remove recycling at
  age ≥ lifetime, and a hard bound: arrays never exceed maxParticles (cap
  1000). loop=false emits for one lifetime window and stops until restarted.
- **Rendering**: ONE bounded `<canvas data-particle-canvas>` per scene —
  world-anchored (offset by the camera origin incl. shake), drawn
  imperatively in the tick (no DOM nodes per particle, no React state per
  particle, canvas cleared + redrawn per frame), `data-particle-count` for
  observability. Particles are EMISSIVE: the canvas draws above the
  lighting layer, so lighting does not darken them (documented decision —
  sparks/glow are emissive in this renderer).
- **Blocks**: `burst {count} particles on {emitter}` — IR (blocks.ts),
  runtime executeBlock → particleCommands, codegen
  `api.burstParticle(componentId, count)`, export runBody + tick drain.
  Play/stop blocks skipped: the `enabled` prop covers authoring and no
  runtime toggle need exists yet (command path ready).
- **Editor**: the Particle Emitter renders in the palette/tree/canvas with a
  direction-cone handle gizmo (editor-only, never exported); all properties
  are inspector fields via the generic renderer.
- **Diagnostics**: emission rate outside 0–500/s, lifetime outside
  0.05–30 s, max particles outside 1–1000, non-hex color — warnings; the
  runtime clamps and stays stable (verified with rate 9999, lifetime −5,
  maxParticles −20, garbage color).

### Verified (session 50)

- E2E `scripts/e2e-2d-particles.mjs` NEW: 22/22, 0 console errors — emitter
  config persists; canvas gizmos; inspector fields; rate edit
  commits/undoes/redoes; continuous emission reaches a spawn/expire
  EQUILIBRIUM (rate × lifetime); canvas pixel evidence of real drawing;
  camera movement while particles stay world-anchored; bounded counts;
  action-event burst spikes the count and expiry drains it; published
  runtime runs the same system; export embeds config + sim + burst block;
  invalid configs diagnosed with the runtime stable.
- Regressions (9 suites): input-actions 32/32, tilemap 44/44, gameplay
  21/21, camera 34/34, sorting 19/19, motion 11/11, sprite-animation 18/18,
  animation-state-machine 20/20, lighting 19/19.
- `tsc --noEmit` clean; `go vet ./...` clean; `go test -count=1 ./...` green
  (11/11 packages with tests, live PostgreSQL); production `next build`
  green.

### Honest notes (SYSTEM 18)

- Per-particle rotation is not implemented (no authored field consumes it);
  textures draw un-tinted (color applies to procedural circles only) —
  canvas tinting needs offscreen compositing, deferred.
- Emissive/unlit is the only lighting mode (documented decision from the
  renderer's capability; light-reactive particles would need a different
  compositing design).
- The editor preview reuses the same sim class (Spawn/update math shared);
  the visual canvas is editor-local.
- Commit still blocked: no git binary on this machine.

### Next exact task

STOP per the directive — await explicit approval before the next 2D engine
task.

## 58. TASK 51 — 3D Engine Foundation (real model-driven 3D)

The 3D path moved from "foundation in development" placeholder to a REAL
vertical slice: a 3d project opens a software-rendered 3D viewport with
primitives, a canonical camera, inspector transforms, persistence, and
published/export parity. Full detail in `docs/TASK51_3D_FOUNDATION.md`.

- **Renderer decision**: custom software 3D renderer on Canvas 2D
  (`lib/render3d.ts` + vanilla mirror in export.go) — perspective camera,
  near clipping, backface culling, painter's depth sort. No 3D library: the
  primitives are exactly the software renderer's sweet spot, the export
  runtime ships inline vanilla JS (no bundling pipeline), and zero bundle
  weight is added to exported games. REAL 3D: full camera transform and
  depth behavior — proven by a pixel-sampled occlusion swap (the nearer
  cube's color wins the overlap; moving it behind the camera plane swaps
  the winner).
- **Canonical model**: project type "3d" (web union, Go vocabulary,
  migration 056 replacing projects_type_check — found because POST /api/
  projects with type 3d returned 500 against the DB constraint); entities
  cube3d/sphere3d/plane3d/camera3d with scalar transform props px/py/pz,
  rx/ry/rz, sx/sy/sz + color/visible; camera3d fov/near/far/active.
- **Editor**: Viewport3D (orbit navigation, grid, axes, click-select with
  violet outline) replaces the 2D stage for 3d projects only; the palette
  gains a "3D Objects" category (Cube/Sphere/Plane/Camera) gated to 3d
  projects; inspector transforms are generic fields — every edit an
  undoable commit.
- **Runtime parity**: preview-mode and live-app (published) mount the SAME
  Viewport3D in runtime mode with the scene's active camera3d; export.go
  embeds a vanilla mirror (draw3D/render3DScene over data-3d-canvas).
- **Diagnostics**: no camera / no active camera (runtime falls back to a
  default view), FOV outside 20–120, near ≥ far.
- **Bugs fixed en route**: the DB type constraint (500 on create — migration
  056); Go fmt-verb escapes (`%%`) and backticks in the template; orbit
  camera look-at signs.

### Verified (session 51)

- E2E `scripts/e2e-3d-foundation.mjs` 18/18, 0 console errors (depth
  occlusion + swap, palette insert, inspector transforms, undo/redo,
  malformed fov/transform stability, preview/published pixel evidence,
  export markers).
- Regressions (10 suites): input-actions 32/32, tilemap 44/44, gameplay
  21/21, camera 34/34, sorting 19/19, motion 11/11, sprite-animation 18/18,
  animation-state-machine 20/20, lighting 19/19, particles 22/22.
- tsc clean; go vet clean; go test 11/11 packages; next build green.

### Honest notes

- Status FUNCTIONAL/TESTED, not PRODUCTION READY: no 3D gameplay/physics/
  lights/materials/animation; painter's algorithm (no z-buffer — separated
  convex primitives correct, intersecting meshes approximate); no transform
  gizmo (inspector is the editing path); palette/inspector labels follow the
  inspector's English-only convention.
- Android/Windows exports embed the same standalone HTML (3D works there);
  no native GPU acceleration claim.
- Commit still blocked: no git binary on this machine.

### Next exact task

STOP per the directive — await explicit approval before TASK 52.

## 59. TASK 53 — 3D Scene Hierarchy + Parenting + Local/World Transform

The structural layer of the 3D editor: entities can be PARENTED
(`props.parentId`, scalar, canonical — child lists derived), local
transforms stay the only authored data, and world transforms are DERIVED as
`parent.world × local` (translation + rotation + scale all compose). Full
record in `docs/TASK53_3D_HIERARCHY.md`.

- **Evaluation** (`lib/hierarchy3d.ts`): deterministic memoized recursion —
  cycle/self-parent/missing-parent branches evaluate as ROOTS (stable
  runtime, model never mutated), hard depth limit 32, issues surfaced as
  warnings (cycle, self-parent, missing parent, excessive depth).
- **Renderer**: `Mesh3D.matrix` (world, column-major mat4) consumed by
  `meshFaces` — the painter's sort/cull/camera pass unchanged. mat4 helpers
  (identity/multiply/composeTRS/transformPoint) live in render3d.ts.
- **Editor**: Hierarchy panel inside the 3D viewport (derived tree,
  expand/collapse, click-select synced with viewport + inspector,
  duplicate-subtree + delete buttons); inspector "Hierarchy" section with
  Parent picker (self + descendants excluded — cycles impossible via UI),
  read-only derived world position, Duplicate subtree, Delete
  (children reparent to the grandparent — documented semantics). Ops:
  setParent3D / duplicateHierarchy3D / removeComponent3D — each one
  undoable commit.
- **Export**: vanilla mirror of the hierarchy evaluation
  (`computeWorldMatrices3D`/`meshFaces3DWorld`) over the embedded model —
  all three web targets carry hierarchy parity (shells run the same HTML).
- **Playwright E2E** (`scripts/e2e-3d-hierarchy.mjs`) 17/17, 0 console
  errors — including VISUAL evidence: pixel centroids of the child cube
  move when the parent moves and re-orbit when the parent rotates 90°; the
  grandchild renders under a scaled parent; parentId chains persist across
  save/reload exactly; duplicate subtree remaps ids; delete reparents; a
  raw-model cycle raises a diagnostic with the runtime error-free.
- Regressions (11 suites): 3d-foundation 18/18, input-actions 32/32,
  tilemap 44/44, gameplay 21/21, camera 34/34, sorting 19/19, motion 11/11,
  sprite-animation 18/18, animation-state-machine 20/20, lighting 19/19,
  particles 22/22.
- tsc clean; go vet clean; go test 11/11 packages with tests; production
  next build green.

### Honest notes

- Exit at this slice: no world→local editing, no DnD reparenting, no
  parent-child gizmo lines, depth limit 32, painter's algorithm (no
  z-buffer), English-only inspector labels (convention), commit still
  blocked (no git on this machine).

### Next exact task

STOP per the directive — await explicit approval before TASK 54.

## 60. TASK 54 — Real 3D Physics Foundation (collider + rigid body + gravity + trigger + collision)

The 3D engine gains real, deterministic, model-driven physics. Entity props
carry the configuration (`bodyType` none/static/dynamic, `colliderType`
none/box/sphere, collider size/radius, `isTrigger`, `gravityEnabled`,
`mass` — all canonical scalar props, no schema change); scene styles carry
`gravityX/Y/Z` (default 0/−9.81/0, clamped ±100). Collider dimensions
multiply the entity's world scale — the same convention the editor gizmos
draw, the web runtime simulates, and the export simulates. Full record in
`docs/TASK54_3D_PHYSICS_FOUNDATION.md`.

- **Solver** (`lib/physics3d.ts`, new): fixed timestep 1/120 s with ≤ 4
  catch-up steps; world-aligned box/sphere colliders; box/box
  minimum-translation, sphere/sphere distance, sphere/box closest-point;
  positional correction split by **inverse mass** (static = infinite),
  velocity correction along the normal (no bounce); grounded on upward
  contacts (ny > 0.5); trigger enter/stay/exit via tracked pairs; bounded
  limits (64 bodies, gravity ≤ 100, collider ≤ 1000, mass ≤ 10000).
- **Runtime**: physics seeds once per mount in the mount-stable 3D rAF loop
  (refs mirror the model — React re-renders never re-seed); dynamic bodies
  render at simulated positions (translation overridden in the world
  matrix); trigger events dispatch through the EXISTING `touches-` /
  `touches-exit-` handler vocabulary — no new event architecture.
  Observability attributes on the canvas: `data-physics-bodies`,
  `data-trigger-overlaps`, `data-physics-grounded`.
- **Export** (`export.go`): vanilla JS mirror of the solver
  (`overlapBetween` is sphere-aware); `render3DScene` is idempotent per
  screen (a trigger-handler rerender refreshes meshes/camera only — it can
  no longer re-seed physics mid-run or stack rAF loops; monotonic run-id
  stops superseded loops); exported runs reflect `set-property` via
  runtime props; same observability attributes for identical testability.
- **Editor**: amber/dashed-mint collider gizmos (editor-only);
  Physics3DPanel in the inspector (Body, Collider, Size X/Y/Z / radius,
  Trigger, gravity, Mass); scene gravity X/Y/Z fields; diagnostics for
  out-of-range mass/collider values.
- **Real regressions found by the suites and fixed in this task**:
  (a) the physics restructure had dropped world matrices for non-dynamic
  meshes (hierarchy broke in preview — caught by e2e-3d-hierarchy pixel
  centroids); (b) the state-machine panel gating had narrowed to
  `sprite` only (player/enemy lost the panel — caught by
  e2e-animation-state-machine); (c) the penetration split was
  mass-weighted instead of inverse-mass-weighted; (d) export `emit()`
  rerender could rebuild the 3D canvas mid-run (hang).

### Verified (session 53)

- Playwright E2E `scripts/e2e-3d-physics.mjs` **24/24, 0 console errors** —
  including the directive's measurable physics evidence: player falls from
  Y 5 (sampled every 60 ms), lands at y ≈ 0.5 (ground top + half extent)
  without penetrating (min Y > 0.35, no tunneling), grounded becomes true,
  rest is stable (no sinking), restart restores py 5 and clears grounded,
  trigger overlap fires while falling through an elevated band and the
  `touches-e-zone` handler recolors the player blue→rose (≥ 10 000 exact
  rose pixels), published runtime lands identically, and the EXPORTED HTML
  opened from disk runs its own vanilla physics (lands + grounded, no page
  errors).
- Regressions (12 suites): 3d-foundation 18/18, 3d-hierarchy 17/17,
  input-actions 32/32, tilemap 44/44, gameplay 21/21, camera 34/34,
  sorting 19/19, motion 11/11, sprite-animation 18/18,
  animation-state-machine 20/20, lighting 19/19, particles 22/22.
- tsc clean; go vet clean; go test 11/11 packages; production next build
  green (dev stopped, `.next` removed first).

### Honest notes (TASK 54)

- No rotation in collision response (world-aligned AABBs; rotated
  colliders approximate their AABB), no rigid-body torque, no
  friction/restitution, no joints, no raycasts, no character controller.
- Sphere colliders are true spheres in the solver; rendered spheres are
  faceted tessellations (radius agrees, tessellation is visual).
- No physics debug overlay yet (observability attributes only).
- Commit still blocked: no git binary on this machine.

### Next exact task

STOP per the directive — await explicit approval before TASK 55.

## 61. TASK 55 — Real 3D Material + Lighting Foundation

The 3D engine gains real material and lighting INSIDE the existing software
rasterizer — no renderer replacement (Task 51's architecture decision
re-validated during reconnaissance), no DOM overlay, no fake lighting. Full
record in `docs/TASK55_3D_MATERIAL_LIGHTING.md`.

- **Material** (canonical): baseColor = the mesh's existing `color` prop,
  hex-validated with safe fallback. Roughness/metalness are UNAVAILABLE in
  a flat-fill rasterizer → documented and NOT exposed as controls.
- **Light** (canonical): one new `light3d` entity — type point|directional
  (both real), enabled, color, intensity 0–5, radius 0.1–1000 (real: the
  point attenuation range). Uses the EXISTING transform system (rotation =
  emission direction for directional) and participates in the Task 53
  hierarchy (world position = parent.world × local). Explicitly
  non-physics: no collider/body; the physics inspector is gated to meshes.
- **Shading**: per visible face during rasterization —
  `base × clamp01(ambient + Σ intensity·atten·max(N·L,0)·lightColor)`;
  geometric world-space face normals (viewer-oriented, degenerate-safe);
  point attenuation `1 − dist/radius`; ambient from the existing
  ambientColor/ambientIntensity scene styles (3D defaults white × 1 →
  scenes without lights render pixel-identically to before — all exact-
  color regression assertions unchanged).
- **Bounded**: max 8 active lights (enforced at resolution and
  accumulation); excessive count is diagnosed and rendering stays stable.
- **Editor**: light gizmos (marker + influence ring / direction arrow,
  dimmed when disabled, editor-only); collider gizmos now draw only for
  entities that actually have a collider; Material section + Light fields
  + semantics explainer in the inspector; ambient fallback type-aware.
- **Export**: vanilla mirror of parsing, hierarchy resolution, and the
  shading equations (`parseLight3DProps`/`parseAmbient3D`/
  `resolveLights3D`/`shadeFace3D`); the idempotent `render3DScene` refresh
  path re-resolves lights/ambient so runtime light edits reach exported
  pixels.

### Verified (session 54)

- Playwright E2E `scripts/e2e-3d-material-lighting.mjs` **42/42, 0 console
  errors** with the directive's pixel evidence: (A) exact base-color render
  then full repaint on a Material edit; (B) light enabled/disabled moves
  the cube's front-face luminance from the ambient floor to >60 and back;
  (C) light position changes face illumination (front face 15.5 → 178 when
  the light drops from above to level); (D) surface-orientation proof —
  equal-distance light in FRONT of a face lights it while the light BEHIND
  does not. Plus hierarchy (a parented light keeps the moved cube lit;
  unattached it would fall to the ambient floor), persistence of every
  value, undo/redo, malformed-config diagnostics + stability, the 8-light
  boundary, 390px parity, and the exported HTML run from disk (lit, no
  errors).
- Regressions (12 suites): 3d-foundation 18/18, 3d-hierarchy 17/17,
  3d-physics 24/24, input-actions 32/32, tilemap 44/44, gameplay 21/21,
  camera 34/34, sorting 19/19, motion 11/11, sprite-animation 18/18,
  animation-state-machine 20/20, 2d-lighting 19/19, 2d-particles 22/22.
- tsc clean; go vet clean; go test 11/11 packages; production next build
  green (dev stopped, `.next` removed first).

### Honest notes (TASK 55)

- Flat per-face shading: a large quad shades uniformly from its center —
  no per-pixel pools; the cube's top face is a near-invisible sliver at
  typical camera angles (evidence uses the front face).
- No shadows/specular/spot/area lights/probes — none claimed in the UI.
- Builder chrome: pre-existing ~28px scrollWidth artifact at 390px
  (identical on 2D projects; the 3D builder adds none of it — parity-
  guarded in the E2E).
- Inspector labels are English (the established inspector convention);
  commit still blocked: no git binary on this machine.

### Next exact task

STOP per the directive — await explicit approval before TASK 56.

## 62. TASK 56 — Real 3D Transform Gizmos (Move / Rotate / Scale)

Selected 3D entities are now manipulable DIRECTLY in the editor viewport
through real move/rotate/scale gizmos — real ray/pointer interaction, no
visual fake, no new engine. Full record in
`docs/TASK56_3D_TRANSFORM_GIZMOS.md`.

- **Math** (`lib/transform-gizmo.ts`, new, pure): exact pointer-ray
  unprojection through the active camera; MOVE = closest point between the
  pointer ray and the axis line (no pixel-to-world multiplier), converted to
  canonical LOCAL via the parent's inverted world matrix (`mat4Invert`, new);
  ROTATE = ray∩ring-plane → wrap-safe planar delta on the matching canonical
  Euler axis (rx/ry/rz kept — no quaternions); SCALE = pointer projection on
  the axis' screen direction, per-axis start values, clamped 0.1–100,
  NaN-safe. LOCAL/WORLD spaces orient handles on local rotation columns vs
  world axes.
- **Interaction**: editor toolbar (Move/Rotate/Scale + Local/World), W/E/R
  shortcuts, Escape cancels mid-drag (capture-phase, before the builder's
  Escape-deselect); picking uses the SAME projected geometry as drawing;
  drags preview hierarchy-aware without touching the model; pointer release
  commits ONE canonical `updateProps` = ONE undo entry; the camera never
  orbits while transforming.
- **Editor-only**: gizmos never render in preview/published/export and never
  touch project data beyond the canonical transform fields (camera fov/near/
  far/active and light semantics untouched). Physics (TASK 54) unaffected —
  editor has no physics world; preview re-seeds deterministically.

### Verified (session 55)

- Playwright E2E `scripts/e2e-3d-transform-gizmos.mjs` **34/34, 0 console
  errors** — pointer-driven drags at the projected handle positions with
  model + pixel evidence: move X/Y/Z (px/py/pz change AND the cube's
  rendered centroid moves), one drag = one undo entry (exact restore to
  1e-6) + redo, rotate X/Y/Z rings + inspector parity, scale X/Y/Z + pixel
  growth + extreme-drag clamping, Local/World orientation change (tilted vs
  horizontal X handle), parent-child (parent move → child world moves; child
  gizmo → child local changes, parent unchanged), inspector↔gizmo parity
  both directions, save/reload persistence, Escape cancel.
- Regressions (13 suites): 3d-foundation 18/18, 3d-hierarchy 17/17,
  3d-physics 24/24, 3d-material-lighting 42/42, input-actions 32/32,
  tilemap 44/44, gameplay 21/21, camera 34/34, sorting 19/19, motion 11/11,
  sprite-animation 18/18, animation-state-machine 20/20, 2d-lighting 19/19,
  2d-particles 22/22.
- tsc clean; go vet clean; go test 11/11 packages; production next build
  green.

### Honest notes (TASK 56)

- Rotate rings map the delta onto the matching LOCAL Euler axis; world-space
  ring drags on parented objects may visually differ from the ring plane
  (exact for unparented entities).
- No depth axis, no snapping, no multi-select (per directive), gizmo draws
  without mesh occlusion (flat editor overlay; inactive handles dim).
- Commit still blocked: no git binary on this machine.

### Next exact task

STOP per the directive — await explicit approval before TASK 57.

## 63. TASK 57 — Real 3D Character Controller + Input (Playable 3D Gameplay)

A designated 3D entity becomes the player: WASD/arrows move relative to the
active camera, Space jumps physics-driven, gravity/landing/walls come from
the TASK 54 physics — one implementation across Preview, Published, and
Exported HTML. Ground + Player + physics + input + movement + jump +
collision = a playable 3D scene. Full record in
`docs/TASK57_3D_CHARACTER_CONTROLLER.md`.

- **Canonical model**: scalar controller props on the player entity —
  `controllerEnabled`, `moveSpeed` (0.1–100), `acceleration` (0–200),
  `deceleration` (0–200), `jumpForce` (0–50), `airControl` (0–1) — clamped at
  parse; gravity reuses the TASK 54 `gravityEnabled`; runtime state
  (velocity/grounded/input) is never persisted; `maxSlopeAngle` not
  implemented and not exposed.
- **Player designation**: `controllerEnabled` on the entity (no hidden
  player object); the FIRST enabled controller is honored (deterministic),
  multiple controllers warn, zero controllers render normally with an info
  diagnostic.
- **Input**: the EXISTING input abstraction — five semantic slots
  (`move-forward`/`move-backward` reuse the established `move-left`/`move-right`/`jump`
  vocabulary) resolved from the screen's canonical `inputActions`
  (rebindable in the Input Actions panel) with built-in 3D defaults
  (W/A/S/D, arrows, Space). Runtime-mode-only pressed-key set; no parallel
  key system; editor shortcuts untouched.
- **Movement**: input vector normalized (≤ 1); camera-relative basis from
  the ACTIVE camera3d rotation (no second camera); velocity-based with
  acceleration/deceleration × airControl, applied per fixed step (1/120 s)
  BEFORE the existing `PhysicsWorld.step` — the controller decides
  velocities, the existing physics integrates/collides/resolves. One world,
  one timestep, one authority.
- **Jump**: one physics-driven impulse (`vy = jumpForce`) per press edge
  while grounded; edges expire per frame — holding Space cannot stack jumps
  and airborne presses are rejected (all E2E-proven).
- **Editor**: Controller (3D player) inspector section; diagnostics for
  multiple controllers, controller-without-dynamic-body, gravity disabled,
  and every range; observability attributes (`data-3d-player`,
  `data-controller-enabled/grounded/speed`, `data-physics-bodies` now
  carries x/y/z — web AND export identical).
- **Export**: vanilla mirror (`applyController3D` + key listeners installed
  once per run) with identical math; editor-only UI never leaks (E2E
  asserts no toolbar/hierarchy/transform-mode in the published runtime).

### Verified (session 56)

- Playwright E2E `scripts/e2e-3d-character-controller.mjs` **35/35, 0 console
  errors** — real keyboard gameplay: W/S/A/D displacement in the correct
  camera-relative directions, solo speed ≈ moveSpeed, normalized diagonals,
  deceleration to rest, gravity fall/land/grounded/stable-rest, jump rise +
  return + no-held-repeat + airborne rejection, wall blocking at the exact
  face with no tunneling, restart reset, save/reload persistence, published
  movement, exported-run-from-disk movement + jump.
- Regressions (14 suites): 3d-foundation 18/18, 3d-hierarchy 17/17,
  3d-physics 24/24, 3d-material-lighting 42/42, 3d-transform-gizmos 34/34,
  input-actions 32/32, tilemap 44/44, gameplay 21/21, camera 34/34,
  sorting 19/19, motion 11/11, sprite-animation 18/18,
  animation-state-machine 20/20, 2d-lighting 19/19, 2d-particles 22/22.
- tsc clean; go vet clean; go test 11/11 packages; production next build
  green.

### Honest notes (TASK 57)

- NOT IMPLEMENTED / DEFERRED: slopes, stairs, crouch/sprint/prone, ledge
  climbing, swimming, ladders, double/wall jump, moving platforms, root
  motion, full third-/first-person camera, ragdoll, navmesh, advanced
  character animation, capsule colliders, mobile touch controls, 3D camera
  follow (the authored camera stays fixed).
- Character collider = the existing supported box (no fake capsule).
- Commit still blocked: no git binary on this machine.

### Next exact task

STOP per the directive — await explicit approval before TASK 58.

## 64. Cloudflare Workers Web Deployment — Phase 1B (explicit vinext/Wrangler config)

The Cloudflare deployment failure (`npm error Unsupported URL Type
"workspace:"`) came from automatic framework detection running npm against
the pnpm workspace. Fix: an EXPLICIT, toolchain-generated Workers
configuration inside **apps/web** — the monorepo, `workspace:*`, the Go API,
PostgreSQL, and Vercel were not touched. Full record in
`docs/CLOUDFLARE_WEB_DEPLOYMENT.md`.

- `pnpm dlx vinext check` (apps/web): **87% compatible, no blockers**
  (partial: next/font/google CDN fonts; App Router strict-mode wrapping).
- `vinext init --platform=cloudflare` generated `apps/web/wrangler.jsonc`
  (Worker `web`, fetch-handler, `nodejs_compat`, assets dist/client, Images
  binding), `apps/web/vite.config.ts` (vinext + Cloudflare Vite plugin),
  `apps/web/.gitignore`, and scripts `dev:vinext` / `build:vinext` /
  `start:vinext` / `deploy:vinext` — existing `dev`/`build`/`start`/`check`
  untouched. `pnpm-workspace.yaml` allowBuilds placeholders completed with
  real values (`esbuild: true`, `workerd: true`).
- react/react-dom 19.1.0 → 19.3.0 (vinext RSC requirement;
  `next dev`/`next build` verified green on 19.3.0). `"type": "module"`
  added. `workspace:*` intact; `pnpm install` from root works.
- Workers verification: `build:vinext` exit 0 (32 routes); `start:vinext`
  preview on :8787 verified in a real browser (12/12: landing/login/
  register/pricing/explore/docs render, navigation, builder fallback without
  backend, zero pageerror + zero hydration errors; API-connection refusals
  are the only console errors and are expected — the Go API is intentionally
  not deployed for Workers yet); `wrangler deploy --dry-run` exit 0.
- Full regression after the change: 15 E2E suites green (35/42/34/24/18/17
  3D suites + 2D), `tsc` clean, `go vet` clean, `go test` 11/11, `next build`
  exit 0.
- Real dashboard deploy is pending Cloudflare authentication (one command:
  `pnpm run deploy:vinext`; dashboard: root directory `apps/web`, deploy
  command `pnpm run deploy:vinext`, no framework-detection overrides). The
  acceptance checklist lives in the task doc §10.

### Honest notes (Cloudflare Phase 1B)

- The Workers deployment has NO backend yet — authenticated flows
  intentionally do not work there (not faked).
- vinext 1.0.0-beta.12 / wrangler 4.141.0; Worker name `web` (generated).

### Next exact task

Cloudflare dashboard deploy (needs account auth) or the next directive task
— await explicit approval.

