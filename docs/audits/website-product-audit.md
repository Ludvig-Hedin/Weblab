# Weblab Website ↔ Product Audit

**Date:** 2026-05-10
**Scope:** Public marketing site under `apps/web/client/src/app/**` (homepage, features, compare, pricing, faq, about, blog, changelog, workflows) vs. actual implemented product surface in `apps/web/client/src/app/project/[id]/**`, `packages/*`, `apps/backend/**`, and `docs/agent-context/**`.
**Mode:** Audit only — no code edits made.

---

## 1. Executive Summary

Weblab is materially more capable than the marketing site shows, and at the same time the marketing site overclaims in several spots that hurt trust badly enough to be P0.

The product reality is strong: TipTap chat composer with mentions/slash, multi-provider AI (OpenRouter + Claude Code/Codex/Gemini/OpenCode/Cursor CLI bridges), MobX-driven canvas with multi-frame breakpoint editing, Monaco code panel, AST-aware edits via `@weblab/parser`, GitHub App OAuth + commit/PR flow, Freestyle deploy + custom-domain DNS verification, Stripe billing, MCP server, six framework adapters (Next/Vite/Remix/Astro/TanStack/static), feature flags, role-based project access, local-folder import. Solid, real-codebase visual editor with a multi-CLI agent layer.

The marketing reality is weaker: the homepage hero is generic ("AI visual website builder for builders"), the strongest differentiators (multi-CLI agents, MCP server, real-codebase AST edits, six framework adapters) are barely visible above the fold, and the testimonials + "Tens of thousands of builders" + "90+ contributors" copy reads as inherited Onlook social proof presented as Weblab's. Pricing lists capabilities (SSO/SAML, audit logs, custom-domain) that range from real to absent, with no clear plan tier or price visible. Mockup imagery is a cartoon "Villainstagram" demo, not a real product screenshot.

Ship priority: (1) fix the social-proof + claims that are inherited or fabricated, (2) replace the mockup with a real screenshot, (3) lead with the actual differentiators in the hero, (4) audit pricing claim-by-claim against shipped code.

---

## 2. Top 10 Highest-Impact Issues

| # | Severity | Issue | Where |
|---|---|---|---|
| 1 | **P0** | Testimonials reference dated 2024-25 tweets (Adam Argyle, Aaron Epstein, Tina He, John Maeda, Koder, Ryutaro, Kawai, Utsumura) but the quote text reads "Weblab" / "@weblab". These were Onlook tweets (Onlook was the codebase pre-fork). Either the tweet copy was string-replaced, or attribution is wrong. Either way it is misleading and will be caught. | `apps/web/client/src/app/_components/landing-page/testimonials-section.tsx:60-135` |
| 2 | **P0** | "Tens of thousands of builders love Weblab" headline. Org schema (`seo.ts:53`) sets `numberOfEmployees: 1`. There is no usage data shown to support a five-figure user base for the fork. | `testimonials-section.tsx:64-66` |
| 3 | **P0** | "90+ contributors" + "Open source & transparent" stat block. These contributors are on `github.com/onlook-dev/onlook`, not `Ludvig-Hedin/Weblab`. Claiming them as Weblab community is misattribution. | `apps/web/client/src/app/_components/landing-page/social-proof-section.tsx:8-21` |
| 4 | **P0** | Pricing lists "SSO (SAML/OAuth), advanced security controls, audit logs, and admin controls" with no implementation evidence in the codebase. No SAML, no audit-log table, no admin console route. | `apps/web/client/src/app/pricing/page.tsx:58-62` |
| 5 | **P0** | Pricing is a marketing list of features under one "For Teams" block — no plan tier, no price, no Free vs Pro vs Enterprise breakdown, despite Stripe being fully wired (`subscriptionRouter`, `prices` table, checkout + billing portal). The schema.org `SoftwareApplication.offers.price = "0"` (`seo.ts:111-114`) contradicts the existence of paid plans. | `pricing/page.tsx`, `seo.ts:110-115` |
| 6 | **P1** | Hero copy is generic. "AI visual website builder for builders" + "Design with your real components on an infinite canvas. Ship production-ready websites instead of prototypes." The single strongest differentiator (multi-CLI agents — Claude Code, Codex, Gemini, OpenCode, Cursor) is invisible. So is the MCP server. So is open source. | `apps/web/client/src/app/_components/hero/index.tsx:62-79` |
| 7 | **P1** | Featured product mockup is a hand-drawn "Villainstagram / Villainterest" cartoon scene with placeholder chat about a masonry layout. No real editor screenshot anywhere on the homepage. Reduces trust below real-codebase competitors. | `apps/web/client/src/app/_components/landing-page/weblab-interface-mockup.tsx:11-65` |
| 8 | **P1** | FAQ promises "real-time collaboration" and "spatial comments… work together in real-time" while the codebase has comment threads in DB schema but **no presence/cursor merge** code path verified. Overclaim. | `apps/web/client/src/app/faq/page.tsx`, repo-map notes |
| 9 | **P1** | Pricing claim "Branching & Version Control … full version history" overstates current capability. Git branch CRUD ships; rollback / time-travel UI does not. | `pricing/page.tsx:24-27` |
| 10 | **P1** | Old Midjourney filenames left in `apps/web/client/public/assets/` (`the___daniel_httpss.mj.run...`). 14 files, multi-MB each, public. Either delete or reference. Currently unreferenced bloat in the build. | `apps/web/client/public/assets/` |

