# Ideaven Design System — the visual constitution

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
| `mint`          | `#46e3b4`            | secondary accent, focus outlines     |
| `amber` `sky` `rose` | block category colors | Events, Data, Looks             |

**Accent discipline**: violet/mint appear in small doses — CTAs, kickers,
single highlighted words, block shapes, selection outlines. Body copy is fog
on canvas (≈ 7:1 contrast). Nothing glows, nothing pulses without meaning.

## A. Typography hierarchy

One family, **Sora** (variable, self-hosted via `next/font`), weights
300–700. System mono stack (`JetBrains Mono` → Consolas) for code, labels,
coordinates, and every numeral that means data.

| Role            | Spec                                   |
| --------------- | -------------------------------------- |
| Display / H1    | 44–72 px semibold, tracking tight      |
| H2              | 30–44 px                               |
| Section kicker  | mono, `01 ·—— KICKER`, violet/fog      |
| Body            | 16–18 px, paragraphs ≤ 2 lines         |
| UI controls     | 13–15 px medium                        |
| Inspector text  | 12 px labels, 11.5 px explainer cards  |
| Canvas overlays | 8.5–10 px mono (sorting labels, chips) |

Hierarchy comes from size + weight + fog/mist contrast — never from color
splashes. Numerals in the HUD, credits, and diagnostics are always mono.

## B. Spacing rhythm

Marketing sections breathe: `py-24 sm:py-32`, container `max-w-6xl`,
alternating `panel/40` bands with hairline borders for editorial cadence.
Tools are dense: panels `p-3`, control rows `gap-2`, section groups `gap-4`,
4 px base grid. The jump between marketing roominess and tool density is
intentional — same DNA, different breathing.

## C. Surface hierarchy

Dark theme elevation is **lightness stepping, not shadow stacking**:
`canvas → panel → card`, with interactive washes at 5 % / 9 % white
(`surface`, `surface-strong`). Light theme inverts the same roles. If a
surface needs to feel higher, it steps one token up and gains a hairline —
it does not grow a drop shadow.

## D. Radius strategy

| Token         | Use                                     | Real usage |
| ------------- | --------------------------------------- | ---------- |
| `rounded-lg`  | default interactive: buttons, inputs    | dominant (142×) |
| `rounded-xl`  | large cards, modals, empty states       | 56×        |
| `rounded-full`| dots, pills, avatars, score chips       | 47×        |
| `rounded-md`  | compact inputs, inner elements          | 29×        |
| block motif   | the notch-and-bump command block shape  | signature  |

Radii shrink as surfaces get denser. Nothing in the product is sharp-cornered
except canvas overlays, which use `borderRadius: 6–8` to match entities.

## E. Border strategy

1 px hairlines (`line`) carry almost all separation. Borders are also a
**semantic system**:

- **solid hairline** — real, physical boundaries
- **dashed** — guides and projections, not physical: camera viewport,
  world-bounds rectangle, viewfinder marks (they frame space; they are not
  objects)
- **2 px violet outline** — selection (design canvas, inspector focus)
- hover brightens one step (`border-line → white/20`), never recolors

## F. Shadow strategy

Shadows are rare and tinted, never gray stacks: the primary button carries
one violet shadow (`0 10px 30px -10px violet/50`); modals may lift one step.
Everything else uses surface stepping + hairlines (see C).

## G. Icon treatment

18 hand-drawn 24 px stroke icons (`visuals/icons.tsx`), `currentColor`, no
fills, no emoji as UI. Entity glyphs on the canvas mirror the runtime's
actual shapes (player = rounded square, coin = circle, camera = dashed
viewport) so the editor never lies about the game.

## H. Color roles

Structural tokens (canvas/panel/card/line/ink/fog/mist) describe space;
accents describe **state and category**: violet = primary action + selection,
mint = success/focus, amber/sky/rose = block categories (Events/Data/Looks),
rose also = hazards. Color never carries meaning alone — text or position
always disambiguates.

## I. Accent usage

One violet moment per view where the eye should land (CTA, active tool,
selected node). Mint marks focus and success. If two accents compete, one
wins and the other steps down to fog. Decorative elements must trace back to
the block motif or the editing metaphor, or they are deleted.

## J. Data visualization language

Mono numerals, flat single-color fills, hairline axes. Real examples: the
runtime score chip (HUD, mono), credit balance badge, progress bars
(`anim-progress-x`, one flat violet bar — never a fake percentage),
asset-intelligence dimension/memory rows. No decorative charts, no invented
metrics, no sparkles around numbers.

## K. Editor visual language (builder)

