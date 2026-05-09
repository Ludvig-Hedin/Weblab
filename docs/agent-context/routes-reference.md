# App Routes Reference

Complete map of all top-level routes under
`apps/web/client/src/app/`. Use this when adding a new page, redesigning
navigation, or ensuring SEO/sitemap consistency.

> Routes are file-system-driven by Next.js App Router. Each directory is a
> route segment; `page.tsx` produces a navigable page.

## Marketing & Public

| Route | Path | Purpose |
|-------|------|---------|
| `/` | `app/page.tsx` | Homepage / hero / create flow entry |
| `/about` | `app/about/` | Company / mission |
| `/blog` | `app/blog/` | Marketing blog (MDX-driven via `content/blog/`) |
| `/changelog` | `app/changelog/` | Public changelog (data from `lib/changelog-entries.ts`) |
| `/compare` | `app/compare/` | Comparison pages vs competitors |
| `/download` | `app/download/` | Desktop app download |
| `/faq` | `app/faq/` | Frequently asked questions |
| `/features` | `app/features/` | Feature highlights |
| `/pricing` | `app/pricing/` | Pricing tiers, links to Stripe |
| `/privacy-policy` | `app/privacy-policy/` | Privacy policy |
| `/terms-of-service` | `app/terms-of-service/` | Terms of service |
| `/see-a-demo` | `app/see-a-demo/` | Demo booking |
| `/workflows` | `app/workflows/` | Workflow templates / integrations (Claude Code, vibe coding, etc.) |
| `/site-map` | `app/site-map/` | XML sitemap helper page |
| `robots.txt` | `app/robots.txt/` | SEO robots file |

## Auth & Onboarding

| Route | Path | Purpose |
|-------|------|---------|
| `/login` | `app/login/` | Login UI |
| `/auth/*` | `app/auth/` | Auth callbacks, redirect, sign-out, session bootstrap |
| `/callback` | `app/callback/` | OAuth provider redirect target |
| `/invitation` | `app/invitation/` | Accept team invitation |

## Core Product

| Route | Path | Purpose |
|-------|------|---------|
| `/projects` | `app/projects/` | Project list / dashboard |
| `/project/[id]` | `app/project/[id]/` | **Main editor workspace** — see `editor-architecture.md` |
| `/design-system` | `app/design-system/` | Living design system (password-gated off localhost) |

## Backend Plumbing

| Route | Path | Purpose |
|-------|------|---------|
| `/api/*` | `app/api/` | Next.js route handlers (tRPC entrypoint, REST helpers) |
| `/webhook` | `app/webhook/` | Inbound webhook receivers (Stripe, GitHub, etc.) |

## Shared Infrastructure

| File | Purpose |
|------|---------|
| `app/layout.tsx` | Root layout — providers, theme, i18n, scripts (env-gated) |
| `app/page.tsx` | Homepage |
| `app/not-found.tsx` | 404 |
| `app/_components/` | Marketing/shared components used across multiple pages (hero, top-bar, etc.) |
| `app/fonts.ts` | Next.js font loaders |
| `app/seo.ts` | Shared SEO metadata helpers |

## Adding a New Page

1. Create `app/<segment>/page.tsx`. Default to a Server Component.
2. Add `use client` only if the page uses events, state, browser APIs, or
   client-only libs.
3. Add metadata via `export const metadata: Metadata = { ... }` (use
   `seo.ts` helpers where possible).
4. If user-facing, add it to:
   - `next-sitemap.config.js` if the route should appear in the sitemap
   - i18n message files if it has user-facing copy
5. If the page introduces a new top-level concept, also add the route to this
   file.

## Project Editor Sub-routes

The `/project/[id]` route has substantial internal structure under
`_components/`:

- `canvas/` — visual canvas, frames, overlays, hotkeys
- `left-panel/` — code panel, design panel (assets, components, insert)
- `right-panel/` — chat tab, style tab v2
- `top-bar/` — toolbar, publish controls
- `bottom-bar/` — terminal, status
- `editor-bar/` — element inspector
- `right-click-menu/` — context menu
- `element-palette/` — element insertion
- `members/` — collaboration / presence
- `cms-workspace/` — **NEW** CMS integration (see `cms-architecture.md`)
- `branch/` — branch switching UI
- `mobile-layout.tsx`, `preview-overlay.tsx` — mobile + preview surfaces
- `clone-project-dialog.tsx`, `keyboard-shortcuts-modal.tsx`,
  `project-load-error.tsx` — modal/error helpers

Editor architecture is documented in `editor-architecture.md`.

## Common Pitfalls

- Adding a `page.tsx` without a top-level `<main>` or correct semantic HTML.
- Creating a client component when a Server Component would suffice (causes
  larger client bundle).
- Forgetting to update `next-sitemap.config.js` for marketing routes that
  should be indexed.
- Skipping i18n by hardcoding strings instead of using `messages/*`.
- Adding webhook routes outside `/webhook/` (breaks security headers and
  request parsing assumptions).