---

## 3. Actual Feature Inventory (verified from code)

Status legend: **I** = Implemented · **P** = Partial · **S** = Stub / scaffold · **N** = Not found.

### 3.1 AI chat / agent

| Feature | Status | Evidence |
|---|---|---|
| TipTap composer with `@` file mentions, slash commands, image attachments | I | `apps/web/client/src/components/ai-prompt-composer/**` |
| Slash modes: ASK / CREATE / EDIT / FIX / PLAN | I | `packages/models/src/chat/type.ts`, `slash-commands.tsx` |
| Multi-provider routing (OpenRouter cloud + 5 local CLI bridges: Claude Code, Codex, Gemini, OpenCode, Cursor + Ollama) | I | `packages/ai/src/providers/manifest.ts:12-149`, `packages/ai-cli/**` |
| Streaming via tRPC chat mutation | I | `apps/web/client/src/server/api/routers/chat/message.ts` |
| Provider failover (OpenRouter → OpenAI on transient errors) | I | feature-log entry |
| Framework-aware system prompt | I | `ai-chat-architecture.md:93-101` |
| Plan mode standalone page | I | recent commit `1bce3371 feat(plan-mode)` |
| Selected-element / screenshot context pills | I | mention extensions + canvas selection store |
| Suggestions after a turn | I | editor-architecture.md:91 |

### 3.2 Visual editor

| Feature | Status | Evidence |
|---|---|---|
| Iframe canvas + multi-frame layout | I | `apps/web/client/src/app/project/[id]/_components/canvas/**` |
| Responsive frame breakpoints (mobile/tablet/desktop/custom) | I | migration `0029_frame_breakpoints.sql`, `breakpoints-architecture.md` |
| Drag/drop element insert/move + snap/group/copy managers | I | `components/store/editor/engine.ts:30` |
| Inline text edit on canvas | I | `text` manager + `data-weblab-editing-text` |
| Right-click context menu | I | `_components/right-click-menu/` |
| Hotkeys (pan/zoom/undo/redo/clipboard) | I | `keyboard-shortcuts-modal.tsx` |
| Comments / spatial threads | P | DB schema only; no live cursor / presence merge |
| Element palette + insert | I | `element-palette/` |
| Design panel (color/type/spacing/grid) | I | `left-panel/design-panel/**` |
| Editor state persistence (frame, breakpoint, selection) | I | `use-editor-state-persistence.tsx`, feature-log 2026-05-09 |
| Preview overlay (design vs CMS content mode) | I | `preview-overlay.tsx` |

### 3.3 Code / project editing

| Feature | Status | Evidence |
|---|---|---|
| Monaco editor + collapsible file tabs | I | `left-panel/code-panel/code-tab/file-content/code-editor.tsx` |
| File tree, search, drag rename | I | `code-tab/sidebar/file-tree*.tsx` |
| AST-aware JSX/TSX edits via Babel | I | `packages/parser/**`, `style` + `code` managers |
| Format on save | I | DefaultSettings.EDITOR_SETTINGS |
| Inline AI edit on selected code | I | `code-tab/file-content/inline-edit/prompt.tsx` |
| Diff viewer | S | no dedicated diff component found |

### 3.4 Local repo / existing project

