NEXT_TASK:
STOP — awaiting explicit approval per the Cloudflare Phase 1B directive.
Queued: Cloudflare dashboard deploy (needs account auth) or TASK 58 onward.

FILES / MODULES TO CONTINUE FROM:
- apps/web/wrangler.jsonc + apps/web/vite.config.ts (CF Phase 1B generated
  config — source of truth for Workers deploy)
- apps/web/package.json (scripts dev:vinext/build:vinext/start:vinext/
  deploy:vinext; react 19.3.0; type: module; vinext/wrangler/vite deps)
- pnpm-workspace.yaml (allowBuilds: esbuild true, workerd true, sharp false)
- scripts/verify-cf-preview.mjs (12-check Workers preview verification)
- docs/CLOUDFLARE_WEB_DEPLOYMENT.md (Phase 1B record + dashboard checklist
  + rollback)
- apps/web/src/lib/character3d.ts (TASK 57 controller)
- apps/web/src/lib/transform-gizmo.ts (TASK 56 gizmo math)
- apps/web/src/lib/render3d.ts (renderer + shading + gizmos + mat4Invert)
- apps/web/src/components/runtime/viewport-3d.tsx (physics/controller/gizmos)
- apps/api/internal/project/export.go (vanilla mirrors)
- scripts/e2e-3d-character-controller.mjs (35 checks)
- docs/TASK51..57 + docs/CLOUDFLARE_WEB_DEPLOYMENT.md
- docs/DESIGN.md (the visual constitution — read before any UI/copy work)
# IDEAVEN PROGRESS STATE â€” portable development handoff

> Regenerate/update this file at the END of every implementation session.
> The repository is the source of truth; this file only points at it.

