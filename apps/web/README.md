# @ideaven/web

The Ideaven landing page and future web application. See the repository
[README](../../README.md) for the full picture.

```bash
pnpm dev       # http://localhost:3000
pnpm build     # static production build
pnpm check     # tsc --noEmit
```

Structure:

- `src/app/` — routes (landing page, future-phase placeholders, robots, sitemap)
- `src/components/` — nav, hero/editor concept, landing sections, visual
  primitives (block shape, icons, code, mini-art)
- Design tokens: `src/app/globals.css` (`@theme`)

Set `NEXT_PUBLIC_SITE_URL` in production for correct canonical/sitemap/OG URLs.
