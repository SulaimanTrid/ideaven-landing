IDEAVEN PROGRESS STATE — portable development handoff

> Regenerate/update this file at the END of every implementation session.
> The repository is the source of truth; this file only points at it.

CURRENT_DATE: 2026-10-04
CURRENT_COMMIT: see `git log -1` (TASK 65 commit, pushed to origin/main)
PUSHED: YES — https://github.com/SulaimanTrid/ideaven-landing.git
CURRENT_BRANCH: main

TOOLCHAIN (Windows):
- node: ideaven-v7\tools\node-v24.21.0-win-x64 (put on PATH)
- git: ideaven-v7\tools\mingit\cmd (MinGit portable)
- go: ideaven-v7\tools\go\bin (the API/extbuild worker shells out to `go`)
- postgres: ideaven-v7\tools\pgsql\bin (data: ideaven-v7\tools\pgdata), port 5432
- playwright suites: PLAYWRIGHT_MODULE=../../tools/e2e-runner/node_modules/playwright/index.js
- local stack: PostgreSQL (5432) + apps/api (API_ADDR=:8090 via
  scripts/start-local-api.ps1 or scripts/restart-api-dev.ps1) +
  `npx next dev -p 3000` in apps/web (scripts/start-web-dev.ps1).
- DO NOT run `next build` while `next dev` is live (corrupts .next).

CURRENT_OBJECTIVE:
TASK 65 (Product Coherence: Landing → Dashboard → Creation Hub → Builder)
is COMPLETE and verified (session 65): one product voice across surfaces
with NO second system created. Nav points at the REAL surfaces (Learn
/learn, Explore /explore, Community, Pricing, Create /start); /start is the
smart front door into the ONE canonical Creation Hub (session truth →
/dashboard/projects/new with ?type= preselect; anonymous →
/register?next=<hub>; RegisterForm honors ?next=; RequireAuth keeps path +
query). Landing gained the "Three ways to create" section (real
CreationPreview visuals, canonical CTAs, honest extensions line); the
dashboard lost its stale "editor arrives next phase" line and gained the
"Start here" strip + three-entry empty state; ONE engine vocabulary
(project-meta.ts: App / 2D Game / 3D Game) feeds cards, public pages,
Explore and the builder identity chip; public project pages use
"IDEAVEN — <name>" metadata with OG and carry no editor chrome. e2e-task65
49/49 (0 console errors); 29-suite sweep green (task64 34/34 solo after a
contention flake; asset-studio 25/25 after fixing a pre-existing
<img src=""> console error; community = documented legacy drift); all
gates green (tsc, go vet, go test, next build, build:vinext,
verify-cf-preview 12/12).

FILES / MODULES TO CONTINUE FROM:
- apps/web/src/lib/project-meta.ts (THE engine vocabulary — projectTypeLabel
  is "App"/"2D Game"/"3D Game"; engineIdentityLabel uppercases for badges;
  do not reintroduce "Game"/"3D Scene")
- apps/web/src/components/auth/start-redirect.tsx + app/start/page.tsx
  (the /start router: authenticated → hub with ?type=, anonymous →
  register?next=)
- apps/web/src/app/dashboard/projects/new/create-project-client.tsx
  (hub ?type= preselect — keep the PROJECT_TYPES validation)
- apps/web/src/auth/require-auth.tsx (next = path AND query, Suspense-wrapped)
- apps/web/src/components/sections/creation-paths.tsx (landing "Three ways
  to create" — client component, uses useI18n)
- apps/web/src/components/nav/site-header.tsx + footer/site-footer.tsx
  (real routes; authenticated Home CTA; footer "2.0 beta")
- apps/web/src/components/dashboard/dashboard-content.tsx (Start here strip,
  three-entry empty state), project-card.tsx (data-engine-badge)
- apps/web/src/app/p/[slug]/page.tsx ("IDEAVEN — <name>" metadata, engine
  badge), apps/web/src/app/explore/layout.tsx (gallery metadata)
- scripts/e2e-task65-product-coherence.mjs (49 checks — TASK 65 gate)
- scripts/run-regressions-t65.mjs (29-suite regression sweep runner)
- docs/TASK65_PRODUCT_COHERENCE.md + docs/STATUS.md section 72

KNOWN HONEST LIMITS / QUEUED:
- Landing sections predating TASK 65 remain English-first (new surfaces
  are bilingual EN/ID); deep builder strings follow the existing roadmap.
- e2e-community.mjs legacy drift (STATUS §68) — needs a rewrite task.
- Extension components/methods/events remain declared-but-unavailable at
  runtime (TASK 64 honesty surfaces).
- /start checks the session client-side via the real auth provider.

NEXT_TASK:
STOP - awaiting explicit approval per the TASK 65 directive. Queued:
TASK 66 onward.
