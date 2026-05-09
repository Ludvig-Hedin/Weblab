# Weblab — UI & Design System

## Component library

**`@weblab/ui`** — Radix UI + TailwindCSS + shadcn components. Always prefer this over writing new custom components.

Every component is showcased at `/design-system` (password-gated off localhost via `DESIGN_SYSTEM_PASSWORD`). When adding or modifying a component, also update `apps/web/client/src/app/design-system/page.tsx`.

## Styling rules

- **TailwindCSS 4** — utility-first. Global styles in `src/app/globals.css`.
- **Dark theme by default.** `ThemeProvider` in `src/app/layout.tsx` sets it. Don't hardcode light colors.
- **Design tokens over raw palette.** Use semantic CSS variables (`--foreground-success`, `--background-success`, etc.) not raw Tailwind palette classes (`text-green-500`).
- **Never inline hex literals** in component code (use CSS vars or token classes).
- Token definitions: `src/app/globals.css` (light + dark sections).
- Token utilities: `packages/ui/tailwind.config.ts`.

## Semantic color tokens (recently added)

Success group: `text-foreground-success`, `bg-background-success`, `bg-background-success-secondary`, `border-success`
Warning group: `text-foreground-warning`, `bg-background-warning`, `bg-background-warning-secondary`, `border-warning`

Currently aliased to blue palette (Weblab's primary color). To switch to green/amber, edit only the 8 token values in `globals.css`.

## Editor vs marketing styles

**Editor/workspace** (all `/project/*` routes + project dashboard):
- Dense, calm, scannable
- Icon-based toolbar actions
- No decorative gradients, orbs, or marketing-style cards
- No layout shift on focus, hover, or state changes
- Stable frame dimensions at all times
- Clear loading/error/retry states

**Marketing** (`/`, `/features`, `/blog`, etc.):
- Richer and more expressive
- Decorative elements OK (hero animations, gradients in established sections)
- Still brand-consistent
- Use real product screenshots/visuals — no generic placeholders

## i18n

`next-intl` configured globally. Provider in `src/app/layout.tsx`.

Strings: `apps/web/client/messages/*.json`

```ts
// ✅
const t = useTranslations('editor');
return <p>{t('emptyState')}</p>;

// ❌
return <p>No projects yet</p>;
```

Keep message keys stable. Prefer adding new keys over renaming existing ones.

## App-local components

Beyond `@weblab/ui`, app-local reusable components live in `src/components/ui/`. Check there before writing a new one.

Key app-local components:
- AI-chat input styles: `src/components/ui/ai-chat-input-styles.ts`
- Various modals, dialogs, and editor-specific widgets

## No-layout-shift focus

Chat input has specific behavior documented in `docs/ai-chat-input-unification-2026-05-06.md`:
- Focus must not change container border weight or size
- All surfaces use `AiPromptComposer` to maintain consistent behavior
- TipTap manages focus state internally — don't override with CSS that affects layout

## Changelog entry format

When shipping a user-facing feature, prepend to `apps/web/client/src/lib/changelog-entries.ts`:

```ts
{
    slug: 'v1-6-short-slug',     // kebab-case
    version: '1.6',              // bump last entry by 0.1
    title: 'Feature Name',
    description: 'One or two sentences.',
    date: '2026-MM-DD',
    tags: ['Tag1', 'Tag2'],      // 2-4 labels
}
```

If the feature has a visible UI, save a representative SVG or screenshot to `apps/web/client/public/assets/changelog/`.

## Blog post format

File: `apps/web/client/content/blog/<slug>.mdx`

```mdx
---
title: "Post Title"
description: "One sentence for OG/cards."
date: "YYYY-MM-DD"
author: "Ludvig Hedin"
authorImage: "https://github.com/ludvighedin.png"
category: "Product"
tags: ["tag1", "tag2"]
coverImage: "/assets/blog/<slug>.svg"
---
```

Cover image → `apps/web/client/public/assets/blog/`. Reuse an existing SVG as template.

## Design system page maintenance

Whenever you:
- Add a new `@weblab/ui` component → add a demo section to `design-system/page.tsx`
- Change a token name or value → update the swatch on the design system page
- Add a new semantic token group → add it to the token catalog section

The design system page is the single reference for "what the app looks like."
