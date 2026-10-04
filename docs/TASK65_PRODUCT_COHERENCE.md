# TASK 65 — Product Coherence: Landing → Dashboard → Creation Hub → Builder

Status: **FUNCTIONAL / TESTED** (dedicated E2E 49/49; full regression sweep +
gates recorded in STATUS §72)
Session: 65 (2026-10-04).

---

## 1. Product information architecture (unchanged in shape, now coherent in voice)

One product, one loop: IDEA → BUILD → SEE → UNDERSTAND → IMPROVE → SHARE.
The public journey DISCOVER → CREATE → BUILD → PREVIEW → PUBLISH → SHARE →
REMIX → EXTEND now reads the same on every surface, because every entry
point uses the same canonical routes and the same vocabulary:

- **Creation**: `/start` → `/dashboard/projects/new` (the TASK 59 Creation
  Hub — still the ONLY creation implementation).
- **Builder**: `/builder/<id>` (Tasks 58–63 shell untouched).
- **Publish/Share**: builder Publish → `/p/<slug>` (the real runtime).
- **Remix**: `/p/<slug>` → "Remix into my account" → a NEW project in the
  remixer's account with the correct engine.
- **Learn/Explore/Community/Pricing**: real routes, real data.

No second dashboard, creation hub, project model, design system, CTA
router, badge system, preview system, metadata system, theme system, or
icon system was created — every fix reuses existing primitives
(`project-meta.ts`, `engineIdentityLabel`, `CreationPreview`, `safeNextPath`,
`RequireAuth`, the auth provider, i18n dictionaries, UI kit).

## 2. Root causes found (the "several unrelated web apps" feeling)

1. **Navigation drift**: header + footer labeled "Learn"/"Explore" but
   linked to landing anchors (`/#journey`, `/#explore`) while real `/learn`
   and `/explore` pages existed — the nav promised places the product has,
   then delivered a marketing scroll.
2. **`/start` was a dumb redirect to `/register`** — the canonical hub is
   `/dashboard/projects/new`, so landing CTAs never reached it directly for
   signed-in users, and creation intent died at an auth wall.
3. **The hub ignored a `?type=` preselect** and RequireAuth dropped query
   strings, so "Start 2D Game" could not survive the journey into the right
   environment.
4. **Engine identity split-brain**: dashboard cards/public pages said
   "Game"/"3D Scene" while the builder said "2D GAME"/"3D GAME"/"APP".
5. **Stale honesty on the dashboard**: "the editor arrives in the next
   phase" — the editor has existed since Task 60.
6. **No creation section on the landing** and zero extension mentions.

## 3. What changed

### `/start` — the smart front door (§15/§32/§33/§34)

- `StartRedirect` uses the session truth the app already has (`useAuth` →
  `/api/me`): authenticated → the Creation Hub (preserving `?type=`);
  anonymous → `/register?next=<hub>` so creation intent survives sign-up.
- `RegisterForm` now honors `?next=` via the SAME `safeNextPath` primitive
  the login form uses (no duplicate logic).
- `RequireAuth` keeps path **and query** in the `next` return (deep links
  survive the login stop).

### Creation Hub — same flow, deeper entry (§8/§16)

- The hub reads `?type=`, validates it against the canonical `PROJECT_TYPES`
  (unknown values are ignored), preselects the environment, and starts at
  the method step. It is still ONE flow — the deep link just skips step 1;
  "Change environment" returns to the full choice.

### Landing — the product front (§4–§11)

- New **"Three ways to create"** section (`#ways-to-create`): Application /
  2D Game / 3D Game cards, each with who it is for, what capabilities exist,
  a real `CreationPreview` (the TASK 61 system — no mock interfaces), and
  CTAs **Start App / Start 2D Game / Start 3D Game** → `/start?type=…`.
- §9: honest extension positioning line — "publish your own blocks as
  extensions and they appear in your Blocks palette" — with a link to the
  extensions dashboard. No marketplace-maturity claims.
- Hero: primary **Start Building** → `/start`; secondary **Explore** → the
  real gallery `/explore` (§37: Explore connects onward — cards open live
  projects with Run + Remix). The final CTA's secondary anchor was
  relabeled honestly ("See it in action") since it scrolls to the showcase.
- No invented metrics anywhere (no creator/project/build counts).

### Dashboard — creation first (§12/§13/§35/§36)

- Primary action: **Create Project** → the hub (was already true; now
  asserted).
- The stale "editor arrives in the next phase" line is GONE.
- New **"Start here"** strip: Templates / Learn / Community — real routes
  with one-line honest descriptions.
