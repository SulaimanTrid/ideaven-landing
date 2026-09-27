# Anti-slop integration — exact method (recorded 2026-09-21)

anti-slop (https://github.com/miqdadbadjuber/anti-slop, MIT) is a filter —
38 rules for AI agents to stop generic AI-generated UI, copy, and code. It
is NOT a style guide; direction comes from this repo's `docs/DESIGN.md`.

## What was installed (project-local, workspace scope)

The documented skills installation path, adapted to this machine (no plugin
marketplace for the running agent):

| File | Size | Source |
| ---- | ---- | ------ |
| `.agents/skills/antislop/SKILL.md` | 50,556 B | `skills/antislop/SKILL.md` @ main |
| `.agents/skills/antislop-ui/SKILL.md` | 26,844 B | `skills/antislop-ui/SKILL.md` |
| `.agents/skills/antislop-copywriting/SKILL.md` | 25,419 B | `skills/antislop-copywriting/SKILL.md` |
| `.agents/skills/antislop-human/SKILL.md` | 11,051 B | `skills/antislop-human/SKILL.md` |
| `.agents/skills/antislop-human/contrast-check.py` | 5,589 B | same folder (required by antislop-human) |
| `.agents/skills/antislop-layoutmobile/SKILL.md` | 16,378 B | `skills/antislop-layoutmobile/SKILL.md` |
| `.agents/skills/antislop-code/SKILL.md` | 8,944 B | `skills/antislop-code/SKILL.md` |

Files were fetched byte-exact with `curl` from
`raw.githubusercontent.com/miqdadbadjuber/anti-slop/main/...` (WebFetch would
have re-rendered the markdown and risked mangling frontmatter). The fetch was
performed by the agent on the USER'S explicit directive ("integrate the
repository … use the documented skills installation path"), not by a runtime
self-fetch.

## Why `.agents/skills/`

The running agent (ZCode) discovers workspace skills from `<repo>/.zcode/skills/`
and `<repo>/.agents/skills/` (workspace scope, documented in its
configuration guide). `.agents/skills/` was chosen because it is the
cross-tool convention (Codex migrates to `$HOME/.agents/skills/`, Copilot and
Antigravity share the project path) — the IDEAVEN repository carries its
development discipline to every agent that opens it. ZCode loads it;
Codex-class tools can read the same folders.

## Entry-file pointer block

`AGENTS.md` (project root) was created with the antislop pointer block
between `<!-- antislop:start -->` / `<!-- antislop:end -->` markers, with the
file paths adjusted to `.agents/skills/...`. The block is the source of truth
for which skills are installed; update it when adding/removing a skill. The
pointer takes effect for agents that read `AGENTS.md` at session start.

## Verification

- All 7 files present with intact YAML frontmatter (`name`/`description`
  parsed from the first lines).
- No same-named skills exist in user scope (`~/.zcode/skills/`,
  `~/.agents/skills/` are both absent) — nothing shadows the workspace copy,
  and no duplicates were created.
- ZCode discovery order puts workspace `.agents/skills` above plugin roots,
  so the skills appear in Settings → Skills and are loadable from the NEXT
  session (discovery happens at session start; the live session that
  installed them does not see them in its own skill list — expected).
- Codex plugin path (`codex plugin marketplace add …` / `npx antislop-ai`)
  was NOT used: no Codex CLI exists on this machine; the documented fallback
  (manual skills installation path) applies, which is what was done.

## Anti-slop delivery gate

UI/copy tasks close with the gate checklist (§36 of the master directive):
interchangeability with generic AI SaaS, meaningless pills, unjustified
gradients, fake numbers, generic copy, decoration-as-icons, arbitrary
animation, glassmorphism, justified treatments, IDEAVEN-specific character,
concrete copy, real hierarchy. The constitution for "what IDEAVEN looks like"
lives in `docs/DESIGN.md`.
