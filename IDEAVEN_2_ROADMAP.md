# IDEAVEN 2.0 — Implementation Roadmap

Date: 2026-09-05
Scope: product polish + extension ecosystem + true visual block editor, mapped
onto the architecture that actually exists in this repository today.

> NOTE (machine paths): the original directive mentions `/home/parrot/Ideaven`;
> the live checkout on this machine is
> `/home/zorin/Downloads/Projek IDEAVEN/ideaven-landing-v1`. All paths below
> are relative to that repository. Toolchains live in `~/.local/opt`
> (Node 22, Go 1.24, portable PostgreSQL 16.4 — see docs/STATUS.md).

---

## 1. Existing implementation (what 1.x already ships)

| System | Where | State |
| --- | --- | --- |
| Auth/sessions/profile | `apps/api/internal/{auth,user,session}`, `apps/web/src/auth` | Complete, tested |
| Projects + canonical model v1 | `apps/api/internal/project`, `apps/web/src/lib/project-model` | Complete: schema, validation, versions (20/project, origin edit/ai) |
| Builder (Design/Blocks/Code/Preview) | `apps/web/src/app/builder/[id]` | Complete and live; Blocks mode is a **stack list editor**, not yet a visual canvas |
| Block IR | `apps/web/src/lib/project-model/blocks.ts` | 5 statement + 6 expression defs, typed inputs/slots, deterministic TS codegen, runtime interpreter, block↔line source map |
| Code mode | Monaco + `code-sync.ts` | Parse diagnostics, code→blocks for the subset, custom `screen.code` preserved |
| AI router + changesets | `apps/api/internal/ai` | Closed vocabulary (10 ops incl. `deleteHandler`, `updateBlockInput`), credits ledger, Ask AI panel, Auto-Fix + re-check |
| Publishing | `apps/api/internal/project/publish.go`, `/p/[slug]` | Snapshot model, gallery, creators, remix, stats |
| Assets | `apps/api/internal/asset` | Upload/list/raw; raw is public iff project is published |
| Templates | `internal/project/templates.go` | 3 real built-in models |
| Exports | `internal/project/export.go` | Standalone HTML (vanilla-JS IR runtime) + Android WebView project zip + CI workflow |
| Credit ledger | `internal/ai/credits.go` | Derived balance, grants, activity feed, settings surface |
| Explore/Community/Learn/Docs/Pricing | `apps/web/src/app/...` | All real content, no placeholders |
| Tests | `apps/api` | Full suite green against live PostgreSQL (7/7 packages) |

## 2. Reusable systems for 2.0 (do not rebuild)

- **The block IR is the contract.** Visual editor (C) must edit the exact
  `Block` tree (`{id, kind, type, inputs, slots, children, elseChildren}`) —
  codegen, runtime, diagnostics, AI, and exports already consume it.
- **Codegen + block↔line source map** (`codegen.ts`) power D's click-to-source
  both directions; extend, never fork.
- **Version snapshot machinery** (`project_versions`, origin labels) is the
  template for extension versioning.
- **Asset upload + public-when-published** is the pattern for extension media.
- **Dashboard shell + drawer**, settings nav, site header, tokens in
  `globals.css` are the chrome the theme system wraps.
- **Portable PG + harness tests** (`integration_test.go` harness) is the
  verification vehicle for every new backend capability.

## 3. Missing infrastructure (gaps 2.0 must fill)

1. **Theme layer** — tokens exist but are dark-locked; no Light/System, no
   persisted preference, scattered `bg-white/[0.0x]` literals.
2. **Extension data model** — no tables, no manifest contract, no build
   pipeline, no AIX packaging, no studio UI.
3. **Visual block canvas** — Blocks mode is a vertical list editor; missing
   drag/snap/hats/C-blocks/minimap/search/zoom-pan/keyboard.
4. **Device preview fidelity** — device frames exist (phone/tablet/desktop)
   but no status bar/notch/orientation/custom-size presets.
5. **Companion** — no pairing/relay; the QR→published-page path is the
   current phone story.
6. **Avatar upload** — profile has initials only.
7. **Landing marketing depth** — real content, but no live playable demo or
   product showcases.

## 4. Workstream dependencies

```
A(theme) ────────────────┐ every later UI depends on tokens only
B(extension data model) ─┴─► B2(Extension Studio UI) ─► B3(AIX build/validate) ─► B4(install/marketplace)
C(visual blocks) ──► D(block↔code source map) ─► C2(extension-generated blocks)
E(device preview) ──► F(companion: pairing + logs)
G(landing) depends on B3/C/E/F demos existing
H(avatar) independent; marketplace foundation depends on B3
```

Order below keeps every phase shippable without breaking 1.x routes.

## 5. Phases

