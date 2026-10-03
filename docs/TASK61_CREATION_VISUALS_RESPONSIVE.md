# TASK 61 — Creation Visuals + Real Device Orientation + Responsive Builder Polish

Status: **FUNCTIONAL / TESTED** (dedicated E2E 45/45; full regression sweep +
gates recorded in STATUS §68)
Session: 61 (2026-10-03).

---

## 1. Root causes (verified in code / measured geometry, not guessed)

1. **The builder header could genuinely collide at wide viewports.** The
   right-hand actions zone was `flex-1` — it claimed ~50 % of the leftover
   header space regardless of its content. With `justify-end`, content wider
   than its flex share overflows LEFTWARD: at 1440×950 the measured right
   zone was 525 px wide carrying ~690 px of controls, so Assets/History
   rendered ON TOP of the mode nav (real bounding-box intersection, e.g.
   `Preview ∩ Assets` = 77 px overlap). TASK 58 had masked this with an
   internal scroll; TASK 60's content-sized rewrite removed the scroll but
   kept `flex-1` — and no suite ever asserted pairwise geometry.
2. **Landscape reflowed the screen, not the DEVICE.** `viewportSize()`
   already swapped the screen dimensions, but `DeviceFrame` was
   portrait-shaped chrome: the camera/speaker pill stayed top-center across
   a now-wide screen, side buttons stayed on the left edge, the home
   indicator stayed bottom-center — a sideways leftover portrait composition.
3. **Fit was width-only and bezel-blind.** `fitScale` used
   `surface.clientWidth / frame.width`, ignoring stage height and the bezel,
   so tall devices clipped vertically and "entire frame visible" was never
   actually guaranteed.
4. **Device dimensions were declared twice** (canvas preset row duplicated
   the canonical `VIEWPORT_SIZES` table).
5. **The three creation illustrations were three ad-hoc div compositions** —
   generic, weak, and the dashboard showed the same app icon for 3D projects
   as for apps.

## 2. Creation preview architecture (ONE system)

`apps/web/src/components/visuals/creation-preview.tsx` — a single
`CreationPreview` component (`type: "app" | "game" | "3d"`, `data-creation-preview`
observable, `role="img"` + descriptive `aria-label`), rendering deterministic
inline SVG (480×200 stage, `preserveAspectRatio="xMidYMid meet"` — no crop,
no stretch, crisp at any DPI, nothing to 404). Consumers:

- Creation Hub cards (`create-project-client.tsx`) — replaces the three
  ad-hoc previews.
- Dashboard project cards (`project-card.tsx`) — the header preview now
  matches the project's REAL environment (a 3D project no longer shows the
  generic app glyph).

**Asset contract**: external art (if ever produced) lives under
`public/ideaven/creation-previews/` and MUST be consumed through this one
component; pages never hardcode preview images or dimensions. Inline SVG is
the current implementation of that contract.

**Scene vocabulary (real engine values only, nothing invented):**

- APP — white device screen, `#f3f5f9` top bar, `#e3e6ee` placeholders,
  `#5743d9` primary button under the violet selection outline with corner
  handles (the editing metaphor), stacked block-motif shapes, an inspector
  panel hint.
- 2D — `#0c0f17` + dot grid, player `#46e3b4` (rounded square), platforms
  `#2a3348`, coins `#ffb454`, dashed violet camera viewport (dashed =
  guides), stage corner ticks. No fake gameplay stats.
- 3D — `#0c0f17`, flat ground quad + violet grid hairlines, the cube in its
  `#58c7f0` tri-tone flat shading (top `#7fd8f5` / side `#3d92ba` — the
  `shadeFace3D` look), two-tone sphere, warm point-light gizmo (marker +
  influence ring, `#ffd9a0`), dashed camera frustum, corner ticks. No GLB /
  PBR / terrain / shadows implied.

## 3. Real device orientation architecture

Structure (§10): stage (`overflow-auto`, measured) → layout spacer
(`measuredUnit × scale`) → device presentation unit (the ONE transform) →
`DeviceFrame` (orientation-aware bezel) → screen (native logical size from
`viewportSize()`).

- **One canonical dimension source** (§11): `VIEWPORT_SIZES` in
  `components/builder/viewport.tsx` (phone 390×844, tablet 834×1112,
  desktop 1280×800); the canvas preset row now derives from it — no
  duplicated constants. Orientation deterministically swaps the pair through
  `viewportSize()`.
- **One scale owner** (§12): unchanged from TASK 58 — the whole unit
  (bezel included) is measured at native size and carries the single
  `scale()` transform; the spacer reserves exactly `measured × scale`.
