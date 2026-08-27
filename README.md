# Ideaven — Phase 1: Landing Page & Platform Foundation

> **Every idea deserves a way to exist.**

Ideaven (*Idea + Haven*) is a future platform where people create games, apps,
and interactive experiences — visually with **blocks**, or with **real
TypeScript code**. This repository is **Phase 1**: a production-quality landing
page, a clean monorepo foundation, and a minimal Go API.

**Not included (by design):** authentication, accounts, dashboard, project
system, block editor, TypeScript editor, AI backend, marketplace, payments,
community backend, or a database. Those belong to later phases — see
`docs/ROADMAP.md`.

---

## Tech Stack

| Layer     | Technology                                  |
| --------- | ------------------------------------------- |
| Frontend  | Next.js 15 (App Router), React 19, TypeScript |
| Styling   | Tailwind CSS v4 (CSS-first theme tokens)    |
| Fonts     | Sora (via `next/font`, self-hosted) + system mono |
| Backend   | Go 1.24, standard library only (zero deps)  |
| Package manager | pnpm 11 (workspaces)                 |

No UI kit, no icon library, no animation library, no trackers. Every visual —
icons, block shapes, game scenes, app mockups — is hand-built SVG/CSS.

---

## Quick Start

Requirements: **Node.js ≥ 20**, **pnpm ≥ 10**, **Go ≥ 1.24**.

```bash
# 1. Install dependencies
pnpm install

# 2a. Run the frontend (http://localhost:3000)
pnpm dev

# 2b. Run the backend in a second terminal (http://localhost:8080)
pnpm dev:api

# or run both together
pnpm dev:all        # uses scripts/dev.sh
```

Production:

```bash
pnpm build          # Next.js production build (all pages prerendered static)
pnpm --filter @ideaven/web start

pnpm build:api      # Go binary → apps/api/bin/api
API_ADDR=:8080 ./apps/api/bin/api
```

Quality checks:

```bash
pnpm check          # tsc --noEmit + go vet + go test across the workspace
```

---

## API (Phase 1)

One endpoint:

```bash
curl http://localhost:8080/api/health
# {"service":"ideaven-api","status":"ok","timestamp":"...","version":"0.1.0"}
```

Configuration (all optional):

| Variable              | Default | Purpose                    |
| --------------------- | ------- | -------------------------- |
| `API_ADDR`            | `:8080` | Listen address             |
| `API_ALLOWED_ORIGINS` | —       | Comma-separated CORS allowlist |

Middleware chain: logger → panic recovery → security headers → CORS.
Unknown routes return JSON 404s; wrong methods return 405 (Go 1.22 mux patterns).

---

## Project Structure

```
ideaven/
├── apps/
│   ├── web/                  # Next.js landing page (App Router, src/)
│   │   └── src/
│   │       ├── app/          # routes: /, placeholders, robots.ts, sitemap.ts
│   │       └── components/   # nav, hero, sections/, visuals/, footer
│   └── api/                  # Go API (cmd/api + internal/*)
├── packages/
│   ├── ui/                   # @ideaven/ui — Button, Chip, Logo, SectionHeader…
│   └── config/               # @ideaven/config — shared tsconfig bases
├── docs/                     # ARCHITECTURE.md, DESIGN.md, ROADMAP.md
├── scripts/dev.sh            # run web + api together
├── package.json              # workspace root scripts
└── pnpm-workspace.yaml
```

### Web app component map

- `components/hero/` — hero + the interactive editor concept (palette, preview
  canvas, properties panel, BLOCKS/CODE strip with typing simulation)
- `components/sections/` — the nine landing sections (core idea, journey, AI,
  creations, loop, showcase, philosophy, why, final CTA)
- `components/visuals/` — the block shape, icon set, code highlighter, mini-art
- Client islands are deliberately small: header, editor visual, AI demo, loop
  cycler, scroll-reveal wrapper. Everything else is server-rendered.

---

## Performance & Accessibility

Measured on the production build (local, cold cache):

- **First Contentful Paint ≈ 0.6–0.9 s**, all routes fully static
- **~160 KB transferred**, 10 requests, single font family
- Zero layout shift (fixed-size SVG art, `display: swap` font)
- `prefers-reduced-motion` respected everywhere (CSS + JS checks); reveals and
  typing degrade to static content
- Semantic landmarks, one `h1`, skip-link, focus-visible styles, keyboard-safe
  menus, aria states on all custom controls
- No images except `og-image.png` (52 KB) — everything else is inline SVG

## SEO

- Per-page titles/descriptions via metadata API, canonical URL
- `robots.txt` + `sitemap.xml` (metadata routes; only real pages listed)
- Open Graph + Twitter cards with a branded 1200×630 image
- Placeholder future-phase pages are `noindex` — honest to crawlers

Set `NEXT_PUBLIC_SITE_URL` in production so canonical/sitemap/OG URLs point at
the real domain.

## Security (Phase 1 posture)

- No secrets, keys, or credentials anywhere in the repo
- Security headers on both services (`X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`, CSP `default-src 'none'` on the API)
- No `eval`, no dynamic HTML injection, no third-party scripts
- Minimal, maintained dependencies; Go API has zero dependencies

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the system fits together
- [`docs/DESIGN.md`](docs/DESIGN.md) — brand, tokens, the block motif
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — phases 1 → 13 and what changes when
