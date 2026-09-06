# Ideaven Architecture (Phase 1)

## Monorepo layout

pnpm workspaces with two app packages and two shared packages:

```
apps/web        @ideaven/web      Next.js 15, App Router, React 19, Tailwind v4
apps/api        @ideaven/api      Go 1.24, stdlib only
packages/ui     @ideaven/ui       Shared React primitives (TS source, transpiled by web)
packages/config @ideaven/config   Shared tsconfig bases (extended by relative path)
```

Key decisions:

- **`@ideaven/ui` ships TypeScript source**, not a build. `apps/web` compiles it
  via `transpilePackages` and scans it for Tailwind classes via `@source` in
  `globals.css`. No bundler config duplication, one source of truth.
- **Design tokens live in `apps/web/src/app/globals.css`** (`@theme` block).
  UI primitives reference those tokens by Tailwind class. When a second web app
  appears, tokens should graduate into `packages/ui` (see ROADMAP).
- **tsconfigs extend by relative path** (`../../packages/config/...`) — robust,
  zero package-resolution magic.

## Frontend

### Rendering strategy

Everything is a **server component by default**. Only five small client
islands exist:

| Island                  | Why it's client                              |
| ----------------------- | -------------------------------------------- |
| `site-header`           | scroll state, mobile menu, Escape handling   |
| `editor-visual`         | BLOCKS/CODE tabs, Run/Pause/Stop state        |
| `ai-demo`               | timed concept animation                       |
| `loop-section`          | auto-advancing state cycler                   |
| `reveal`                | IntersectionObserver entrance animations      |

Result: all 12 routes prerender as static content; ~110 kB first-load JS on `/`.

### Progressive enhancement

- A tiny `beforeInteractive` script adds `.js` to `<html>`. CSS only pre-hides
  reveal targets when that flag exists — no-JS visitors (and crawlers) see full
  content immediately.
- The code-typing simulation renders the full snippet server-side, then replays
  the animation client-side.
- All timed/animated islands check `prefers-reduced-motion` and fall back to a
  static final state; a global CSS rule neutralizes remaining animations.

### Route inventory

| Route        | Type      | Purpose                                  |
| ------------ | --------- | ---------------------------------------- |
| `/`          | static    | Landing page (all sections)              |
| `/learn` `/explore` `/community` `/pricing` `/login` `/start` `/docs` `/privacy` `/terms` | static, `noindex` | Future-phase placeholders — every future link resolves here, no dead ends |
| `/robots.txt` `/sitemap.xml` | metadata routes | SEO |
| `/_not-found` | static    | Custom 404 in brand voice                |

An `error.tsx` boundary renders a branded retry screen for render failures.

## Backend

```
cmd/api/main.go            entrypoint: config.Load() → server.Run()
internal/config            env parsing (API_ADDR, API_ALLOWED_ORIGINS)
internal/handler           HTTP handlers (health) + tests
internal/middleware        chain: logger → recover → secure headers → CORS
internal/server            mux wiring, JSON 404 fallback, graceful shutdown
internal/build             version constant (ldflags-overridable)
```

- Go 1.22+ method-aware mux patterns (`GET /api/health`) give 405s for free.
- Graceful shutdown on SIGINT/SIGTERM with a 10 s drain window.
- Structured logging via `log/slog`; panics become JSON 500s, never stack trace
  leaks.
- CORS is allowlist-only and inert until origins are configured.

### Growth path (by phase)

Adding a feature later means: new `internal/<domain>` package, handlers
registered in `server.New`, tests beside handlers. No phase-1 code needs to be
deleted. See `docs/ROADMAP.md` for the full mapping.

### Projects domain (Phase 4)

`internal/project` owns the project library and the canonical Project Model:

- `migrations/005_projects.sql` — `projects` table keyed by `users.id` (FK
  cascade); the model document lives in a JSONB column with
  `model_version`; owner-scoped unique slug; recency indexes.
- `model.go` — versioned model schema (v1: screens with components, depth-
  limited validation of unique IDs, start-screen navigation) and the initial
  model each new app/game project starts from.
- `store.go` — every query is owner-scoped; list supports search, status
  filter, sort, and pagination with total count.
- `service.go` — validation limits, slug generation with collision retry,
  duplicate with fresh identity, not-found semantics that never reveal
  whether a foreign project exists.
- `handler.go` — identity always derives from the session cookie; list
  payloads omit the model document; wire shape mirrored in
  `apps/web/src/types/project.ts`.