| Feature | Status | Evidence |
|---|---|---|
| GitHub App OAuth (install, sign state, validate) | I | `routers/github.ts:15-59` |
| Import existing GitHub repo | I | `github.ts` parseRepoUrl + clone |
| Local folder import | I | `projects/import/local/**`, hero "Open Local Folder" button |
| Figma file import | I | `routers/figma.ts`, `packages/figma` |
| CodeSandbox cloud sandbox provider | I | `packages/code-provider`, cloud mode |
| Six framework adapters (Next/Vite/Remix/Astro/TanStack/static) | I (Next, static) / P (rest behind `NEXT_PUBLIC_MULTI_FRAMEWORK_ENABLED`) | `packages/framework/registry.ts:isFrameworkReady` |
| Auto-detect framework on import | I | `detectFrameworkFromFiles()` |
| Hybrid local+cloud sync mode | S | repo-map.md notes "planned" |

### 3.5 Asset / media

| Feature | Status | Evidence |
|---|---|---|
| Image upload via drag/drop or chat | I | `routers/image.ts`, composer `onImageFiles` |
| Asset library browser in design panel | I | design-panel asset section |
| Image optimization helpers | I | `packages/image-server` |
| Video / `<video>` tag insert | S | TODO in editor-bar |

### 3.6 Versioning / branches / commits / deployment

| Feature | Status | Evidence |
|---|---|---|
| Project branches (main + feature) | I | branch manager + `routers/branches.ts` |
| GitHub commits / PR creation from canvas | I | `routers/github.ts` saveChanges/createPullRequest |
| Deploy via Freestyle (`@freestyle-sh`) + custom domain | I | `publish/helpers/deploy.ts:deployFreestyle` |
| Custom-domain DNS verification | I | `routers/domain.ts`, `helpers/records.ts` |
| Publish flow (build → deploy → live URL) | I | `routers/publish.ts`, deployments table |
| Time-travel / rollback UI | N | not implemented |

### 3.7 Auth / account / billing / onboarding

| Feature | Status | Evidence |
|---|---|---|
| Supabase Auth + OAuth providers | I | `auth/**`, `auth-context.tsx` |
| User profile (`fromDbUser`) | I | `routers/user.ts` |
| Stripe subscriptions, checkout, billing portal | I | `routers/subscription.ts`, `packages/stripe` |
| Plans (Free / paid tiers) | P | tables exist, no UI plan picker on public pricing page |
| Project member invitations + roles | I | `routers/invitation.ts`, `member.ts`, ProjectRole enum |
| Profile setup / onboarding route | I | `apps/web/client/src/app/profile-setup/**` |
| Account deletion | S | no `user.delete` route |
| Audit logs / SSO / SAML / admin console | N | no evidence in code |

### 3.8 Open-source / dev positioning

| Feature | Status | Evidence |
|---|---|---|
| Apache 2.0 license + Onlook attribution | I | `LICENSE.md` |
| Public GitHub link in nav/footer | I | `page-footer.tsx:96-104` |
| MCP server (file/bash/project tools) | I | `packages/mcp/server.ts` |
| Multi-CLI bridges (Claude Code, Codex, Gemini, OpenCode, Cursor) | I | `packages/ai-cli/**` |
| Figma plugin | I | `packages/figma-plugin` |

### 3.9 Unfinished / hidden / experimental

| Feature | Status | Evidence |
|---|---|---|
| Multi-framework picker | P | feature-flag gated |
| Plan mode UI polish | P | landed in commit `1bce3371`; recent |
| Hybrid local+cloud sync | S | planned per repo-map.md |
| Custom-font discovery | S | TODO in `font-panel` |
| Cursor presence / multiplayer | S | comment table only, no presence merge |
| Video element insert | S | TODO |
| Diff viewer | S | not found |

---

## 4. Website Feature Coverage Matrix

Coverage of real product capabilities on the public site.

