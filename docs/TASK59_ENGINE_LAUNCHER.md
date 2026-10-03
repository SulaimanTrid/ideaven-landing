# TASK 59 — Engine Launcher + Creation Hub

Status: **FUNCTIONAL / TESTED** (dedicated E2E 31/31, 16 regression suites green, all gates green)
Session: 59 (2026-10-03). Committed and pushed to origin/main.

---

## 1. Original problem

IDEAVEN already had three REAL creation engines — Application (device-framed
app builder), 2D Game (scene runtime, sprites, physics, lighting, particles,
state machines), and 3D Game (Viewport3D, hierarchy, physics, lighting,
gizmos, character controller) — but the product had no intentional front
door: the creation wizard's "3D" choice never actually created a 3D project,
the 3D option was labelled as a future milestone, and the builder showed no
persistent engine identity.

## 2. Root causes (verified in code, not guessed)

1. `create-project-client.tsx` step-12 ("2D or 3D?") stored the choice in a
   local `gameDimension` state that was NEVER sent to the API — `create()`
   posted `type: projectType` which stayed `"game"`. A user choosing 3D got a
   2D game project.
2. The 3D card still said "Foundation in development" with an amber
   "next engine milestone" notice — stale after TASKs 51–58.
3. The builder top-bar showed only `projectTypeLabel` ("Game"/"3D Scene") —
   no engine identity, no cross-environment navigation.
4. The app empty screen showed only a passive drag hint (no quick-create).

## 3. Canonical creation flow

Dashboard → Create Project → **Creation Hub** (`/dashboard/projects/new`)
→ choose Application / 2D Game / 3D Game → method (blank / template) →
details (name, optional description) → `projectApi.create({ type })` →
auto-route to `/builder/[id]` → the loaded `model.type` decides the engine
surface. URL-only modes were rejected; templates keep their own type
filtering; the "More kinds" chips remain for non-flagship types.

## 4. Implementation

- **Creation Hub rewrite** (`create-project-client.tsx`): three environment
  cards — Application, 2D Game, 3D Game — each with the engine icon, an
  honest env label ("3D ENGINE · FOUNDATION AVAILABLE" — confident, not
  dominant), title, description, capability chips (only real capabilities),
  a lightweight preview derived from the actual visual language (app chrome,
  2D scene composition, 3D cube-on-plane with camera ticks — no fake
  screenshots), and a "Start X" primary action. Method + details steps kept;
  `type` now flows canonically (`app`/`game`/`3d`).
- **Duplicate prevention**: `creatingRef` + `creating` disabled state — one
  creation intent = one project (E2E double-activation verified: exactly one
  project created).
- **Real errors**: `ApiError` field errors surface on the name field; other
  failures show an honest error and stay on the hub with the environment
  preserved (E2E: injected a real 500 via route interception).
- **Builder engine identity** (`top-bar.tsx` + `project-meta.
  engineIdentityLabel`): a subtle `[ 3D GAME ▾ ]` chip
  (`data-engine-identity`) next to the logo.
- **Environment menu (creation navigator)**: lists Application / 2D Game /
  3D Game; the current environment is disabled; choosing another opens a
  confirm dialog ("Create a new 3D Game project? — <current project> stays
  exactly as it is"), then creates a NEW project via `projectApi.create`
  (loading state, disabled double-activation, real error text) and routes to
  it. The current project is NEVER mutated (E2E-verified screens JSON
  identical before/after). Escape/outside-click close it.
- **App empty state** (canvas.tsx): "Create your first component
  [Button][Text][Image]" calling `actions.insertNew` — the same canonical
  insertion as the palette. (Game empty-state moved into `screenRoot` so it
  renders once for both shell variants.)
- **Icon**: new `IconCube3D` (isometric cube, same stroke language) —
  distinct from the 2D gamepad; no emoji, no new icon library.

## 5. Accessibility

Semantic buttons, `aria-pressed`/`aria-expanded`/`aria-haspopup`,
`role="menu"`/`menuitem`, `role="dialog"` + `aria-modal` for the confirm,
visible focus rings throughout, Enter activates, Escape closes, no
mouse-only interaction, card body is not clickable (only labeled actions).

## 6. Verification

- `scripts/e2e-engine-launcher.mjs` — **31/31**: hub opens from the
  dashboard; three cards with Start actions; Start App/2D/3D each create the
  correct canonical type (API-verified) and open the correct builder; engine
  identity visible per type; reload persistence; environment menu lists all
  three with current disabled; cross-navigation confirmation creates a NEW
  project while the current one's screens JSON stays byte-identical;
  double-activation creates exactly one project; injected 500 shows a real
  error on the hub; responsive 390/768/1024/1280; keyboard reachability +
  Enter + Escape; no unexpected console/page errors.
- Regressions (16 suites): builder-shell-integrity 35, character-controller
  35, material-lighting 42, gizmos 34, physics 24, foundation 18, hierarchy
  17, tilemap 44, input-actions 32, camera 34, particles 22, state-machine
  20, 2d-lighting 19, sprite 18, gameplay 21, sorting 19, motion 11 — all
  green. tsc clean; go vet clean; go test 11/11; next build exit 0;
  build:vinext exit 0.

## 7. Known limitations

- AI-generated start is still "Coming soon" (honest badge).
- The 3D card states "Foundation available" — no claims of AAA/PBR/terrain.
- Only blank/template methods exist; no import paths.
- The environment menu creates anonymous-name projects ("My 3D Game") —
  rename happens inside the builder.

### Next exact task

STOP per the directive — await explicit approval before TASK 60.