- **PHASE A (this session)** — Global theme system (Light/Dark/System,
  persisted, zero page-specific logic) + block editor architecture audit
  (§7 below) + extension data model (tables, manifest contract, CRUD API,
  tests, TS client, minimal real "My Extensions" surface).
- **PHASE B** — Extension Studio (explorer/manifest/source/docs editors,
  validate→build→AIX worker, logs, versions, install → registered component
  + generated block defs).
- **PHASE C** — True visual block canvas on the existing IR (palette, hats,
  C-blocks, typed sockets, snap, minimap, search, shortcuts) + extension
  blocks rendered from manifests.
- **PHASE D** — Block↔code source-map UX (click block ⇄ highlight code,
  guarded custom code).
- **PHASE E** — Device preview presets (status bar, notch, orientation,
  custom dimensions) in designer + preview.
- **PHASE F** — Companion architecture: pairing token + relay endpoints +
  Companion PWA shell reusing the exported runtime; live reload via SSE.
- **PHASE G** — Landing upgrade: playable mini-demo built on the exported
  runtime, showcases (blocks/AI/extensions/companion/2D), extension marketing
  section (Create → Build → .AIX → Install → Use).
- **PHASE H** — Avatar upload (client crop/resize, IndexedDB cache, server
  sync), marketplace foundation (Installed/Explore/Trending/Verified tabs on
  the extension registry), Learn tracks (Beginner/Intermediate/Advanced).

## 6. Testing requirements (every phase)

- Go: new store/service/handler tests in the harness style; full suite green
  against live PostgreSQL; `go vet` clean.
- Web: `tsc --noEmit` clean; `next build` green (never while `next dev` is
  running — same `.next`); browser verification of the changed flows.
- IR guard: after any blocks change, round-trip a fixture model through
  codegen + runtime and diff.

## 7. Block editor architecture audit (Phase A deliverable)

Current: `blocks-side.tsx` renders a handler's `body` as a vertical list of
def-labeled cards with per-input pickers; operations in `blocks.ts`
(addBlock/moveBlock/removeBlock/setBlockInput/…) already treat the tree
generically (find, walk, slots, children).

Gaps vs. Scratch-style canvas: no free-form positions, no drag wiring, no
hat representation (screen-level handlers are the hats), no C-shape visuals,
no zoom/pan, no minimap/search.

Decision for Phase C: keep the IR unchanged; add a **canvas layer** that maps
each handler to a hat block and each statement to a stack block (C-blocks for
`if`), expressions render as rounded reporter bubbles nested in sockets. The
canvas owns a view-model (positions, selection, drag state) derived from —
never replacing — the IR; every mutation routes through the existing
`blocks.ts` operations so codegen/runtime/AI remain identical. Source map
(line ⇄ block id) already exists in `codegen.ts` and is the basis of D.

## 8. Extension data model (Phase A deliverable)

- `extensions`: id, owner_id, slug (unique), name, summary, kind
  (component|blocks|mixed), status (draft|published), manifest JSONB,
  docs TEXT, current_version, timestamps.
- `extension_versions`: id, extension_id, version, manifest JSONB, source
  JSONB (today: component metadata + block definitions authored in-studio;
  Phase B adds built artifacts), changelog, created_at,
  UNIQUE(extension_id, version).
- Manifest contract v1 (validated server-side): `{ format: 1, name,
  components: [{id, label, icon, props:[{key,type,default}]}], methods:
  [{id,label,params:[{key,type}]}], events: [{id,label}], blocks: [{type,
  kind, category, label, inputs, slots, container}], dependencies: [{slug,
  version}] }` — the same shape the block registry consumes, so Phase C can
  render extension blocks with zero new vocabulary types.
- AIX (Phase B) = zip: `manifest.json`, `source/…`, `meta.sig` placeholder;
  build worker validates manifest → resolves deps → compiles metadata →
  verifies → emits package + logs.

## 9. Risks

- Theme flip touching hardcoded `white/…` utilities in chrome — mitigated by
  surface tokens + mechanical replacement; device frames intentionally stay
  light (they depict the user's app, not the IDE).
- Monaco stays dark in Light theme for Phase A (accepted; revisit in C).
- Extension manifest is forward-compatible but AIX packaging (B) must not be
  advertised publicly until the build worker is real.
- `next build` vs `next dev` on one `.next` (the session-13 outage) — builds
  only run with dev stopped.
- Performance: landing demo must reuse the tiny exported runtime; no asset
  bloat.

## 10. Status log

- 2026-09-05 — Roadmap created. Phase A implemented and verified: theme
  system (light/dark/system + Appearance settings) + extension data model
  (tables, manifest v1, CRUD API, tests, registry UI). Next: PHASE B —
  Extension Studio + AIX build pipeline.