| Capability | Mentioned clearly | Vague | Missing | Misleading | Overclaim |
|---|---|---|---|---|---|
| Real React/Next.js codebase editing | ✅ hero subline + features | | | | |
| Multi-CLI agent bridge (Claude Code/Codex/Gemini/OpenCode/Cursor) | | only `/workflows/claude-code` and `/compare/claude-code`; not on homepage | mostly missing above the fold | | |
| MCP server | | | ✅ missing entirely | | |
| Six framework adapters (Vite/Remix/Astro/TanStack/static besides Next) | | | ✅ missing | | |
| AST-aware edits (no LLM rewrites that drift the codebase) | | features page hints | underused | | |
| Visual canvas + multi-frame breakpoints | ✅ ResponsiveMockupSection | | | | |
| GitHub PR flow | ✅ "Direct GitHub Integration" / "Ship PRs, Not Prototypes" | | | | |
| Custom domain + Freestyle deploy | | pricing line "Custom Domains" | underused, no flow shown | | |
| Stripe billing / paid plans | | | ✅ no public price | | the schema offers free at $0 |
| Open source | ✅ pricing + features hero "Open Source" | not in homepage hero | | | |
| Real-time collaboration | | | | ✅ FAQ overclaims | |
| SSO / SAML / audit logs | | | | ✅ pricing implies shipped | ✅ |
| Version history / rollback | | | | ✅ pricing "full version history" | ✅ |
| Tens of thousands of users | | | | ✅ overclaim | ✅ |
| 90+ contributors | | | | ✅ inherited from Onlook | ✅ |
| Plan mode | | | ✅ missing | | |
| Inline AI edit on selected code | | | ✅ missing | | |
| Local folder import | ✅ hero CTA "Open Local Folder" | | | | |
| Figma import | | only in pricing flavor | underused | | |
| Selected-element-as-AI-context | | | ✅ missing | | |

---

## 5. Positioning & Copy Audit

### 5.1 Hero (`hero/index.tsx`)

- **Current H1:** "AI visual website builder _for builders_"
  **Problem:** generic. "For builders" reads as a tautology and doesn't pick a side. Indistinguishable from Lovable, v0, Bolt copy.
  **Suggested:** "The visual editor for your real React codebase." or "Edit your real React app on a canvas. Ship pull requests, not prototypes."
  **Why:** names the differentiator (real codebase, PRs) in five seconds. Drops the cliché "AI builder" framing every competitor uses.

- **Current sub:** "Design with your real components on an infinite canvas. Ship production-ready websites instead of prototypes."
  **Problem:** OK but dilutes by repeating "production-ready" — already implicit. Also no mention of multi-CLI agents, open source, or framework breadth.
  **Suggested:** "Bring your existing Next.js, Vite, or Remix project. Edit visually. Let Claude Code, Codex, or Cursor edit alongside you. Ship real PRs."

- **CTAs:** "Get started · Import GitHub · Open Local Folder · Start Blank" — these are excellent. Keep them. They prove the product is real-codebase-first.

### 5.2 Section flow (`home-page-client.tsx`)

Current order: Hero → ResponsiveMockupSection → WhatCanWeblabDoSection → FAQSection → ChangelogGrid (4) → CTASection.

- No social-proof / testimonials section is currently shown on the homepage (good, since the testimonials file is suspect — see §2).
- WhatCanWeblabDoSection is dense and decent, but the "AI Chat Preview" inside the mockup uses cartoon "Villainstagram" copy. Replace with a real chat exchange about a real component (e.g. editing a Tailwind className on a Hero component).
- Changelog grid limited to 4 — fine.
- Missing: a "How it works" three-step (Connect repo → Edit visually → Ship PR), a multi-agent / open-source proof block, and a framework support strip.

### 5.3 Pricing

`pricing/page.tsx` lists 9 capability cards plus an "Enterprise Features" list, but no actual price, no Free/Pro/Team breakdown, and no Stripe `<PricingTable>` rendered (despite `PricingTable` being imported on line 10). The Contact CTA implies "talk to us for any plan", which contradicts a working self-serve subscription.

**Suggested rewrite:** Three columns — Free (1 project, cloud sandbox, OpenRouter cloud), Pro ($X/mo, unlimited projects, custom domains, paid model providers), Team (custom, includes invitations + roles + priority support). Drop the SSO/SAML/audit-logs claims until shipped.

### 5.4 Compare pages

11 competitor comparisons (Lovable, Bolt, v0, Webflow, Framer, Replit, Claude Code, Emergent, Wix, one.com, Onlook). Positioning is reasonable. The Claude Code page is honest about complementarity — keep that tone everywhere. The Onlook page appropriately attributes the fork.

### 5.5 FAQ

Copy is direct and answers real buyer questions. Two issues:
- "Real-time collaboration" promise (overclaim — see §2).
- No question explaining open-source, MCP server, multi-agent bridges, or self-hosting cost.

