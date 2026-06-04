# Weblab Feature Catalog

> **Master inventory** of every feature in the Weblab web app. Every row has a **stable ID** (`F-XXX`), **tags**, **path**, **usage**, **sub-features**, **dependencies**. Use it for QA, onboarding, audits, and the companion [test plan](./test-plan.md).

---

## How to use this doc

**Agents — read this before:**
- planning any feature work
- answering "where does X live"
- writing a feature plan or design doc
- writing tests
- doing a code audit

**Agents — update this whenever you:**
- add a new top-level route, modal, panel, or API
- add a new Convex module, table, or `@weblab/*` package
- rename or delete a feature row above

See the **[Change Protocol](#change-protocol)** at the bottom.

---

## Searching this doc

Use these conventions so grep/ripgrep work cleanly:

| Look for | Grep pattern |
|---|---|
| One feature by ID | `F-042` |
| All editor features | `#editor` |
| All AI features | `#ai` |
| All marketing pages | `#public` |
| All auth-gated routes | `#auth-gated` |
| All Convex functions | `#convex` |
| All deprecated / disabled | `#deprecated` |
| All features touching a file | `grep -n 'apps/web/client/src/app/project'` |

**Stable IDs are sacred** — never reuse an ID after a feature is deleted; mark it `~~F-042~~ (removed)` instead. New rows get the next free ID.

---

## Tags

| Tag | Meaning |
|---|---|
| `#public` | Anyone can hit it unauthenticated |
| `#auth-gated` | Requires sign-in (Clerk) |
| `#admin` | Requires admin role |
| `#editor` | Inside `/project/[id]` editor surface |
| `#ai` | Touches LLM / chat / inline-edit / tab-complete / suggestion |
| `#cms` | CMS workspace + bindings |
| `#billing` | Stripe + subscription + usage |
| `#integration` | External service (GitHub, Figma, Stripe, Freestyle, Vercel Sandbox, Clerk) |
| `#convex` | Convex function/table |
| `#trpc` | tRPC procedure (now only 2 routers — `sandbox`, `components`) |
| `#rest` | Next.js route handler under `/api/` |
| `#webhook` | Inbound webhook |
| `#package` | Lives in `packages/*` |
| `#store` | MobX manager in `src/components/store/` |
| `#modal` | A modal/dialog component |
| `#deprecated` | Code retained but no production caller |
| `#disabled` | Functional surface but flagged off (e.g. `project.fork` on Vercel) |
| `#mobile` | Phone/tablet-only surface |
| `#i18n` | Touches `messages/*` localization |

> ⚠️ **Important architecture note (2026-05-26):** The backend was migrated from tRPC routers (`apps/web/client/src/server/api/`) to **Convex** (`apps/web/client/convex/`). Only two vestigial tRPC routers remain in `apps/web/server/`: `sandbox` and `components`. Treat `docs/agent-context/trpc-routers-reference.md` as **stale** and follow this catalog instead.

---

## Table of Contents

- [1. Public / Marketing routes](#1-public--marketing-routes) (F-001 … F-049)
- [2. Marketing components](#2-marketing-components) (F-050 … F-079)
- [3. Auth, Onboarding & Callbacks](#3-auth-onboarding--callbacks) (F-080 … F-099)
- [4. Workspace & Settings](#4-workspace--settings) (F-100 … F-119)
- [5. Projects Dashboard, Create, Import](#5-projects-dashboard-create-import) (F-120 … F-149)
- [6. Project Editor Shell](#6-project-editor-shell) (F-150 … F-169)
- [7. Editor Canvas & Preview](#7-editor-canvas--preview) (F-170 … F-199)
- [8. Editor Top Bar](#8-editor-top-bar) (F-200 … F-219)
- [9. Editor Left Panel — Design](#9-editor-left-panel--design) (F-220 … F-249)
- [10. Editor Left Panel — Code](#10-editor-left-panel--code) (F-250 … F-259)
- [11. Editor Right Panel — Style](#11-editor-right-panel--style) (F-260 … F-279)
- [12. Editor Right Panel — Chat (AI)](#12-editor-right-panel--chat-ai) (F-280 … F-299)
- [13. Editor Right Panel — Interactions & Comments](#13-editor-right-panel--interactions--comments) (F-300 … F-309)
- [14. Editor Bar (Inline Toolbar)](#14-editor-bar-inline-toolbar) (F-310 … F-329)
- [15. Editor Bottom Bar](#15-editor-bottom-bar) (F-330 … F-339)
- [16. Editor Context Menus, Palettes, Search](#16-editor-context-menus-palettes-search) (F-340 … F-359)
- [17. Editor Members, Branches, Versioning](#17-editor-members-branches-versioning) (F-360 … F-379)
- [18. Editor CMS Workspace](#18-editor-cms-workspace) (F-380 … F-399)
- [19. Editor Modals, Errors, Mobile, Offline](#19-editor-modals-errors-mobile-offline) (F-400 … F-419)
- [20. Settings Modal (in-editor + non-project)](#20-settings-modal-in-editor--non-project) (F-420 … F-449)
- [21. Pricing Modal, Avatar Dropdown, In-app UI](#21-pricing-modal-avatar-dropdown-in-app-ui) (F-450 … F-469)
- [22. REST API Routes (Next.js)](#22-rest-api-routes-nextjs) (F-470 … F-489)
- [23. Webhooks](#23-webhooks) (F-490 … F-499)
- [24. tRPC Routers (vestigial)](#24-trpc-routers-vestigial) (F-500 … F-509)
- [25. Convex Functions](#25-convex-functions) (F-510 … F-579)
- [26. Convex Schema Tables](#26-convex-schema-tables) (F-580 … F-629)
- [27. Editor Store Managers (MobX)](#27-editor-store-managers-mobx) (F-630 … F-679)
- [28. Shared Packages](#28-shared-packages) (F-680 … F-709)
- [29. Integrations (External Services)](#29-integrations-external-services) (F-710 … F-729)
- [30. Admin](#30-admin) (F-730 … F-739)
- [31. Dev / Internal](#31-dev--internal) (F-740 … F-749)
- [32. Cross-Cutting (env, i18n, theming, SEO)](#32-cross-cutting-env-i18n-theming-seo) (F-750 … F-779)
- [Glossary](#glossary)
- [Change Protocol](#change-protocol)
- [Change Log](#change-log)

---

## 1. Public / Marketing routes

| ID | Tags | Route | Path | Sub-features | Used when |
|---|---|---|---|---|---|
| F-001 | `#public` | `/` | [src/app/page.tsx](apps/web/client/src/app/page.tsx) | `HomePageClient` hero + scroll sections | Marketing entry, drives sign-up + project create |
| F-002 | `#public` | `/about` | [src/app/about/page.tsx](apps/web/client/src/app/about/page.tsx) | FeaturesHero, founder card, values grid (Speed/Resilience/Reinvention/Competence), hiring qualities (Commitment/Passion/Excellence), motion blur fx, GitHub/LinkedIn social links, CTA | Company-story page |
| F-003 | `#public` | `/blog` | [src/app/blog/page.tsx](apps/web/client/src/app/blog/page.tsx) | Featured post card, post grid, ChangelogGrid (limit 4), PostCard, JSON-LD blog + breadcrumb | Content hub |
| F-004 | `#public` | `/blog/[slug]` | [src/app/blog/[slug]/page.tsx](apps/web/client/src/app/blog/[slug]/page.tsx) | MDX render, OG meta, author image, reading time | Individual blog posts (MDX in `content/blog/`) |
| F-005 | `#public` | `/changelog` | [src/app/changelog/page.tsx](apps/web/client/src/app/changelog/page.tsx) | Version-dated entries, tag badges, sidebar version/date layout, breadcrumb JSON-LD | Public release log; data: [changelog-entries.ts](apps/web/client/src/lib/changelog-entries.ts) |
| F-006 | `#public` | `/compare` | [src/app/compare/page.tsx](apps/web/client/src/app/compare/page.tsx) | ComparisonMatrixSection, competitor grid, CTA | Comparison hub |
| F-007 | `#public` | `/compare/bolt` | [src/app/compare/bolt/page.tsx](apps/web/client/src/app/compare/bolt/page.tsx) | Per-competitor comparison | vs Bolt |
| F-008 | `#public` | `/compare/claude-code` | [src/app/compare/claude-code/page.tsx](apps/web/client/src/app/compare/claude-code/page.tsx) | Per-competitor comparison | vs Claude Code |
| F-009 | `#public` | `/compare/emergent` | [src/app/compare/emergent/page.tsx](apps/web/client/src/app/compare/emergent/page.tsx) | Per-competitor comparison | vs Emergent |
| F-010 | `#public` | `/compare/framer` | [src/app/compare/framer/page.tsx](apps/web/client/src/app/compare/framer/page.tsx) | Per-competitor comparison | vs Framer |
| F-011 | `#public` | `/compare/lovable` | [src/app/compare/lovable/page.tsx](apps/web/client/src/app/compare/lovable/page.tsx) | Per-competitor comparison | vs Lovable |
| F-012 | `#public` | `/compare/one-com` | [src/app/compare/one-com/page.tsx](apps/web/client/src/app/compare/one-com/page.tsx) | Per-competitor comparison | vs one.com |
| F-013 | `#public` | `/compare/onlook` | [src/app/compare/onlook/page.tsx](apps/web/client/src/app/compare/onlook/page.tsx) | Per-competitor comparison (legacy) | vs Onlook |
| F-014 | `#public` | `/compare/replit` | [src/app/compare/replit/page.tsx](apps/web/client/src/app/compare/replit/page.tsx) | Per-competitor comparison | vs Replit |
| F-015 | `#public` | `/compare/v0` | [src/app/compare/v0/page.tsx](apps/web/client/src/app/compare/v0/page.tsx) | Per-competitor comparison | vs Vercel v0 |
| F-016 | `#public` | `/compare/webflow` | [src/app/compare/webflow/page.tsx](apps/web/client/src/app/compare/webflow/page.tsx) | Per-competitor comparison | vs Webflow |
| F-017 | `#public` | `/compare/wix` | [src/app/compare/wix/page.tsx](apps/web/client/src/app/compare/wix/page.tsx) | Per-competitor comparison | vs Wix |
| F-018 | `#public` | `/download` | [src/app/download/page.tsx](apps/web/client/src/app/download/page.tsx) | AppIcon SVG, motion fade-in, Apple Silicon + Intel buttons, system req footer | Desktop app distribution |
| F-019 | `#public` | `/faq` | [src/app/faq/page.tsx](apps/web/client/src/app/faq/page.tsx) | 5 sections (About, Features, Compatibility, Workflow, Company), FAQDropdown, sticky sidebar, smooth scroll, active section highlight, CTA | Pre-sales Q&A |
| F-020 | `#public` | `/features` | [src/app/features/page.tsx](apps/web/client/src/app/features/page.tsx) | FeaturesHero, ResponsiveMockupSection, BenefitsSection, FeaturesIntroSection, FeaturesGridSection, ComparisonMatrixSection, 8-Q FAQ, CTA; uses CreateManagerProvider + SubscriptionModal + NonProjectSettingsModal | Product capabilities |
| F-021 | `#public` | `/features/ai` | [src/app/features/ai/page.tsx](apps/web/client/src/app/features/ai/page.tsx) | AI-specific hero + grid + intro + provider icons | AI feature page |
| F-022 | `#public` | `/features/ai-for-frontend` | [src/app/features/ai-for-frontend/page.tsx](apps/web/client/src/app/features/ai-for-frontend/page.tsx) | AI-for-frontend angle | AI frontend page |
| F-023 | `#public` | `/features/blocks` | [src/app/features/blocks/page.tsx](apps/web/client/src/app/features/blocks/page.tsx) | Blocks/components showcase | Component blocks page |
| F-024 | `#public` | `/features/builder` | [src/app/features/builder/page.tsx](apps/web/client/src/app/features/builder/page.tsx) | Visual builder positioning | Builder feature page |
| F-025 | `#public` | `/features/prototype` | [src/app/features/prototype/page.tsx](apps/web/client/src/app/features/prototype/page.tsx) | Prototyping flows | Prototyping feature page |
| F-026 | `#public` | `/website-builder` | [src/app/website-builder/](apps/web/client/src/app/website-builder/) | SEO-targeted landing variant | Long-tail SEO entry |
| F-027 | `#public` | `/ai-website-builder` | [src/app/ai-website-builder/page.tsx](apps/web/client/src/app/ai-website-builder/page.tsx) | SEO-targeted landing variant | Long-tail SEO entry |
| F-028 | `#public` | `/visual-site-builder` | [src/app/visual-site-builder/page.tsx](apps/web/client/src/app/visual-site-builder/page.tsx) | SEO-targeted landing variant | Long-tail SEO entry |
| F-029 | `#public` `#billing` | `/pricing` | [src/app/pricing/page.tsx](apps/web/client/src/app/pricing/page.tsx) | PricingTable, For-Teams enterprise section, 9-card highlights, 8-item enterprise checklist, GitHub disclaimer, Contact mailto | Plan selection + Stripe entry |
| F-030 | `#public` | `/privacy-policy` | [src/app/privacy-policy/page.tsx](apps/web/client/src/app/privacy-policy/page.tsx) | TOC, personal-data table, cookies, security, state-law rights (CA/NV), contact | Legal |
| F-031 | `#public` | `/terms-of-service` | [src/app/terms-of-service/page.tsx](apps/web/client/src/app/terms-of-service/page.tsx) | 12 sections, NY law clause, AI-training opt-out | Legal |
| F-032 | `#public` | `/see-a-demo` | [src/app/see-a-demo/page.tsx](apps/web/client/src/app/see-a-demo/page.tsx) | Redirect to `/projects` | Demo placeholder |
| F-033 | `#public` | `/workflows` | [src/app/workflows/page.tsx](apps/web/client/src/app/workflows/page.tsx) | Hero, 3-card grid (Claude Code / Vibe Coding / Codex), Coming Soon badges, motion fx, CTA | Stack-integration hub |
| F-034 | `#public` | `/workflows/claude-code` | [src/app/workflows/claude-code/page.tsx](apps/web/client/src/app/workflows/claude-code/page.tsx) | Per-workflow walkthrough | Claude Code workflow |
| F-035 | `#public` | `/workflows/vibe-coding` | [src/app/workflows/vibe-coding/page.tsx](apps/web/client/src/app/workflows/vibe-coding/page.tsx) | Per-workflow walkthrough | Vibe coding |
| F-036 | `#public` | `/workflows/codex` | [src/app/workflows/codex/page.tsx](apps/web/client/src/app/workflows/codex/page.tsx) | Per-workflow walkthrough | Codex CLI |
| F-037 | `#public` | `/security` | [src/app/security/page.tsx](apps/web/client/src/app/security/page.tsx) | Hero, compliance-features, data-features, compare, subprocessors, contact, badges (SOC2/ISO) | Security/compliance |
| F-038 | `#public` | `/site-map` | [src/app/site-map/page.tsx](apps/web/client/src/app/site-map/page.tsx) | Sticky sidebar (Main / Features / Workflows / Resources / Social / Legal), scroll tracking | HTML sitemap (not XML) |
| F-039 | `#public` | `/offline` | [src/app/offline/page.tsx](apps/web/client/src/app/offline/page.tsx) | Lost-connection fallback | PWA offline route |
| F-040 | `#public` `#deprecated` | `/landing-old` | [src/app/landing-old/page.tsx](apps/web/client/src/app/landing-old/page.tsx) | Legacy homepage variant | Archived hero/landing |
| F-041 | `#public` `#deprecated` | `/landing-v2` | [src/app/landing-v2/page.tsx](apps/web/client/src/app/landing-v2/page.tsx) | Mid-cycle homepage variant | Archived hero/landing |
| F-042 | `#public` | `not-found.tsx` | [src/app/not-found.tsx](apps/web/client/src/app/not-found.tsx) | 404 view | 404 fallback |
| F-043 | `#public` | `error.tsx` | [src/app/error.tsx](apps/web/client/src/app/error.tsx) | Root error boundary | Crash fallback |
| F-044 | `#public` | Root layout | [src/app/layout.tsx](apps/web/client/src/app/layout.tsx) | Providers (theme/i18n/Clerk/tRPC/Convex), ThemeProvider dark default, env-gated scripts | Root provider tree |
| F-045 | `#public` | `/design-system` | [src/app/design-system/page.tsx](apps/web/client/src/app/design-system/page.tsx) | Every `@weblab/ui` component + tokens + color/font/radius/shadow scales; live edit via CSS vars (preview only) | Living design system reference. Localhost open; non-localhost gated by `DESIGN_SYSTEM_PASSWORD` env |

---

## 2. Marketing components

> Located under [src/app/_components/](apps/web/client/src/app/_components/).

| ID | Tags | Component | Path | Used in | Purpose |
|---|---|---|---|---|---|
| F-050 | `#public` | `website-layout.tsx` | [_components/website-layout.tsx](apps/web/client/src/app/_components/website-layout.tsx) | Every marketing page | Header + footer wrapper |
| F-051 | `#public` | `auth-modal.tsx` | [_components/auth-modal.tsx](apps/web/client/src/app/_components/auth-modal.tsx) | Marketing CTAs, editor sign-in gate | Inline auth modal |
| F-052 | `#public` | `cookie-consent.tsx` | [_components/cookie-consent.tsx](apps/web/client/src/app/_components/cookie-consent.tsx) | Root layout | Cookie banner, localStorage persist |
| F-053 | `#public` | `button-link.tsx` | [_components/button-link.tsx](apps/web/client/src/app/_components/button-link.tsx) | CTAs | Link styled as `<Button>` |
| F-054 | `#public` | `changelog-grid.tsx` | [_components/changelog-grid.tsx](apps/web/client/src/app/_components/changelog-grid.tsx) | `/blog`, `/changelog` | Grid of changelog entries |
| F-055 | `#public` | `smooth-scroll-provider.tsx` | [_components/smooth-scroll-provider.tsx](apps/web/client/src/app/_components/smooth-scroll-provider.tsx) | Root layout | Smooth scroll context |
| F-056 | `#public` | `view-transition-noise-suppress.tsx` | [_components/view-transition-noise-suppress.tsx](apps/web/client/src/app/_components/view-transition-noise-suppress.tsx) | Root layout | Suppress jank during view transitions |
| F-057 | `#public` | `sw-register.tsx` | [_components/sw-register.tsx](apps/web/client/src/app/_components/sw-register.tsx) | Root layout | PWA service worker registration |
| F-058 | `#public` | `theme.tsx` | [_components/theme.tsx](apps/web/client/src/app/_components/theme.tsx) | Root layout | ThemeProvider; dark default |
| F-059 | `#public` | `desktop-chrome.tsx` | [_components/desktop-chrome.tsx](apps/web/client/src/app/_components/desktop-chrome.tsx) | Mockups | Faux desktop window chrome |
| F-060 | `#public` | `hero/`, `hero-v2.tsx` | [_components/hero/](apps/web/client/src/app/_components/hero/), [_components/hero-v2.tsx](apps/web/client/src/app/_components/hero-v2.tsx) | Homepage | Hero variants |
| F-061 | `#public` | `home-page-client.tsx` + v2 + old | [_components/home-page-client.tsx](apps/web/client/src/app/_components/home-page-client.tsx) | `/`, `/landing-old`, `/landing-v2` | Homepage shells |
| F-062 | `#public` `#billing` | `promo-banner/` | [_components/promo-banner/](apps/web/client/src/app/_components/promo-banner/) | Marketing pages | Promo strip (e.g. discount, launches) — wired to `/api/promo-resume` |
| F-063 | `#public` | `security/` | [_components/security/](apps/web/client/src/app/_components/security/) | `/security` | Hero, compliance, data, compare, subprocessors, contact, badges |
| F-064 | `#public` | `shared/` | [_components/shared/](apps/web/client/src/app/_components/shared/) | Cross-page | Shared marketing primitives |
| F-065 | `#public` | `top-bar/` (marketing) | [_components/top-bar/](apps/web/client/src/app/_components/top-bar/) | Marketing pages | Public header nav |
| F-066 | `#public` | `landing-page/*` | [_components/landing-page/](apps/web/client/src/app/_components/landing-page/) | Landing pages | faq-section, faq-dropdown, cta-section, features-grid/intro, builder-features-*, ai-features-*, benefits, responsive-mockup, comparison-teaser, social-proof, use-cases, scrolling-velocity, testimonials, terminal-section, just-shipped-strip, feature-trio, feature-backdrop, weblab-interface-mockup, code-one-to-one, obsess-for-hours, contributor, model-agnostic, provider-icons, color-swatch-group, illustrations, contact-link, locale-switcher, theme-switcher |

---

## 3. Auth, Onboarding & Callbacks

| ID | Tags | Route / Component | Path | Sub-features | Used when |
|---|---|---|---|---|---|
| F-080 | `#public` | `/sign-in` (catch-all) | [src/app/sign-in/[[...rest]]/page.tsx](apps/web/client/src/app/sign-in/[[...rest]]/page.tsx) | Server-rendered Clerk entry, returnUrl sanitization, signed-in bounce | Sign-in entry |
| F-081 | `#public` | `clerk-auth-form` | [src/app/sign-in/_components/clerk-auth-form.tsx](apps/web/client/src/app/sign-in/_components/clerk-auth-form.tsx) | OAuth (GitHub/Google/Vercel) + email OTP, sign-in vs sign-up detect, 30s resend cooldown, sessionStorage state | Combined auth form |
| F-082 | `#public` | `/sign-in/verify` | [src/app/sign-in/verify/page.tsx](apps/web/client/src/app/sign-in/verify/page.tsx) | 6-digit OTP, factor attestation, 60s resend, sign-out fallback | OTP code entry |
| F-083 | `#public` | `/sign-in/sso-callback` | [src/app/sign-in/sso-callback/page.tsx](apps/web/client/src/app/sign-in/sso-callback/page.tsx) | `AuthenticateWithRedirectCallback`, fallback → `/projects`, new sign-ups → `/profile-setup` | OAuth redirect target |
| F-084 | `#public` | `/sign-up` (catch-all) | [src/app/sign-up/[[...rest]]/page.tsx](apps/web/client/src/app/sign-up/[[...rest]]/page.tsx) | Clerk-hosted sign-up | Sign-up entry |
| F-085 | `#public` | `/auth/redirect` | [src/app/auth/redirect/page.tsx](apps/web/client/src/app/auth/redirect/page.tsx) | returnUrl sanitization, HOME sentinel, immediate server redirect | Post-OAuth router |
| F-086 | `#public` | `/auth/auth-code-error` | [src/app/auth/auth-code-error/page.tsx](apps/web/client/src/app/auth/auth-code-error/page.tsx) | Display Clerk OAuth error code | Auth failure surface |
| F-087 | `#auth-gated` | `/profile-setup` | [src/app/profile-setup/page.tsx](apps/web/client/src/app/profile-setup/page.tsx) | Initial profile capture (name/handle); server-side auth gate via [layout.tsx](apps/web/client/src/app/profile-setup/layout.tsx) (`getCurrentUser()` → redirect /sign-in) | First-run after sign-up |
| F-088 | `#public` `#integration` `#disabled` | `/callback/figma` | [src/app/callback/figma/page.tsx](apps/web/client/src/app/callback/figma/page.tsx) | OAuth code/state parse, synchronous error-message derivation (always renders error until Figma OAuth is configured) | Figma OAuth target |
| F-089 | `#public` `#integration` | `/callback/github/install` | [src/app/callback/github/install/page.tsx](apps/web/client/src/app/callback/github/install/page.tsx) | GitHub App install confirmation | Post-GitHub-App-install |
| F-090 | `#public` `#billing` | `/callback/stripe/success` | [src/app/callback/stripe/success/page.tsx](apps/web/client/src/app/callback/stripe/success/page.tsx) | Stripe checkout success | Post-checkout |
| F-091 | `#public` `#billing` | `/callback/stripe/cancel` | [src/app/callback/stripe/cancel/page.tsx](apps/web/client/src/app/callback/stripe/cancel/page.tsx) | Stripe checkout cancel | Cancelled checkout |
| F-092 | `#public` | `/invitation/[id]` | [src/app/invitation/[id]/page.tsx](apps/web/client/src/app/invitation/[id]/page.tsx) | Token parse, invite data query (Convex `projectInvitations.getWithoutToken`), accept (`projectInvitations.accept`) / decline, re-auth handler, telemetry clear | Project invite landing |
| F-093 | `#public` | `/invitation/workspace/[id]` | [src/app/invitation/workspace/[id]/page.tsx](apps/web/client/src/app/invitation/workspace/[id]/page.tsx) | Same as F-092 but workspace-scoped | Workspace invite landing |

---

## 4. Workspace & Settings

| ID | Tags | Route | Path | Sub-features | Used when |
|---|---|---|---|---|---|
| F-100 | `#auth-gated` | `/w/new` | [src/app/w/new/page.tsx](apps/web/client/src/app/w/new/page.tsx) | Name input, slug generation, create via Convex `workspaces.create` | Create new workspace |
| F-101 | `#auth-gated` | `/w/[slug]` (layout) | [src/app/w/[slug]/layout.tsx](apps/web/client/src/app/w/[slug]/layout.tsx) | Auth bounce, workspace context provider | Workspace shell |
| F-102 | `#auth-gated` | `/w/[slug]/projects` | [src/app/w/[slug]/projects/page.tsx](apps/web/client/src/app/w/[slug]/projects/page.tsx) | Project list, create, import, filter, sort, recent, shared, subscription modal, settings modal, command palette | Workspace projects dashboard |
| F-103 | `#auth-gated` | `/w/[slug]/settings/general` | [src/app/w/[slug]/settings/general/page.tsx](apps/web/client/src/app/w/[slug]/settings/general/page.tsx) | Name / slug / logo / delete | Workspace settings |
| F-104 | `#auth-gated` `#billing` | `/w/[slug]/settings/billing` | [src/app/w/[slug]/settings/billing/page.tsx](apps/web/client/src/app/w/[slug]/settings/billing/page.tsx) | Plan, seats, Stripe portal, usage caps | Billing |
| F-105 | `#auth-gated` | `/w/[slug]/settings/members` | [src/app/w/[slug]/settings/members/page.tsx](apps/web/client/src/app/w/[slug]/settings/members/page.tsx) | List, role change, remove | Member admin |
| F-106 | `#auth-gated` | `/w/[slug]/settings/invitations` | [src/app/w/[slug]/settings/invitations/page.tsx](apps/web/client/src/app/w/[slug]/settings/invitations/page.tsx) | Pending invitations, resend, revoke | Invite admin |
| F-107 | `#auth-gated` | `/w/[slug]/settings` (layout) | [src/app/w/[slug]/settings/layout.tsx](apps/web/client/src/app/w/[slug]/settings/layout.tsx) | Sidebar nav for settings sub-routes | Settings shell |
| F-108 | `#auth-gated` | `/settings` | [src/app/settings/page.tsx](apps/web/client/src/app/settings/page.tsx) | Personal user account settings | User account |

---

## 5. Projects Dashboard, Create, Import

| ID | Tags | Route | Path | Sub-features | Used when |
|---|---|---|---|---|---|
| F-120 | `#auth-gated` | `/projects` | [src/app/projects/page.tsx](apps/web/client/src/app/projects/page.tsx) | Resolve `lastWorkspaceSlug` cookie, first workspace fallback, personal workspace auto-create → redirect to `/w/[slug]/projects` | Legacy projects landing |
| F-121 | `#auth-gated` | `/projects/new` | [src/app/projects/new/page.tsx](apps/web/client/src/app/projects/new/page.tsx) | Blank / prompt / template launch entry | Create project |
| F-122 | `#auth-gated` | `/projects/creating` | [src/app/projects/creating/page.tsx](apps/web/client/src/app/projects/creating/page.tsx) | Phase indicator, progress, error surface; reads `CreateManager` phases | Project creation in-progress |
| F-123 | `#auth-gated` `#ai` | `/projects/plan` | [src/app/projects/plan/page.tsx](apps/web/client/src/app/projects/plan/page.tsx) | AI plan/spec generation before scaffold | Plan-first project intake |
| F-124 | `#auth-gated` | `/projects/marketplace` | [src/app/projects/marketplace/page.tsx](apps/web/client/src/app/projects/marketplace/page.tsx) | Template grid, filter, preview | Template browse |
| F-125 | `#auth-gated` | `/projects/templates/[id]` | [src/app/projects/templates/[id]/page.tsx](apps/web/client/src/app/projects/templates/[id]/page.tsx) | Template detail, screenshots, "Use template" button | Single template detail |
| F-126 | `#auth-gated` | `/projects/import` | [src/app/projects/import/page.tsx](apps/web/client/src/app/projects/import/page.tsx) | Import method selector | Import hub |
| F-127 | `#auth-gated` | `/projects/import/local` | [src/app/projects/import/local/page.tsx](apps/web/client/src/app/projects/import/local/page.tsx) | Upload local folder/zip | Desktop import path |
| F-128 | `#auth-gated` `#integration` | `/projects/import/github` | [src/app/projects/import/github/page.tsx](apps/web/client/src/app/projects/import/github/page.tsx) | OAuth, repo list, branch select, clone | GitHub import |
| F-129 | `#auth-gated` `#integration` | `/projects/import/figma` | [src/app/projects/import/figma/page.tsx](apps/web/client/src/app/projects/import/figma/page.tsx) | Figma selection import | Figma → project seed |
| F-130 | `#auth-gated` | `/project` (index) | [src/app/project/page.tsx](apps/web/client/src/app/project/page.tsx) | Listing / redirect | Bare project root |
| F-131 | `#auth-gated` | `/project/[id]` | [src/app/project/[id]/page.tsx](apps/web/client/src/app/project/[id]/page.tsx) | Editor entry — see sections 6–19 | Main editor |
| F-132 | `#auth-gated` | `/project/[id]/loading` | [src/app/project/[id]/loading.tsx](apps/web/client/src/app/project/[id]/loading.tsx) | Skeleton during initial load | Editor loading state |
| F-133 | `#auth-gated` | `/project/[id]/error` | [src/app/project/[id]/error.tsx](apps/web/client/src/app/project/[id]/error.tsx) | Error boundary at editor scope | Editor crash fallback |
| F-134 | `#auth-gated` | `/project/[id]/settings/access` | [src/app/project/[id]/settings/access/page.tsx](apps/web/client/src/app/project/[id]/settings/access/page.tsx) | Per-page access controls (Convex `pageAccess`) | Project access admin |
| F-135 | `#store` | `CreateManager` | [src/components/store/create/manager.ts](apps/web/client/src/components/store/create/manager.ts) | Blank / prompt / public + private GitHub-template phases, name gen, error surface, phase reset | Drives `/projects/new` + `/projects/creating` |
| F-782 | `#auth-gated` `#ai` | Clone-website dialog | [clone-website-dialog.tsx](apps/web/client/src/app/projects/_components/clone-website-dialog.tsx) + [use-clone-website.ts](apps/web/client/src/hooks/use-clone-website.ts) | URL / screenshot tabs, framework picker (Next.js / static HTML), Firecrawl scrape (`utils.scrapeUrl`) → `projectActions.createFromWebsiteClone` → editor. Seeds WEBSITE_URL/WEBSITE_SCRAPE/IMAGE/PROMPT clone context that `use-start-project.resumeCreate` (F-150) replays into the AI chat via `getCloneSystemPrompt` | "Clone a website" card on the dashboard |

---

## 6. Project Editor Shell

| ID | Tags | Feature | Path | Sub-features | Used when |
|---|---|---|---|---|---|
| F-150 | `#editor` | Editor shell | [project/[id]/_components/main.tsx](apps/web/client/src/app/project/[id]/_components/main.tsx) | Composes top-bar, left-panel, canvas, right-panel, bottom-bar, mobile-layout; lazy modals (settings, pricing, keyboard shortcuts, CMS); initializes engine | Root editor layout |
| F-151 | `#editor` `#mobile` | Mobile layout | [project/[id]/_components/mobile-layout.tsx](apps/web/client/src/app/project/[id]/_components/mobile-layout.tsx) | Tab switcher (Chat / Comments / Preview), touch pan/zoom | Phone/tablet variant |
| F-152 | `#editor` | Onboarding tour | [project/[id]/_components/onboarding-tour.tsx](apps/web/client/src/app/project/[id]/_components/onboarding-tour.tsx) | Tooltip sequence, feature intro | First-time-user guide |
| F-153 | `#editor` | Offline banner | [project/[id]/_components/offline-banner.tsx](apps/web/client/src/app/project/[id]/_components/offline-banner.tsx) | Network status warning | Connection drop |
| F-154 | `#editor` | Offline panel | [project/[id]/_components/offline-panel.tsx](apps/web/client/src/app/project/[id]/_components/offline-panel.tsx) | Fallback UI | Lost connection |
| F-155 | `#editor` | Offline editor bootstrap | [project/[id]/_components/offline-editor-bootstrap.tsx](apps/web/client/src/app/project/[id]/_components/offline-editor-bootstrap.tsx) | Bootstrap minimal editor when offline | Offline init path |
| F-156 | `#editor` | Page settings drawer | [project/[id]/_components/page-settings-drawer/](apps/web/client/src/app/project/[id]/_components/page-settings-drawer/) | Page name, size, background, viewport | Per-page meta edit |
| F-157 | `#editor` `#modal` | Clone project dialog | [project/[id]/_components/clone-project-dialog.tsx](apps/web/client/src/app/project/[id]/_components/clone-project-dialog.tsx) | Name input, clone action | Fork project |
| F-158 | `#editor` `#modal` | Keyboard shortcuts modal | [project/[id]/_components/keyboard-shortcuts-modal.tsx](apps/web/client/src/app/project/[id]/_components/keyboard-shortcuts-modal.tsx) | Hotkey reference grouped by section | `?` keypress |
| F-159 | `#editor` | Project load error | [project/[id]/_components/project-load-error.tsx](apps/web/client/src/app/project/[id]/_components/project-load-error.tsx) | Variant-specific copy (not-found / unauthorized / invalid id) | Project fetch failure |
| F-160 | `#editor` | Canvas error boundary | [project/[id]/_components/canvas-error-boundary.tsx](apps/web/client/src/app/project/[id]/_components/canvas-error-boundary.tsx) | Crash recovery wrapper for canvas | Frame crash isolation |

---

## 7. Editor Canvas & Preview

| ID | Tags | Feature | Path | Sub-features | Used when |
|---|---|---|---|---|---|
| F-170 | `#editor` | Canvas viewport | [project/[id]/_components/canvas/index.tsx](apps/web/client/src/app/project/[id]/_components/canvas/index.tsx) | Pan, zoom, hotkeys mount, recenter | Editable workspace root |
| F-171 | `#editor` | Frames list | [project/[id]/_components/canvas/frames.tsx](apps/web/client/src/app/project/[id]/_components/canvas/frames.tsx) | Multi-frame layout | Multi-viewport rendering |
| F-172 | `#editor` | Frame view | [project/[id]/_components/canvas/frame/view.tsx](apps/web/client/src/app/project/[id]/_components/canvas/frame/view.tsx) | Iframe embed, sandbox preview, gesture, resize, reload | Single preview frame |
| F-173 | `#editor` `#integration` | Frame connection | [project/[id]/_components/canvas/frame/frame-connection.ts](apps/web/client/src/app/project/[id]/_components/canvas/frame/frame-connection.ts) | Penpal handshake, preload-script, event routing | Iframe ↔ editor RPC |
| F-174 | `#editor` `#integration` `#deprecated` | CSB preview adapter | [project/[id]/_components/canvas/frame/codesandbox-preview.ts](apps/web/client/src/app/project/[id]/_components/canvas/frame/codesandbox-preview.ts) | Provider-aware preview URL (CSB legacy) | Legacy CSB preview — Vercel Sandbox is current path |
| F-175 | `#editor` | Frame gesture | [project/[id]/_components/canvas/frame/gesture.tsx](apps/web/client/src/app/project/[id]/_components/canvas/frame/gesture.tsx) | Drag, resize, pan capture | Touch/mouse |
| F-176 | `#editor` | Resize handles | [project/[id]/_components/canvas/frame/resize-handles.tsx](apps/web/client/src/app/project/[id]/_components/canvas/frame/resize-handles.tsx) | 8-way resize, breakpoint snap | Manual frame resize |
| F-177 | `#editor` | Canvas overlay | [project/[id]/_components/canvas/overlay/](apps/web/client/src/app/project/[id]/_components/canvas/overlay/) | comment-pins, drag-select, elements highlight, pan cursor, remote-cursors | Selection + collab overlays |
| F-178 | `#editor` | Recenter canvas button | [project/[id]/_components/canvas/recenter-canvas-button.tsx](apps/web/client/src/app/project/[id]/_components/canvas/recenter-canvas-button.tsx) | Reset viewport center | UX helper |
| F-179 | `#editor` | Rulers | [project/[id]/_components/canvas/rulers.tsx](apps/web/client/src/app/project/[id]/_components/canvas/rulers.tsx), [rulers-tick-step.ts](apps/web/client/src/app/project/[id]/_components/canvas/rulers-tick-step.ts) | Top + side rulers, tick scale | Visual ruler grid |
| F-180 | `#editor` | Selection utils | [project/[id]/_components/canvas/selection-utils.ts](apps/web/client/src/app/project/[id]/_components/canvas/selection-utils.ts) | Math helpers for selection box | Selection math |
| F-181 | `#editor` | Hotkeys | [project/[id]/_components/canvas/hotkeys/](apps/web/client/src/app/project/[id]/_components/canvas/hotkeys/) | Keyboard shortcut manager | Canvas hotkey scope |
| F-182 | `#editor` | Preview floating overlay | [project/[id]/_components/preview-overlay.tsx](apps/web/client/src/app/project/[id]/_components/preview-overlay.tsx) | Resizable preview window, theme toggle, error → chat | Detached preview |

---

## 8. Editor Top Bar

| ID | Tags | Feature | Path | Sub-features | Used when |
|---|---|---|---|---|---|
| F-200 | `#editor` | Top bar shell | [project/[id]/_components/top-bar/index.tsx](apps/web/client/src/app/project/[id]/_components/top-bar/index.tsx) | Layout container | Editor header |
| F-201 | `#editor` | Project breadcrumb | [project/[id]/_components/top-bar/project-breadcrumb.tsx](apps/web/client/src/app/project/[id]/_components/top-bar/project-breadcrumb.tsx) | Click-to-edit name | Project identity |
| F-202 | `#editor` | Branch chip | [project/[id]/_components/top-bar/branch.tsx](apps/web/client/src/app/project/[id]/_components/top-bar/branch.tsx) | Current branch + selector | Branch switch |
| F-203 | `#editor` | Connection chip | [project/[id]/_components/top-bar/connection-chip.tsx](apps/web/client/src/app/project/[id]/_components/top-bar/connection-chip.tsx) | Online/offline badge, reconnect | Sync status |
| F-204 | `#editor` | Mode toggle | [project/[id]/_components/top-bar/mode-toggle.tsx](apps/web/client/src/app/project/[id]/_components/top-bar/mode-toggle.tsx) | Design / Code / Preview tabs | Editor-mode switch |
| F-205 | `#editor` | Git actions | [project/[id]/_components/top-bar/git-actions.tsx](apps/web/client/src/app/project/[id]/_components/top-bar/git-actions.tsx) | Commit / push / pull / branch switch | Git ops |
| F-206 | `#editor` | New project menu | [project/[id]/_components/top-bar/new-project-menu.tsx](apps/web/client/src/app/project/[id]/_components/top-bar/new-project-menu.tsx) | Blank / template / import | Quick project launch |
| F-207 | `#editor` | Recent projects | [project/[id]/_components/top-bar/recent-projects.tsx](apps/web/client/src/app/project/[id]/_components/top-bar/recent-projects.tsx) | Recently accessed list | Quick switch |
| F-208 | `#editor` | Diff viewer | [project/[id]/_components/top-bar/diff/](apps/web/client/src/app/project/[id]/_components/top-bar/diff/) | Compare branches / pending changes | Pre-publish diff review |
| F-209 | `#editor` | Publish trigger | [project/[id]/_components/top-bar/publish/](apps/web/client/src/app/project/[id]/_components/top-bar/publish/) | trigger-button, dropdown, deploy-history-dialog, hosting-integrations-dialog, loading | Deploy + history + provider connect |

---

## 9. Editor Left Panel — Design

| ID | Tags | Feature | Path | Sub-features | Used when |
|---|---|---|---|---|---|
| F-220 | `#editor` | Left panel router | [project/[id]/_components/left-panel/index.tsx](apps/web/client/src/app/project/[id]/_components/left-panel/index.tsx) | Design vs Code panel switch | Mode-aware sidebar |
| F-221 | `#editor` | Design panel shell | [project/[id]/_components/left-panel/design-panel/index.tsx](apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/index.tsx) | Tab router for design tabs | Sidebar tab host |
| F-222 | `#editor` | Layers tab | [project/[id]/_components/left-panel/design-panel/layers-tab/](apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/layers-tab/) | Tree, drag-reorder, visibility toggle, lock/unlock | DOM tree explorer |
| F-223 | `#editor` | Components tab | [project/[id]/_components/left-panel/design-panel/components-tab/](apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/components-tab/) | Search, insert reusable components | Project component library |
| F-224 | `#editor` | Insert tab | [project/[id]/_components/left-panel/design-panel/insert-tab/](apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/insert-tab/) | Div / text / image / etc. | Element palette |
| F-225 | `#editor` | Asset tab | [project/[id]/_components/left-panel/design-panel/asset-tab/](apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/asset-tab/) | asset-grid, asset-sidebar, dropzone, folder browser, bulk actions, search, sort | Image / icon / file assets |
| F-226 | `#editor` | Brand tab | [project/[id]/_components/left-panel/design-panel/brand-tab/](apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/brand-tab/) | color-panel, font-panel, text-styles, color-styles, variables, token editors | Design tokens |
| F-227 | `#editor` | Pages tab | [project/[id]/_components/left-panel/design-panel/page-tab/](apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/page-tab/) | List, create, delete, rename pages | Multi-page mgmt |
| F-228 | `#editor` | Windows tab | [project/[id]/_components/left-panel/design-panel/windows-tab/](apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/windows-tab/) | Active dialogs/sidebars/modals list | Off-canvas jump |
| F-229 | `#editor` | Branches tab | [project/[id]/_components/left-panel/design-panel/branches-tab/](apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/branches-tab/) | Branch list + actions | Branch panel |
| F-230 | `#editor` | Search tab | [project/[id]/_components/left-panel/design-panel/search-tab/](apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/search-tab/) | Search across layers/assets | Find within project |
| F-231 | `#editor` | Help button | [project/[id]/_components/left-panel/design-panel/help-button/](apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/help-button/) | Inline help, docs links | Contextual help |
| F-232 | `#editor` | Zoom controls | [project/[id]/_components/left-panel/design-panel/zoom-controls/](apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/zoom-controls/) | Zoom presets, fit | Canvas zoom |

---

## 10. Editor Left Panel — Code

| ID | Tags | Feature | Path | Sub-features | Used when |
|---|---|---|---|---|---|
| F-250 | `#editor` | Code panel | [project/[id]/_components/left-panel/code-panel/](apps/web/client/src/app/project/[id]/_components/left-panel/code-panel/) | File tree, Monaco editor, lint, outline | Code workspace (Code mode) |

---

## 11. Editor Right Panel — Style

| ID | Tags | Feature | Path | Sub-features | Used when |
|---|---|---|---|---|---|
| F-260 | `#editor` | Right panel shell | [project/[id]/_components/right-panel/index.tsx](apps/web/client/src/app/project/[id]/_components/right-panel/index.tsx) | Tab switcher (Style / Interactions / Chat / Comments), resize, persist | Sidebar router |
| F-261 | `#editor` `#deprecated` | Style tab v1 | [project/[id]/_components/right-panel/style-tab/](apps/web/client/src/app/project/[id]/_components/right-panel/style-tab/) | Layout / background / border / shadow / typography / opacity / states | Legacy property panel |
| F-262 | `#editor` `#deprecated` | Style tab v2 | [project/[id]/_components/right-panel/style-tab-v2/](apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v2/) | Refactored controls | Older property panel |
| F-263 | `#editor` `#deprecated` | Style tab v3 | [project/[id]/_components/right-panel/style-tab-v3/](apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v3/) | Property exploration variant | v3 experiment |
| F-264 | `#editor` | Style tab v4 (current) | [project/[id]/_components/right-panel/style-tab-v4/](apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v4/) | controls/, sections/, specs/ — granular nested controls | Current property panel |

---

## 12. Editor Right Panel — Chat (AI)

| ID | Tags | Feature | Path | Sub-features | Used when |
|---|---|---|---|---|---|
| F-280 | `#editor` `#ai` | Chat tab shell | [project/[id]/_components/right-panel/chat-tab/index.tsx](apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/index.tsx) | Tab root | Chat surface mount |
| F-281 | `#editor` `#ai` | Chat tab content | [project/[id]/_components/right-panel/chat-tab/chat-tab-content/](apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-tab-content/) | Layout: input + messages + history | Tab body composition |
| F-282 | `#editor` `#ai` | Chat input | [project/[id]/_components/right-panel/chat-tab/chat-input/](apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-input/) | TipTap composer, mentions, slash commands, attachments | User input |
| F-283 | `#editor` `#ai` | Chat messages | [project/[id]/_components/right-panel/chat-tab/chat-messages/](apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-messages/) | Streaming, markdown, tool calls, code-diff render | Message list |
| F-284 | `#editor` `#ai` | Context pills | [project/[id]/_components/right-panel/chat-tab/context-pills/](apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/context-pills/) | Selected element, file, screenshot, error context | Attach context to message |
| F-285 | `#editor` `#ai` | Code display | [project/[id]/_components/right-panel/chat-tab/code-display/](apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/code-display/) | Diff blocks, accept/reject | Inline code-change UI |
| F-286 | `#editor` `#ai` | Controls | [project/[id]/_components/right-panel/chat-tab/controls.tsx](apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/controls.tsx) | Model picker, send, stop, settings | Chat controls |
| F-287 | `#editor` `#ai` | Suggestions | [project/[id]/_components/right-panel/chat-tab/suggestions.tsx](apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/suggestions.tsx) | Suggested prompts, smart actions | Follow-up suggestions |
| F-288 | `#editor` `#ai` | Chat history | [project/[id]/_components/right-panel/chat-tab/history.tsx](apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/history.tsx) | Conversation list, switch, delete | Multi-conversation mgmt |
| F-289 | `#editor` `#ai` | Chat panel dropdown | [project/[id]/_components/right-panel/chat-tab/panel-dropdown.tsx](apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/panel-dropdown.tsx) | Panel-scope settings dropdown | Panel meta controls |
| F-290 | `#editor` `#ai` | Chat error boundary | [project/[id]/_components/right-panel/chat-tab/error.tsx](apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/error.tsx) | Catches render errors in chat | Chat crash isolation |
| F-291 | `#editor` `#ai` | Shared composer | [src/components/ai-prompt-composer/](apps/web/client/src/components/ai-prompt-composer/) | Reusable TipTap composer | Used across surfaces (editor chat + non-editor inputs) |
| F-292 | `#editor` `#ai` | Element AI menu | [project/[id]/_components/canvas/overlay/elements/buttons/ai-menu.tsx](apps/web/client/src/app/project/[id]/_components/canvas/overlay/elements/buttons/ai-menu.tsx) | Corner AI button on a selected element → popover (tag header, textarea); Send runs an inline `ChatType.EDIT`, Add-to-chat reveals/focuses the chat with the element attached; `openChatPanel` + `waitForChatReady` mount the chat hook before sending | Quick AI edit / attach element from the canvas |

> Architecture: [docs/agent-context/ai-chat-architecture.md](docs/agent-context/ai-chat-architecture.md)

---

## 13. Editor Right Panel — Interactions & Comments

| ID | Tags | Feature | Path | Sub-features | Used when |
|---|---|---|---|---|---|
| F-300 | `#editor` | Interactions tab | [project/[id]/_components/right-panel/interactions-tab/](apps/web/client/src/app/project/[id]/_components/right-panel/interactions-tab/) | Event handlers, state binding, conditional visibility, animations | Behavior editor |
| F-301 | `#editor` | Comments tab | [project/[id]/_components/right-panel/comments-tab/](apps/web/client/src/app/project/[id]/_components/right-panel/comments-tab/) | Inline comment threads list, reply, resolve | Project discussion |

---

## 14. Editor Bar (Inline Toolbar)

| ID | Tags | Feature | Path | Sub-features | Used when |
|---|---|---|---|---|---|
| F-310 | `#editor` | Editor bar shell | [project/[id]/_components/editor-bar/index.tsx](apps/web/client/src/app/project/[id]/_components/editor-bar/index.tsx) | Per-element variant dispatcher | Inline floating toolbar |
| F-311 | `#editor` | Div selected | [project/[id]/_components/editor-bar/div-selected.tsx](apps/web/client/src/app/project/[id]/_components/editor-bar/div-selected.tsx) | Width / height / padding / margin / radius / border / bg / opacity | Generic box quick-edit |
| F-312 | `#editor` | Text selected | [project/[id]/_components/editor-bar/text-selected.tsx](apps/web/client/src/app/project/[id]/_components/editor-bar/text-selected.tsx) | Font / size / weight / color / align / line-height | Text quick-edit |
| F-313 | `#editor` | Image selected | [project/[id]/_components/editor-bar/img-selected.tsx](apps/web/client/src/app/project/[id]/_components/editor-bar/img-selected.tsx) | src / alt / fit / bg | Image quick-edit |
| F-314 | `#editor` | Frame selected | [project/[id]/_components/editor-bar/frame-selected/](apps/web/client/src/app/project/[id]/_components/editor-bar/frame-selected/) | Device preset, theme, rotate, window actions | Frame-level controls |
| F-315 | `#editor` | Dropdowns | [project/[id]/_components/editor-bar/dropdowns/](apps/web/client/src/app/project/[id]/_components/editor-bar/dropdowns/) | border / border-color / radius / opacity / display / width / height / padding / margin / background / color | Granular property pickers |
| F-316 | `#editor` | Text inputs | [project/[id]/_components/editor-bar/text-inputs/](apps/web/client/src/app/project/[id]/_components/editor-bar/text-inputs/) | Font selector, text-align, text-color, advanced-typography | Inline text inputs |
| F-317 | `#editor` | Generic inputs | [project/[id]/_components/editor-bar/inputs/](apps/web/client/src/app/project/[id]/_components/editor-bar/inputs/) | Numeric / unit / segment inputs | Editor-bar primitives |
| F-318 | `#editor` | Bar hooks | [project/[id]/_components/editor-bar/hooks/](apps/web/client/src/app/project/[id]/_components/editor-bar/hooks/) | Bar-specific React hooks | Bar utility |
| F-319 | `#editor` | Bar utils | [project/[id]/_components/editor-bar/utils/](apps/web/client/src/app/project/[id]/_components/editor-bar/utils/) | CSS unit conversion, etc. | Bar utility |
| F-320 | `#editor` | Overflow menu | [project/[id]/_components/editor-bar/overflow-menu.tsx](apps/web/client/src/app/project/[id]/_components/editor-bar/overflow-menu.tsx) | Hidden actions in narrow viewport | Responsive bar |
| F-321 | `#editor` | Hover tooltip | [project/[id]/_components/editor-bar/hover-tooltip.tsx](apps/web/client/src/app/project/[id]/_components/editor-bar/hover-tooltip.tsx) | Tooltip primitive | Per-control hover help |
| F-322 | `#editor` | Toolbar button | [project/[id]/_components/editor-bar/toolbar-button.tsx](apps/web/client/src/app/project/[id]/_components/editor-bar/toolbar-button.tsx) | Bar-styled button | Bar primitive |
| F-323 | `#editor` | Separator | [project/[id]/_components/editor-bar/separator.tsx](apps/web/client/src/app/project/[id]/_components/editor-bar/separator.tsx) | Visual divider | Bar primitive |

---

## 15. Editor Bottom Bar

| ID | Tags | Feature | Path | Sub-features | Used when |
|---|---|---|---|---|---|
| F-330 | `#editor` | Bottom bar shell | [project/[id]/_components/bottom-bar/index.tsx](apps/web/client/src/app/project/[id]/_components/bottom-bar/index.tsx) | Layout, mode + zoom + terminal toggles | Bottom toolbar |
| F-331 | `#editor` | Terminal area | [project/[id]/_components/bottom-bar/terminal-area.tsx](apps/web/client/src/app/project/[id]/_components/bottom-bar/terminal-area.tsx) | Session aggregation across branches, toggle (toolbar stays visible, panel below), new/close/drag-reorder tabs, cycle hotkeys | Dev terminal panel |
| F-331a | `#editor` | Terminal panel | [project/[id]/_components/bottom-bar/terminal-panel.tsx](apps/web/client/src/app/project/[id]/_components/bottom-bar/terminal-panel.tsx) | Round draggable/closable tab bar, "+" new tab, drag-resize height (persisted), xterm bodies | Expanded terminal window |
| F-331b | `#editor` `#ai` | Terminal input | [project/[id]/_components/bottom-bar/terminal-input.tsx](apps/web/client/src/app/project/[id]/_components/bottom-bar/terminal-input.tsx) | Command input → PTY, AI toggle (NL→command via F-480), preview/auto-run setting (localStorage) | Type / ask-AI command row |
| F-332 | `#editor` | Terminal | [project/[id]/_components/bottom-bar/terminal.tsx](apps/web/client/src/app/project/[id]/_components/bottom-bar/terminal.tsx) | xterm-style I/O renderer | Shell view |
| F-333 | `#editor` | Errors console | [project/[id]/_components/bottom-bar/errors-console.tsx](apps/web/client/src/app/project/[id]/_components/bottom-bar/errors-console.tsx) | Error list, stack traces, quick-fix → chat | Runtime errors |
| F-334 | `#editor` | Preview theme toggle | [project/[id]/_components/bottom-bar/preview-theme-toggle.tsx](apps/web/client/src/app/project/[id]/_components/bottom-bar/preview-theme-toggle.tsx) | Toggle preview light/dark | Preview theme |
| F-335 | `#editor` | Restart sandbox button | [project/[id]/_components/bottom-bar/restart-sandbox-button.tsx](apps/web/client/src/app/project/[id]/_components/bottom-bar/restart-sandbox-button.tsx) | Re-init sandbox | Recover sandbox |

---

## 16. Editor Context Menus, Palettes, Search

| ID | Tags | Feature | Path | Sub-features | Used when |
|---|---|---|---|---|---|
| F-340 | `#editor` | Right-click menu | [project/[id]/_components/right-click-menu/](apps/web/client/src/app/project/[id]/_components/right-click-menu/) | Copy / paste / duplicate / delete / arrange / group / convert-to-component | Element context actions |
| F-783 | `#editor` `#integration` | Copy to Figma | [copy/figma.ts](apps/web/client/src/components/store/editor/copy/figma.ts) + [getFigmaSceneData preload](apps/web/preload/script/api/elements/dom/figma-scene.ts) + [@weblab/figma-clipboard](packages/figma-clipboard) | Copies the selected element or frame to the OS clipboard in Figma's native scene format (Kiwi buffer) → paste into Figma as editable frames/text/shapes, no plugin. Surfaced 4 ways: right-click element (via F-340), right-click frame (WINDOW_ITEMS), Figma button in the frame toolbar (F-314 `window-actions-group.tsx`), and the element overlay (`overlay/elements/buttons/figma.tsx`). Scene serialized in-iframe by the `getFigmaSceneData` bridge; encoded by `@weblab/figma-clipboard` (F-784) | Move a rendered element/frame into Figma to iterate visually |
| F-341 | `#editor` | Element palette | [project/[id]/_components/element-palette/](apps/web/client/src/app/project/[id]/_components/element-palette/) | Categories, recently used | Quick insert |
| F-342 | `#editor` | Command palette | [project/[id]/_components/command-palette/](apps/web/client/src/app/project/[id]/_components/command-palette/) | Global Cmd-K search | Keyboard nav |
| F-343 | `#editor` | File finder | [project/[id]/_components/file-finder/](apps/web/client/src/app/project/[id]/_components/file-finder/) | Search files/components/pages | Quick file open |
| F-344 | `#editor` | Project search | [project/[id]/_components/project-search/](apps/web/client/src/app/project/[id]/_components/project-search/) | Search inside project content | Full-project search |

---

## 17. Editor Members, Branches, Versioning

| ID | Tags | Feature | Path | Sub-features | Used when |
|---|---|---|---|---|---|
| F-360 | `#editor` | Members panel | [project/[id]/_components/members/](apps/web/client/src/app/project/[id]/_components/members/) | member-row, invite-member-input, members-content, invitation-row, suggested-teammates | Manage project team |
| F-361 | `#editor` | Branch UI | [project/[id]/_components/branch/](apps/web/client/src/app/project/[id]/_components/branch/) | branch-controls, branch-list | Switch / fork branch |

---

## 18. Editor CMS Workspace

| ID | Tags | Feature | Path | Sub-features | Used when |
|---|---|---|---|---|---|
| F-380 | `#editor` `#cms` | CMS shell | [project/[id]/_components/cms-workspace/index.tsx](apps/web/client/src/app/project/[id]/_components/cms-workspace/index.tsx) | Tab router | CMS workspace root |
| F-381 | `#editor` `#cms` | Collections tab | [project/[id]/_components/cms-workspace/collections-tab.tsx](apps/web/client/src/app/project/[id]/_components/cms-workspace/collections-tab.tsx) | List collections | Content list |
| F-382 | `#editor` `#cms` | Sources tab | [project/[id]/_components/cms-workspace/sources-tab.tsx](apps/web/client/src/app/project/[id]/_components/cms-workspace/sources-tab.tsx) | Connect external sources | Source mgmt |
| F-383 | `#editor` `#cms` | Fields tab | [project/[id]/_components/cms-workspace/fields-tab.tsx](apps/web/client/src/app/project/[id]/_components/cms-workspace/fields-tab.tsx) | Schema fields editor | Schema editor |
| F-384 | `#editor` `#cms` | Items table | [project/[id]/_components/cms-workspace/items-table.tsx](apps/web/client/src/app/project/[id]/_components/cms-workspace/items-table.tsx) | List + edit + pagination | Data grid |
| F-385 | `#editor` `#cms` | Item editor | [project/[id]/_components/cms-workspace/item-editor.tsx](apps/web/client/src/app/project/[id]/_components/cms-workspace/item-editor.tsx) | Per-item form | Edit single item |
| F-386 | `#editor` `#cms` | Bind dialog | [project/[id]/_components/cms-workspace/bind-dialog.tsx](apps/web/client/src/app/project/[id]/_components/cms-workspace/bind-dialog.tsx) | Field → DOM binding | Data-binding UX |
| F-387 | `#editor` `#cms` | Routing dialog | [project/[id]/_components/cms-workspace/routing-dialog.tsx](apps/web/client/src/app/project/[id]/_components/cms-workspace/routing-dialog.tsx) | Dynamic per-item routes | URL routing |
| F-388 | `#editor` `#cms` | Map collections | [project/[id]/_components/cms-workspace/map-collections-dialog.tsx](apps/web/client/src/app/project/[id]/_components/cms-workspace/map-collections-dialog.tsx) | External ↔ internal mapping | Schema mapping |
| F-389 | `#editor` `#cms` | Connect source | [project/[id]/_components/cms-workspace/connect-source-dialog.tsx](apps/web/client/src/app/project/[id]/_components/cms-workspace/connect-source-dialog.tsx) | Connect external CMS/DB | New source flow |
| F-390 | `#editor` `#cms` | Create collection | [project/[id]/_components/cms-workspace/create-collection-dialog.tsx](apps/web/client/src/app/project/[id]/_components/cms-workspace/create-collection-dialog.tsx) | New collection wizard | Schema scaffold |
| F-391 | `#editor` `#cms` | Edit source | [project/[id]/_components/cms-workspace/edit-source-dialog.tsx](apps/web/client/src/app/project/[id]/_components/cms-workspace/edit-source-dialog.tsx) | Update existing source | Source edit |
| F-392 | `#editor` `#cms` | Data pusher | [project/[id]/_components/cms-workspace/data-pusher.tsx](apps/web/client/src/app/project/[id]/_components/cms-workspace/data-pusher.tsx) | Push bound data → preview | Render binding |

> Architecture: [docs/agent-context/cms-architecture.md](docs/agent-context/cms-architecture.md)

---

## 19. Editor Modals, Errors, Mobile, Offline

See F-151 to F-160. Plus:

| ID | Tags | Feature | Path | Sub-features | Used when |
|---|---|---|---|---|---|
| F-400 | `#editor` `#modal` | Subscription modal | (lazy import in F-150) | Plan upsell w/ Stripe | Out-of-quota / upgrade CTA |
| F-401 | `#editor` `#modal` | Settings modal (project) | See section 20 (F-420+) | Multi-tab in-editor settings | "Project Settings" entry |
| F-402 | `#editor` `#modal` | Settings modal (non-project) | [src/components/ui/settings-modal/non-project.tsx](apps/web/client/src/components/ui/settings-modal/non-project.tsx) | Same shell, no project ctx | User-level settings in marketing pages |

---

## 20. Settings Modal (in-editor + non-project)

> Located in [src/components/ui/settings-modal/](apps/web/client/src/components/ui/settings-modal/). Two shells: `with-project.tsx` (in-editor) and `non-project.tsx` (marketing).

| ID | Tags | Tab | Path | Sub-features | Used when |
|---|---|---|---|---|---|
| F-420 | `#modal` | Settings shell — with-project | [settings-modal/with-project.tsx](apps/web/client/src/components/ui/settings-modal/with-project.tsx) | Tab sidebar + body, project-aware | In-editor settings |
| F-421 | `#modal` | Settings shell — non-project | [settings-modal/non-project.tsx](apps/web/client/src/components/ui/settings-modal/non-project.tsx) | User-only tabs | Marketing surface |
| F-422 | `#modal` | Account tab | [settings-modal/account-tab.tsx](apps/web/client/src/components/ui/settings-modal/account-tab.tsx) | Name, email, profile, delete account section (F-435) | Personal info |
| F-423 | `#modal` `#ai` | AI tab | [settings-modal/ai-tab.tsx](apps/web/client/src/components/ui/settings-modal/ai-tab.tsx) | Model picker, provider keys, defaults | AI config |
| F-424 | `#modal` | Appearance tab | [settings-modal/appearance-tab.tsx](apps/web/client/src/components/ui/settings-modal/appearance-tab.tsx) | Theme, density | Visual prefs |
| F-425 | `#modal` `#editor` | Editor tab | [settings-modal/editor-tab.tsx](apps/web/client/src/components/ui/settings-modal/editor-tab.tsx) | Editor behaviors (autosave, snap, lint) | Editor prefs |
| F-426 | `#modal` `#integration` | Git tab | [settings-modal/git-tab.tsx](apps/web/client/src/components/ui/settings-modal/git-tab.tsx) | Local git config | Git prefs |
| F-427 | `#modal` `#integration` | GitHub tab | [settings-modal/github-tab.tsx](apps/web/client/src/components/ui/settings-modal/github-tab.tsx) | GitHub OAuth, repo link | GitHub integration |
| F-428 | `#modal` `#i18n` | Language tab | [settings-modal/language-tab.tsx](apps/web/client/src/components/ui/settings-modal/language-tab.tsx) | Locale picker | Localization prefs |
| F-429 | `#modal` | Preferences tab | [settings-modal/preferences-tab.tsx](apps/web/client/src/components/ui/settings-modal/preferences-tab.tsx) | Misc UX prefs | General prefs |
| F-430 | `#modal` | Shortcuts tab | [settings-modal/shortcuts-tab.tsx](apps/web/client/src/components/ui/settings-modal/shortcuts-tab.tsx) | Hotkey reference + rebind | Keyboard config |
| F-431 | `#modal` `#billing` | Subscription tab | [settings-modal/subscription-tab.tsx](apps/web/client/src/components/ui/settings-modal/subscription-tab.tsx) | Plan, seats, portal link | Billing surface |
| F-432 | `#modal` `#billing` | Subscription cancel modal | [settings-modal/subscription-cancel-modal.tsx](apps/web/client/src/components/ui/settings-modal/subscription-cancel-modal.tsx) | Cancellation reasons, confirm | Cancel flow |
| F-433 | `#modal` | Skills tab | [settings-modal/skills-tab/](apps/web/client/src/components/ui/settings-modal/skills-tab/) | AI skill registry config (Convex `skills`) | AI skills mgmt |
| F-434 | `#modal` | Versions panel | [settings-modal/versions/](apps/web/client/src/components/ui/settings-modal/versions/) | Snapshots / history; empty-state when none | Project versions |
| F-435 | `#modal` | User delete section | [settings-modal/user-delete-section.tsx](apps/web/client/src/components/ui/settings-modal/user-delete-section.tsx) | Destructive confirmation | Account deletion |
| F-436 | `#modal` `#editor` | Project (General) settings (in modal) | [settings-modal/project/](apps/web/client/src/components/ui/settings-modal/project/) | Overview (Site ID + copy, Pages, Last published/updated, Created); project name; **folder dropdown** (localforage-shared with the dashboard via `moveProjectIdsToFolder` + `CreateFolderDialog`); commands; offline; danger zone | Project/General settings tab |
| F-437 | `#modal` `#editor` | Site settings | [settings-modal/site/](apps/web/client/src/components/ui/settings-modal/site/) | Site-level meta, OG, favicon with **separate dark-mode favicon** (writes `metadata.icons.icon` as a `[{url,media}]` light/dark array) | Public site config |
| F-438 | `#modal` `#integration` | Domain settings | [settings-modal/domain/](apps/web/client/src/components/ui/settings-modal/domain/) | Editable free Weblab subdomain (`preview.tsx` → `domains.setPreviewSlug`/`previewSlugGet`); custom-domain list + verify (`custom/`); neutral Pro upsell card | Domain attach + claim Weblab subdomain |
| F-780 | `#modal` `#integration` | Site Access tab | [settings-modal/site-access-tab.tsx](apps/web/client/src/components/ui/settings-modal/site-access-tab.tsx) | Member list + inline role (manager/editor/reviewer/viewer), remove/leave, invite-by-email, revoke pending — over `projectMembers` + `projectInvitations` | Manage who can access the site |
| F-781 | `#modal` `#integration` | SEO tab | [settings-modal/seo-tab.tsx](apps/web/client/src/components/ui/settings-modal/seo-tab.tsx) | File-backed editors written to project `public/` via `activeSandbox.writeFile`: robots.txt (+ AI-bot/crawler quick-inserts), llms.txt, custom sitemap.xml | Crawlers + machine-readable site files |
| F-439 | `#modal` | Helpers | [settings-modal/helpers.tsx](apps/web/client/src/components/ui/settings-modal/helpers.tsx) | Shared form helpers; `SettingsTabValue` enum | Internal |

---

## 21. Pricing Modal, Avatar Dropdown, In-app UI

| ID | Tags | Component | Path | Sub-features | Used when |
|---|---|---|---|---|---|
| F-450 | `#billing` `#modal` | Pricing modal | [src/components/ui/pricing-modal/](apps/web/client/src/components/ui/pricing-modal/) | Tier cards, Stripe-checkout buttons | Out-of-quota upsell, "Upgrade" CTAs |
| F-451 | `#billing` | Pricing table | [src/components/ui/pricing-table/](apps/web/client/src/components/ui/pricing-table/) | Shared between `/pricing` + modal | Plan rendering |
| F-452 | `#auth-gated` | Avatar dropdown | [src/components/ui/avatar-dropdown/](apps/web/client/src/components/ui/avatar-dropdown/) | Profile, settings, theme, sign-out | Header user menu |
| F-453 | `#editor` `#ai` | Telemetry provider | [src/components/telemetry-provider.tsx](apps/web/client/src/components/telemetry-provider.tsx) | PostHog events + Gleap feedback widget | Analytics + feedback |

---

## 22. REST API Routes (Next.js)

> Route handlers under [src/app/api/](apps/web/client/src/app/api/). Methods derived from exported HTTP-method functions.

| ID | Tags | Path | File | Methods | Auth | External calls | Purpose |
|---|---|---|---|---|---|---|---|
| F-470 | `#rest` | `/api/health` | [api/health/route.ts](apps/web/client/src/app/api/health/route.ts) | GET | none | none | `{ ok: true }` health check |
| F-471 | `#rest` `#ai` | `/api/chat` | [api/chat/route.ts](apps/web/client/src/app/api/chat/route.ts) | POST | Supabase + Convex `project.view` cap | OpenRouter, Ollama, Convex (`projects.get`, `conversations.getSummary`, `aiUsageEvents.insert`, `messages.replaceConversationMessages`) | Streaming chat w/ multi-model + memory + skill summarization |
| F-472 | `#rest` `#ai` | `/api/chat/summarize` | [api/chat/summarize/route.ts](apps/web/client/src/app/api/chat/summarize/route.ts) | POST | Supabase + Convex `conversations.view` cap | OpenRouter, Convex (`conversations.get`, `conversations.setSummary`) | Background conversation summarization (204) |
| F-473 | `#rest` `#ai` | `/api/chat-images/[id]` | [api/chat-images/[id]/route.ts](apps/web/client/src/app/api/chat-images/[id]/route.ts) | GET | current user (per-user cache) | none | Retrieve AI-generated images from 30-min in-memory cache |
| F-474 | `#rest` `#ai` | `/api/ai/inline-edit` | [api/ai/inline-edit/route.ts](apps/web/client/src/app/api/ai/inline-edit/route.ts) | POST | Supabase + Convex `project.view` cap | OpenRouter, Ollama, Convex (`projects.get`) | Streaming inline code edit, usage metering, refund on failure |
| F-475 | `#rest` `#ai` | `/api/ai/tab-complete` | [api/ai/tab-complete/route.ts](apps/web/client/src/app/api/ai/tab-complete/route.ts) | POST | Supabase + Convex `project.view` cap | OpenRouter, Ollama, Convex (`projects.get`) | Tab-completion suggestions; 429 on rate limit |
| F-476 | `#rest` `#ai` | `/api/transcribe` | [api/transcribe/route.ts](apps/web/client/src/app/api/transcribe/route.ts) | POST | Supabase + per-user rate limit | OpenAI Whisper, OpenRouter fallback | Audio → text (25 MB, 90 s) |
| F-477 | `#rest` | `/api/email-capture` | [api/email-capture/route.ts](apps/web/client/src/app/api/email-capture/route.ts) | POST | none | N8N webhook (optional) | Email + UTM capture for newsletter |
| F-478 | `#rest` `#ai` | `/api/models/local` | [api/models/local/route.ts](apps/web/client/src/app/api/models/local/route.ts) | GET | Supabase user | Ollama `/api/tags` (loopback only) | Local Ollama model listing w/ SSRF guard |
| F-479 | `#rest` `#billing` | `/api/promo-resume` | [api/promo-resume/route.ts](apps/web/client/src/app/api/promo-resume/route.ts) | GET | Clerk | Stripe, Convex `subscriptionActions.startPromoCheckout` | Post-login promo / discount flow |
| F-480 | `#rest` `#ai` | `/api/ai/terminal-command` | [api/ai/terminal-command/route.ts](apps/web/client/src/app/api/ai/terminal-command/route.ts) | POST | Supabase + Convex `project.view` cap | OpenRouter, Convex (`projects.get`) | Natural-language → single shell command for the editor terminal's AI mode; usage metered, refund on failure |

---

## 23. Webhooks

> No `/webhook/*` routes are currently checked into [src/app/](apps/web/client/src/app/). Webhook handling moved to Convex (see F-545: `clerkWebhooks.ts`). Stripe webhooks are handled inside Convex actions (`subscriptionActions.ts`).

| ID | Tags | Surface | Where | Purpose |
|---|---|---|---|---|
| F-490 | `#webhook` `#convex` `#integration` | Clerk webhook | [convex/clerkWebhooks.ts](apps/web/client/convex/clerkWebhooks.ts) | User lifecycle sync (Convex `users` table) |
| F-491 | `#webhook` `#convex` `#billing` | Stripe webhook | [convex/subscriptionActions.ts](apps/web/client/convex/subscriptionActions.ts) | Subscription / invoice lifecycle |
| F-492 | `#webhook` `#convex` `#integration` | GitHub webhook | [convex/githubActions.ts](apps/web/client/convex/githubActions.ts) | Repo events (best-effort) |

---

## 24. tRPC Routers (vestigial)

> Only two tRPC routers remain — in `apps/web/server/`, not `apps/web/client/`. Treat [docs/agent-context/trpc-routers-reference.md](docs/agent-context/trpc-routers-reference.md) as **stale**.

| ID | Tags | Router | Path | Procedures | Purpose |
|---|---|---|---|---|---|
| F-500 | `#trpc` | `sandbox` | [apps/web/server/src/router/routes/sandbox.ts](apps/web/server/src/router/routes/sandbox.ts) | `create`, `start`, `stop`, `status` | Sandbox lifecycle from editor → Fastify server |
| F-501 | `#trpc` | `components` | [apps/web/server/src/router/routes/components.ts](apps/web/server/src/router/routes/components.ts) | `listProjectComponents` | Scan project dir for React components via regex |

---

## 25. Convex Functions

> Backend lives in [apps/web/client/convex/](apps/web/client/convex/). Each `.ts` file exports `query` / `mutation` / `action` / `internal*` functions. Internal functions (prefixed `_`) are not addressable from the client.

| ID | Tags | Module | Path | Notable procedures | Purpose |
|---|---|---|---|---|---|
| F-510 | `#convex` `#ai` | `aiUsageEvents` | [convex/aiUsageEvents.ts](apps/web/client/convex/aiUsageEvents.ts) | `amIAdmin`, `insert`, `listAdmin`, `aggregateAdmin`, `conversationTotals` | AI usage / token accounting |
| F-511 | `#convex` | `branches` | [convex/branches.ts](apps/web/client/convex/branches.ts) | `getByProjectId`, `create`, `update`, `remove` | Branch CRUD |
| F-512 | `#convex` | `branchActions` | [convex/branchActions.ts](apps/web/client/convex/branchActions.ts) | `fork`, `createBlank` | Branch lifecycle actions |
| F-513 | `#convex` `#ai` | `chatActions` | [convex/chatActions.ts](apps/web/client/convex/chatActions.ts) | `generateTitle`, `generateSuggestions` | AI-driven conversation polish |
| F-514 | `#convex` `#cms` | `cmsBindings` | [convex/cmsBindings.ts](apps/web/client/convex/cmsBindings.ts) | `listForProject`, `snapshot`, `upsert`, `remove`, `removeMany` | CMS DOM↔field bindings |
| F-515 | `#convex` `#cms` | `cmsActionsInternal` | [convex/cmsActionsInternal.ts](apps/web/client/convex/cmsActionsInternal.ts) | `_wizardCreateCollection`, `_wizardAttachCollection` | CMS wizard internals |
| F-516 | `#convex` `#cms` | `cmsActions` | [convex/cmsActions.ts](apps/web/client/convex/cmsActions.ts) | `sourceTestConnection`, `sourceTestExisting`, `sourceCreate`, `sourceUpdate`, `sourceListRemoteCollections`, `sourceMapCollections`, `sourceSync` | CMS source connection + sync |
| F-517 | `#convex` `#cms` | `cmsItems` | [convex/cmsItems.ts](apps/web/client/convex/cmsItems.ts) | `list`, `get`, `create`, `update`, `remove`, `_upsertBatch`, `_pruneBatch` | CMS item CRUD + sync |
| F-518 | `#convex` `#cms` | `cmsCollections` | [convex/cmsCollections.ts](apps/web/client/convex/cmsCollections.ts) | `list`, `get`, `create`, `update`, `remove` | CMS collection CRUD |
| F-519 | `#convex` `#cms` | `cmsFields` | [convex/cmsFields.ts](apps/web/client/convex/cmsFields.ts) | `listByCollection`, `create`, `update`, `reorder`, `remove` | CMS schema fields |
| F-520 | `#convex` `#cms` | `cmsCollectionPages` | [convex/cmsCollectionPages.ts](apps/web/client/convex/cmsCollectionPages.ts) | (per file) | CMS collection→page binding |
| F-521 | `#convex` `#cms` | `cmsSources` | [convex/cmsSources.ts](apps/web/client/convex/cmsSources.ts) | (per file) | CMS external-source records |
| F-522 | `#convex` `#ai` | `conversations` | [convex/conversations.ts](apps/web/client/convex/conversations.ts) | `list`, `get`, `upsert`, `update`, `remove`, `_setDisplayName`, `_setSuggestions`, `getSummary`, `setSummary` | Chat conversation entities |
| F-523 | `#convex` `#ai` | `messages` | [convex/messages.ts](apps/web/client/convex/messages.ts) | (per file) | Chat messages incl. `replaceConversationMessages` |
| F-524 | `#convex` | `comments` | [convex/comments.ts](apps/web/client/convex/comments.ts) | `list`, `create`, `update`, `remove`, `resolve`, `unresolve` | Project comments |
| F-525 | `#convex` | `commentReplies` | [convex/commentReplies.ts](apps/web/client/convex/commentReplies.ts) | `create`, `update`, `remove` | Threaded replies |
| F-526 | `#convex` | `crons` | [convex/crons.ts](apps/web/client/convex/crons.ts) | Scheduled jobs | Background scheduling |
| F-527 | `#convex` | `deployments` | [convex/deployments.ts](apps/web/client/convex/deployments.ts) | `getByType` | Deployment records |
| F-528 | `#convex` `#integration` | `domainActions` | [convex/domainActions.ts](apps/web/client/convex/domainActions.ts) | (per file) | Custom-domain operations |
| F-529 | `#convex` `#integration` | `domainActionsDb` | [convex/domainActionsDb.ts](apps/web/client/convex/domainActionsDb.ts) | Internal verification ops | Domain DB helpers |
| F-530 | `#convex` `#integration` | `domains` | [convex/domains.ts](apps/web/client/convex/domains.ts) | (per file) | Custom domains records |
| F-531 | `#convex` `#integration` | `figmaActions` | [convex/figmaActions.ts](apps/web/client/convex/figmaActions.ts) | (per file) | Figma OAuth + import |
| F-532 | `#convex` | `frames` | [convex/frames.ts](apps/web/client/convex/frames.ts) | (per file) | Frame entities w/ breakpoints |
| F-533 | `#convex` `#integration` | `githubActions` | [convex/githubActions.ts](apps/web/client/convex/githubActions.ts) | (per file) | GitHub OAuth + import + webhook |
| F-534 | `#convex` `#integration` | `hostingConnectionActions` | [convex/hostingConnectionActions.ts](apps/web/client/convex/hostingConnectionActions.ts) | (per file) | Hosting provider connect |
| F-535 | `#convex` `#integration` | `hostingConnections` | [convex/hostingConnections.ts](apps/web/client/convex/hostingConnections.ts) | (per file) | Hosting connection records |
| F-536 | `#convex` | `http` | [convex/http.ts](apps/web/client/convex/http.ts) | HTTP router | Webhook entry points |
| F-537 | `#convex` | `pageAccess` | [convex/pageAccess.ts](apps/web/client/convex/pageAccess.ts) | (per file) | Per-page ACL (F-134) |
| F-538 | `#convex` | `ping` | [convex/ping.ts](apps/web/client/convex/ping.ts) | (per file) | Liveness ping |
| F-539 | `#convex` | `presence` | [convex/presence.ts](apps/web/client/convex/presence.ts) | (per file) | Live cursors + collaborator presence |
| F-540 | `#convex` | `projectActions` | [convex/projectActions.ts](apps/web/client/convex/projectActions.ts) | (per file) | Project lifecycle |
| F-541 | `#convex` | `projectCreateRequests` | [convex/projectCreateRequests.ts](apps/web/client/convex/projectCreateRequests.ts) | (per file) | Pending create requests |
| F-542 | `#convex` | `projectInvitationActions` | [convex/projectInvitationActions.ts](apps/web/client/convex/projectInvitationActions.ts) | (per file) | Project invite send + accept |
| F-543 | `#convex` | `projectInvitations` | [convex/projectInvitations.ts](apps/web/client/convex/projectInvitations.ts) | (per file) | Invitation records |
| F-544 | `#convex` | `projectMembers` | [convex/projectMembers.ts](apps/web/client/convex/projectMembers.ts) | (per file) | Membership + roles |
| F-545 | `#convex` `#integration` | `clerkWebhooks` | [convex/clerkWebhooks.ts](apps/web/client/convex/clerkWebhooks.ts) | (per file) | Clerk events → users sync |
| F-546 | `#convex` | `projectOffline` | [convex/projectOffline.ts](apps/web/client/convex/projectOffline.ts) | (per file) | Offline-pin entries |
| F-547 | `#convex` | `projectSettings` | [convex/projectSettings.ts](apps/web/client/convex/projectSettings.ts) | (per file) | Per-project settings |
| F-548 | `#convex` | `projects` | [convex/projects.ts](apps/web/client/convex/projects.ts) | (per file) | Project CRUD + reads |
| F-549 | `#convex` | `publishActions` | [convex/publishActions.ts](apps/web/client/convex/publishActions.ts) | (per file) | Publish to hosting |
| F-550 | `#convex` | `publishActionsDb` | [convex/publishActionsDb.ts](apps/web/client/convex/publishActionsDb.ts) | (per file) | Publish DB helpers |
| F-551 | `#convex` | `skillActions` | [convex/skillActions.ts](apps/web/client/convex/skillActions.ts) | (per file) | AI skill execution |
| F-552 | `#convex` | `skills` | [convex/skills.ts](apps/web/client/convex/skills.ts) | (per file) | AI skill registry |
| F-553 | `#convex` | `storage` | [convex/storage.ts](apps/web/client/convex/storage.ts) | (per file) | Blob storage queries |
| F-554 | `#convex` | `storageActions` | [convex/storageActions.ts](apps/web/client/convex/storageActions.ts) | (per file) | Blob upload + sign |
| F-555 | `#convex` `#billing` | `subscriptionActions` | [convex/subscriptionActions.ts](apps/web/client/convex/subscriptionActions.ts) | `startPromoCheckout`, Stripe webhook handlers, portal | Stripe lifecycle |
| F-556 | `#convex` `#billing` | `subscriptions` | [convex/subscriptions.ts](apps/web/client/convex/subscriptions.ts) | (per file) | Subscription records |
| F-557 | `#convex` `#billing` | `usage` | [convex/usage.ts](apps/web/client/convex/usage.ts) | (per file) | Usage caps + reads |
| F-558 | `#convex` | `userActions` | [convex/userActions.ts](apps/web/client/convex/userActions.ts) | (per file) | User-level actions |
| F-559 | `#convex` | `userActionsInternal` | [convex/userActionsInternal.ts](apps/web/client/convex/userActionsInternal.ts) | (per file) | Internal user helpers |
| F-560 | `#convex` | `users` | [convex/users.ts](apps/web/client/convex/users.ts) | (per file) | User profile reads/writes |
| F-561 | `#convex` | `utils` | [convex/utils.ts](apps/web/client/convex/utils.ts) | (per file) | Shared helpers |
| F-562 | `#convex` | `workspaces` | [convex/workspaces.ts](apps/web/client/convex/workspaces.ts) | (per file) | Workspace CRUD |
| F-563 | `#convex` | `internal/` | [convex/internal/](apps/web/client/convex/internal/) | Various | Internal-only modules |
| F-564 | `#convex` | `lib/` | [convex/lib/](apps/web/client/convex/lib/) | Various | Shared backend helpers |
| F-565 | `#convex` | `auth.config.ts` | [convex/auth.config.ts](apps/web/client/convex/auth.config.ts) | Wires Convex identity verification to Clerk's `convex` JWT template via `CLERK_JWT_ISSUER_DOMAIN` (set on Convex deployment, not `.env.local`); fails loud if missing | Clerk → Convex auth config |

---

## 26. Convex Schema Tables

> Source of truth: [convex/schema.ts](apps/web/client/convex/schema.ts). 45 tables.

| ID | Tag | Table | Purpose |
|---|---|---|---|
| F-580 | `#convex` | `users` | User profiles |
| F-581 | `#convex` | `userSettings` | Per-user prefs |
| F-582 | `#convex` `#integration` | `providerConnections` | OAuth provider tokens |
| F-583 | `#convex` `#editor` | `userCanvases` | Default zoom/pan/viewport |
| F-584 | `#convex` | `workspaces` | Workspace records |
| F-585 | `#convex` | `workspaceMembers` | Workspace membership |
| F-586 | `#convex` | `workspaceInvitations` | Workspace invites |
| F-587 | `#convex` | `projectMembers` | Project membership |
| F-588 | `#convex` `#admin` | `auditLog` | Audit trail |
| F-589 | `#convex` | `projects` | Project records |
| F-590 | `#convex` | `branches` | Branch records |
| F-591 | `#convex` | `projectSettings` | Per-project settings |
| F-592 | `#convex` | `projectInvitations` | Project invites |
| F-593 | `#convex` | `projectOfflinePins` | Offline-mode pins |
| F-594 | `#convex` | `pageAccess` | Per-page ACL |
| F-595 | `#convex` | `projectCreateRequests` | Pending create requests |
| F-596 | `#convex` `#editor` | `canvases` | Canvas records |
| F-597 | `#convex` `#editor` | `frames` | Frame records (w/ breakpoints) |
| F-598 | `#convex` `#editor` | `layoutGuideStyles` | Layout guides |
| F-599 | `#convex` `#ai` | `conversations` | Chat conversations |
| F-600 | `#convex` `#ai` | `messages` | Chat messages |
| F-601 | `#convex` `#cms` | `cmsSources` | External CMS sources |
| F-602 | `#convex` `#cms` | `cmsCollections` | CMS collections |
| F-603 | `#convex` `#cms` | `cmsFields` | CMS schema fields |
| F-604 | `#convex` `#cms` | `cmsItems` | CMS items |
| F-605 | `#convex` `#cms` | `cmsCollectionPages` | Page ↔ collection binding |
| F-606 | `#convex` `#cms` | `cmsBindings` | DOM ↔ field bindings |
| F-607 | `#convex` | `projectComments` | Project comments |
| F-608 | `#convex` | `commentReplies` | Comment thread replies |
| F-609 | `#convex` `#integration` | `customDomains` | Custom domains |
| F-610 | `#convex` `#integration` | `projectCustomDomains` | Project ↔ domain link |
| F-611 | `#convex` `#integration` | `customDomainVerification` | DNS verification state |
| F-612 | `#convex` `#integration` | `previewDomains` | Preview/staging domains |
| F-613 | `#convex` | `deployments` | Deployment records |
| F-614 | `#convex` `#integration` | `hostingProviderConnections` | Hosting connections |
| F-615 | `#convex` | `feedbacks` | User feedback (Gleap) |
| F-616 | `#convex` `#ai` | `skills` | AI skill registry |
| F-617 | `#convex` `#billing` | `products` | Stripe products |
| F-618 | `#convex` `#billing` | `prices` | Stripe prices |
| F-619 | `#convex` `#billing` | `subscriptions` | Stripe subscriptions |
| F-620 | `#convex` `#billing` | `rateLimits` | Per-user rate limits |
| F-621 | `#convex` `#billing` | `usageRecords` | Usage accounting |
| F-622 | `#convex` `#billing` `#deprecated` | `legacySubscriptions` | Legacy sub records |
| F-623 | `#convex` `#editor` | `cursors` | Live cursor positions |
| F-624 | `#convex` `#ai` | `aiUsageEvents` | Token usage events |

---

## 27. Editor Store Managers (MobX)

> All managers in [src/components/store/](apps/web/client/src/components/store/) — use `makeAutoObservable`. Branch-scoped managers (history, sandbox, error) instantiate per branch.

| ID | Tag | Manager | Path | Role |
|---|---|---|---|---|
| F-630 | `#store` | Engine root | [store/editor/engine.ts](apps/web/client/src/components/store/editor/engine.ts) | Top-level editor engine — composes all managers |
| F-631 | `#store` | `CreateManager` | [store/create/manager.ts](apps/web/client/src/components/store/create/manager.ts) | F-135 |
| F-632 | `#store` | `StateManager` | [store/state/manager.ts](apps/web/client/src/components/store/state/manager.ts) | Global state orchestration + persistence |
| F-633 | `#store` | `ActionManager` | [store/editor/action/](apps/web/client/src/components/store/editor/action/) | Dispatch run/undo/redo |
| F-634 | `#store` | `HistoryManager` | [store/editor/history/](apps/web/client/src/components/store/editor/history/) | Stack, transactions, hydrate |
| F-635 | `#store` | `AstManager` | [store/editor/ast/](apps/web/client/src/components/store/editor/ast/) | AST parse + cache |
| F-636 | `#store` | `LayersManager` | [store/editor/ast/layers.ts](apps/web/client/src/components/store/editor/ast/layers.ts) | DOM hierarchy |
| F-637 | `#store` | `CodeManager` | [store/editor/code/](apps/web/client/src/components/store/editor/code/) | File writes + diff requests |
| F-638 | `#store` | `StyleManager` | [store/editor/style/](apps/web/client/src/components/store/editor/style/) | CSS property updates |
| F-639 | `#store` | `TokensManager` | [store/editor/tokens/](apps/web/client/src/components/store/editor/tokens/) | Design tokens scaffolding |
| F-640 | `#store` | `ThemeManager` | [store/editor/theme/](apps/web/client/src/components/store/editor/theme/) | Tailwind color theme |
| F-641 | `#store` `#editor` | `CanvasManager` | [store/editor/canvas/](apps/web/client/src/components/store/editor/canvas/) | Viewport + zoom |
| F-642 | `#store` `#editor` | `FramesManager` | [store/editor/frames/](apps/web/client/src/components/store/editor/frames/) | Frame lifecycle + breakpoints |
| F-643 | `#store` `#editor` | `FrameEventManager` | [store/editor/frame-events/](apps/web/client/src/components/store/editor/frame-events/) | Iframe message routing |
| F-644 | `#store` `#editor` | `OverlayManager` | [store/editor/overlay/](apps/web/client/src/components/store/editor/overlay/) | Selection/hover overlays |
| F-645 | `#store` `#editor` | `SnapManager` | [store/editor/snap/](apps/web/client/src/components/store/editor/snap/) | Grid snap + alignment |
| F-646 | `#store` `#editor` | `BreakpointsManager` | [store/editor/breakpoints/](apps/web/client/src/components/store/editor/breakpoints/) | Responsive breakpoints |
| F-647 | `#store` `#editor` | `ScreenshotManager` | [store/editor/screenshot/](apps/web/client/src/components/store/editor/screenshot/) | Frame screenshot capture |
| F-648 | `#store` `#editor` | `ElementsManager` | [store/editor/element/](apps/web/client/src/components/store/editor/element/) | Selection + hover state |
| F-649 | `#store` `#editor` | `InsertManager` | [store/editor/insert/](apps/web/client/src/components/store/editor/insert/) | Element insertion |
| F-650 | `#store` `#editor` | `MoveManager` | [store/editor/move/](apps/web/client/src/components/store/editor/move/) | Drag + reposition |
| F-651 | `#store` `#editor` | `GroupManager` | [store/editor/group/](apps/web/client/src/components/store/editor/group/) | Group/ungroup |
| F-652 | `#store` `#editor` | `CopyManager` | [store/editor/copy/](apps/web/client/src/components/store/editor/copy/) | Clipboard |
| F-653 | `#store` `#editor` | `TextEditingManager` | [store/editor/text/](apps/web/client/src/components/store/editor/text/) | ProseMirror inline edit |
| F-654 | `#store` `#editor` | `InteractionsManager` | [store/editor/interactions/](apps/web/client/src/components/store/editor/interactions/) | Event / state / anim wiring |
| F-655 | `#store` `#editor` | `ImageManager` | [store/editor/image/](apps/web/client/src/components/store/editor/image/) | Image asset mgmt |
| F-656 | `#store` `#editor` | `FontManager` | [store/editor/font/](apps/web/client/src/components/store/editor/font/) | System + custom fonts |
| F-657 | `#store` `#editor` | `FileCacheManager` | [store/editor/cache/file-cache.ts](apps/web/client/src/components/store/editor/cache/file-cache.ts) | File cache TTL |
| F-658 | `#store` `#editor` `#integration` | `SandboxManager` | [store/editor/sandbox/](apps/web/client/src/components/store/editor/sandbox/) | Provider lifecycle, push/pull |
| F-659 | `#store` `#editor` | `ApiManager` | [store/editor/api/](apps/web/client/src/components/store/editor/api/) | API endpoint routing |
| F-660 | `#store` `#editor` | `IdeManager` | [store/editor/ide/](apps/web/client/src/components/store/editor/ide/) | IDE integration |
| F-661 | `#store` `#ai` | `ChatManager` | [store/editor/chat/](apps/web/client/src/components/store/editor/chat/) | Chat UI + streaming |
| F-662 | `#store` | `BranchManager` | [store/editor/branch/](apps/web/client/src/components/store/editor/branch/) | Per-branch state |
| F-663 | `#store` | `CommentManager` | [store/editor/comment/](apps/web/client/src/components/store/editor/comment/) | Inline canvas comments |
| F-664 | `#store` | `PresenceManager` | [store/editor/presence/](apps/web/client/src/components/store/editor/presence/) | Live cursors + presence |
| F-665 | `#store` | `ErrorManager` | [store/editor/error/](apps/web/client/src/components/store/editor/error/) | Build / runtime errors |
| F-666 | `#store` | `PagesManager` | [store/editor/pages/](apps/web/client/src/components/store/editor/pages/) | Multi-page detect + settings |
| F-667 | `#store` `#integration` | `GitManager` | [store/editor/git/](apps/web/client/src/components/store/editor/git/) | Git ops |
| F-668 | `#store` | `HostingContext` | [store/hosting/](apps/web/client/src/components/store/hosting/) | Hosting provider context + hooks |
| F-669 | `#store` | `HotkeysManager` | [store/hotkeys/](apps/web/client/src/components/store/hotkeys/) | Global hotkey registry |
| F-670 | `#store` | Lib helpers | [store/lib/](apps/web/client/src/components/store/lib/) | Shared store utilities |

---

## 28. Shared Packages

> Source: [packages/*](packages/). 28 packages.

| ID | Tag | Package | Path | Purpose |
|---|---|---|---|---|
| F-680 | `#package` | `@weblab/constants` | [packages/constants](packages/constants) | Brand `APP_NAME`, DOM prefix, deprecated URLs |
| F-681 | `#package` | `@weblab/models` | [packages/models](packages/models) | Shared model types |
| F-682 | `#package` | `@weblab/types` | [packages/types](packages/types) | Low-level utility types |
| F-683 | `#package` | `@weblab/db` | [packages/db](packages/db) | Drizzle schema (legacy Supabase tables) |
| F-684 | `#package` | `@weblab/utility` | [packages/utility](packages/utility) | General-purpose helpers |
| F-685 | `#package` | `@weblab/rpc` | [packages/rpc](packages/rpc) | Vestigial tRPC contracts |
| F-686 | `#package` | `@weblab/auth` | [packages/auth](packages/auth) | Auth capability layer |
| F-687 | `#package` `#ai` | `@weblab/ai` | [packages/ai](packages/ai) | LLM SDK / OpenRouter / multi-provider |
| F-688 | `#package` `#ai` | `@weblab/ai-cli` | [packages/ai-cli](packages/ai-cli) | Local CLI adapters (Codex, Claude Code, Gemini, OpenCode, Cursor) |
| F-689 | `#package` | `@weblab/parser` | [packages/parser](packages/parser) | Babel JSX/TSX AST + responsive class rebase |
| F-690 | `#package` | `@weblab/framework` | [packages/framework](packages/framework) | Framework detect/configure (Next/Vite/Remix/Astro/TanStack/static) |
| F-691 | `#package` `#integration` | `@weblab/code-provider` | [packages/code-provider](packages/code-provider) | Sandbox provider (Vercel Sandbox primary; CSB `#deprecated`) |
| F-692 | `#package` | `@weblab/file-system` | [packages/file-system](packages/file-system) | Browser-compatible FS abstraction |
| F-693 | `#package` `#ai` | `@weblab/mcp` | [packages/mcp](packages/mcp) | Model Context Protocol server |
| F-694 | `#package` `#integration` | `@weblab/github` | [packages/github](packages/github) | Octokit + GitHub App |
| F-695 | `#package` `#integration` | `@weblab/figma` | [packages/figma](packages/figma) | Figma REST API |
| F-696 | `#package` `#integration` | `@weblab/figma-plugin` | [packages/figma-plugin](packages/figma-plugin) | Figma plugin source |
| F-784 | `#package` `#integration` | `@weblab/figma-clipboard` | [packages/figma-clipboard](packages/figma-clipboard) | DOM-scene → Figma native clipboard (Kiwi) encoder for F-783 Copy to Figma. Vendors the Figma scene schema (`schema-data.ts`), drives `kiwi-schema` + `pako` to emit the `fig-kiwi` archive + `text/html` paste envelope. Round-trip unit-tested (T-813) |
| F-697 | `#package` `#integration` | `@weblab/git` | [packages/git](packages/git) | Local git ops |
| F-698 | `#package` `#billing` | `@weblab/stripe` | [packages/stripe](packages/stripe) | Stripe products / webhooks |
| F-699 | `#package` `#integration` | `@weblab/email` | [packages/email](packages/email) | Transactional email |
| F-700 | `#package` | `@weblab/ui` | [packages/ui](packages/ui) | Radix + Tailwind + shadcn primitives |
| F-701 | `#package` | `@weblab/fonts` | [packages/fonts](packages/fonts) | Curated font catalog |
| F-702 | `#package` | `@weblab/image-server` | [packages/image-server](packages/image-server) | Image processing |
| F-703 | `#package` | `@weblab/penpal` | [packages/penpal](packages/penpal) | Iframe RPC (Penpal-based) |
| F-704 | `#package` | `@weblab/growth` | [packages/growth](packages/growth) | Referrals / attribution / share |
| F-705 | `#package` | `@weblab/scripts` | [packages/scripts](packages/scripts) | Build + setup scripts |

---

## 29. Integrations (External Services)

| ID | Tag | Service | Touchpoints | Purpose |
|---|---|---|---|---|
| F-710 | `#integration` | Clerk | F-080–F-091, [convex/auth.config.ts](apps/web/client/convex/auth.config.ts), F-545 | Auth |
| F-711 | `#integration` | Convex | Sections 25–26 | Backend (primary) |
| F-712 | `#integration` | Supabase | [src/utils/supabase/](apps/web/client/src/utils/supabase/), [packages/db](packages/db) | Auth-adjacent + legacy DB |
| F-713 | `#integration` `#ai` | OpenRouter | F-471, F-474, F-475, F-687 | LLM routing |
| F-714 | `#integration` `#ai` | OpenAI | F-476 (Whisper) | Audio transcription |
| F-715 | `#integration` `#ai` | Anthropic | F-687 (via provider router) | LLM provider |
| F-716 | `#integration` `#ai` | Ollama | F-471, F-474, F-475, F-478 | Local LLM |
| F-717 | `#integration` `#ai` | Firecrawl / Exa / Mem0 | F-687 | AI tools / memory |
| F-718 | `#integration` | GitHub | F-089, F-128, F-205, F-427, F-533, F-694 | Repo import + sync + App + webhook |
| F-719 | `#integration` `#disabled` | Figma | F-088, F-129, F-531, F-695, F-696 | Design import (callback currently disabled) |
| F-720 | `#integration` `#billing` | Stripe | F-090, F-091, F-479, F-491, F-555, F-617–F-622, F-698 | Billing + checkout + portal |
| F-721 | `#integration` | Freestyle | F-549 | Hosting deploy |
| F-722 | `#integration` | Vercel Sandbox | [packages/code-provider/src/providers/vercel-sandbox](packages/code-provider/src/providers/vercel-sandbox) | Project runtime (primary) |
| F-723 | `#integration` `#deprecated` | CodeSandbox | [packages/code-provider/src/providers/codesandbox](packages/code-provider/src/providers/codesandbox) | Legacy runtime (archived 2026-05-24) |
| F-724 | `#integration` | N8N | F-477 | Email-capture webhook |
| F-725 | `#integration` | PostHog | F-453 | Analytics |
| F-726 | `#integration` | Gleap | F-453, F-615 | In-app feedback widget |

---

## 30. Admin

| ID | Tag | Route | Path | Sub-features | Purpose |
|---|---|---|---|---|---|
| F-730 | `#admin` `#auth-gated` | `/admin` (layout) | [src/app/admin/layout.tsx](apps/web/client/src/app/admin/layout.tsx) | Role check, sidebar | Admin shell |
| F-731 | `#admin` `#auth-gated` `#ai` | `/admin/usage` | [src/app/admin/usage/page.tsx](apps/web/client/src/app/admin/usage/page.tsx) | AI usage aggregates (F-510) | Token / cost analytics |

---

## 31. Dev / Internal

| ID | Tag | Route | Path | Purpose |
|---|---|---|---|---|
| F-740 | `#internal` | `/dev/convex-smoke` | [src/app/dev/convex-smoke/page.tsx](apps/web/client/src/app/dev/convex-smoke/page.tsx) | Convex connection smoke test |

---

## 32. Cross-Cutting (env, i18n, theming, SEO)

| ID | Tag | Concern | Where | Purpose |
|---|---|---|---|---|
| F-750 | `#internal` | Env schema | [src/env.ts](apps/web/client/src/env.ts) | `@t3-oss/env-nextjs` validation |
| F-751 | `#internal` | tRPC client | [src/trpc/react.tsx](apps/web/client/src/trpc/react.tsx) | React Query + tRPC links (now mostly Convex) |
| F-752 | `#internal` | tRPC server helpers | [src/trpc/](apps/web/client/src/trpc/) | Vestigial helpers |
| F-753 | `#internal` | Service worker | [public/sw.js](apps/web/client/public/sw.js), F-057 | PWA |
| F-754 | `#i18n` | i18n config | [src/i18n/](apps/web/client/src/i18n/), [messages/](apps/web/client/messages/) | next-intl |
| F-755 | `#i18n` | Locale switcher | F-066 `locale-switcher.tsx` | Switch language |
| F-756 | `#public` | Theme provider | F-058 | Dark default |
| F-757 | `#public` | Theme switcher | F-066 `theme-switcher.tsx` | User toggle |
| F-758 | `#public` | SEO metadata | [src/app/seo.ts](apps/web/client/src/app/seo.ts) | Canonical / OG / twitter helpers |
| F-759 | `#public` | Sitemap | [next-sitemap.config.js](apps/web/client/next-sitemap.config.js) | XML sitemap |
| ~~F-760~~ | `#public` `#deprecated` | Robots | (not present in tree as of 2026-05-26 — likely served from static `public/robots.txt` or next-sitemap output) | Crawler control |
| F-761 | `#public` | Changelog data | [src/lib/changelog-entries.ts](apps/web/client/src/lib/changelog-entries.ts) | F-005 data source |
| F-762 | `#public` | Blog MDX | [content/blog/](apps/web/client/content/blog/) | F-004 content |
| F-763 | `#editor` | Path aliases | [tsconfig.json](apps/web/client/tsconfig.json) | `@/*` and `~/*` → `src/*` |

---

## Glossary

- **Workspace** — top-level tenant containing projects + members + billing.
- **Project** — single web app being built; has branches, frames, conversations, CMS.
- **Branch** — versioned snapshot of a project's code + state. Independent sandbox per branch.
- **Frame** — single iframe in the canvas, optionally device-bound (responsive breakpoint).
- **Sandbox** — running container that previews user code. Provider = Vercel Sandbox.
- **Provider connection** — OAuth token to GitHub / Figma / Stripe.
- **Skill** — discrete AI capability registered in the `skills` table.
- **Hosting connection** — credentials for deploy target (Freestyle).
- **Mode** — editor mode: Design / Code / Preview.
- **Style tab v4** — current property panel; v1–v3 retained as `#deprecated`.
- **CMS binding** — DOM element ↔ CMS field link, stored in `cmsBindings`.
- **Convex action** — Convex's name for a function that can call external APIs.
- **`#vestigial`** — Code retained from a previous architecture (tRPC, Drizzle Supabase) but not the primary path.

---

## Change Protocol

When you ship a feature, follow this protocol **before** opening a PR:

1. **Add or update a row.** New top-level feature → new row, next free `F-XXX` ID, tags, path (clickable), sub-features (bullet or comma-separated), `Used when` column.
2. **Don't reuse IDs.** Deleting a feature → strike it out: `~~F-042~~ (removed YYYY-MM-DD)` — keep the row.
3. **Renaming a feature** is fine; the ID stays.
4. **Sub-feature** = something a user can interact with inside a larger row. Either bullet-list it in the row or split it into its own ID if other rows reference it.
5. **Pair with [test-plan.md](./test-plan.md).** Every new row needs at least one test case row in the same section.
6. **Append to [Change Log](#change-log)** with date + ID + one-liner.
7. **Update the matching agent-context doc** if architecture changed (per `CLAUDE.md` Documentation Discipline).

### Style rules

- Paths are markdown links (`[label](path)`); the label is the path, no leading slash. Use the absolute repo path so the link clicks.
- Tags always go in inline-code: `` `#editor` ``.
- One row per feature. Don't merge unrelated features into one row.
- Use the existing section if the feature fits; otherwise add a new section and renumber the TOC.
- Keep `Sub-features` short. If a sub-feature has its own complex behavior, give it its own ID.

### Owner

This file is owned by **whoever ships the feature**. There is no central reviewer; the linter is the catalog itself — if you can't find your feature here, the PR isn't done.

---

## Change Log

| Date | IDs added / changed | Note |
|---|---|---|
| 2026-05-26 | F-001 … F-763 | Initial comprehensive catalog v2 — replaces v1 (Convex backend reflected, route inventory verified against filesystem). |
| 2026-05-26 | F-087, F-088, F-092 | Validation pass: documented F-087 server-side auth gate (new `profile-setup/layout.tsx`); F-088 tagged `#disabled` and rewritten to render error synchronously (drops fragile useEffect + AnimatePresence pattern that hung the page); F-092 invite query/mutation name corrected (`projectInvitations.*`). |
| 2026-05-29 | image-gen + skills | `generate_image` tool now supports Nano Banana (`google/gemini-2.5-flash-image`) via OpenRouter REST alongside direct-OpenAI GPT Image; metered via new `convex/usage.reserveImage` (5-credit multiplier + daily/burst/per-turn caps, `type:'image'` on `usageRecords`). Skill import gained `.md`/`.zip` upload; 7 more default-on built-ins embedded; scope selector clarified. `#ai` `#images` `#skills` `#billing`. See spec `docs/superpowers/specs/2026-05-29-skills-image-gen-design.md`. |
| 2026-06-02 | F-331, F-331a, F-331b, F-332, F-480 | Editor terminal overhaul: bottom toolbar stays visible when the terminal opens (panel grows below it); multiple terminal tabs with create (`+`) / close / drag-reorder and a fully-round tab wrapper; a command input row below the tabs that writes to the active PTY; AI mode (new `terminal-input.tsx`) translating natural language → one shell command via new route F-480 (`/api/ai/terminal-command`, agent `packages/ai/src/agents/terminal-command.ts`), preview-then-Enter by default with an auto-run toggle (localStorage); drag-resizable panel height (persisted). Default active tab switched to the interactive terminal. `#editor` `#ai`. |
| 2026-06-02 | F-438, F-530 | Settings-modal polish: editable free Weblab subdomain in the Domain tab (`domains.setPreviewSlug`/`previewSlugGet` + `projects.previewSlug` + `_previewCreate` honors it; validation extracted to pure `convex/lib/previewSlug.ts`, unit-tested T-438); Pro upsell card restyled neutral/monochrome (was blue-bg/orange-text — a dark-theme `--background-warning` token bug, now amber); dead Density appearance control removed (`--spacing-unit` consumed nowhere); form label/input spacing 6px→8px; new `settings.*` i18n namespace (en + sv) wired into Appearance/Language/Editor/Domain tabs. `#modal` `#i18n` `#convex` `#design`. |
| 2026-06-03 | F-436, F-437 | Settings polish round 2: dark/light favicon in the Site tab (`metadata.icons.icon` light/dark media-query array; `Icons.icon` type widened to `Icon \| Icon[]`); folder dropdown in General (localforage-shared with the dashboard); active settings tab → full-contrast text + medium weight (was muted via ghost-variant `dark:text-[#999]`); section subtitles `text-foreground-tertiary` → `-secondary`. Handoff prompts written for the deferred work: [add-publishing-controls](prompts/add-publishing-controls.md), [add-fonts-tab](prompts/add-fonts-tab.md), [add-seo-v2](prompts/add-seo-v2.md). `#modal` `#design`. |
| 2026-06-03 | F-782 | Website clone (URL + screenshot) re-enabled end-to-end after the Convex migration left `useCloneWebsite` stubbed (it scraped, then threw "temporarily unavailable"). New `projectActions.createFromWebsiteClone` provisions a Vercel sandbox + seeds the purpose-built clone context types (WEBSITE_URL/WEBSITE_SCRAPE/IMAGE/PROMPT) that `use-start-project.resumeCreate` turns into a framework-specific clone prompt via `getCloneSystemPrompt` (lit up a previously dead replay branch). Separately, the user-facing "FIRECRAWL_API_KEY is not configured" error was an env-placement bug: the key must live on the Convex deployment (where the scrape action runs), not Next.js `.env.local` — set on dev + prod. Helpers extracted to `clone-prompt.ts` (unit-tested T-809). `#ai` `#convex`. |
| 2026-06-02 | F-436, F-780, F-781 | Project-settings expansion: F-436 General gained an Overview section (Site ID + copy, Pages, Last published/updated, Created); new **Site Access** tab (F-780) over existing `projectMembers`/`projectInvitations` APIs (first UI for them); new **SEO** tab (F-781) with file-backed robots.txt / llms.txt / custom sitemap.xml editors written to project `public/` via `activeSandbox.writeFile` (real effect without the disabled publish pipeline). Deferred sub-features (password, private staging, 301 redirects, Forms, Fonts, folders, SEO auto-sitemap/canonical) logged in BACKLOG with quick alternatives. `#modal` `#integration`. |
| 2026-06-04 | F-783, F-784 | **Copy to Figma**: copy the selected element or frame to the clipboard in Figma's native scene format (no plugin) → `Cmd/Ctrl+V` into Figma yields editable frames/text/shapes. New package `@weblab/figma-clipboard` (F-784) vendors the Figma Kiwi scene schema and drives `kiwi-schema` + `pako` to emit the `fig-kiwi` archive + `text/html` paste envelope (round-trip unit-tested T-813). New preload bridge `getFigmaSceneData` serializes the subtree (geometry + computed styles) in-iframe; editor manager `CopyToFigmaManager` (`engine.figma`) writes the clipboard. Surfaced on all 4 affordances: right-click element + frame, frame toolbar button, element overlay button (reused existing `Icons.Figma`). v1 maps fills/borders/radius/text/font/opacity with absolute positioning; images → placeholder rect; gradients/shadows/flex-auto-layout deferred (BACKLOG). `#editor` `#integration`. |

