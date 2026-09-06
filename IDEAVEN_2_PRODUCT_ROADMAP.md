# IDEAVEN 2.0 — PRODUCT ROADMAP (Phases 1–17)

Date: 2026-09-05. Companion to `IDEAVEN_2_ROADMAP.md` (architecture-level).
This document maps the 17 product phases onto what actually exists. A phase
is marked complete only when UI + state + API + validation + error handling +
persistence + tests + browser verification all work together.

Legend: ✅ complete · ◐ partial (what's missing listed) · ⬜ not started.
Tests column names the verification each phase must pass.

| # | Phase | Status | Reusable base | Missing / plan | Depends on |
|---|---|---|---|---|---|
| 1 | Extension ecosystem | ✅ core (Studio, build→AIX, install registry) | 012 tables, manifest v1, CRUD API, registry UI (session 14) | **Studio** (manifest/docs/versions/build tabs), **isolated build worker** → AIX package → verify → download, **install registry**, dependency resolution, build logs | — |
| 2 | True visual blocks | ✅ | Block IR (5 stmt + 6 expr, typed inputs/slots), `blocks.ts` ops, codegen, runtime, source map | Scratch-style canvas (hats, stacks, reporters, C-blocks, drag/snap, zoom/pan, minimap, search, shortcuts) as a **view-model over the same IR**; extension blocks from manifests | 1 (extension blocks) |
| 3 | Block ↔ code | ◐ | `codegen.ts` block↔line map; diagnostics click-through exists | Bidirectional highlight (block⇄code), guarded custom-code surface polish | 2 |
| 4 | Device preview | ◐ | Phone/tablet/desktop frames + Preview runtime | Status bar/notch/orientation/custom-size presets; landing uses the same runtime (already true for published pages/exports) | — |
| 5 | Companion | ⬜ | QR→public page (live app on phone today); exported runtime | Pairing tokens + SSE relay + Companion PWA reusing the exported runtime; Run/Connect/Reload actions | 4 |
| 6 | Global design system | ✅ | Session 14: runtime tokens, Light/Dark/System, ThemeProvider + toggle + Appearance page, surface tokens across 29 files | Reduced-motion audit (partially exists) | — |
| 7 | i18n | ⬜ | 10 locales listed; no infra yet | Key-based dictionary layer, locale negotiation (choice→account→browser→Accept-Language→en), no per-component conditionals | — |
| 8 | Documentation 2.0 | ⬜ | Learn (6 lessons) + Docs (schema/blocks/API) | Per-concept progressive docs (What/Analogy/Example/Blocks/Code/Mistakes/When/Advanced; Beginner→Advanced), Learn/Explain/Ask AI hooks | 7 (keys), 2 (block ids) |
| 9 | Community 2.0 | ◐ | Community page (stats, publications, remix loop), creators | Posts/threads/reactions/solved/tags/moderation/onboarding quiz — new domain (posts tables + API) | 6 |
| 10 | Landing 2.0 | ◐ | Landing real; published apps use the real runtime | Playable IR-based mini-demo embedded in landing; section upgrades | 2 (blocks showcase), 4 |
| 11 | Extension marketing | ⬜ | Extension registry live | Landing section Create→Build→.AIX→Install→Use with real Studio preview | 1 |
| 12 | Pricing 2.0 | ◐ | Pricing page honest (free tier + packs-not-yet-sold) | Visual redesign, plan comparison, device animation, reduced-motion | 6 |
| 13 | Profile avatar | ◐ | Profile settings exist (URL-based avatar preview today) | File picker + crop/rotate/resize + IndexedDB cache + server upload endpoint | — |
| 14 | Marketplace foundation | ◐ | Explore gallery, remix, creators, stats | Extension marketplace tabs (Installed/Explore/Trending/Verified/categories/detail/versions), free downloads = install flow of Phase 1 | 1 |
| 15 | Marketplace safety/commerce | ⬜ | Ledger/audit patterns exist (ai_usage, version origins) | Seller roles, moderation queue, licenses, order ledger schema, provider abstraction — **schema + abstractions only until payments activate** | 14 |
| 16 | Accessibility | ◐ | Strong a11y baseline (labels, focus-visible, roles, aria-*) | Full keyboard map for canvas, text scaling pass, contrast pass under Light theme | 6 |
| 17 | Responsive | ◐ | Drawer nav, responsive grids, scrollable builder top bar | Landing mobile-first polish pass; docs/community mobile pass | 6 |

## Phase 1 implementation plan (this session)

1. `cmd/extbuild` — **isolated build worker** (own process): stdin job JSON →
   validate manifest → resolve dependencies against the registry → package
   AIX (zip: `manifest.json`, `docs.md`, `meta.json` with checksum) → verify
   (reopen + parse) → emit structured logs. Never in-process.
2. `internal/extension/build.go` — pipeline orchestrator: worker resolution
   (env `EXT_BUILD_BIN` → `go run ./cmd/extbuild` fallback), step logs,
   AIX persistence under `.data/extensions/`, verify-after-build, build
   result stored on the version row.
3. Install registry: `extension_installs` (user+extension, one per user).
4. API: `POST /api/extensions/{id}/build`, `GET /api/extensions/{id}/aix?version=`,
   `POST|DELETE /api/extensions/{id}/install`, `GET /api/extensions/installed`.
5. Web: Extension Studio page `/dashboard/extensions/[id]` with Manifest /
   Docs / Versions / Build tabs (real editors, real diagnostics, real
   download); registry cards link into the Studio.
6. Tests: build success (logs + AIX + verify), dependency failure
   diagnostics, install/uninstall, AIX download ownership.
7. Browser verification: Studio flow end-to-end as a signed-in creator.

### Risks
- Worker resolution in prod: ship `cmd/extbuild` as its own binary; the
  `go run` fallback exists for dev/tests only (toolchain present here).
- AIX is metadata+docs today; compiled artifacts arrive when extensions can
  carry code — the packaging/verify skeleton already accommodates them.
- Install wiring into project palettes lands with Phase 2 (block registry).

## Status log
- 2026-09-05 — Product roadmap created. Phase 1 executed and verified (see
  STATUS.md session 15): Studio UI + isolated worker pipeline + AIX
  packaging/download + publish gate + install registry. Remaining Phase 1
  polish (dependency UI picker, install wiring into project palettes) rides
  on Phase 2. Next: Phase 2 — true visual blocks on the existing IR.
- 2026-09-06 — Phase 2 executed and browser-verified (STATUS.md session 17):
  Scratch-style canvas (`blocks-canvas.tsx`) over the same IR — hat block,
  snap strips between/inside statements, C-block arms, draggable reporter
  sockets, zoom/pan (ctrl+wheel, buttons, background drag), minimap with
  viewport jump, palette search, keyboard shortcuts (select/Del/arrows/
  undo/redo), extension blocks registered from installed manifests into a
  namespaced block registry (`block-registry.ts`). Codegen/preview honestly
  skip extension blocks with a visible comment until runtime providers
  land. Phase 1 leftover (install wiring into palettes) is now done as part
  of this registry. Next: Phase 8 (Documentation 2.0) or Phase 10 landing
  demo — both unblock on this.