Density and clarity first. The stage always shows the scene's own background
(model data, currently dark) so the editor equals the runtime; chrome panels
follow the theme tokens. Selection is spatial (violet outline + scale
handles); paint tools switch the cursor to a crosshair and preview the
RESULT before commit (auto-tile hover shading paints the exact shade the
cell will get); overlays show derived truth (sorting labels `Layer · order`,
camera viewfinder + world bounds from the same props the runtime reads).
Explainer cards in the inspector are bordered, 11.5 px, and say what the
control actually does.

## L. Game Studio visual language

The signature shape is the rounded command block with a **notch on top and a
bump below** (connectability — the product's core promise): logo mark, real
script blocks (`blockPath(w, h)` stacked at −4.5 px so bumps fill notches),
the creator-journey staircase, word separators. Block labels are near-black
on bright fills (Scratch-like); values sit in inset rounded input pills.
Runtime HUD stays fixed outside the world container.

## M. 3D Studio visual language (direction — not built yet)

Honest status: there is no 3D studio yet. When it arrives it must feel
**spatial**: viewport-first layout, grid floor with standard X/Y/Z axis
colors, transform gizmos, sparse panels that reuse the editor's inspector
and radius/border systems, and orbit/pan/zoom that feels like a camera, not
a scroll. It shares the DNA above; it does not get a second design system.

## N. Responsive behavior

Marketing: single column at `sm`, grids at `sm:2 / lg:3` with the last odd
card centered. The credit-purchase flow becomes a bottom sheet at 390 px
(verified in E2E). Dashboards reflow to single column. The builder canvas is
a desktop pointer tool — paint, drag, and gizmo interactions assume a
pointer and are not mobile targets; on small screens the chrome reflows but
the canvas keeps pointer semantics.

## O. Accessibility constraints

- `focus-visible` mint outlines on every interactive element (2px offset 2)
- keyboard skip link, full keyboard paths in flows
- body copy contrast ≈ 7:1 (fog on canvas); mist only for decorative text
- `prefers-reduced-motion`: global guard collapses animation/transition
  durations; entrance reveals render visible; nothing becomes unusable
- state is never communicated by motion alone (aria-pressed on tools,
  aria-label on icon-only controls)

## Motion — the ONE motion system

All durations and easings are tokens in `globals.css` (`@theme` → Tailwind
`duration-*` / `ease-*` utilities). No component hardcodes a new value.

| Token        | Value | Use                                            |
| ------------ | ----- | ---------------------------------------------- |
| `instant`    | 0 ms  | state flips that must not animate              |
| `micro`      | 90 ms | press feedback, tiny transforms                |
| `quick`      | 160 ms| hover, color/border transitions (the default)  |
| `standard`   | 240 ms| small entrances, utility movements             |
| `deliberate` | 420 ms| pop/rise entrances, explainers                 |
| `emphasis`   | 700 ms| hero reveals (`data-reveal`)                   |

| Easing       | Curve                       | Use                          |
| ------------ | --------------------------- | ---------------------------- |
| `enter`      | `cubic-bezier(0.22,1,0.36,1)`| the house settle — entrances, hovers |
| `exit`       | `cubic-bezier(0.4,0,1,1)`    | accelerate out, exits        |
| `press`      | `cubic-bezier(0.2,0,0,1)`    | fast attack, soft release    |
| `spatial`    | `cubic-bezier(0.32,0.72,0,1)`| panels, sheets, large moves  |

Character rules:

- transform/opacity only; never animate layout properties
- press = fast compression (`scale 0.97`, micro + press easing); release is
  the same soft curve — no bounce, no cartoon
- entrance reveals are IntersectionObserver + CSS (`data-reveal`), visible
  without JS
- three purposeful ambient loops exist and no more: the caret blink, the
  character bob while "running", the live pulse dot
- no parallax, no particles, no ambient float, no animation restart flicker;
  interruptible transitions over keyframe restarts
- motion communicates hierarchy, cause/effect, and state change — if it
  communicates nothing, it is deleted

## Surfaces share DNA, not identity

Landing may be expressive. Dashboard is calm. Builder is dense and precise.
Game Studio feels like a creative tool. Asset Studio feels tactile. 3D
Studio will feel spatial. Community feels human. Same tokens, same motion
system, same block motif — different energy per surface.

## Don'ts (anti "AI-generated product")

No purple gradient washes, no glow blobs, no glassmorphism cards, no floating
3D shapes, no stock photos, no fake social proof, no autoplay video, no
oversized neon typography, no sparkle icons, no meaningless pills, no fake
urgency, no "next-generation" copy. Every decorative element traces back to
the block motif or the editing metaphor. Copy says something specific to
Ideaven or it says nothing.