- **Orientation-aware chrome** (§14): `DeviceFrame` gains `orientation`.
  Phone landscape puts volume buttons on the top edge, power on the bottom,
  rotates the camera/speaker pill onto the left edge, and stands the home
  indicator on the right edge. Tablet swaps its camera between top-center
  (portrait) and left-center (landscape). The entire presentation reflows
  as one coherent object.
- **Fit recalculates** (§13): `fitScale = min(1, availW/nativeW,
  availH/nativeH)` against the MEASURED unit (bezel included) and the
  actual central stage (`surface.clientWidth/Height`, which already sits
  between palette and inspector — never the browser width). Zoom only
  changes the outer presentation scale (§12).
- **Authored layout untouched** (§15): orientation remains a preview
  setting (`settings.preview.orientation`) — component coordinates are never
  modified by it (regression-guarded by shell-integrity).
- **Game/3D stay scene stages** (§31): no fake phone frames introduced.

## 4. Builder toolbar system

- **Root fix**: the actions zone is now sized BY ITS CONTENT
  (`shrink-0`); the mode nav (`flex-1 min-w-0`) owns the remaining space and
  scrolls when tight. No zone can render on top of another at any width —
  asserted with pairwise bounding-box intersection checks at
  390/768/1024/1280/1440.
- **Semantic groups with hairline separators** (§19): [utility Assets+History]
  · [credits] · [history Undo/Redo] · [theme] · [publishing Publish+Export] ·
  [save].
- **Export priority** (§20): Export stays shrink-0 and visible at every
  tested width (icon fallback below lg with tooltip).
- **Save / Publish / Export distinction** (§21): Save = filled violet with
  tooltip "Save — persist the current project"; Publish = sky/mint outline
  with tooltip "Publish — snapshot this project to a public page
  (/p/<slug>)"; Export = neutral outline with its pipeline tooltip. Three
  separate visible controls at desktop (geometry-asserted).
- **Project name** (§25): truncated at `max-w-40` with a `title` tooltip —
  it cannot push actions away (the name is hidden below lg anyway).
- **Credits** (§26): icon+count at desktop, icon-only below sm; function
  intact.
- **Assets/History** (§27): utility group, into the overflow menu below xl.
- **390 compaction** (§18): below sm the inline theme toggle moves into the
  overflow menu (same `useTheme` cycle, labelled "Theme — switch to …") and
  Save becomes icon-only with its tooltip + aria-label; the engine-identity
  chip is hidden below md (the environment remains visible in the overflow
  menu and the Creation Hub). Measured result: no horizontal overflow and no
  collisions at 390.

## 5. Accessibility & SEO

- Every icon-only control exposes `aria-label` + `title`; orientation and
  zoom controls keep accessible names; overflow menu items are `role=menuitem`
  with Escape/outside-click close; previews are labelled media
  (`role="img"` + descriptive label), never anonymous decoration.
- Builder metadata stays environment-specific from TASK 60
  ("IDEAVEN App/2D Game/3D Game Builder", canonical `/builder/<id>`,
  noindex); the Creation Hub keeps its semantic `h1` and per-environment
  card labels; no hidden SEO text in the editor.

## 6. Verification

- `scripts/e2e-task61-creation-visuals.mjs` — **45/45, 0 console errors**:
  previews (existence, one architecture, labelled media, no broken images,
  geometry, 320→1440 responsiveness), dashboard cards per type, toolbar
  matrix with bounding-rect evidence (no collisions, Export reachable, no
  overflow, diagnostics collapsed — five widths), Save/Publish/Export
  separation, and the full landscape cycle: portrait geometry → landscape
  swap (ratio-preserving) → Fit inside stage → back to portrait restored →
  save → reload persistence → tablet landscape/portrait ratios.
- Regression sweep + gates: recorded in `docs/STATUS.md` §68 (24 suites
  listed in the directive §46, plus tsc / go vet / `go test -count=1` /
  next build / vinext build / Cloudflare preview verification).

## 7. Known limitations

- The app preview's phone miniature is deliberately small relative to the
  card (the 480×200 stage favors the wide scene languages); acceptable at
  card size, noted honestly.
- The builder at 390 remains a compressed desktop shell (per DESIGN.md §N:
  the canvas keeps pointer semantics; no dedicated mobile editor).
- 1024–1279 keeps the TASK 60 compaction (Assets/History/AI/Undo/Redo in
  the overflow menu) — §18 permits "secondary controls may compact"; at
  ≥1280 every primary control is inline.
- Creation previews are NOT wired into builder empty states (they already
  carry canonical quick-create actions; large illustrations would crowd
  them).
