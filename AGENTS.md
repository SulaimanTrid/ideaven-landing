# IDEAVEN — repository instructions

- Monorepo: `apps/web` (Next.js 15, Tailwind v4) + `apps/api` (Go, PostgreSQL).
- The canonical project model is the source of truth for every surface
  (editor, preview, published, export). Never fork it per surface.
- Verification gates before "done": `tsc --noEmit`, production `next build`
  (never while `next dev` serves), `go vet ./...`, `go test -count=1 ./...`,
  the relevant `scripts/e2e-*.mjs` suites. Run them for real; report
  failures honestly.
- Visual constitution: `docs/DESIGN.md`. Motion tokens:
  `apps/web/src/app/globals.css` (`--duration-*`, `--ease-*`).
- Current status and next task: `docs/STATUS.md` + `IDEAVEN_PROGRESS_STATE.md`.

<!-- antislop:start -->
## antislop
For UI, copy, people, mobile layout, or code comments work, read
`.agents/skills/antislop/SKILL.md` (core) and then the skill for the task:
- UI / visual: `.agents/skills/antislop-ui/SKILL.md`
- Copy & text: `.agents/skills/antislop-copywriting/SKILL.md`
- People: `.agents/skills/antislop-human/SKILL.md`
- Mobile / responsive: `.agents/skills/antislop-layoutmobile/SKILL.md`
- Code comments: `.agents/skills/antislop-code/SKILL.md`
Before starting, ask the user when antislop applies: during the work, or
after it is done.
<!-- antislop:end -->
