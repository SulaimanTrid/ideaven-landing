# Ideaven Roadmap

Status as of 2026-09-03 — see `docs/STATUS.md` for the full audit. The
builder foundation (workspace shell, design mode with palette/canvas/tree/
inspector, autosave, undo/redo) ships between phases 4 and 5; Ask AI and
the asset manager are in. Each later phase builds on the previous one —
nothing is throwaway.

| # | Phase            | Adds                                                     | Depends on | Status |
| - | ---------------- | -------------------------------------------------------- | ---------- | ------ |
| 1 | Foundation       | Landing page, monorepo, Go API skeleton, health endpoint | —          | ✅ |
| 2 | Authentication   | Email sign-in, sessions, user model                      | 1          | ✅ |
| 3 | User Dashboard   | Project list, create/delete, profile                     | 2          | ✅ |
| 4 | Project Creation | Project model (screens, components, assets), persistence | 3          | ✅ model v1 + persistence; editors pending |
| 5 | Block Editor     | Palette, canvas, drag-connect blocks, block→IR compiler  | 4          | ◐ block IR + editor + codegen done; free-form canvas later |
| 6 | TypeScript Editor| Monaco-based editor, TS project model, type-checking      | 4          | ✅ Monaco + parser diagnostics + code→blocks sync done; IntelliSense polish later |
| 7 | Runtime          | Shared execution model: blocks IR and TS run identically  | 5, 6       | ◐ IR interpreter runs in Preview; code execution shares semantics |
| 8 | Live Preview     | Hot-reload preview pane, Run/Pause/Stop (real)            | 7          | ◐ Run/Restart + navigation real; pause/hot-reload pending |
| 8b | Diagnostics     | Error center: errors/warnings/info, click-to-source        | 5, 6       | ✅ Foundation (Diagnostics panel + model walker); validator expansion later |
| 9 | Contextual AI    | Project-aware assistant, change proposals, apply engine   | 5–8        | ◐ Ask AI with validated model changesets + usage accounting (session 7); credit UX later |
| 10| Save/Versioning  | Autosave, snapshots, history, diff                        | 4          | ◐ autosave + server-side version snapshots (origin-labelled: edit/ai) + History panel restore (sessions 9–10); diff view later |
| 11| Publish          | Share links, embeds, web export                           | 8          | ⬜ |
| 12| Community        | Public profiles, galleries, following (replaces the "Example" showcase cards as-is) | 11 | ⬜ |
| 13| Marketplace      | Templates, components, asset packs, payments              | 12         | ⬜ |

## What Phase 1 already prepared for each step

- **Blocks** — `blockPath()` and the `Block` primitive render real connectable
  shapes today; the editor phase turns them into interactive components.
- **Code** — the tokenized-code renderer (`visuals/code.tsx`) mirrors how the
  TS editor will highlight user code.
- **Runtime loop** — the hero editor's Run/Pause/Stop state machine and the
  Live Creation Loop section model the intended UX before the runtime exists.
- **AI** — `ai-demo.tsx` encodes the interaction contract: request → analysis →
  change plan → applied diff. The future AI backend fulfills that contract.
- **Showcase** — project cards take structured metadata (`name/kind/tag/art/desc`),
  so real community projects drop in without redesign.
- **API** — handlers/middleware/server packages accept new domains without
  touching Phase 1 code; version is ldflags-overridable for CI.
- **Placeholders** — every future route already resolves to an honest
  "future phase" page with `noindex`; phases replace pages, not link structure.

## Known deferrals (intentional)

- Strict CSP with nonces (needs app-router nonce plumbing)
- ESLint/Prettier setup (kept out to minimize Phase 1 dependency surface)
- OG image generation as code (`opengraph-image.tsx`) instead of static PNG
- Design tokens graduation into `packages/ui` when a second consumer appears
- Analytics/monitoring — none, by design, until a privacy policy exists
