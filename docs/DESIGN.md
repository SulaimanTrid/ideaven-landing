# Ideaven Design System

## Brand

- **Name**: Ideaven — *Idea + Haven*
- **Philosophy**: Every idea deserves a way to exist.
- **Tagline**: Build it your way.
- **Identity**: IMAGINE. BUILD. SHARE.
- **Voice**: confident, technical, friendly, never hype-y. No fake statistics,
  testimonials, or invented success.

## Color tokens (`apps/web/src/app/globals.css`)

| Token           | Value                | Use                                  |
| --------------- | -------------------- | ------------------------------------ |
| `canvas`        | `#0a0c12`            | page background (very dark navy)     |
| `panel`         | `#0e1119`            | alternate section bands              |
| `card`          | `#12151f`            | raised surfaces                      |
| `line`          | `white @ 8%`         | hairline borders                     |
| `ink`           | `#f2f1ea`            | primary text (warm white)            |
| `fog`           | `#a9b0c2`            | secondary text (cool gray)           |
| `mist`          | `#6f7789`            | tertiary/decorative text             |
| `violet`        | `#8f7bff`            | primary accent (electric violet)     |
| `violet-deep`   | `#6c58f5`            | primary buttons, logo                |
| `mint`          | `#46e3b4`            | secondary accent (soft mint)         |
| `amber` `sky` `rose` | block category colors | Events, Data, Looks              |

**Accent discipline**: violet/mint appear in small doses — CTAs, kickers,
single highlighted words, block shapes. Body copy is fog on canvas (≈ 7:1
contrast). Nothing glows, nothing pulses without meaning.

## Typography

- **Sora** (variable, via `next/font`, self-hosted) for everything — one
  family, weights 300–700. System mono stack for code/labels (zero font cost).
- H1: 44–72 px semibold, tracking tight. H2: 30–44 px. Body: 16–18 px, short
  paragraphs (2 lines max where possible).
- Editorial kicker pattern on every section: mono `01 ·—— KICKER` in violet/fog.

## The block motif

The signature shape is a rounded command block with a **notch on top and a bump
below** (connectability — the product's core promise). It appears as:

1. The logo mark (violet block + mint "idea spark" dot)
2. Real script blocks in the hero editor and Core Idea section (SVG paths from
   `blockPath(w, h)`, stacked with a −4.5 px overlap so bumps fill notches)
3. The rising staircase of the creator journey (muted → vivid = beginner → creator)
4. Word separators in Philosophy (IMAGINE ◾ BUILD ◾ SHARE) and the dim
   decorative blocks behind the final CTA

Block labels are near-black on bright fills (Scratch-like); values sit in
inset rounded "input" pills.

## Layout & rhythm

- Container `max-w-6xl`, sections `py-24 sm:py-32`, alternating
  `panel/40` bands with hairline borders for editorial cadence
- Hero: dotted-grid wash (radial mask), centered copy, full-width editor visual
- Feature grids at `sm:2 / lg:3` with the last odd card centered

## Motion rules

Allowed: navbar state on scroll, hover states, entrance reveals (IO + CSS),
code typing, character bob while "running", timed concept demos (AI, loop).
Everything checks `prefers-reduced-motion`. No parallax, no particles, no
looping video, no ambient float.

## Iconography & art

- 18 hand-drawn 24 px stroke icons (`visuals/icons.tsx`), `currentColor`
- All miniature scenes (platformer, quiz app, showcase thumbnails) are pure
  inline SVG/HTML compositions — zero raster assets in the UI, only
  `og-image.png` (52 KB) exists in `/public`

## Don'ts (anti "AI-generated landing page")

No purple gradient washes, no glow blobs, no glassmorphism cards, no floating
3D shapes, no stock photos, no fake social proof, no autoplay video, no
oversized neon typography. Every decorative element traces back to the block
motif or the editing metaphor.
