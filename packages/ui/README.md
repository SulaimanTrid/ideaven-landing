# @ideaven/ui

Shared UI primitives for Ideaven web apps: `Button`, `ButtonLink`, `Chip`,
`Container`, `Logo`, `SectionHeader`, and the `cn` class helper.

The package ships TypeScript source and is compiled by the consuming Next.js
app via `transpilePackages`. Components use Tailwind classes, so the consuming
app must define the Ideaven design tokens (`violet`, `violet-deep`, `mint`,
`ink`, `fog`, `mist`, `line`, `canvas`, …) in its Tailwind theme — see
`apps/web/src/app/globals.css` for the canonical token set.
