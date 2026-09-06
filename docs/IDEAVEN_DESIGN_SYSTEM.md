# IDEAVEN Design System

Semantic tokens (Tailwind v4 `@theme inline`, light + dark) shared by
landing, dashboard, builder, and exports.

## Surfaces & text
`bg-canvas` (page) · `bg-panel` (chrome) · `bg-card` (content) ·
`bg-surface` / `bg-surface-strong` (interactive) · `text-ink` (primary) ·
`text-fog` (body) · `text-mist` (muted) · `border-line`.

## Brand & status
`violet` / `violet-deep` (primary) · `mint` (success) · `amber` (warning) ·
`rose` (danger) · `sky` (info). Status uses tinted chips
(`bg-*/10 text-*`), never color alone.

## Type & spacing
Sora (display/UI) + system mono (code/labels). Scale: 10px labels
(`tracking-[0.14em]` uppercase mono) → 11.5–13.5px body/UI → 15–26px
headings → 34–56px display. Spacing on a 4px grid; cards `rounded-2xl`;
controls `rounded-lg`.

## Controls
Buttons: primary (`bg-violet-deep text-white`), secondary
(`border-line bg-surface`), destructive (rose on hover). Inputs:
`border-line bg-panel`, `focus-visible:outline-2 outline-mint` everywhere.
Tabs: pill-in-box (`bg-surface-strong text-ink` active). Dialogs: centered
`rounded-2xl border-line bg-panel shadow-2xl`. Toasts: bottom, dark chip.

## Blocks (visual language)
Solid vivid category fills (sky=navigation, rose=variables, violet=ui,
amber=control, mint=text, yellow=logic) with dark text, connect notch
above + bump below, dark-translucent value sockets (`rgb(10 12 18 / 0.28)`),
hat blocks with dome cap. Categories pair color with label — never color
alone.

## Motion
Purposeful only: rise-in on landing blocks, pulse on running status, hover
lifts. `prefers-reduced-motion` respected (typing effect and pulses
disable).

## Themes
One token set, two resolutions: light and dark via `[data-theme]` on
`<html>`, applied pre-hydration (anti-flash). Both themes use the same
semantic names — components never hardcode theme-specific colors.