CURRENT_DATE: 2026-09-27
CURRENT_COMMIT: 190a3f4 (docs: record commit 500d922 in the progress handoff; git restored via portable MinGit)
PUSHED: YES — origin/main = 190a3f4 (https://github.com/SulaimanTrid/ideaven-landing.git), fully up to date as of 2026-09-27.
CURRENT_BRANCH: main

GIT RESTORED (2026-09-27): MinGit 2.47.1 portable at ideaven-v7\tools\mingit
(add tools\mingit\cmd to PATH). The full uncommitted batch (sessions 42–56)
is committed as 500d922 and PUSHED to origin together with the four older
unpushed commits (35fd4a1, ef32e75, cf1d9d1, e91459a) and this handoff
update (190a3f4).

âš ï¸ GIT RESTORED: MinGit 2.47.1 portable lives at ideaven-v7\tools\mingit
(put tools\mingit\cmd on PATH). Committer identity: Ideaven Dev
<dev@ideaven.local>. The previously uncommitted batch (TASK 12 credit
purchase, TASK 14 camera behaviors, rule tiles, sorting layers, sessions
42â€“56: input abstraction, action events, sprite animation, state machine,
2D lighting, particles, 3D foundation/hierarchy/physics/material-lighting/
gizmos/character-controller, anti-slop + DESIGN.md + motion) is COMMITTED
(500d922, 104 files, +21,577) and PUSHED to
https://github.com/SulaimanTrid/ideaven-landing.git — origin/main is up to
date (190a3f4). No pending commits remain.

CURRENT_OBJECTIVE:
Cloudflare Workers Web Deployment Phase 1B is COMPLETE and verified: the
EUNSUPPORTEDPROTOCOL failure (npm auto-detection vs pnpm workspace) is fixed
with an EXPLICIT generated config — apps/web/wrangler.jsonc + vite.config.ts
via `vinext init --platform=cloudflare` (vinext 1.0.0-beta.12, wrangler
4.141.0), scripts dev:vinext/build:vinext/start:vinext/deploy:vinext added
(dev/build/start untouched), `workspace:*` INTACT, pnpm install from root
works, react 19.3.0, allowBuilds esbuild/workerd completed. Verified:
build:vinext exit 0 (32 routes), Workers preview on :8787 (browser
verification 12/12 — landing/login/register/pricing/explore/docs render,
zero pageerror/zero hydration errors; API-connection refusals expected —
backend intentionally not deployed), wrangler deploy --dry-run exit 0.
Regressions after the change: 15 E2E suites green, tsc clean, go vet clean,
go test 11/11, next build exit 0 (Vercel intact). Real dashboard deploy
pending Cloudflare auth (one command: pnpm run deploy:vinext; root dir
apps/web). ALSO: a manual test account was created via the auth API for 3D
testing (credentials shared with the owner in chat ONLY — never committed). STOP per directive.


COMPLETED (session 52 â€” TASK 53 3D hierarchy):
- hierarchy3d.ts (new): computeWorldMatrices, childrenMap3D,
  descendantsOf3D, HierarchyIssue (cycle/self-parent/missing-parent/
  excessive-depth)
- render3d.ts: mat4 helpers (identity/multiply/composeTRS/transformPoint) +
  Mesh3D.matrix consumed by meshFaces
- ops.ts: setParent3D (cycle-guarded), duplicateHierarchy3D (subtree with
  id remap), removeComponent3D (children reparent to grandparent)
- viewport-3d.tsx: meshes from world matrices + HierarchyPanel (editor)
- inspector.tsx: Hierarchy3DPanel (parent picker, world position
  read-only, duplicate/delete)
- diagnostics.ts: hierarchy issues as warnings
- export.go: vanilla hierarchy mirror in the 3D draw path
- gates: e2e-3d-hierarchy 17/17 NEW; regressions 3d-foundation 18/18,
  input-actions 32/32, tilemap 44/44, gameplay 21/21, camera 34/34,
  sorting 19/19, motion 11/11, sprite-animation 18/18, state-machine
  20/20, lighting 19/19, particles 22/22; tsc clean; go vet clean;
  go test 11/11 packages with tests; next build green

PARTIALLY_COMPLETE:
- Tilemap SYSTEM 4: shading vocabulary is 3 variants (interior/edge/base) â€”
  no per-tile rule variants, no 8-neighbor blob auto-tiling; all tile values
  are solid (no per-value collision flags); no fill tool; no multiple
  tilemap layers; palette editing is a text field.
- 2D engine wider roadmap (PHASE Gâ€“J): lighting (5), sprite shape (6),
  pixel-perfect camera (7), prefabs (10), particles (18), input abstraction
  (19), animation state machine (20), debug overlays (21), atlas/slicing/
  pivot deepening (1Câ€“1F), skeletal foundation (2B) â€” NOT_STARTED.
- Export touch events for solid entities fire in the preview runtime but
  not in the exported sceneTick (pre-existing gap, unchanged).

IN_PROGRESS: nothing (slice boundary â€” clean handoff point).

BLOCKED: nothing technical. NOTE: git is not on PATH on this machine, so
the uncommitted batch above cannot be committed until git is available.

SESSION LOG:

## Session 57 (2026-10-02)
DATE: 2026-10-02
COMMIT: (this session) Cloudflare Phase 1B — committed + pushed
CURRENT PHASE: Cloudflare Workers Web Deployment - Phase 1B
CURRENT FEATURE: explicit vinext/Wrangler configuration for apps/web
COMPLETED THIS SESSION:
- vinext check in apps/web: 87% compatible, NO blockers (2 partial:
  next/font/google CDN fonts, App Router strict-mode wrapping)
- vinext init --platform=cloudflare: generated apps/web/wrangler.jsonc
  (Worker `web`, fetch-handler, nodejs_compat, assets dist/client, IMAGES),
  apps/web/vite.config.ts (vinext + CF vite plugin), apps/web/.gitignore,
  scripts dev:vinext/build:vinext/start:vinext/deploy:vinext (dev/build/
  start untouched), react 19.1.0 -> 19.3.0, "type": "module"
- pnpm-workspace.yaml allowBuilds placeholders completed (esbuild true,
  workerd true; sharp false kept) — build scripts now run
- pnpm install (root) clean; workspace:* intact; no monorepo flattening
- pnpm approve path: esbuild/workerd postinstall ran via allowBuilds
VERIFIED THIS SESSION: build:vinext exit 0 (32 routes, dist/client+server);
start:vinext Workers preview on :8787 + browser verification 12/12
(scripts/verify-cf-preview.mjs: landing/login/register/pricing/explore/docs
render, header nav, builder fallback without backend, ZERO pageerror, ZERO
hydration errors; API-connection refusals are the only console errors and
are expected — backend intentionally not deployed); wrangler deploy
--dry-run exit 0 (202 modules); regressions after change: 15 E2E suites
green (controller 35, material-lighting 42, gizmos 34, physics 24,
foundation 18, hierarchy 17, tilemap 44, input-actions 32, camera 34,
particles 22, state-machine 20, 2d-lighting 19, sprite 18, gameplay 21,
sorting 19, motion 11), tsc clean, go vet clean, go test 11/11, next build
exit 0 (Vercel intact). Evidence in STATUS.md 64 +
docs/CLOUDFLARE_WEB_DEPLOYMENT.md.
ALSO THIS SESSION: created a manual test account via the auth API for the
owner to try the 3D features (credentials shared in chat only, NOT in the
repo); PostgreSQL restarted after machine memory-pressure kill.
TEST RESULTS: go test -count=1 ./... -> ok 11/11 packages with tests.
E2E RESULTS (this session): controller 35/0; lighting 42/0; gizmos 34/0;
physics 24/0; foundation 18/0; hierarchy 17/0; tilemap 44/0; input-actions
32/0; camera 34/0; particles 22/0; state-machine 20/0; 2d-lighting 19/0;
sprite 18/0; gameplay 21/0; sorting 19/0; motion 11/0.
KNOWN LIMITATIONS: Workers deployment has NO backend (auth flows fail until
the Go API phase — not faked); vinext is 1.0.0-beta; next/font/google uses
CDN fonts; Worker name `web` (generated); real dashboard deploy pending
Cloudflare account auth.
CURRENT BLOCKERS: Cloudflare deploy needs the owner's Cloudflare account
authentication (dashboard login or wrangler login).
NEXT EXACT TASK: STOP - awaiting approval; Cloudflare dashboard deploy or
TASK 58.

## Session 56 (2026-09-27)
DATE: 2026-09-27
COMMIT: none (uncommitted batch on top of e91459a - no git binary on this machine)
CURRENT PHASE: 3D Engine - TASK 57 Real 3D Character Controller + Input
CURRENT FEATURE: playable 3D gameplay (movement + jump + collision)
COMPLETED THIS SESSION:
- character3d.ts (new): parseController3D (clamped), resolveControllerKeys
  (canonical inputActions with 3D defaults W/A/S/D+arrows+Space),
  inputVector (normalized), cameraBasis (active camera facing),
  controllerVelocity (acceleration/deceleration/airControl)
- viewport-3d.tsx: runtime-only pressed-key set + jump edge, controller
  velocity applied per fixed step BEFORE PhysicsWorld.step, observability
  attrs (data-3d-player, data-controller-enabled/grounded/speed);
  data-physics-bodies now carries x/y/z (web + export identical)
- inspector.tsx: Controller3DPanel (Enabled/Move speed/Acceleration/
  Deceleration/Jump force/Air control; maxSlopeAngle honestly absent)
- diagnostics.ts: multiple controllers, controller w/o dynamic body,
  gravity disabled, range warnings, no-controller info
- export.go: vanilla mirror (applyController3D + key listeners installed
  once per run) with identical math + observability
VERIFIED THIS SESSION: e2e-3d-character-controller 35/35 NEW (real keyboard
gameplay: W/S/A/D camera-relative displacement, solo speed = moveSpeed,
normalized diagonals, deceleration to rest, gravity fall/land/grounded/
stable rest, Space jump + return, no hold-stacking, airborne rejection,
wall blocking at the exact face + no tunneling, restart reset, save/reload
persistence, published movement, exported-run-from-disk movement + jump,
no editor UI in runtime); regressions 3d-foundation 18/18, 3d-hierarchy
17/17, 3d-physics 24/24, 3d-material-lighting 42/42, 3d-transform-gizmos
34/34, input-actions 32/32, tilemap 44/44, gameplay 21/21, camera 34/34,
sorting 19/19, motion 11/11, sprite-animation 18/18, state-machine 20/20,
2d-lighting 19/19, 2d-particles 22/22; tsc clean; go vet clean; go test
11/11 packages with tests; next build green. Evidence in STATUS.md 63 +
docs/TASK57_3D_CHARACTER_CONTROLLER.md.
TEST RESULTS: go test -count=1 ./... -> ok 11/11 packages with tests.
E2E RESULTS: 3d-character-controller 35/0/0; 3d-transform-gizmos 34/0/0;
3d-material-lighting 42/0/0; 3d-physics 24/0/0; 3d-hierarchy 17/0/0;
3d-foundation 18/0/0; particles 22/0/0; lighting 19/0/0; state-machine
20/0/0; sprite-animation 18/0/0; input-actions 32/0/0; tilemap 44/0/0;
gameplay 21/0; camera 34/0; sorting 19/0; motion 11/0.
KNOWN LIMITATIONS: no slopes/stairs/crouch/sprint/ladders/double-jump/
moving platforms/root motion/full 3D camera controllers/ragdoll/navmesh/
capsule colliders/touch controls/3D camera follow (authored camera fixed);
box character collider (no fake capsule); git unavailable -> uncommitted.
CURRENT BLOCKERS: none (commit pending git availability).
NEXT EXACT TASK: STOP - awaiting approval; queued TASK 58.

## Session 55 (2026-09-26)
DATE: 2026-09-26
COMMIT: none (uncommitted batch on top of e91459a - no git binary on this machine)
CURRENT PHASE: 3D Engine - TASK 56 Real 3D Transform Gizmos
CURRENT FEATURE: move/rotate/scale gizmos with real ray interaction
COMPLETED THIS SESSION:
- transform-gizmo.ts (new): screenToWorldRay (exact unprojection),
  axisRayParameter (closest point ray/axis), rayPlanePoint + planarAngle +
  angleDelta (rotate), scaleFromProjection (clamped 0.1-100), gizmoAxes
  (local/world), worldCenterOf
- render3d.ts: mat4Invert (determinant-guarded), projectTransformGizmo +
  drawTransformGizmo (move arrows / rotate rings / scale grips + uniform
  grip, screen-constant sizing, active-axis highlight)
- viewport-3d.tsx: gizmo mode/space state + toolbar (data-transform-mode/
  space), handle picking from the SAME projected geometry as drawn,
  deterministic drag preview in the rAF loop (hierarchy-aware), commit-once
  at pointer release via onTransform, Escape cancel (capture-phase before
  builder deselect), W/E/R shortcuts (input-safe), data-gizmo-handles
  observability
- canvas.tsx: onTransform wired to actions.updateProps (one undoable commit)
VERIFIED THIS SESSION: e2e-3d-transform-gizmos 34/34 NEW (pointer-driven
drags at projected handles: move X/Y/Z + pixel centroid movement, one drag
= one undo entry exact to 1e-6 + redo, rotate X/Y/Z rings + inspector
parity, scale X/Y/Z + pixel growth + clamp, Local/World orientation,
parent-child (parent move -> child world moves; child gizmo -> child local
only), inspector<->gizmo parity both ways, save/reload, Escape cancel,
zero console errors); regressions 3d-foundation 18/18, 3d-hierarchy 17/17,
3d-physics 24/24, 3d-material-lighting 42/42, input-actions 32/32, tilemap
44/44, gameplay 21/21, camera 34/34, sorting 19/19, motion 11/11,
sprite-animation 18/18, state-machine 20/20, 2d-lighting 19/19, 2d-particles
22/22; tsc clean; go vet clean; go test 11/11 packages with tests; next
build green. Evidence in STATUS.md 62 + docs/TASK56_3D_TRANSFORM_GIZMOS.md.
TEST RESULTS: go test -count=1 ./... -> ok 11/11 packages with tests.
E2E RESULTS: 3d-transform-gizmos 34/0/0; 3d-material-lighting 42/0/0;
3d-physics 24/0/0; 3d-hierarchy 17/0/0; 3d-foundation 18/0/0; particles
22/0/0; lighting 19/0/0; state-machine 20/0/0; sprite-animation 18/0/0;
input-actions 32/0/0; tilemap 44/0/0; gameplay 21/0; camera 34/0; sorting
19/0; motion 11/0.
KNOWN LIMITATIONS: rotate rings map deltas to the matching local Euler axis
(world-space ring drags on parented objects may differ visually), no depth
axis/snapping/multi-select, gizmo draws without mesh occlusion, git
unavailable -> uncommitted work.
CURRENT BLOCKERS: none (commit pending git availability).
NEXT EXACT TASK: STOP - awaiting approval; queued TASK 57.

## Session 54 (2026-09-26)
DATE: 2026-09-26
COMMIT: none (uncommitted batch on top of e91459a - no git binary on this machine)
CURRENT PHASE: 3D Engine - TASK 55 Real 3D Material + Lighting
CURRENT FEATURE: baseColor material + point/directional lights + ambient + per-face N·L shading
COMPLETED THIS SESSION:
- lights3d.ts (new): parseLight3D/parseAmbient3D/validHexColor/resolveLights3D
  (hierarchy-resolved world lights) + LIGHT3D_LIMITS (max 8 lights)
- render3d.ts: shadeFace3D (ambient + bounded N·L + point attenuation,
  geometric viewer-oriented normals, clamp-safe), Light3DWorld/Ambient3D,
  drawLightGizmos (marker + influence ring / direction arrow)
- registry.tsx: light3d entity (point/directional), mesh color relabeled
  "Base color", ENTITY_TYPES + light3d
- inspector.tsx: Material3DPanel (Base Color, no roughness/metalness - honest),
  Light3DExplainer, T3D_TYPES vs T3D_PHYSICS_TYPES split (lights non-physics),
  ambient fallback type-aware
- viewport-3d.tsx: lights+ambient into drawScene3D in BOTH modes, light
  gizmos, collider gizmos gated to actual colliders
- diagnostics.ts: material/light ranges + excessive-light + ambient warnings
- export.go: vanilla mirror (parseLight3DProps/parseAmbient3D/resolveLights3D/
  shadeFace3D - identical equations); render3DScene refresh re-resolves lights
VERIFIED THIS SESSION: e2e-3d-material-lighting 42/42 NEW (pixel evidence:
exact base color + repaint, light on/off, light position, N·L orientation
front-vs-behind at equal distance, hierarchy-attached light follows parent,
persistence, undo/redo, malformed safety, 8-light boundary, 390px parity,
export-run-from-disk lit); regressions 3d-foundation 18/18, 3d-hierarchy
17/17, 3d-physics 24/24, input-actions 32/32, tilemap 44/44, gameplay 21/21,
camera 34/34, sorting 19/19, motion 11/11, sprite-animation 18/18,
state-machine 20/20, 2d-lighting 19/19, 2d-particles 22/22; tsc clean;
go vet clean; go test 11/11 packages with tests; next build green.
Evidence in STATUS.md 61 + docs/TASK55_3D_MATERIAL_LIGHTING.md.
TEST RESULTS: go test -count=1 ./... -> ok 11/11 packages with tests.
E2E RESULTS: 3d-material-lighting 42/0/0; 3d-physics 24/0/0; 3d-hierarchy
17/0/0; 3d-foundation 18/0/0; particles 22/0/0; lighting 19/0/0;
state-machine 20/0/0; sprite-animation 18/0/0; input-actions 32/0/0;
tilemap 44/0/0; gameplay 21/0; camera 34/0; sorting 19/0; motion 11/0.
KNOWN LIMITATIONS: flat per-face shading (no per-pixel pools on large
quads), no shadows/specular/spot/area lights/probes, roughness+metalness
unavailable (no controls), top-face sliver at typical cameras, pre-existing
390px chrome scrollWidth artifact (2D parity guarded), English-only
inspector labels (convention), git unavailable -> uncommitted work.
CURRENT BLOCKERS: none (commit pending git availability).
NEXT EXACT TASK: STOP - awaiting approval; queued TASK 56.


## Session 53 (2026-09-26)
DATE: 2026-09-26
COMMIT: none (uncommitted batch on top of e91459a - no git binary on this machine)
CURRENT PHASE: 3D Engine - TASK 54 Real 3D Physics Foundation
CURRENT FEATURE: collider + rigid body + gravity + trigger + collision
COMPLETED THIS SESSION:
- physics3d.ts (new): fixed-timestep solver (1/120s, <=4 catch-up), box/sphere
  colliders (world scale aware), inverse-mass split, grounded, trigger
  enter/stay/exit, PHYSICS_LIMITS, parse/normalize helpers
- viewport-3d.tsx: mount-stable physics seed + step loop, dynamic-body
  render overrides, touches- emit dispatch, data-physics-bodies /
  data-trigger-overlaps / data-physics-grounded, collider gizmos (editor),
  world matrices restored for ALL meshes (regression fix)
- export.go: vanilla solver mirror (sphere-aware overlapBetween), idempotent
  render3DScene (same-screen rerender refreshes meshes only; run-id stops
  superseded loops), runtime-prop meshes, observability attrs
- inspector.tsx: Physics3DPanel + scene gravity X/Y/Z; state-machine panel
  gating restored to ANIMATION_ENTITY_TYPES (regression fix)
- diagnostics.ts: mass/collider range warnings
- preview-mode/live-app: getProps wired into Viewport3D (set-property
  reaches 3D meshes)
VERIFIED THIS SESSION: e2e-3d-physics 24/24 NEW; regressions 3d-foundation
18/18, 3d-hierarchy 17/17, input-actions 32/32, tilemap 44/44, gameplay
21/21, camera 34/34, sorting 19/19, motion 11/11, sprite-animation 18/18,
state-machine 20/20, lighting 19/19, particles 22/22; tsc clean; go vet
clean; go test 11/11 packages with tests; next build green. Evidence in
STATUS.md 60 + docs/TASK54_3D_PHYSICS_FOUNDATION.md.
TEST RESULTS: go test -count=1 ./... -> ok 11/11 packages with tests.
E2E RESULTS: 3d-physics 24/0/0; 3d-hierarchy 17/0/0; 3d-foundation 18/0/0;
particles 22/0/0; lighting 19/0/0; state-machine 20/0/0; sprite-animation
18/0/0; input-actions 32/0/0; tilemap 44/0/0; gameplay 21/0; camera 34/0;
sorting 19/0; motion 11/0.
KNOWN LIMITATIONS: no rotation in collision response (world-aligned AABBs),
no torque/friction/restitution/joints/raycasts, no physics debug overlay,
git unavailable -> uncommitted work.
CURRENT BLOCKERS: none (commit pending git availability).
NEXT EXACT TASK: STOP - awaiting approval; queued TASK 55.


## Session 52 (2026-09-26)
DATE: 2026-09-26
COMMIT: none (uncommitted batch on top of e91459a - no git binary on this machine)
CURRENT PHASE: 3D Engine - TASK 53 Scene Hierarchy + Parenting
CURRENT FEATURE: parentId hierarchy + derived local/world transforms
COMPLETED THIS SESSION:
- hierarchy3d.ts (world-matrix evaluation, cycle-safe, issues surfaced)
- render3d.ts mat4 helpers + Mesh3D.matrix consumed by meshFaces
- ops: setParent3D / duplicateHierarchy3D / removeComponent3D
- viewport-3d: meshes from world matrices + HierarchyPanel (editor)
- inspector Hierarchy3DPanel (parent picker, world position read-only, duplicate/delete)
- diagnostics: hierarchy issues as warnings; export.go vanilla hierarchy mirror in the 3D draw path
VERIFIED THIS SESSION: e2e-3d-hierarchy 17/17 NEW; regressions 3d-foundation 18/18, input-actions 32/32, tilemap 44/44, gameplay 21/21, camera 34/34, sorting 19/19, motion 11/11, sprite-animation 18/18, state-machine 20/20, lighting 19/19, particles 22/22; tsc clean; go vet clean; go test 11/11 packages with tests; next build green. Evidence in STATUS.md 59 + docs/TASK53_3D_HIERARCHY.md.
TEST RESULTS: go test -count=1 ./... -> ok 11/11 packages with tests.
E2E RESULTS: 3d-hierarchy 17/0/0; 3d-foundation 18/0/0; particles 22/0/0; lighting 19/0/0; state-machine 20/0/0; sprite-animation 18/0/0; input-actions 32/0/0; tilemap 44/0/0; gameplay 21/0; camera 34/0; sorting 19/0; motion 11/0.
KNOWN LIMITATIONS: world transform read-only; no DnD reparenting; depth limit 32; painters algorithm; English-only inspector labels (convention); git unavailable -> uncommitted work.
CURRENT BLOCKERS: none (commit pending git availability).
NEXT EXACT TASK: STOP - awaiting approval; queued TASK 54.


## Session 51 (2026-09-26)
DATE: 2026-09-26
COMMIT: none (uncommitted batch on top of e91459a â€” no git binary on this machine)
CURRENT PHASE: 3D Engine â€” TASK 51 Foundation
CURRENT FEATURE: real model-driven 3D scene/camera/primitives/renderer
COMPLETED THIS SESSION:
- project type "3d" (migration 056 + Go vocabulary + InitialModel)
- render3d.ts (software perspective renderer) + viewport-3d.tsx
  (editor/runtime modes) + registry 3d defs + palette gating
- export.go vanilla renderer mirror + rerender branch
- diagnostics (no camera/active/fov/near-far)
VERIFIED THIS SESSION: e2e-3d-foundation 18/18 NEW (REAL 3D depth
occlusion + swap via pixel sampling, palette insert, inspector transforms,
undo/redo, malformed stability, preview/published parity, export engine);
regressions input-actions 32/32, tilemap 44/44, gameplay 21/21, camera
34/34, sorting 19/19, motion 11/11, sprite-animation 18/18,
state-machine 20/20, lighting 19/19, particles 22/22; tsc clean; go vet
clean; go test 11/11 packages with tests; next build green. Evidence in
STATUS.md Â§58 + docs/TASK51_3D_FOUNDATION.md.
TEST RESULTS: go test -count=1 ./... â†’ ok 11/11 packages with tests.
E2E RESULTS: 3d-foundation 18/0/0; particles 22/0/0; lighting 19/0/0;
state-machine 20/0/0; sprite-animation 18/0/0; input-actions 32/0/0;
tilemap 44/0/0; gameplay 21/0; camera 34/0; sorting 19/0; motion 11/0.
KNOWN LIMITATIONS: no 3D gameplay/lights/materials/animation; painter's
algorithm (no z-buffer); no transform gizmo; English-only inspector
labels (convention); git unavailable â†’ uncommitted work.
CURRENT BLOCKERS: none (commit pending git availability).
NEXT EXACT TASK: STOP â€” awaiting approval; queued TASK 52.

## Session 50 (2026-09-26)
DATE: 2026-09-26
COMMIT: none (uncommitted batch on top of e91459a â€” no git binary on this machine)
CURRENT PHASE: 2D Engine â€” SYSTEM 18 Real 2D Particles
CURRENT FEATURE: bounded particle emitter architecture end to end
COMPLETED THIS SESSION:
- particles.ts: parseEmitter (clamped) + ParticleSim (accumulator emission,
  cone spawn, dt update, interpolation, swap-remove recycling, hard bounds)
- `emitter` entity (registry/canvas gizmo/inspector fields, non-collidable)
- scene-stage: per-emitter sims, dt step, burst drain, world-anchored
  particle canvas (emissive, above lighting), data-particle-count
- export.go: vanilla sim mirror + canvas + burst-particle block
- diagnostics: rate/lifetime/maxParticles ranges + non-hex color
VERIFIED THIS SESSION: e2e-2d-particles 22/22 NEW (persistence, gizmos,
fields, edit+undo+redo, equilibrium, pixel evidence, camera anchoring,
bounded counts, burst spike + expiry, published parity, export engine,
invalid-config stability); regressions input-actions 32/32, tilemap 44/44,
gameplay 21/21, camera 34/34, sorting 19/19, motion 11/11,
sprite-animation 18/18, state-machine 20/20, lighting 19/19; tsc clean;
go vet clean; go test 11/11 packages with tests; next build green.
Evidence in STATUS.md Â§57.
TEST RESULTS: go test -count=1 ./... â†’ ok 11/11 packages with tests.
E2E RESULTS: particles 22/0/0; lighting 19/0/0; state-machine 20/0/0;
sprite-animation 18/0/0; input-actions 32/0/0; tilemap 44/0/0; gameplay
21/0; camera 34/0; sorting 19/0; motion 11/0.
KNOWN LIMITATIONS: no per-particle rotation or tinted textures (deferred);
emissive-only lighting mode; no play/stop emitter blocks (enabled prop
covers authoring; command path ready); git unavailable â†’ uncommitted work.
CURRENT BLOCKERS: none (commit pending git availability).
NEXT EXACT TASK: STOP â€” awaiting approval.

## Session 49 (2026-09-26)
DATE: 2026-09-26
COMMIT: none (uncommitted batch on top of e91459a â€” no git binary on this machine)
CURRENT PHASE: 2D Engine â€” SYSTEM 5 Real-time 2D Lighting
CURRENT FEATURE: ambient + point lights composited over the world
COMPLETED THIS SESSION:
- `light` entity (registry/canvas gizmo/inspector fields) + ambient in
  screen styles; scene.ts lightsOf/ambientOf + LIGHT_LIMITS
- world-anchored lighting compositing layer in scene-stage + export.go
  (ambient veil + screen-blend point gradients, camera tracking)
- diagnostics: out-of-range intensity/radius, non-hex color, ambient range
VERIFIED THIS SESSION: e2e-2d-lighting 19/19 NEW; regressions input-actions
32/32, tilemap 44/44, gameplay 21/21, camera 34/34, sorting 19/19, motion
11/11, sprite-animation 18/18, state-machine 20/20; tsc clean; go vet
clean; go test 11/11 packages with tests; next build green. Evidence in
STATUS.md Â§56.
TEST RESULTS: go test -count=1 ./... â†’ ok 11/11 packages with tests.
E2E RESULTS: lighting 19/0/0; input-actions 32/0/0; tilemap 44/0/0;
gameplay 21/0; camera 34/0; sorting 19/0; motion 11/0; sprite-animation
18/0/0; state-machine 20/0/0.
KNOWN LIMITATIONS: compositing illumination (no normal maps/shadows/
occlusion); no directional/spot lights; no lighting blocks (no gameplay
need yet); git unavailable â†’ uncommitted work.
CURRENT BLOCKERS: none (commit pending git availability).
NEXT EXACT TASK: STOP â€” awaiting approval; queued particles.

## Session 48 (2026-09-26)
DATE: 2026-09-26
COMMIT: none (uncommitted batch on top of e91459a â€” no git binary on this machine)
CURRENT PHASE: 2D Engine â€” SLICE 3 Sprite Animation State Machine
CURRENT FEATURE: model-driven state machine over the SLICE 2 player
COMPLETED THIS SESSION:
- canonical `animator` prop (S/P/T/D payload) + pure helpers in scene.ts
- runtime machine (built-in physics feed, deterministic evaluation, ONE
  switch per tick, trigger fire-once) driving the SLICE 2 player
- set/trigger animation parameter blocks (IR + codegen + export)
- sprite inspector StateMachinePanel (states/params/transitions/default)
- diagnostics: missing clip, missing default, dangling transitions,
  unknown condition parameters
VERIFIED THIS SESSION: e2e-animation-state-machine 20/20 NEW (playable
Idleâ†’Runâ†’Jumpâ†’Attackâ†’Idle via real physics + action events, save/reload,
published parity, export engine, diagnostics); regressions input-actions
32/32, tilemap 44/44, gameplay 21/21, camera 34/34, sorting 19/19, motion
11/11, sprite-animation 18/18; tsc clean; go vet clean; go test 11/11
packages with tests; next build green. Evidence in STATUS.md Â§55.
TEST RESULTS: go test -count=1 ./... â†’ ok 11/11 packages with tests.
E2E RESULTS: state-machine 20/0/0; input-actions 32/0/0; tilemap 44/0/0;
gameplay 21/0; camera 34/0; sorting 19/0; motion 11/0; sprite-animation
18/0/0.
KNOWN LIMITATIONS: exit time is a progress fraction (no seconds-based
exit/cross-fade); no set-state block (machine is the only state authority);
list editor, not a node canvas; git unavailable â†’ uncommitted work.
CURRENT BLOCKERS: none (commit pending git availability).
NEXT EXACT TASK: STOP â€” awaiting approval; queued lighting/particles.

## Session 47 (2026-09-26)
DATE: 2026-09-26
COMMIT: none (uncommitted batch on top of e91459a â€” no git binary on this machine)
CURRENT PHASE: 2D Engine â€” SLICE 2 Sprite Animation Foundation
CURRENT FEATURE: real sprite animation end to end (model â†’ editor â†’ runtime â†’ export)
COMPLETED THIS SESSION:
- canonical animations/animation props + scene.ts clip helpers
- runtime playback (dt-based, loop/non-loop, commands) + EntityView frames
- play/stop animation blocks + codegen + export engine
- sprite inspector Animation panel (clip CRUD, asset frame picker, preview)
- e2e-sprite-animation.mjs NEW (real PNG uploads via asset API)
VERIFIED THIS SESSION: e2e-sprite-animation 18/18; regressions
input-actions 32/32, tilemap 44/44, gameplay 21/21, camera 34/34, sorting
19/19, motion 11/11; tsc clean; go vet clean; go test 11/11 packages with
tests; next build green. Evidence in STATUS.md Â§54.
TEST RESULTS: go test -count=1 ./... â†’ ok 11/11 packages with tests
(corrects earlier session entries that said 12 â€” the suite has eleven
test-bearing packages).
E2E RESULTS: sprite-animation 18/0/0; input-actions 32/0/0; tilemap
44/0/0; gameplay 21/0; camera 34/0; sorting 19/0; motion 11/0.
KNOWN LIMITATIONS: Asset Studio SpriteDoc unchanged (bridge = saved frame
PNGs); block vocabulary play/stop (pause/restart in the command path,
palette entries intentionally skipped); e2e-motion press check now
load-robust; git unavailable â†’ uncommitted work.
CURRENT BLOCKERS: none (commit pending git availability).
NEXT EXACT TASK: STOP â€” awaiting approval; queued SLICE 3 state machine.

## Session 46 (2026-09-26)
DATE: 2026-09-26
COMMIT: none (uncommitted batch on top of e91459a â€” no git binary on this machine)
CURRENT PHASE: 2D Engine â€” SLICE 1b action-pressed handler event
CURRENT FEATURE: real edge-triggered action events in the block system
COMPLETED THIS SESSION:
- runtime dispatchActionPressed (screen-level â†’ components, model order,
  nested) + scene-stage tick wiring + export.go mirror
- blocks event picker + i18n (EN/ID) + registry fallback + diagnostics
  (deleted/disabled action references)
- REAL pre-existing bug fixed: omitempty dropped componentId for
  screen-level handlers â†’ dead after reload; (componentId ?? null)
  normalization in handlersFor + dispatcher + export
VERIFIED THIS SESSION: e2e-input-actions 32/32 NEW (edge/hold/release/
second-press, multi-handler, visible effect, published parity, export
markers, diagnostics, undo/redo); regressions tilemap 44/44, gameplay
21/21, camera 34/34, sorting 19/19, motion 11/11; tsc clean; go vet clean;
go test 11/11; next build green. Evidence in STATUS.md Â§53.
TEST RESULTS: go test -count=1 ./... â†’ ok 11/11 packages with tests.
E2E RESULTS: input-actions 32/0/0; tilemap 44/0/0; gameplay 21/0;
camera 34/0; sorting 19/0; motion 11/0.
KNOWN LIMITATIONS: mouse/gamepad bindings absent; "action held/value"
conditions future work; diagnostics "where" label cosmetic quirk for
reloaded screen-level handlers; git unavailable â†’ uncommitted work.
CURRENT BLOCKERS: none (commit pending git availability).
NEXT EXACT TASK: STOP â€” awaiting approval; queued SLICE 2 animation.

## Session 45 (2026-09-22)
DATE: 2026-09-22
COMMIT: none (uncommitted batch on top of e91459a â€” no git binary on this machine)
CURRENT PHASE: 2D Engine advanced gameplay â€” SLICE 1 Input Abstraction
CURRENT FEATURE: model-driven input actions end to end
COMPLETED THIS SESSION:
- reconciliation (sorting done, triggers/trace exist; input was the gap)
- inputActions model (web+Go) + editor panel + runtime action controller +
  export mirror + diagnostics; touch buttons via the action layer
- motion-stray sweep (8 values â†’ tokens; export pulse/progress house patterns)
VERIFIED THIS SESSION: tsc clean; go vet clean; go test 11/11 packages;
next build green; e2e-input-actions 17/17 NEW; regressions tilemap 44/44,
gameplay 21/21, camera 34/34, motion 11/11; 0 console errors.
Evidence in STATUS.md Â§52.
TEST RESULTS: go test -count=1 ./... â†’ ok 11/11 packages with tests.
E2E RESULTS: input-actions 17/0/0; tilemap 44/0/0; gameplay 21/0;
camera 34/0; motion 11/0.
KNOWN LIMITATIONS: keyboard bindings only; action-event block deferred
(design recorded); machine kills background processes under memory pressure
(gates completed across restarts); git unavailable â†’ uncommitted work.
CURRENT BLOCKERS: none (commit pending git availability).
NEXT EXACT TASK: SLICE 1b action-pressed event; then SLICE 2 animation.

## Session 44 (2026-09-21)
DATE: 2026-09-21
COMMIT: none (uncommitted batch on top of e91459a â€” no git binary on this machine)
CURRENT PHASE: Master product evolution â€” PHASE A (anti-slop + DESIGN.md + motion)
CURRENT FEATURE: design identity foundation + one motion slice
COMPLETED THIS SESSION:
- anti-slop integration (docs/ANTI-SLOP.md has the exact method)
- docs/DESIGN.md visual constitution (Aâ€“O, code-grounded)
- motion token system in globals.css + Button primitive slice
- scripts/e2e-motion.mjs (NEW, 11/11)
VERIFIED THIS SESSION: tsc clean; next build green; e2e-motion 11/11;
tilemap 44/44; gameplay 21/21; 0 console errors. Evidence in STATUS.md Â§51.
TEST RESULTS: not re-run this session (no API code changed in 44; go vet +
go test 11/11 last ran green in session 43).
E2E RESULTS: motion 11/0/0; tilemap-paint 44/0/0; scene-gameplay 21/0.
KNOWN LIMITATIONS: PHASE B audit not yet run; modals/sheets/popovers still
carry ad-hoc motion values; git unavailable â†’ uncommitted work.
CURRENT BLOCKERS: none (commit pending git availability).
NEXT EXACT TASK: PHASE B UI/copy audit; then lighting (SYSTEM 5).

## Session 43 (2026-09-21)
DATE: 2026-09-21
COMMIT: none (uncommitted batch on top of e91459a â€” no git binary on this machine)
CURRENT PHASE: 8.0 / 2D Game Engine â€” SYSTEM 4 rule tiles (requested TASK 15)
CURRENT FEATURE: rule tiles completion slice over the existing architecture
COMPLETED THIS SESSION:
- verified the existing derived-shading rule-tile architecture against the
  task spec (4-neighbor, canonical autoTile + base tiles, all-surface parity)
- inspector rule-tiles explainer (inspector.tsx, camera/sorting convention)
- e2e-tilemap-paint.mjs 29 â†’ 44 checks, all green (neighbor reaction,
  exact undo/redo, erase reaction, toggle control, reload persistence,
  preview parity, model keeps base values)
VERIFIED THIS SESSION: tsc clean; next build green; go vet clean;
go test 11/11 packages; tilemap 44/44, gameplay 21/21, camera 34/34,
sorting 19/19; 0 console errors. Evidence in STATUS.md Â§50.
TEST RESULTS: go test -count=1 ./... â†’ ok 11/11 packages with tests (live
PostgreSQL). E2E: tilemap-paint 44/0/0, scene-gameplay 21/0, camera 34/0,
sorting 19/0.
KNOWN LIMITATIONS: 3-variant shading vocabulary; no 8-neighbor blob
auto-tiling/per-value collision flags/fill tool/layers; palette editing is
a text field; export solid-touch events pre-existing gap; git unavailable
â†’ uncommitted work.
CURRENT BLOCKERS: none (commit pending git availability).
NEXT EXACT TASK: lighting (SYSTEM 5); see NEXT_TASK above and STATUS.md Â§50.

## Session 42 (2026-09-21)
DATE: 2026-09-21
COMMIT: none (uncommitted batch on top of e91459a â€” no git binary on this machine)
CURRENT PHASE: 8.0 / 2D Game Engine â€” verification pass over untracked sessions
CURRENT FEATURE: machine migration + rule tiles + sorting layers verification
COMPLETED THIS SESSION:
- full gate run on the new machine (tsc / next build / go vet / go test
  11/11 / four E2E suites: sorting 19/19 NEW, tilemap 29/29, camera 34/34,
  gameplay 21/21; 0 console errors)
- workerEnv fix (LocalAppData/AppData/UserProfile + case-insensitive match)
- camera name-chip handle (data-camera-handle) + e2e retarget
- docs: STATUS.md Â§49, IDEAVEN_PROGRESS.md, LOCAL-DEV-WINDOWS.md, this file
VERIFIED THIS SESSION: see COMPLETED. Evidence in STATUS.md Â§49.
TEST RESULTS: go test -count=1 ./... â†’ ok 11/11 packages with tests (live
PostgreSQL). E2E: sorting 19/0/0, tilemap-paint 29/0/0, camera 34/0/0,
scene-gameplay 21/0/0.
KNOWN LIMITATIONS: palette editing is a text field; all tile values solid;
no fill tool/layers; export solid-touch events pre-existing gap; git
unavailable â†’ uncommitted work.
CURRENT BLOCKERS: none (commit pending git availability).
NEXT EXACT TASK: rule tiles (requested TASK 15) â€” done in session 43.

## Session 41 (2026-09-16)
DATE: 2026-09-16
COMMIT: cf1d9d1 â€” feat(2d): tile palette â€” multi-tile painting
CURRENT PHASE: 8.0 / 2D Game Engine â€” PHASE F, SYSTEM 4 (Tilemap)
CURRENT FEATURE: Tile palette â€” multi-tile painting
COMPLETED THIS SESSION:
- canonical `palette` prop + registry default (4 tiles) + text field
- toolbar swatch row; Paint writes the selected tile value
- per-tile colors on design canvas, preview, published pages, and the
  exported runtime (tileColorAt in scene.ts AND export.go)
VERIFIED THIS SESSION: E2E 24/24 (multi-tile assertions incl. preview
palette color + model "4,2:2"); export HTML embeds palette + tile values;
gameplay E2E 21/21; tsc clean; next build green; go vet clean;
go test 11/11 packages.
TEST RESULTS: go test -count=1 ./... â†’ ok 11/11 packages (live PostgreSQL).
E2E RESULTS: tilemap-paint 24/0/0; scene-gameplay 21/0.
KNOWN LIMITATIONS: palette editing is a text field; all tile values solid;
no rule tiles; no multiple layers; export solid-touch events pre-existing
gap (platforms included).
CURRENT BLOCKERS: none.
NEXT EXACT TASK: rule tiles (auto-tiling) or camera behaviors (SYSTEM 8).
