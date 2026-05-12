# Design And Product Context

## Product

Weblab is positioned as a visual-first code editor and AI builder for designers
and product teams working with real Next.js/Tailwind code. The app should feel
like a professional creative tool, not a generic SaaS dashboard.

Primary user-facing promises:

- create projects quickly from prompt, image, template, Figma, GitHub, or local
  folder
- visually edit real code with canvas, layers, toolbar controls, and code panel
- keep generated output portable and code-backed
- support branches, checkpoints, comments, publishing, domains, and team flows

## Brand

The product is Weblab.

- Import `APP_NAME` from `@weblab/constants`; do not hardcode the brand in JSX
  or metadata.
- Package scope: `@weblab/*`.
- DOM attributes: `data-weblab-*`.
- URL protocol: `weblab://`.
- Cache dir: `.weblab`.
- The local repo folder may still be named `onlook`; that is not user-facing.

Allowed remaining "Onlook" references are listed in root `AGENTS.md` and
`CLAUDE.md`. Treat other occurrences as bugs.

## Visual Design Direction

Follow existing app styling before introducing new patterns.

- Use `@weblab/ui` and app-local primitives first.
- Prefer TailwindCSS and established token classes.
- Keep editor/workspace surfaces dense, calm, and scannable.
- Use icons for toolbar actions where a familiar icon exists.
- Avoid marketing-style cards inside the editor workspace.
- Avoid nested cards and decorative gradients/orbs unless they are already part
  of the specific marketing section pattern.
- Ensure buttons, controls, and text do not shift or overflow on focus, hover,
  loading, mobile, or long-label states.

## Marketing Site

The current worktree includes expanded marketing surfaces:

- homepage/hero and landing-page feature sections
- feature pages for AI, builder, prototype, and AI-for-frontend
- workflow pages for Claude Code and vibe coding
- blog and changelog routes/content
- pricing, FAQ, about, download, demo, sitemap, policy, and terms pages

Marketing pages can be richer and more expressive than the editor, but they
should still preserve brand consistency and actual product signals. Use real or
purpose-built visuals instead of generic decorative placeholders.

## Editor UX

Editor UI should prioritize speed and precision:

- Stable frame dimensions and no layout shift.
- Clear loading/error/retry states for sandbox startup and restart.
- Mobile fallback states should provide useful actions, not dead ends.
- Page/forms should ignore invalid or loading submissions.
- Chat input focus should not visually change container size or border weight.
- Suggestions/settings should only expose visible, working behavior.

## Color Token Format — Hex Only

CSS custom properties in `packages/ui/src/globals.css` store colors as **hex** (`#rrggbb`) or **rgba** (`rgba(r, g, b, a)`). The previous pattern of bare HSL triplets (`H S% L%`) wrapped in `hsl(var(--x))` has been removed entirely.

### Rules for agents and contributors

- **Never write** `hsl(...)` or `hsla(...)` anywhere — CSS, TSX, inline styles, Tailwind arbitrary values, or `tailwind.config.ts`.
- **CSS variables** — define new tokens as `#rrggbb`. For transparency, use `rgba(r, g, b, a)`.
- **Tailwind config** (`packages/ui/tailwind.config.ts`) — reference tokens as `var(--token-name)`, not `hsl(var(--token-name))`.
- **Inline styles / `style=` props** — use `var(--token-name)` directly; the variable already contains a valid color.
- **Tailwind arbitrary values** — use `bg-[var(--token-name)]`, `text-[var(--token-name)]`. For opacity, use `color-mix`: `bg-[color-mix(in_srgb,_var(--token-name)_50%,_transparent)]`.
- **Dynamic color generation** (e.g. presence cursors, color pickers) — compute `rgba(r, g, b, a)` values in TypeScript; do not return `hsl(...)` strings.
- **`tokenToHex(value)`** in `apps/web/client/src/app/design-system/_components/color-utils.ts` — use this to normalise a raw token value to hex when a hex string is needed. It handles both hex passthrough and legacy HSL strings.

### What changed (for context)

All tokens in `globals.css` were converted from `H S% L%` triplets to hex in one migration. `tailwind.config.ts` and every `hsl(var(...))` call across the codebase were updated in the same commit. The design system inspector (`token-control.tsx`, `color-swatch.tsx`) was updated to store overrides as hex directly.

## Content And i18n

For user-facing app strings:

- use `next-intl` message files in `apps/web/client/messages/*`
- keep message keys stable where possible
- update generated/typed message files if the local pattern requires it

For documentation and feature notes:

- put durable engineering notes under `docs/`
- update this context pack when a change affects future agents
