# TASK 63 — Beginner Workspace Navigation + Scrollable Editor Panels

Status: **FUNCTIONAL / TESTED** (dedicated E2E 42/42; full regression sweep +
gates recorded in STATUS §70)
Session: 63 (2026-10-04).

---

## 1. Workspace architecture (ONE builder shell, §3)

The single builder shell is unchanged: GLOBAL HEADER → mode strip →
WORKSPACE (LEFT panel / MAIN surface / RIGHT panel) → Diagnostics
(collapsed by default). Project type still picks the editor surface
(Palette vs GameObject list, SceneEditor vs Viewport3D, preview variants) —
there are no per-engine builders.

## 2. What changed

### Mode navigation (§4/§5/§24)

- One controlled horizontal strip; tabs keep consistent sizing, never
  shrink into unreadability, never wrap into two rows.
- Active tab = `aria-current="page"` + filled background + a violet
  UNDERLINE — active state is never color alone.
- Tooltips document the new keyboard shortcuts: **Alt+1..5** =
  Design/Blocks/Code/Preview/Insights (guarded: ignored while typing in a
  field; plain W/A/S/D/E/R/Space untouched for gameplay/tools).
- **Root-cause fix found by the suite**: the strip used `justify-center`;
  when the tab row overflowed, centered content spilled LEFT under the
  brand zone and the breadcrumb intercepted clicks (measured interception
  at 1440). Now `justify-start` — overflow scrolls predictably to the
  right, the active tab is always reachable.

### Breadcrumb / context (§32/§33)

- ONE compact breadcrumb in the header: `My Project / ENGINE / MODE`
  (`data-workspace-context`, aria-labelled). It REPLACED the separate name
  span (which plus a breadcrumb could collide with the strip at xl) and is
  `pointer-events-none` — informational, never steals a click.

### Left panel (§6/§7/§8)

- Independent scroll container (`[scrollbar-width:thin]`), sticky search.
- **Search**: filters instantly over label + type + category + a small
  alias map ("text" → Text / Text Input / Password Input / Text to Speech;
  "tap" → Button). Registry vocabulary only — no second index. While
  searching, all matching groups render flat with a live count.
- **Collapsible categories**: chevron headers with `aria-expanded` /
  `aria-controls`; state persisted per project type in localStorage
  (`ideaven.palette.open.<type>` — UI-only, never the model). Default:
  primary category (Game Entities / 3D Objects / User Interface) open,
  marked "· start here"; the rest collapsed for beginners.

### Right inspector (§10/§11)

- Independent scroll container; Layers stay pinned above.
- **Collapsible sections**: every `Section` header is now a button with
  `aria-expanded`/`aria-controls` (all start open — no behavior removed).
- Scroll preservation: the rail is a native scroller outside the React
  selection state; selecting another object does not reset it (asserted;
  focus restoration may shift it deeper, but it never resets to top).

### Panel collapse (§26)

- Desktop: left and right rails each carry a collapse button; a collapsed
  rail becomes a compact strip (icon + vertical label) with an explicit
  recovery button — `aria-expanded` + `aria-controls` on both states. The
  main viewport reflows into the freed space.

### Small widths (§27/§28)

- 390: rails hidden; floating action buttons open the **palette drawer**
  (below md) and the **inspector drawer** (below lg, design mode) as
  right-side sheets — `role=dialog` + `aria-modal`, backdrop click and
  Escape close (window-level Escape listener: focus may live on the FAB
  outside the drawer), and only ONE major drawer is open at a time (opening
  one closes the others).
- 768: left rail visible, inspector reachable as the drawer FAB.
- 1280+: three columns as before (TASK 61 collision guards intact).

### Code / Blocks / Preview (§16/§17/§21/§22)

- Code: Monaco keeps its own scroll containers (independent vertical +
  horizontal; word wrap on; no page-level scroll) — asserted with
  Ctrl+Home→End scroll evidence. A one-line beginner hint appears under the
  toolbar for generated code.
- Blocks: the canvas already owned pan (background drag + plain wheel) and
  zoom (ctrl+wheel at cursor); TASK 63 asserts them and adds the §19
  empty-state hint "Start with an event block — 'When this happens…'". The
  palette rail scrolls independently.
- Preview: rails are hidden; device/zoom/restart controls stay reachable;
  diagnostics remains collapsed.

### Guidance (§19/§30/§31)

- Blocks empty state: "Start with an event block" hint (empty-state only).
- Code: generated-TypeScript hint (visible only while the buffer is
  generated and undirty).
- Design/3D empty states already carry real quick-create actions (TASK
  58/62 suites guard them).

### Scrollbar/body strategy (§34/§35)

- The builder page is `h-dvh` — the body never scrolls; all scrolling
  happens inside the palette, inspector, code editor, blocks workspace, and
  preview stage. Rails/containers use native scrolling with
  `scrollbar-width:thin` (no custom scrollbar JS).

### State separation (§38) / routing (§39)

- All TASK 63 state (collapsed rails, drawers, palette categories, search)
  is builder-local React state or localStorage — never the project model.
- No new URLs; modes remain local builder state.

## 3. Known limitations

- The mode strip is left-aligned when it overflows (previously centered);
  centered overflow was the unreachable-tabs bug.
- Panel collapse is desktop-only; small widths use drawers instead (§26's
  "drawers at small width").
- Category-collapse persistence is per browser (localStorage), per project
  type — not synced.
- Inspector section collapse state is session-local (not persisted).
- e2e-community.mjs remains a legacy drift audit (STATUS §68) — untouched.

## 4. Verification

- `scripts/e2e-task63-workspace-navigation.mjs` — **42/42, 0 console/page
  errors** across all three engines (details in STATUS §70).
- Regression sweep + gates: STATUS §70.