### 5.6 About

Tone is overwrought ("obliterate the divide"). Founder positioning is fine, but reading "We're building Weblab from Sweden" plus `seo.ts numberOfEmployees: 1` next to "Tens of thousands of builders" creates a credibility break.

---

## 6. Visual / Style Consistency Audit

Source of truth: `apps/web/client/src/styles/globals.css` + `@weblab/ui/globals.css` + the `/design-system` route.

| Area | Marketing site | Editor app | Verdict |
|---|---|---|---|
| Color tokens | uses `text-foreground-primary`, `text-foreground-secondary`, `bg-background-weblab` | identical | ✅ aligned |
| Typography | Inter (`--font-inter`) + script accent (`vujahdayScript`) for hero "for builders" | Inter only | ⚠️ marketing has decorative italic; editor has no equivalent — fine since marketing-only |
| Border radius | `rounded-xl` testimonials, `rounded-lg` mockup notes | `rounded-md` / `rounded-lg` editor cards | ✅ acceptable variance |
| Shadow / elevation | `shadow-sm` minimal | minimal | ✅ aligned |
| Density | landing has generous spacing, editor is compact (matches `data-density='compact'`) | compact | ⚠️ intentional, but the testimonial cards use looser `p-6` than app patterns — could tighten |
| Buttons | `Button` from `@weblab/ui/button` used | same | ✅ aligned |
| Icons | `@weblab/ui/icons` everywhere | same | ✅ aligned |
| Backgrounds | `UnicornBackground` (animated), `dunes-create-*` | flat tokens | ⚠️ marketing-only effect — fine |
| Brand wordmark | `BrandWordmark` from `@weblab/ui/brand` | same component | ✅ aligned |
| Mockup imagery | hand-drawn "Villainstagram" cartoon | real editor UI | ❌ **off-brand and outdated** — primary issue |
| Screenshots | `/assets/site-version-1..4.png` carousel | not the current editor UI | ⚠️ verify these are current |

Recommendations:
- Replace `weblab-interface-mockup.tsx` with a real screenshot of the editor on a known demo project. Use the `/design-system` route's component library to render a faithful inline mock if a screenshot is undesirable.
- Audit `site-version-1..4.png` against the current editor — capture fresh screenshots with the multi-frame breakpoint header visible.

---

## 7. Asset Freshness Audit

`apps/web/client/public/assets/` (file-by-file judgement):

| Asset | Used where | Current? | Issue | Recommended fix |
|---|---|---|---|---|
| `og-image.png` (`public/og-image.png`) | layout.tsx OG + Twitter | unknown | not opened — verify shows current product UI | regenerate from current editor capture |
| `favicon.svg` / `favicon.png` / `favicon.ico` | layout.tsx icons | likely current | none | keep |
| `ludvig.webp` | `/about` | current | none | keep |
| `brand/logo.png` `brand/wordmark.png` `brand/symbol.png` | seo.ts schema, BrandWordmark fallback | likely current | none | keep |
| `assets/site-version-1..4.png` | `WhatCanWeblabDoSection` carousel | unknown freshness | likely Onlook-era screenshots | recapture from current editor |
| `assets/dunes-create-{light,dark}.png` `assets/dunes-login-{light,dark}.png` | hero + auth forms | atmospheric, fine | none | keep |
| `assets/new-yt-thumbnail.png` | unknown reference | check usage | possible stale | verify or delete |
| `assets/profile-picture.png` | likely placeholder | unused? | dead asset risk | grep references; delete if unused |
| `assets/mountains.png` | unknown | unused? | dead asset risk | grep references; delete if unused |
| `assets/testimonials-{adam,kawai,tina,ryutaro,koder,aaron,john,utsumaru}.png` | `testimonials-section.tsx` | rendered with **suspect attribution** | **P0 — see §2** | remove section or replace with verifiable Weblab quotes |
| `assets/the___daniel_httpss.mj.run...` (14 files) | not referenced in marketing pages we read | dead bloat | leak Midjourney run URLs | delete |
| `assets/demo-docs.png` | unknown | unverified | check | verify or delete |
| `assets/layers-car.mp4` | unknown | unverified | check | verify or delete |
| `assets/logo-claude-code.svg` `assets/logo-codex.svg` | likely `/compare/claude-code` and `/workflows/claude-code` | useful | could be reused on homepage to show multi-CLI integration | keep + reuse |
| `apps/web/client/public/scenes/` | unknown | unverified | inspect | verify |