- Empty state (§35): the three canonical entries **Create Application /
  Create 2D Game / Create 3D Game** (routing through the hub with
  `?type=`) above "Create your first project". No fake recent projects.
- Project cards (§13): name, status, thumbnail (CreationPreview), relative
  updated time — and an **engine identity badge** (`data-engine-badge`)
  using the same vocabulary as the builder header.

### Engine identity — ONE vocabulary (§14)

`project-meta.ts` is the single vocabulary source:
`app → "App"`, `game → "2D Game"`, `3d → "3D Game"`; `engineIdentityLabel`
uppercases for badges (APP / 2D GAME / 3D GAME). The old "Game"/"3D Scene"
conflicts are gone from cards, public pages, and Explore filters. The
design-mode canvas overlay keeps its context-specific "3D SCENE · <screen>"
label (that is a scene label, not a project-type label).

### Publish/Share/Remix (§17–§20)

- Publish → `/p/<slug>` with QR + "Open public page" (unchanged, verified).
- Public project page: project name, creator, **engine identity badge**,
  description, live runtime (the SAME runtime as builder preview — §18),
  discussions, and **Remix into my account** (real copy → correct engine).
- No editor chrome, no diagnostics, no session artifacts on public pages.

### Navigation (§21/§22/§33/§34)

- Header links: **Learn / Explore / Community / Pricing / Create** — all
  real routes. Footer mirrors the same truth + "Start Building".
- Authenticated users see a primary **Home** (workspace) CTA plus the
  account menu (now including Extensions) — discovery never disappears.
- Builder navigation untouched (task-oriented, Tasks 58–63 intact).
- Logo usage unchanged (approved mark, no collision — fixed header offset).

### Colors/typography/motion (§23–§25)

No new colors, no new motion tokens, no giant text: the new section reuses
SectionHeader/Chip/Container/CreationPreview and the house link/button
patterns; the only motion is the existing `Reveal` entrance.

### SEO (§31)

- Public project pages: title `IDEAVEN — <Project Name>`, description from
  public-safe fields, Open Graph (title/description/type).
- `/explore` gained real metadata via a server layout (title/description/
  canonical); `/community` and `/pricing` carry title + description
  (+ canonical on pricing); `/learn` unchanged (already complete).
- Builder pages keep their engine-aware titles (IDEAVEN 3D Game Builder —
  asserted since TASK 60).

### i18n (§29)

New strings exist in BOTH dictionaries: `nav.create`, the full
`landing.path*` set (kicker/title/lead/card titles/for-lines/descriptions/
CTAs/extensions line), and the `dash.startHere`/`dash.emptyCreate*` set.
No language logic duplicated; no mixed-language sentences introduced.

### Performance & security (§40/§42/§43)

- The new section is pure SVG/DOM (CreationPreview) — no images, no new
  bundles, no video. No new trackers.
- Public pages expose public-safe fields only (verified: no editor chrome,
  no session strings, no diagnostics).

## 4. Verification

- **New E2E** `scripts/e2e-task65-product-coherence.mjs`: **49/49, 0
  console errors** — covers §44's 36 areas (navigation truth, canonical CTA
  routing for all three environments through the hub, builder identities,
  dashboard cards/return/empty states, publish → public page → remix with
  two real users, EN + ID, light + dark, 390→1440 overflow, headings/CTA
  accessibility, metadata, private-data safety, error hygiene), §45
  cross-surface flows (landing → explore; landing → learn → creation;
  pricing → creation; full publish/remix journey), and §46 screenshots
  (landing ×4 widths, dashboard, hub, public project — at 390/768/1280/1440
  where applicable).
- Screenshots land in `scripts/screenshots-task65/` and are asserted
  non-trivial (>10 KB) — DOM text alone is not trusted for layout.
- §47 builder regression: the suite itself opens APP/2D/3D builders and
  asserts identity + viewport; the §48 sweep covers the rest.
- Known test-side finding: a blank game screen renders no scene canvas
  (a scene requires an entity) — the suite seeds a real player before
  publishing so the public page proves the real runtime.

## 5. Known limitations / honest notes

- `/start` performs a client-side session check (a branded splash for a
  moment) — it uses the app's real session truth rather than a second
  server-side auth path.
- Landing body sections beyond the new one remain English-first (existing
  coverage state — not worsened; the new surfaces are fully bilingual).
- The public project page ships the published model JSON to the visitor —
  that IS the published app (the snapshot the owner chose to make public);
  private data (drafts, other users' projects, internal diagnostics) is
  never included.
- Remix requires sign-in (honest CTA: "Sign in to remix").
