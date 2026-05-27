# App Routes Reference

Complete map of all top-level routes under
`apps/web/client/src/app/`. Use this when adding a new page, redesigning
navigation, or ensuring SEO/sitemap consistency. Last refreshed: 2026-05-27.

> Routes are file-system-driven by Next.js App Router. Each directory is a
> route segment; `page.tsx` produces a navigable page.
>
> Auth-gating happens in `src/middleware.ts` (Clerk). Public routes pass
> through; protected routes redirect to `/sign-in`.

## Marketing & Public

| Route | Path | Purpose |
|-------|------|---------|
| `/` | `app/page.tsx` | Homepage / hero / create flow entry |
| `/about` | `app/about/` | Company / mission |
| `/ai-website-builder` | `app/ai-website-builder/` | SEO landing — "AI website builder" |
| `/blog` | `app/blog/` | Marketing blog (MDX-driven via `content/blog/`) |
| `/changelog` | `app/changelog/` | Public changelog (data from `lib/changelog-entries.ts`) |
| `/compare` | `app/compare/` | Comparison pages vs competitors |
| `/download` | `app/download/` | Desktop app download |
| `/faq` | `app/faq/` | Frequently asked questions |
| `/features` | `app/features/` | Feature highlights |
| `/landing-old`, `/landing-v2` | `app/landing-old/`, `app/landing-v2/` | A/B variants of the landing page |
| `/pricing` | `app/pricing/` | Pricing tiers, links to Stripe |
| `/privacy-policy` | `app/privacy-policy/` | Privacy policy |
| `/security` | `app/security/` | Security overview / production-readiness summary |
| `/terms-of-service` | `app/terms-of-service/` | Terms of service |
| `/see-a-demo` | `app/see-a-demo/` | Demo booking |
| `/visual-site-builder` | `app/visual-site-builder/` | SEO landing — "Visual site builder" |
| `/website-builder` | `app/website-builder/` | SEO landing — "Website builder" |
| `/site-map` | `app/site-map/` | Sitemap helper page (HTML; not the XML feed) |
| `/workflows/*` | `app/workflows/` | Workflow templates / integrations (`claude-code`, `codex`, `vibe-coding`) |

## Auth & Onboarding

| Route | Path | Purpose |
|-------|------|---------|
| `/sign-in/[[...rest]]` | `app/sign-in/[[...rest]]/page.tsx` | Custom Clerk-powered sign-in (replaces prebuilt UI) |
| `/sign-in/sso-callback` | `app/sign-in/sso-callback/` | OAuth SSO callback |
| `/sign-in/verify` | `app/sign-in/verify/` | Email-link / magic-link verification |
| `/sign-up` | `app/sign-up/` | Unified sign-up (Clerk-powered) |
| `/auth/*` | `app/auth/` | Auth callbacks / sign-out / session bootstrap |
| `/callback` | `app/callback/` | OAuth provider redirect target (legacy Vercel OAuth path) |
| `/profile-setup` | `app/profile-setup/` | First-run profile setup after sign-up |
| `/invitation` | `app/invitation/` | Accept project/workspace invitation |

> No `/login` route in the active codebase — Clerk's `/sign-in` is canonical.

## Core Product

| Route | Path | Purpose |
|-------|------|---------|
| `/projects` | `app/projects/` | Project list / dashboard, import flows (`projects/new`, `projects/import/{figma,github,local}`) |
| `/project/[id]` | `app/project/[id]/` | **Main editor workspace** — see `editor-architecture.md` |
| `/w/[slug]/settings/general` | `app/w/[slug]/settings/general/page.tsx` | Workspace settings — general |
| `/w/[slug]/settings/members` | `app/w/[slug]/settings/members/page.tsx` | Workspace settings — members |
| `/w/[slug]/settings/invitations` | `app/w/[slug]/settings/invitations/page.tsx` | Workspace settings — pending invitations |
| `/settings` | `app/settings/` | Personal account settings |
| `/design-system` | `app/design-system/` | Living design system (password-gated off localhost — `DESIGN_SYSTEM_PASSWORD`) |
| `/offline` | `app/offline/` | Offline fallback served when the editor or marketing app loses connectivity |

## Backend Plumbing

| Route | Path | Purpose |
|-------|------|---------|
| `/api/health` | `app/api/health/` | Liveness probe (Railway healthcheck) |
| `/api/chat` (+ `/api/chat-images`) | `app/api/chat/`, `app/api/chat-images/` | Streaming AI chat |
| `/api/ai/inline-edit` | `app/api/ai/inline-edit/` | Inline AST edit agent |
| `/api/ai/tab-complete` | `app/api/ai/tab-complete/` | Tab completion agent |
| `/api/models` | `app/api/models/` | Available model catalog |
| `/api/transcribe` | `app/api/transcribe/` | Speech-to-text |
| `/api/email-capture` | `app/api/email-capture/` | Newsletter / marketing capture |
| `/api/promo-resume` | `app/api/promo-resume/` | Promo signup resume helper |

**Webhook routing:** All inbound webhooks land on Convex HTTP actions in
`apps/web/client/convex/http.ts` (Clerk users, Stripe billing). There is no
longer a `/webhook` Next.js route in the active codebase.

## Internal / Admin / Dev

| Route | Path | Purpose |
|-------|------|---------|
| `/admin` | `app/admin/` | Admin dashboard (gated to admin capability) |
| `/dev` | `app/dev/` | Internal dev surface (feature flags, sandbox helpers) |
| `/error.tsx` | `app/error.tsx` | Top-level error boundary |
| `/not-found.tsx` | `app/not-found.tsx` | 404 |

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
`_components/`. Current layout (2026-05-27):

- `canvas/` — visual canvas, frames, overlays, hotkeys, layout guides + rulers
- `left-panel/` — code panel (file tree, file content, unsaved-changes dialog), design panel (assets, components, insert, brand tokens, interactions)
- `right-panel/` — chat tab (TipTap composer, summarizer, model picker), style tab v2/v4
- `top-bar/` — toolbar, branch switcher, publish controls, diff/deploy modals
- `bottom-bar/` — terminal, status
- `editor-bar/` — element inspector
- `right-click-menu/` — context menu
- `element-palette/` — element insertion
- `command-palette/` — global command-K
- `project-search/`, `file-finder/` — fuzzy search surfaces
- `members/` — collaboration / presence
- `cms-workspace/` — CMS integration (see `cms-architecture.md`)
- `branch/` — branch switching UI
- `page-settings-drawer/` — per-page settings (schema markup, access control)
- `mobile-layout.tsx`, `preview-overlay.tsx` — mobile + preview surfaces
- `offline-banner.tsx`, `offline-editor-bootstrap.tsx`, `offline-panel.tsx` — offline-mode handling
- `onboarding-tour.tsx` — first-run guided tour
- `clone-project-dialog.tsx`, `keyboard-shortcuts-modal.tsx`, `project-load-error.tsx`, `canvas-error-boundary.tsx` — modal/error helpers
- `main.tsx` — feature root (mounts the editor `engine` store with `useState(() => new Engine())`)

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