---

## 8. Technical / SEO / Accessibility Audit

| Area | Finding | Severity |
|---|---|---|
| Title + description in `layout.tsx` | Set via `APP_NAME` constant. Good. | ✅ |
| OG image (`/og-image.png`) | Single image used for every page. Static, not page-specific. | P2 — add per-page OG for blog and changelog. |
| Twitter handle `@weblab` | Set in `layout.tsx:99-100`. Verify the actual Twitter/X handle. If unowned, this is misleading. | P0 to verify |
| Sitemap | `public/sitemap.xml` exists | ✅ keep current |
| Robots | `public/robots.txt` exists | ✅ |
| LLM discoverability | `public/llms.txt` and `llms-full.txt` present | ✅ good signal |
| Schema.org markup | `organizationSchema`, `websiteSchema`, `softwareApplicationSchema` injected in root layout. `softwareApplicationSchema.offers.price = "0"` while Stripe billing is wired. | P1 — fix `offers` to reflect real plan(s) |
| Canonical URLs | per-page `alternates.canonical` set on `app/page.tsx:9`. Comment in `layout.tsx:60-61` notes prior duplicate-canonical bug — verify all subroutes. | P2 — verify on `/features/*`, `/compare/*`, `/blog/*` |
| Heading hierarchy | Hero is `motion.h1`, sections use `h2`. FAQ uses correct nesting. | ✅ |
| Alt text | Testimonial imgs have `alt={\`${name} profile\`}` — OK. Mockup images: not verified. | P2 |
| Internal links | Footer references `Routes.WORKFLOWS_CLAUDE_CODE`, `Routes.WORKFLOWS_VIBE_CODING` — verify these routes resolve. | P2 |
| Hardcoded brand strings | `apps/web/client/src/app/faq/page.tsx` has multiple hardcoded "Weblab" rather than `APP_NAME`. | P2 |
| Hydration risk | Hero uses `useRouter` + `useState` + auth query — correctly `'use client'`. Fine. | ✅ |
| Console errors | not exercised (per instruction not to run dev server) | n/a |
| Responsive | `ResponsiveMockupSection` has explicit md split — fine. Compare/features pages assume desktop layouts in places. | P2 — spot-test at 375px |
| Image weight | 14 unused Midjourney files in public/assets; if served from CDN they still inflate the deployment artifact. | P1 |

---

## 9. Recommended Homepage Structure

Top-to-bottom, replacing the current flow:

1. **Hero** (replace headline)
   - H1: "Edit your real React codebase on a canvas."
   - Sub: "Bring your Next.js, Vite, Remix, Astro, or TanStack Start project. Design visually. Let Claude Code, Codex, or Cursor edit alongside you. Ship real pull requests."
   - Same four CTAs (Get started · Import GitHub · Open Local Folder · Start Blank).
   - Replace `UnicornBackground` with a static, reduced-motion-friendly gradient by default; keep animated background as opt-in.

2. **Live editor mockup**
   - Real screenshot or live `/design-system`-styled render of the editor at the multi-frame breakpoint header. Drop "Villainstagram".

3. **Three-step "How it works"**
   - Connect → Edit → Ship. One illustration each, ≤15 words of body each.

4. **Multi-agent strip**
   - Logo row: Claude Code, Codex, Gemini, OpenCode, Cursor, OpenRouter. Tagline: "Use the AI you already pay for."
   - Single sentence on MCP server: "Or expose Weblab to your own agents over MCP."

5. **Framework strip**
   - Six logos: Next.js, Vite, Remix, Astro, TanStack Start, plain HTML. "Bring what you have."

6. **Real differentiators block** (the current `WhatCanWeblabDoSection`, but with concrete copy)
   - Real components / no rebuild
   - Multi-frame breakpoint editing
   - Inline AI edit on a code selection
   - GitHub App: real PRs
   - Custom domain via Freestyle
   - Open source + self-hostable

7. **Pricing teaser**
   - Three plans visible. CTA to `/pricing`.

8. **FAQ** (current, minus the real-time-collaboration overclaim)

9. **Changelog grid** (current; expand to 6)

10. **CTA section** (current)