Routes: `POST/GET /api/projects`, `GET/PATCH/DELETE /api/projects/{id}`,
`POST /api/projects/{id}/duplicate`, `POST /api/projects/{id}/open`,
`PUT /api/projects/{id}/model`.
Multi-method paths share one 405 fallback via `routeMethods`.

### Builder (frontend)

The Ideaven Builder lives at `/builder/[id]` — its own layout (session
guard, no marketing/dashboard chrome) so the editor owns the viewport. The
canonical Project Model is the only state all surfaces share:

- `src/lib/project-model/registry.tsx` — the component registry: every type
  that exists in the palette, canvas, tree, and inspector, with defaults and
  editable-field schemas. A type appears in the UI only when it renders for
  real.
- `src/lib/project-model/ops.ts` — pure immutable model operations; every
  editor action and future AI mutation flows through them.
- `src/lib/project-model/use-history.ts` — snapshot undo/redo.
- `app/builder/[id]/builder/` — the shell: top bar (modes, save status,
  history), screens panel, palette, device-framed canvas, layer tree,
  inspector.

Saving: the builder keeps the model in memory, autosaves (1.5 s debounce)
via `PUT /api/projects/{id}/model`, guards tab close, and surfaces save
failures with retry. Server-side validation is the final gate.

### Blocks engine

Block programs live **inside** the Project Model — screen-level
`logic.handlers[]`, each binding a component/screen event to a body of
structured blocks (id/kind/type, `inputs` for literals and references,
`slots` for nested expressions, `children` for nested bodies). There is no
side store and no separate state system: Design, Blocks, and Code modes all
mutate and render the same document through one commit path.

- `lib/project-model/blocks.ts` — the block vocabulary (every type has an
  editor rendering and a codegen mapping; nothing decorative) plus pure
  operations (handlers, statements, slots, variables).
- `lib/project-model/codegen.ts` — deterministic Model→TypeScript
  generation shown in Code mode. The reverse direction (hand-edited code →
  model) is a later milestone and is never pretended to exist.
- Deleting a component leaves referencing blocks intact by design — the
  server validator accepts dangling references and the UI flags them;
  diagnostics turn them into actionable errors in the next milestone.

### Runtime (preview)

`lib/project-model/runtime.ts` interprets the block IR directly — never the
generated code. One run owns fresh variable and component state seeded from
the model; the interactive Preview mode (4th builder mode) renders screens
through the runtime so clicks, typing, toggles, show-message toasts, and
navigate blocks behave as the program dictates. Restart-run re-seeds state
from the model; previewing always reflects the current canonical document.

### Code mode (bidirectional)

Code mode shows the deterministic TypeScript generated from the blocks and
accepts edits in a real **Monaco** editor (`@monaco-editor/react`, loaded
client-side). On "Sync to blocks", `lib/project-model/code-sync.ts` parses
the buffer with the real TypeScript compiler frontend and, when the whole
screen is inside the supported subset, replaces the screen's handlers in one
undoable commit. Anything outside the subset is stored verbatim as
`screen.code` on the screen (custom code) — it is never overwritten by the
generator and never approximated into blocks; a conflict panel shows what
can and cannot be synchronized. Parse errors surface as in-editor markers
and diagnostics with line/column and commit nothing. The generator also
emits a block→line source map for upcoming cross-navigation.

### Diagnostics

`lib/project-model/diagnostics.ts` walks the canonical model and emits
deterministic diagnostics (ERROR/WARNING/INFO): handlers referencing deleted
components, navigate blocks targeting missing screens, set/get-variable on
unknown variables, empty screens, and empty handlers. The bottom
Diagnostics panel merges them with Code-mode parse diagnostics, shows
severity counts (and "No errors 🎉" when healthy), and navigates
click-to-source: model diagnostics open Blocks mode with the owning
handler/screen selected; code diagnostics open Code mode at the marker.
This panel is the seed of the full validator + error center.

### Language adapters

The code layer is organized as adapters per language. The Ideaven
TypeScript adapter (generate + parse) is implemented. C# and C++ adapters
are prepared architecture only: parsing/diagnostics will use real
frontends (Roslyn; a clang-based pipeline) inside isolated build workers —
never in the main server, and never in the browser. Nothing in the UI
claims C#/C++ support until those adapters pass their own tests.

## Verification performed (Phase 1 exit gate)

- `tsc --noEmit` clean; `go vet` + `go test` green; production build all-static
- Playwright suite: 18/18 — routes, overflow, console errors, tab/typing/run
  interactions, mobile menu, anchor navigation, FCP/perf budget, SEO tags
- Manual visual QA at 1440 px and 375 px across all sections
