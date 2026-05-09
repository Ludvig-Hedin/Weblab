---
name: frontend-design
description: Build refined, minimal, product-ready UI on Tailwind + shadcn/ui — restrained palette, tight spacing, intentional typography, no AI-dashboard slop.
---

# Frontend Design Skill

Use this skill any time the user asks to "build UI", "make it look better", "design a page", "make it minimal", "polish this", "redesign", "make it cleaner", or ships any user-visible component.

## Stack assumptions

- Tailwind CSS 4.x with the project's design tokens (read `apps/web/client/src/app/globals.css`).
- `@weblab/ui` component library (Radix + shadcn). **Always prefer existing components.** Building a new button instead of using `<Button>` is a code review failure.
- Dark theme by default. Verify both light and dark.

## Design philosophy — non-negotiable

> Make the UI feel tighter, cleaner, and more mature. Reduce the "AI dashboard slop" vibe.

- **Restrained, mostly monochrome palette.** Accents only where the user must act.
- **Generous yet purposeful spacing.** Smaller, well-grouped elements beat sprawling ones.
- **Soft, rounded corners. Smooth strokes. Subtle contrast.** No harsh lines, no screaming colors.
- **Typography is intentional and compact.** Use the existing scale, don't invent sizes.
- **Eye candy without being loud.** A piece worth winning a UI contest looks calm at first glance and rewards attention.

## Visual rules I enforce

### Color

- Use semantic tokens: `text-foreground`, `text-foreground-secondary`, `text-foreground-tertiary`, `bg-background`, `bg-background-secondary`, `border-border`, `border-border/40`. **Never** hardcode `text-gray-500`, `bg-zinc-900`, `#1a1a1a`, etc.
- One accent color per surface (usually `--primary`). If you reach for a second accent, you're wrong.
- Hover states: shift opacity (`hover:bg-background-tertiary/50`) before shifting hue.

### Spacing

- Use the 4px scale: `gap-1 gap-1.5 gap-2 gap-3 gap-4 gap-6 gap-8`. Skip the rest.
- Inside cards/dialogs: `p-3` for tight, `p-4` for default, `p-6` for hero.
- Between sections: `space-y-2` inside a group, `space-y-6` between groups.
- Don't center-align body text. Left-align, max-width prose containers.

### Type

- Default body: `text-sm text-foreground`. Captions: `text-xs text-foreground-tertiary`. Display: `text-2xl font-medium tracking-tight`.
- **Never** use `font-bold` on UI text — it shouts. `font-medium` is the cap for headings; `font-semibold` only for emphasized inline.
- `leading-tight` for headings, `leading-relaxed` for prose. Default leading is fine for UI labels.

### Surfaces

- Cards: `rounded-md border border-border/40 bg-background-secondary p-4`.
- Buttons: use the `Button` component variants. Don't restyle them. Add only `size`, `variant`, `disabled`.
- Dialogs/sheets: from `@weblab/ui/dialog` or `@weblab/ui/sheet`. Always `max-w-md` unless the content demands wider.

### Motion

- 150ms transitions on hover/state. `transition-colors`, not `transition-all`.
- No bounce, no spring on UI affordances. Springs are for celebratory moments only (rare).
- Loading: `animate-spin` on `Icons.LoadingSpinner` or `animate-pulse` on skeletons. Never both at once.

### Icons

- From `@weblab/ui/icons`. Default size `h-4 w-4` inline, `h-5 w-5` standalone.
- Match the icon's stroke weight to the text weight. No bold icons next to medium text.

## Component composition rules

1. **Server-render by default.** Add `'use client'` only when you need state, events, or browser APIs.
2. **Compose, don't fork.** If `Button` doesn't fit, wrap it; don't duplicate.
3. **One concern per component.** A component should have one reason to re-render.
4. **Empty / loading / error states are part of the design.** A component without all three isn't done.
5. **Responsive by default.** Mobile-first Tailwind. Test at `sm`, `md`, `lg` before shipping.

## Layout patterns

- **Header**: 56px tall (`h-14`), `border-b border-border/40`, content centered with `max-w-screen-xl mx-auto px-4`.
- **Sidebar**: 240–280px (`w-60`/`w-72`), `border-r border-border/40`, `bg-background-secondary`.
- **Main content**: `mx-auto max-w-3xl` for prose, `max-w-screen-xl` for dashboards.
- **Cards in a grid**: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3`.

## Anti-patterns I refuse

- Inline hex colors anywhere (`#fff`, `#000`, `rgb(...)`).
- `style={{ ... }}` props on Tailwind components — use `className`.
- New "primary" buttons in fuchsia or lime to "make it pop." No.
- Drop shadows on every element. Most things need `shadow-none` or `shadow-sm` at most.
- Gradients on UI surfaces (acceptable on hero illustrations only).
- Random emoji as iconography. Use `@weblab/ui/icons`.
- Three font weights in one screen.
- Dashboards with 8 colors of badges. Pick 2: success/warning, neutral.

## When asked to "improve" an existing screen

1. Read the file. Note every hardcoded color, magic spacing value, custom button.
2. Replace hardcoded values with tokens.
3. Tighten spacing — reduce padding by 25–50%, increase gaps between groups.
4. Drop a font weight if there are three.
5. Consolidate accent colors to one.
6. Ensure `:focus-visible` rings are present (`focus-visible:ring-2 focus-visible:ring-ring`).
7. Verify light + dark by reading `globals.css` for the inverse semantic tokens.
8. Add empty / loading / error states if missing.

The goal is something that looks calm, intentional, and trusted — not a dashboard demo.