Drop the testimonials section until verifiable Weblab-era quotes exist. If reusing Onlook quotes, mark them: "From the open-source community Weblab forked from."

---

## 10. Concrete Next Implementation Plan

Phased, smallest visible wins first. Each task is scoped to ≤1 day unless noted.

### Phase 1 — Stop the bleed (P0, ship same week)

1. Remove or clearly disclaim `testimonials-section.tsx`. If used at all, retitle "From the open-source community we forked from" and link each quote to its original tweet.
2. Replace "Tens of thousands of builders love Weblab" with verifiable copy. Suggested: "Open source. Forked from Onlook. Used by teams who want their codebase, not a hosted clone."
3. Replace "90+ contributors" community-stats block with "Open source — Apache 2.0 — see GitHub." Link to the Weblab repo.
4. `pricing/page.tsx`: remove SSO / SAML / audit-logs / admin-controls bullets until shipped. Either render the actual `<PricingTable>` from `@/components/ui/pricing-table` or list two plans (Free, Pro) with real $ values and a Contact card for Team.
5. Fix `seo.ts softwareApplicationSchema.offers` so it reflects the real Stripe price (or mark as `freeTrial` with a real plan link).
6. FAQ: rewrite the "real-time collaboration" answer to match shipped behavior — async comment threads on the canvas, no live cursors yet.

### Phase 2 — Differentiate (P1, next sprint)

7. Replace `weblab-interface-mockup.tsx` with a real screenshot of the editor (recommended) or a `@weblab/ui`-faithful inline render of a Hero component being edited on a multi-frame canvas with an AI chat exchanging real-feeling messages.
8. Rewrite the hero H1 + subhead per §5.1.
9. Add a multi-agent CLI strip section (Claude Code, Codex, Gemini, OpenCode, Cursor, OpenRouter logos). Logos exist for two; commission three more SVGs.
10. Add a framework support strip (Next, Vite, Remix, Astro, TanStack, static).
11. Add an MCP server callout — one sentence on the homepage, dedicated short page at `/features/mcp`.
12. Recapture `assets/site-version-1..4.png` from the current editor.

### Phase 3 — Polish (P2)

13. Audit canonical URL emission across `/features/*`, `/compare/*`, `/blog/*`, `/changelog/*`. Confirm no duplicate canonicals (per the comment at `layout.tsx:60-61`).
14. Replace hardcoded "Weblab" strings in `apps/web/client/src/app/faq/page.tsx` with `APP_NAME` from `@weblab/constants`.
15. Add per-page OG images for blog posts (use `assets/blog/<slug>.svg`).
16. Delete the 14 `assets/the___daniel_httpss.mj.run*.jpg` files. Confirm no references first via `rg "mj\\.run"`.
17. Verify references to: `assets/new-yt-thumbnail.png`, `assets/profile-picture.png`, `assets/mountains.png`, `assets/demo-docs.png`, `assets/layers-car.mp4`, `public/scenes/`. Delete unreferenced.
18. Mobile spot-check `/compare/*` and `/features/*` at 375px width.
19. Verify the Twitter/X handle `@weblab` actually owned by this project. If not, update or remove from `layout.tsx`.

### Phase 4 — Reposition (P2)

20. Move the open-source angle higher: a single line under the hero, plus a dedicated section above the FAQ. Self-host link, license link, GitHub stars, list of supported local AI CLIs.
21. Add a "Plan mode" feature page (`/features/plan-mode`) — recently shipped but unmentioned on the marketing site.
22. Add a "Selected element as AI context" demo — distinctive vs. v0/Bolt and currently invisible.

---

## Appendix — Brand Constants Health

- `APP_NAME = 'Weblab'` (`packages/constants/src/editor.ts:5`).
- `APP_DOMAIN = 'weblab.build'` (line 6).
- Most marketing pages import from `@weblab/constants`. Exception: `apps/web/client/src/app/faq/page.tsx` and the testimonials section both hardcode "Weblab".
- No remaining "Onlook" references in user-facing copy outside `/compare/onlook/**` (intentional comparison + attribution) and `LICENSE.md` (legal). Clean on this axis.

---

**Audit produced by:** read-only static inspection of `apps/web/client/src/app/**`, `apps/web/client/src/components/**`, `apps/web/client/public/**`, `packages/*`, and `docs/agent-context/**`. No code edits. No dev server runs. No external network calls.
