# Feature Log

Append-only log of significant features, fixes, and edits agents have shipped.
**Newest entries on top.** See `README.md` for what qualifies.

Format:

```
## YYYY-MM-DD — Short Title
Author: <agent / user>
Area: <package / route / system>
Summary: 1-3 sentences on what changed and why.
Files: key paths
Links: changelog / blog / migration / docs
```

---

## 2026-05-28 — CMS workspace bug-hunt sweep (F-380..F-392)
Author: Claude Opus 4.7
Area: `apps/web/client/src/app/project/[id]/_components/cms-workspace`
Summary: Scoped `/bug-hunt` over the 13 catalog rows F-380..F-392 (CMS shell, tabs, table, item editor, dialogs, data pusher). Three auto-fixes: (a) `edit-source-dialog.tsx` `source!.type` non-null assertion could TypeError if the user clicked Test before the source query resolved — added an early-return guard; (b) same file, seed effect overwrote the user's in-progress name edit when a Convex realtime refetch fired — added the `initializedRef` + `lastSourceIdRef` lock-on-first-fill pattern that bind-dialog and routing-dialog already use; (c) `data-pusher.tsx` `matchSegment` called `decodeURIComponent` unguarded — a preview URL with malformed percent-encoding (e.g. `/blog/%G1`) raised URIError that bubbled up through the 2s push interval and spammed unhandled-error logs. Wrapped in try/catch, returns null (non-match). Four report-only TODO(bug-hunt) comments + a CODE_REVIEW_BACKLOG entry for: sources-tab syncingId/testingId concurrent-row race (need `Set<string>`), item-editor unsaved-edit overwrite on collab refetch, items-table bulk-delete dropping failed ids from selection, fields-tab moveField double-click race. `bun typecheck` exit 0; touched-file lint clean.
Files: `apps/web/client/src/app/project/[id]/_components/cms-workspace/{edit-source-dialog,data-pusher,sources-tab,item-editor,items-table,fields-tab}.tsx`, `CODE_REVIEW_BACKLOG.md`
Links: n/a

## 2026-05-28 — Desktop OAuth handoff: wire renderer + polish (follow-up to 38b95dcf2)
Author: Claude Opus 4.7
Area: `apps/web/client/src/app/sign-in`
Summary: Commit `38b95dcf2` (Sonnet 4.6, parallel session) landed the system-browser + Clerk ticket handoff infrastructure — new `/sign-in/desktop-handoff` and `/sign-in/redeem` pages, `openExternal` IPC, and the `weblab://auth/handoff?ticket=…` deep-link route. It did NOT touch `clerk-auth-form.tsx`, so the renderer's `handleOAuth` was still calling `signIn.authenticateWithRedirect` even in the desktop shell — meaning the new infrastructure had no caller. This change wires the renderer side: detect `window.weblabNative.target === 'desktop'` in `handleOAuth`, and route OAuth clicks through `weblabNative.openExternal('/sign-in/desktop-handoff?provider=…')` instead of triggering an in-window Clerk redirect. Web path (browser) is unchanged.

Also polished `redeem-client.tsx` (use `env` instead of `process.env`, `void` the IIFE for the floating-promise rule, cleaner non-empty selector for the Clerk error message) and a prettier nit in `handoff-client.tsx`.
Files: `apps/web/client/src/app/sign-in/_components/clerk-auth-form.tsx`, `apps/web/client/src/app/sign-in/desktop-handoff/handoff-client.tsx`, `apps/web/client/src/app/sign-in/redeem/redeem-client.tsx`
Links: n/a

## 2026-05-28 — Desktop auth: fix dead launch URL + OAuth stale-session recovery
Author: Claude Opus 4.7
Area: `apps/desktop`, `apps/web/client/src/app/sign-in`
Summary: Three bugs fixed in the desktop sign-in flow.
(1) `DEFAULT_LAUNCH_URL` in `apps/desktop/main.js` still pointed at the legacy `/login?native=1` route deleted in the Supabase → Clerk migration (commit `944b1e7ac`). Middleware only redirects `/` → `/sign-in` for the WeblabDesktop UA, so `/login` 404'd. Switched to `/sign-in?native=1`.
(2) `handleOAuth` in `clerk-auth-form.tsx` had no stale-session recovery (commit `f04415447` only fixed the email/OTP path). When the `persist:weblab` Electron cookie jar carried a leftover Clerk session, `signIn.authenticateWithRedirect` short-circuited and the user saw nothing happen on OAuth button clicks. Mirrored the `startOtpFlow` pattern: catch `isAlreadySignedInError`, `signOut`, retry once.
(3) Improved OAuth error extraction — `ClerkAPIResponseError.message` is often a generic short string while the user-facing text lives at `errors[0].longMessage`. Picks the first non-empty candidate across `longMessage` → `message` → `Error.message` → fallback.
Files: `apps/desktop/main.js`, `apps/web/client/src/app/sign-in/_components/clerk-auth-form.tsx`
Links: n/a

## 2026-05-27 — Documentation refresh for agent context
Author: Claude Opus 4.7
Area: `docs/agent-context`, `docs/agent-memory`
Summary: Rewrote `current-progress.md`, `repo-map.md`, `data-api-architecture.md`, `agent-context/README.md`, and `packages-reference.md` to reflect the Clerk + Convex + Vercel Sandbox reality (prior copies still described Supabase + tRPC + CodeSandbox). Added a one-page `agents-onboarding.md` so fresh sessions can spin up in 5 minutes. Appended catch-up entries here for ships that landed between 2026-05-25 and 2026-05-27 (feature catalog, profile-setup, AI chat optimization scaffolding, properties clipboard, rulers tick step tests).
Files: `docs/agent-context/current-progress.md`, `docs/agent-context/repo-map.md`, `docs/agent-context/data-api-architecture.md`, `docs/agent-context/README.md`, `docs/agent-context/packages-reference.md`, `docs/agent-context/agents-onboarding.md`, `docs/agent-memory/feature-log.md`, `docs/agent-memory/architecture-decisions.md`
Links: n/a

## 2026-05-26 — Feature catalog, test plan, backlog, profile-setup layout
Author: Claude Sonnet 4.6
Area: `docs/`, `apps/web/client/src/app/profile-setup`
Summary: Landed the master `docs/feature-catalog.md` (master inventory with stable `F-XXX` IDs and tags `#editor`, `#ai`, `#public`, `#auth-gated`, `#cms`, `#billing`, `#convex`, `#deprecated`, …) and the matching `docs/test-plan.md` (per-feature `T-XXX` test matrix). Added the reusable `docs/prompts/validate-feature.md` orchestration prompt that chains `anthropic-skills:frontend-testing-debugging`, `anthropic-skills:webapp-testing`, and `superpowers:verification-before-completion` against a feature ID / tag / section / branch diff. `BACKLOG.md` consolidated and re-templated. Profile-setup layout refresh on the auth side.
Files: `docs/feature-catalog.md`, `docs/test-plan.md`, `docs/prompts/validate-feature.md`, `BACKLOG.md`, `apps/web/client/src/app/profile-setup/*`
Links: n/a

## 2026-05-26 — Tests for rulers tick step + properties clipboard
Author: Claude Sonnet 4.6
Area: `apps/web/client/src/components/store/editor`
Summary: Added unit tests for the canvas rulers tick-step calculation (Figma-style layout guides shipped 2026-05-17) and for the new properties clipboard that copies/pastes style props across a selection. Both modules previously had only happy-path coverage.
Files: `apps/web/client/src/components/store/editor/style/properties-clipboard.test.ts`, ruler tick-step tests under the canvas store
Links: commit `89fad709b`

## 2026-05-25 — AI chat optimization scaffolding
Author: Claude Sonnet 4.6
Area: `packages/ai`, `apps/web/client/src/app/api/chat`, `apps/web/client/src/app/project/[id]/_hooks/use-chat`
Summary: Landed the optimization pipeline designed in `docs/notes/2026-05-24-ai-chat-optimization-design.md`. New modules: `packages/ai/src/chat/model-router.ts` (selection rules), `request-builder.ts` (assembles streaming request), `summarizer.ts` + `summarizer-utils.ts` (long-context summarization with cache-aware truncation), `prompt/cache-blocks.ts` (Anthropic cache-block markers), `observability/index.ts` (Langfuse + PostHog event emission). The client `useChat` hook now mounts a `useSummarizer` that triggers Convex `chatActions.summarizeConversation` when token budget reaches threshold. Per-message `applyDiff`, `generateTitle`, `generateSuggestions` endpoints gate on `requireProjectCreateCap` / `requireProjectUpdateCap` to prevent cost amplification.
Files: `packages/ai/src/chat/model-router.ts` (new), `packages/ai/src/chat/request-builder.ts` (new), `packages/ai/src/chat/summarizer.ts` (new), `packages/ai/src/chat/summarizer-utils.ts` (new), `packages/ai/src/prompt/cache-blocks.ts` (new), `packages/ai/src/observability/index.ts` (new), `apps/web/client/src/app/project/[id]/_hooks/use-chat/use-summarizer.ts` (new), `apps/web/client/src/app/project/[id]/_hooks/use-chat/index.tsx`, `apps/web/client/convex/chatActions.ts`
Links: design doc `docs/notes/2026-05-24-ai-chat-optimization-design.md`


Area: `packages/code-provider`, `packages/constants`, `apps/web/client/convex`, `apps/web/client/src/components/store/editor/sandbox`, `apps/web/client/src/app/projects/import`
Summary: Two-phase removal of the dual-mode sandbox abstraction. Phase 1 (`5e8dca441`) flipped `WEBLAB_CLOUD_PROVIDER` default to `vercel_sandbox`, made `CSB_API_KEY` optional, added `scaffoldStaticHtmlProject` + framework-aware dispatch to `VercelSandboxProvider.createProject`, and rewrote `convex.projectActions.createBlank` to always provision on Vercel for `framework ∈ {'nextjs', 'static-html'}`. Phase 2 (`de3dc9269`) routed every active CodeSandbox caller away from the SDK — editor session throws `CODESANDBOX_ARCHIVED_MESSAGE` for legacy CSB-backed projects, import flows hard-fail on non-Vercel provisioning, `branchActions.createBlank` ported to Vercel, and `projectActions.fork` / `branchActions.fork` / `publishHelpers.forkBuildSandbox` throw clear errors pointing at `TODO(sandbox-fork)` / `TODO(publish-vercel)`. CodeSandbox provider files and `@codesandbox/sdk` dep retained as `@deprecated` dead code so legacy DB rows still type-check; full deletion gated on row migration. CLAUDE.md gained a "Sandbox runtime — Vercel only" section; an ADR was appended documenting the decision and follow-ups.
Files: `packages/code-provider/src/providers/vercel-sandbox/index.ts`, `packages/code-provider/src/types.ts`, `packages/code-provider/src/providers/codesandbox/index.ts`, `packages/code-provider/package.json`, `packages/constants/src/csb.ts`, `apps/web/client/src/env.ts`, `apps/web/client/.env.example`, `apps/web/client/convex/projectActions.ts`, `apps/web/client/convex/branchActions.ts`, `apps/web/client/convex/projects.ts`, `apps/web/client/convex/lib/publishHelpers.ts`, `apps/web/client/src/components/store/editor/sandbox/session.ts`, `apps/web/client/src/app/projects/import/local/_context/index.tsx`, `apps/web/client/src/app/projects/import/figma/_context/index.tsx`, `CLAUDE.md`, `docs/agent-memory/architecture-decisions.md`, `docs/notes/2026-05-13-vercel-sandbox-provider.md`
Links: ADR `docs/agent-memory/architecture-decisions.md#2026-05-24-codesandbox-archived`

## 2026-05-24 — Backend migration audit pass 3: validate remaining risks + deep edge sweep
Author: Claude Sonnet 4.6
Area: `apps/web/client/convex`, `apps/web/client/src/app/api`, `apps/web/client/src/utils/auth`
Summary: Third audit pass. Validated all "remaining risks" from pass 2 (4 false alarms / out-of-scope, 4 deferred with TODOs) and ran a deep edge-case sweep that surfaced 13 new bugs (5 CRITICAL, 5 HIGH, 3 MEDIUM). Closed CRITICAL: `upsertCanvasView` IDOR (any signed-in caller could write userCanvases rows tied to foreign canvases), `revertIncrement` farmable free-credits (user could replay rateLimitId for unlimited refunds), `uploadServerSideBlob` unlimited binary uploads, `projectActions.createBlank` workspace-viewer IDOR (could burn paid CSB quota and inject sandbox iframes), `setStripeCustomerId` subscription hijack. Closed HIGH: `tab-complete` missing projectId ownership check, `utils.scrapeUrl` SSRF (no allowlist), `applyDiff`/`generateTitle`/`generateSuggestions` unbounded LLM input cost amplification, `captureScreenshot` viewer-tier Firecrawl spend, `projectInvitations._validateAndInsert` full users-table scan (would break at 16k users). Closed MEDIUM: `_createRedeployment` missing stale TTL (stuck redeploys forever), `deleteUserCascade` missing cursors cleanup, `inline-edit` empty-projectId bypass. Added schema fields (`usageRecords.linkedRateLimitId`, `cursors.by_user` index) + three new internal cap helpers (`_requireProjectCreateCap`, `_requireProjectUpdateCap`) so every action that does paid external calls now gates uniformly BEFORE the side effect. Full audit at `docs/agent-memory/backend-migration-audit.md`.
Files: `apps/web/client/convex/users.ts`, `apps/web/client/convex/usage.ts`, `apps/web/client/convex/storageActions.ts`, `apps/web/client/convex/storage.ts`, `apps/web/client/convex/projects.ts`, `apps/web/client/convex/projectActions.ts`, `apps/web/client/convex/projectInvitations.ts`, `apps/web/client/convex/publishActionsDb.ts`, `apps/web/client/convex/utils.ts`, `apps/web/client/convex/chatActions.ts`, `apps/web/client/convex/internal/cascade.ts`, `apps/web/client/convex/schema.ts`, `apps/web/client/src/app/api/ai/tab-complete/route.ts`, `apps/web/client/src/app/api/ai/inline-edit/route.ts`, `apps/web/client/src/app/api/chat/helpers/usage.ts`, `docs/agent-memory/backend-migration-audit.md`

## 2026-05-24 — Backend migration audit pass 2: IDOR + duplicate-user race + UX
Author: Claude Sonnet 4.6
Area: `apps/web/client/convex`, `apps/web/client/src/app/project/[id]`, `apps/web/client/src/app/_components/hero`, `apps/web/client/src/app/projects`, `apps/web/client/src/utils/auth`
Summary: Second audit pass on the Clerk + Convex final cut. Closed two CRITICAL IDOR bugs (`branchActions.fork` / `createBlank` provisioned paid CSB sandboxes and wrote branches into ANY project for any signed-in caller — no `requireCap`). Closed a HIGH duplicate-user-race regression: prior pass fixed `requireUserJIT` via `.collect()+dedupe` but missed five other `.unique()` readers on `by_clerk_user_id` (`clerkWebhooks.upsertUser`/`deleteUser`, `userActionsInternal._getByClerkId`, `lib/stripeWebhook._resolveCallerUserId`, `users.getByClerkId`, `projectInvitations.resolveCaller`, `domainActionsDb`) — every one of those bricked profile sync, account delete, billing, project invitations, and domain ownership for affected users. Closed a HIGH cross-project integrity bug in `frames.update` (mirrored existing `frames.create` guard). Closed a HIGH UX bug where signed-in user on `/projects/new` was redirected to `/sign-in` (Convex `Doc<'users'>` has `_id`, not `id`; component read `user?.id`). Closed a HIGH FORBIDDEN→"session expired" miscategorization on `/project/<id>` that infinite-looped users without access through the sign-in flow. Added loud `console.error` on `clerk-bridge.ts` when Clerk's `convex` JWT template is misconfigured (prior silent null → redirect loop with no signal). Added shared `getUserByClerkIdSafe` helper in `convex/lib/permissions.ts` and a new `_requireProjectUpdateCap` internal query in `convex/branches.ts`. Full diff and remaining risks documented in `docs/agent-memory/backend-migration-audit.md`.
Files: `apps/web/client/convex/branchActions.ts`, `apps/web/client/convex/branches.ts`, `apps/web/client/convex/clerkWebhooks.ts`, `apps/web/client/convex/userActionsInternal.ts`, `apps/web/client/convex/lib/stripeWebhook.ts`, `apps/web/client/convex/lib/permissions.ts`, `apps/web/client/convex/users.ts`, `apps/web/client/convex/projectInvitations.ts`, `apps/web/client/convex/domainActionsDb.ts`, `apps/web/client/convex/frames.ts`, `apps/web/client/src/utils/auth/clerk-bridge.ts`, `apps/web/client/src/app/project/[id]/page.tsx`, `apps/web/client/src/app/project/[id]/_components/project-load-error.tsx`, `apps/web/client/src/app/project/[id]/_components/offline-editor-bootstrap.tsx`, `apps/web/client/src/app/_components/hero/create.tsx`, `apps/web/client/src/app/_components/hero/index.tsx`, `apps/web/client/src/app/_components/hero-v2.tsx`, `apps/web/client/src/app/projects/new/page.tsx`, `apps/web/client/src/app/projects/_components/select/index.tsx`, `apps/web/client/src/app/projects/_components/templates/template-modal.tsx`, `docs/agent-memory/backend-migration-audit.md`

## 2026-05-24 — Backend migration audit: Clerk + Convex hardening
Author: Claude Opus 4.7
Area: `apps/web/client/convex`, `apps/web/client/src/utils/auth`, `apps/web/client/src/utils/supabase`, `apps/web/client/src/env.ts`, `.env.example`
Summary: Audited the final Supabase → Clerk + Convex push. Closed two real bugs (unauthenticated `convex/skillActions.previewImport`; `requireUserJIT` could race with the Clerk webhook and brick reads via `.unique()`), removed a type-only `@supabase/supabase-js` leak by introducing a local `BridgedUser` interface, added warn-once telemetry on the Supabase-storage stub, and made all `SUPABASE_*` env vars optional. Updated `.env.example` to surface Clerk + Convex as the canonical setup and demote Supabase to a rollback footer. Full audit report at `docs/agent-memory/backend-migration-audit.md`.
Files: `apps/web/client/convex/skillActions.ts`, `apps/web/client/convex/lib/permissions.ts`, `apps/web/client/src/utils/auth/types.ts` (new), `apps/web/client/src/utils/auth/clerk-bridge.ts`, `apps/web/client/src/utils/auth/current-user.ts`, `apps/web/client/src/utils/supabase/client/index.ts`, `apps/web/client/src/env.ts`, `apps/web/client/.env.example`, `docs/agent-memory/backend-migration-audit.md` (new)

## 2026-05-24 — Landing-page asset restyle + light bg token shift
Author: Claude Opus 4.7
Area: `apps/web/client` landing page, `packages/ui` light theme
Summary: Restyled the three feature-trio assets (model picker, terminal, AI assistant) and side-by-side feature visuals to match new design language (light cream surfaces w/ subtle shadow + soft top gradient backdrop; dark mode mirror). Each asset now adapts to theme via `dark:` variants instead of being dark-only. Backed up originals as `*-v1.tsx`.
- Light theme `--background` token: `#ffffff` → `#f7f7f4` (warm off-white).
- `FeatureBackdrop`: gradient cream wash on light, kept blurred image + dark veil on dark.
- Inline visuals (Components, Tokens/Brand, History/Revision, Structure/Layers) swapped `bg-background-secondary/80 backdrop-blur-sm` → explicit `bg-white dark:bg-[#1C1C1D]` w/ soft shadow.
- Trio assets: rewritten to mirror Figma — Mac-style window chrome, dropdown anchored under composer, AI-chat layout with thought/tool-call sequence.
Files: `apps/web/client/src/app/_components/landing-page/feature-trio-section.tsx`, `…/feature-backdrop.tsx`, `…/what-can-weblab-do-section-v2.tsx`, `packages/ui/src/globals.css`

## 2026-05-23 — Component system pass: button rewrite, switch/slider/menu/tabs polish
Author: Claude Sonnet 4.6
Area: `packages/ui` components, `apps/web/client/src/components/ui`, `style-tab-v4`, design-system demos
Summary: Comprehensive component-level alignment pass on top of the dark-token rewrite.
- **Button**: dropped pill shape (`rounded-full`), now `rounded-sm` (8px), `h-7` default + sm, 10px horizontal padding, `text-mini` (12px). New variants: `destructive` (bg `#321F20` + text `#FF595D`, no border), `muted` (bg `#242424` + text `#DEDEDE`), `ghost` (text `#717171` resting). Outline uses `--border-secondary` so the line is visible. Same treatment applied to local `apps/web/client/src/components/ui/button.tsx` (still used by 13 pricing/marketing call sites).
- **Switch**: `bg-foreground-brand` (#458ef7) when checked, `bg-background-tertiary` unchecked. Removed hardcoded green `rgb(52,199,89)`.
- **Slider**: shrunk track to 1px, brand-tinted range fill, thumb gets a proper drop shadow + hover scale + brand-tinted focus ring (no longer flat/harsh).
- **Dropdown/Popover/Menubar/ContextMenu/HoverCard/Select**: all swapped `border-foreground/8` (invisible) → `border-border-popover` (#2d2d2d). Items unified at `rounded-sm px-2.5 py-1.5 text-mini`. Added `duration-200 ease-out` (open) / `duration-150 ease-in` (close) for smoother enter/leave.
- **NavigationMenu**: trigger now `h-7 px-2.5 text-mini` to match dropdown/menubar item density (was `h-9 px-4 text-sm` — too tall + too wide).
- **Tabs**: added sliding active-rect indicator via `motion.span layoutId` (per-Tabs-instance scope), so the active background morphs between triggers instead of instant swap. Uses spring 380/32 for smooth glide.
- **Reasoning effort demo** (chat.tsx): pill row was full-width grid with oversized buttons; now `inline-flex w-fit` + `h-6 px-2 rounded-xs`.
- **Editor canvas tokens** (dark): `--background-canvas/chrome/bar/tab-strip/tab-active` pulled into new ladder (canvas=card #1d1d1d, chrome+bar=app #181818, tab-strip=secondary #222, tab-active=accent #2e2e2e).
- **style-tab-v4 controls** (13 files): dropped 27 hardcoded `dark:bg-[#262626]`/`dark:hover:bg-[#2F2F2F]`/`dark:bg-[#3A3A3A]` overrides; semantic tokens (`bg-background-secondary` / `hover:bg-background-tertiary` / `bg-background-active`) now drive both modes.
- **v3 chip controls left alone** per owner instruction (v4 is now the default — `NEXT_PUBLIC_STYLE_PANEL_V4` env default flipped to `true`).
- **Purple-skill swap** (4 files): branch-management, layer tree, draft-context-pill, verify-project switched from `purple-*` palette → `text-foreground-skill`.
- **Status palette swap** (8 files): `red-*` → `destructive`, `amber-*` → `foreground-warning`, `emerald-*` → `foreground-success` across hero/auth/project-row/context-menu/delete/mic-button.
- **components/ui audit**: `select.tsx`, `table.tsx`, `label.tsx` confirmed dead (0 imports) — flagged for delete (rm blocked by sandbox; owner can `rm` manually). `button.tsx`, `card.tsx`, `avatar.tsx`, `alert.tsx`, `badge.tsx` tokenized to use semantic tokens instead of raw slate/red.
- **Radius audit**: `rounded-[4px]` → `rounded-xs`, `rounded-[8px]` → `rounded-sm` across 21 files. `rounded-[10px]` kept (v4 spec). `rounded-[6px]` / large arbitrary values left for design call.
- **Light-mode contrast analysis** (no fixes — analysis only per instruction): hierarchy collapsed (secondary ~`#6c6c6c` and tertiary ~`#7d7d7d` only 13 luminance apart vs dark's 78→32→53 hierarchy); border invisible (matches `--background-tertiary`); card/popover/modal all `#fafafa` — no elevation; status colors still blue-aliased (dark un-aliased); sidebar collapsed with card; ring still gray. Light needs its own full pass.
Files: `packages/ui/src/components/{button,switch,slider,tabs,dropdown-menu,popover,menubar,context-menu,hover-card,select,navigation-menu}.tsx`, `apps/web/client/src/components/ui/{button,card,avatar,alert,badge}.tsx`, `apps/web/client/src/env.ts`, 13 style-tab-v4 control files, ~21 radius-normalized files, `apps/web/client/src/app/design-system/_components/demos/chat.tsx`
Links: prior dark token entry below

---

## 2026-05-23 — Dark theme rewrite to Codex-aligned palette + new semantic tokens
Author: Claude Sonnet 4.6
Area: `packages/ui` design tokens, `apps/web/client/src/styles` and `design-system` page
Summary: Rewrote `.dark` block in `packages/ui/src/globals.css` to use Codex-exact dark palette (bg `#181818`, card `#1d1d1d`, modal `#212121`, popover `#222222`, sidebar `#161616`, accent `#458ef7`, ring `#458ef7`). Added 25+ new semantic tokens: `--modal`, `--background-modal/popover/tooltip-hover`, `--background-sidebar/sidebar-active/chat-input/selected/diff-added/diff-removed`, `--foreground-placeholder/tooltip/diff-added/diff-removed/skill/code-orange/code-purple`, `--border-card/input/search/secondary/popover`. Un-aliased status colors so success=`#6fc57e` real green, warning=`#ec8c55` real orange, destructive=`#e35446` real red (previously all blue-aliased). Switched headings to `font-weight: 500` with tighter tracking. Switched font cascade to system-first (`-apple-system, BlinkMacSystemFont, 'SF Pro Text', var(--font-inter), 'Segoe UI', system-ui`) so Mac users get SF Pro automatically; Inter remains cross-platform fallback. Fixed `ColorSwatch` to read live computed CSS values via `getComputedStyle` + `MutationObserver` instead of stale static HSL strings from `data.ts` (root cause of "all colors look the same" bug in `/design-system`). Light-mode stubs added for the new tokens; full light pass deferred.
Files: `packages/ui/src/globals.css`, `apps/web/client/src/styles/globals.css`, `apps/web/client/src/app/design-system/_components/demos/color-swatch.tsx`, `apps/web/client/src/app/design-system/_components/demos/data.ts`
Links: n/a (internal design system pass)

---

## 2026-05-22 — Core flow QA fixes for login, editor boot, and sandbox preview
Author: Codex (agent)
Area: `apps/web/client` auth/editor flows, `packages/code-provider` Vercel Sandbox
Summary: Real-browser QA covered dev login, signed-out project routing, blank project creation, editor boot, and preview iframes. Fixed the dev magic-link login path so it establishes a Supabase session directly, redirected signed-out `/projects` before protected tRPC calls, moved Node-only crash handlers out of Edge instrumentation, stopped MobX from wrapping the history debounced persister, made presence channel setup idempotent before subscribe, ensured blank projects include Weblab interaction runtime files, and prevented duplicate Next dev servers in Vercel Sandbox previews.
Files: `apps/web/client/src/app/login/actions.tsx`, `apps/web/client/src/app/auth/auth-context.tsx`, `apps/web/client/src/app/projects/page.tsx`, `apps/web/client/src/instrumentation.ts`, `apps/web/client/src/instrumentation-crash-handlers.server.ts`, `apps/web/client/src/components/store/editor/{history,interactions,presence}/index.ts`, `packages/code-provider/src/providers/vercel-sandbox/index.ts`
Links: n/a (internal QA)

---

## 2026-05-20 — Harden Railway client service against silent crashes
Author: Claude Sonnet 4.7
Area: `apps/web/client` (deploy/instrumentation), Railway service config
Summary: Production apex `weblab.build` started returning Cloudflare 502s after the Railway container died silently (no logs, no stack trace) and Railway exhausted its 10-retry restart budget. Added stdout crash handlers (`unhandledRejection`/`uncaughtException`/`SIGTERM`) in `instrumentation.ts` so the next silent crash leaves a fingerprint, bumped `restartPolicyMaxRetries` 10 → 50 across all three Railway services, and set `NODE_OPTIONS=--max-old-space-size=2048` on the client service so heap exhaustion throws a catchable JS exception instead of a kernel SIGKILL.
Files: `apps/web/client/src/instrumentation.ts`, `railway.toml`, `docs/railway.toml`, `apps/docs/railway.toml`
Links: `docs/agent-memory/architecture-decisions.md` (2026-05-20 entry)

---

## 2026-05-17 — Interactions system, multi-provider hosting, brand tokens, page settings
Author: Claude Sonnet 4.6
Area: `packages/models/interactions`, `packages/parser`, `apps/web/preload/ix-runtime`, editor interactions store, hosting provider adapters, brand-tab, page-settings-drawer
Summary: Eight feature + bugfix commits shipped in one session after a comprehensive bug-hunt review.
New: animation interactions system (InteractionsManager, ix-runtime preload bundle, timeline editor UI); multi-provider hosting with Vercel/Netlify/Cloudflare/Railway/Render adapters and redesigned publish dropdown; brand token editor with groups/variable tokens/text styles; page settings drawer with schema markup parser injection.
Bug fixes: duplicatePage same-path overwrite, session.task null crash, resumeSyncInit double-call, EditorState.clear() missing tab resets, refetch() void→Promise, promisifyMethod error swallowed, deployment relation name collision, project role NaN sort, URL() constructor crash in site settings, dead code in domain verify helpers.
Files: 8 commits, ~260 files changed, 12,800+ insertions
Links: commits f1fb6953a..bfa1f928e

---

## 2026-05-14 — Assets panel (Webflow-style rework of the Images tab)
Author: Claude Opus 4.7
Area: `apps/web/client` — editor left panel; `@weblab/utility`, `@weblab/constants`
Summary: Renamed the editor's "Images" tab to "Assets" and reworked it end to end.
It now accepts any file type (PDFs, fonts, docs), classifies files via a new
`getAssetType` helper, and shows type-aware cards. Breadcrumb drilldown was
replaced with a Webflow-style browser: a persistent type-filter + folder-tree
sidebar when the panel is wide (`@container` query, ≥380px) and a dropdown when
narrow. Added a designed drop zone, right-click context menus + a shared
`AssetActions` set, copy-URL, folder creation, move-to-folder (reuses the JSX
image-reference updater), in-place raster compression with an undo toast,
sorting, and multi-select with bulk move/compress/delete.
Files:
  `apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/asset-tab/*` (renamed from `image-tab/`, ~16 files),
  `apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/index.tsx`,
  `packages/utility/src/file.ts` (`getAssetType`),
  `packages/constants/src/files.ts` (font/document extension groups),
  `apps/web/client/messages/*.json` (tab label)
Links: changelog `v1-9-assets-panel`
Note: 3 obsolete files (`breadcrumb-navigation.tsx`, `folder-list.tsx`,
`hooks/use-navigation.tsx`) are unreferenced and pending manual deletion — `rm`
was blocked in the agent environment.

---

## 2026-05-14 — Persistent cross-session undo/redo history
Author: Claude Sonnet 4.6
Area: `apps/web/client` — editor history, action manager, branch manager
Summary: Editor undo/redo stacks now persist to IndexedDB (localforage) keyed by
branch id. History survives page reload and cross-session. On editor boot,
`BranchManager.init()` hydrates each branch's `HistoryManager` from storage after
codeEditor + sandbox are ready. Actions are capped at 100 undo / 50 redo entries
on disk. Fixed async race: `undo()` and `redo()` now properly `await commitTransaction()`
before mutating stacks. Header undo/redo buttons now visible at md+ breakpoint
(was lg+).
Files:
  `apps/web/client/src/components/store/editor/history/storage.ts` (new),
  `apps/web/client/src/components/store/editor/history/index.ts`,
  `apps/web/client/src/components/store/editor/action/index.ts`,
  `apps/web/client/src/components/store/editor/branch/manager.ts`,
  `apps/web/client/src/utils/constants/index.ts`,
  `apps/web/client/src/app/project/[id]/_components/top-bar/index.tsx`

---

## 2026-05-13 — Staged Vercel Sandbox runtime provider
Author: Codex
Area: `@weblab/code-provider`, project sandbox runtime
Summary: Added Vercel Sandbox as a second cloud runtime behind
`WEBLAB_CLOUD_PROVIDER`, with branch-level provider metadata and CodeSandbox as
the default rollback path. Vercel editor calls use server-side tRPC proxies,
new Vercel sandboxes snapshot after setup, and unsupported v1 flows keep using
CodeSandbox instead of silently changing framework behavior.
Files: `packages/code-provider/src/providers/vercel-sandbox/index.ts`,
`apps/web/client/src/server/api/routers/project/sandbox.ts`,
`apps/web/client/src/components/store/editor/sandbox/vercel-browser-provider.ts`,
`docs/notes/2026-05-13-vercel-sandbox-provider.md`
Links: `docs/notes/2026-05-13-vercel-sandbox-provider.md`

## 2026-05-13 — Style Panel v3 — UX polish round 3 (5-agent team)
Author: Claude (impeccable + ux-polish + ui-ux-pro-max) + 5 subagents
Area: apps/web/client/src/app/project/[id]/_components/right-panel
Summary: Third polish round from user UX review. Focus rings now
keyboard-only (`FIELD_BASE_CLASSES` switched `focus-within:` →
`has-[:focus-visible]:`; forked select-field/text-field/icon-toggle-field
into v3). Segmented controls got a clear two-tier active state — STRONG
raised pill when the value is an explicit override, QUIET neutral fill
when it's the inherited/computed default; `isSet?` prop threaded from
sections through SegmentedDisplay / IconToggleField / GrowRow /
OverflowRow. Panel horizontal overflow fixed — v3 root `<div>` was a
flex item without `min-w-0`; added `w-full min-w-0 overflow-x-hidden`
through the root→header→ScrollArea chain. TrblGrid per-side mode
redesigned to 4 discrete bordered inputs (was one merged pill) that
shrink to fit at min panel width. Styles tab active-state bug fixed —
`TooltipTrigger` was clobbering Tabs' `data-state`; tab now only
tooltip-wrapped in CODE mode. Alt-click on a property label now resets
the value AND clears the per-element override flag. `useStyleValue`
forked into v3 with robust `isSet` detection — root cause was a
camelCase (`computed`) vs kebab-case (`defined`) key mismatch + missing
shorthand resolution, so the override dot only lit for some props. New
`useStyleBatchSetter` (`setMultiple`) routes multi-property writes
(padding/margin/grow) through `StyleManager.updateMultiple` as ONE undo
entry — fixes panel-side history fragmentation. Persistent cross-session
history flagged as a separate core-engine effort (not done).
Files: style-tab-v3/controls/{constants,select-field,text-field,
icon-toggle-field,segmented-display,number-field,chip-input,shadow-field,
grow-overflow-row,trbl-grid,property-control,property-label,index}.ts(x),
style-tab-v3/hooks/{use-style-value,use-style-setter}.ts,
style-tab-v3/sections/{layout,size,text,styles}.tsx, style-tab-v3/index.tsx,
right-panel/index.tsx

## 2026-05-13 — Style Panel v3 — UX polish round 2 (4-agent team)
Author: Claude (impeccable + ux-polish + ui-ux-pro-max) + 4 subagents
Area: apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v3
Summary: Second polish round from user UX review. `TrblGrid` redesigned to
the Figma padding control — 2-button mode switcher (Square = all-sides /
SquareDashed = per-side) + a single connected 4-cell pill with T/R/B/L
labels. `SegmentedDisplay` collapses to icon-only via `@container`
queries when the panel is narrow. `display: none` added to the Display
control; Display icons relogicked (Flex → StretchHorizontal, Grid →
LayoutGrid, Block → Square, None → EyeOff). `GrowOverflowRow` split into
separate `GrowRow` + `OverflowRow` — fixes the overflow/alignment bug;
each renders as its own labeled Size row. New `PropertySearch` at the
panel top — fuzzy search over a ~65-entry property registry, scrolls to
+ opens the target section via `[data-style-property]`. Margin moved out
of Advanced into Layout (directly below Padding). Transitions extracted
from Advanced into its own section, placed after Effects. New Content row
in Text — real text-content write via `frameView.editText` + history push.
Verified all required selectors present + inherited/computed values show
as the active selection across value-bearing controls.
Files: style-tab-v3/controls/{trbl-grid,segmented-display,grow-overflow-row,
property-search,index}.ts(x), style-tab-v3/sections/{layout,size,text,
advanced,transitions}.tsx, style-tab-v3/index.tsx

## 2026-05-13 — Style Panel v3 — UX polish pass (4-agent team)
Author: Claude (impeccable + ux-polish + ui-ux-pro-max) + 4 subagents
Area: apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v3
Summary: Polish round on v3 driven by user UX review. Forked `PropertyLabel`,
`PropertyControl`, `constants.ts` into v3 (no longer re-exports of v2):
blue "is set" dot now renders ONLY when set — no gray dot when unset; unset
labels lifted to ~85% visibility; dark-mode field contrast raised (lighter
fill + visible hairline border). `CustomExpander` tinted-card background
removed — expanded rows sit flush in the column. Section header dot only
renders when populated. New `NumberField` replaces the shared
`@weblab/ui/number-input` across all v3 sections — drops the scrub-drag
`cursor-ew-resize` affordance the user disliked; static `cursor-pointer`
unit pill instead. New `ShadowField` — Figma-style `box-shadow` editor
(color swatch + hex + opacity, X/Y/Blur/Spread rows with −/+ steppers),
wired into Effects. Row alignment audited across all sections; `cursor-pointer`
added to clickable affordances; section-level dark-bg overrides removed so
the raised-contrast field tokens win.
Files: style-tab-v3/controls/{constants,property-label,property-control,
custom-expander,number-field,shadow-field,index}.ts(x),
style-tab-v3/sections/*.tsx, style-tab-v3/controls/{trbl-grid,grow-overflow-row}.tsx

## 2026-05-13 — Style Panel v3 (Figma-driven redesign, env-flagged)
Author: Claude (figma-use + impeccable + ux-polish)
Area: apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v3
Summary: Built a successor to `style-tab-v2` matching the Figma design at
`figma.com/design/Jq0i0XECT9DPqfUdIEl5MY?node-id=202-8418`. New section
order (Element → Position → Layout → Size → Styles → Text → Effects →
Overlays → Cursor → Transforms → Advanced) with a hybrid named-style + Custom
expander model on Text and Effects. v2 stays as the default; v3 ships
behind `NEXT_PUBLIC_STYLE_PANEL_V3` (defaults `false`) — module-scope
dynamic import in `right-panel/index.tsx` swaps which panel renders.
Reuses v2's `StyleManager` pipeline, `useStyleValue` / `useStyleSetter`
hooks, and every shared control via a controls/ barrel re-export, so
undo/redo + AST sync + write-target prefs work unchanged. Seven new
primitives in `style-tab-v3/controls/`: ChipInput, StyleChipPicker,
TrblGrid, SegmentedDisplay, AlignmentToolbar, GrowOverflowRow,
CustomExpander. Mounted in the design-system page under a new
"Style panel v3" group. v2 source frozen at
`docs/archive/style-tab-v2-snapshot/`; full property catalog at
`docs/agent-context/style-panel-v2-inventory.md`.
Files: apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v3/**,
apps/web/client/src/app/project/[id]/_components/right-panel/index.tsx,
apps/web/client/src/env.ts,
apps/web/client/src/app/design-system/page.tsx,
apps/web/client/src/app/design-system/_components/demos/style-panel-v3.tsx,
docs/agent-context/style-panel-v2-inventory.md,
docs/archive/style-tab-v2-snapshot/**
Links: docs/agent-context/style-panel-v2-inventory.md

## 2026-05-11 — Performance + production-readiness audit
Author: Claude (performance audit)
Area: apps/web/client (landing + editor + tRPC + providers)
Summary: Closed real-prod issues across landing and editor: gated
anonymous-reachable `user.get` / `user.settings.get` / `provider.connectionsList`
calls behind a Supabase auth-cookie heuristic; extracted `parseRepoUrl`
so the `@weblab/parser` bundle no longer leaks into the landing chunk;
added `loading.tsx` + `error.tsx` for `/project/[id]` and a root
`error.tsx`; lazy-loaded editor modals (settings, subscription,
keyboard shortcuts, command/file palettes, project search, CMS dialogs);
disabled React Query `refetchOnWindowFocus`; closed a cross-project
access gap on `userCanvas.get` / `getWithFrames` / `update`; capped
unbounded `comment.list` and `chat.conversation.getAll`. Surfaced the
silent-failure path on `userCanvas.update` instead of swallowing errors.
Files: see `docs/agent-memory/performance-audit.md` for the full list.
Links: docs/agent-memory/performance-audit.md

## 2026-05-11 — Weblab App Figma component library (extracted from code)
Author: Claude (figma-use)
Area: design-system / Figma
Summary: Built a Figma file mirroring the live app component surface from
`packages/ui` and `apps/web/client/src/**`. Foundations are token-bound
(Color collection with Light + Dark modes, Radius, Spacing collections,
text styles, effect styles). All component sets use Figma variants with
`Variant=` / `Size=` / `State=` properties and reference variables —
swap modes at any frame to flip light/dark. Token values pulled from
`packages/ui/src/globals.css`; Tailwind config + button CVA were the
ground truth for type ramps and button heights/radii.
Categories created:
  Foundations · Core UI · Navigation · Feedback + Overlays · Dashboard
  · Editor · AI Chat · Settings + Auth · QA Notes
Counts: 1 file · 10 pages · 3 variable collections (66 color + 8 radius
+ 14 spacing) · 14 text styles · 5 effect styles · ~200 component
variants across 35 component sets, plus 6 example compositions.
Key token decisions:
  - Status semantic tokens (`background-success/warning`,
    `foreground-success/warning`) are kept aliased to blue to match
    today's `globals.css`. Flagged in QA notes as a decision point.
  - Editor canvas surfaces (`bg/canvas`, `bg/chrome`, `bg/bar`,
    `bg/bar-active`, `bg/tab-strip`, `bg/tab-active`) modeled
    explicitly so Editor mockups can use them directly.
  - Radius scale uses xs/sm/md/lg/xl/2xl/3xl/full anchored to
    `--radius = 1rem`.
Missing / deferred (full list on the QA Notes page in Figma):
  - Calendar, color-picker, motion-card, shimmer skeleton animations
  - Streamdown markdown formatting inside AI messages
  - Real icons (placeholders used — swap when wiring Code Connect)
  - Real green/amber palette (currently aliased to blue)
Recommended follow-ups (also captured in QA Notes):
  1. Rename `foreground-quadranary` → `foreground-quaternary`.
  2. Resolve green/amber aliasing in `globals.css`.
  3. Unify the two `alert.tsx` files (`packages/ui` vs `apps/web/client`).
  4. Reconcile `editor-bar/toolbar-button.tsx` with `Button` `toolbar` size.
  5. Migrate landing-page inline color overrides to tokens.
Files: Figma file `Weblab App — Component Library`
  (key `FrhrPDEJ2BAJS6q6oEVRdJ`,
   https://www.figma.com/design/FrhrPDEJ2BAJS6q6oEVRdJ)
Links: source tokens — `apps/web/client/src/styles/globals.css`,
  `packages/ui/src/globals.css`, `packages/ui/tailwind.config.ts`,
  `packages/ui/src/components/button.tsx`

---

## 2026-05-09 — Editor selection state persistence (frame, breakpoint, element)

Author: Claude (agent)
Area: `apps/web/client` — project editor (`src/app/project/[id]/_hooks`, `src/services/editor`)

Summary: Reloading the editor previously dropped the user's selection state (which frame was active, which breakpoint, which element was selected). Now persisted per-project to `localStorage` and restored on `isProjectReady`. Frame restored via `frames.select`; breakpoint applied after so explicit switches win; element restore polls `view.getElementByOid(oid, false)` until the iframe view is ready or a 5s deadline elapses, then gives up silently. Re-persistence runs through MobX `reaction`s with a single debounced flush — concurrent updates merge into one `pendingPatch` to avoid the lost-write race that an ad-hoc `setTimeout` per reaction would create. Restore is keyed by `projectId` (not a boolean ref), so navigating project → project re-arms cleanly. In-flight async element lookups check a `cancelled` flag before mutating editor state to prevent post-unmount `click` calls.

Files:
- `apps/web/client/src/services/editor/state-persistence.ts` (existed; unchanged contract)
- `apps/web/client/src/services/editor/state-persistence.test.ts` (new — 13 tests, `bun:test`)
- `apps/web/client/src/app/project/[id]/_hooks/use-editor-state-persistence.tsx` (new)
- `apps/web/client/src/app/project/[id]/_components/main.tsx` (wired hook)
- `apps/web/client/src/lib/changelog-entries.ts` (v1.6 entry)
- `apps/web/client/src/server/api/routers/user/user.ts` (cleaned typecheck/lint blockers in dirty tree: `avatarUrl` `string | null` coercion, dropped wrong `await` on void `trackEvent`, narrowed `user_metadata` cast to drop `any` chain)

Validation: `bun typecheck` green, `bun x eslint --max-warnings 0` clean for touched files, `bun test src/services/editor/state-persistence.test.ts` 13/13 pass.

Caveat: clicking the restored element triggers BreakpointsManager's auto-flip to that frame's breakpoint, overriding any explicitly-saved breakpoint when both apply. Treated as acceptable — the element is the more specific signal.

Links:
- Changelog: v1.6 in `changelog-entries.ts`

---

## 2026-05-09 — Product explainer video: planning + HyperFrames implementation

Author: Claude (agent)
Area: `apps/web/product-video/` (new), `docs/`

Summary: Planned and implemented the homepage product explainer. Plan doc covers positioning, format, five storyboards, asset plan, and HyperFrames implementation strategy (`docs/product/product-video-plan.md`). Built the chosen storyboard A — "From prompt to polished site" — as a deterministic HyperFrames composition: 75s, 1920×1080, 10 scene sub-comps + captions overlay, brand-faithful product UI recreations using real Weblab tokens (`#131314` bg, `#3d8bfd` accent, Inter, 16px radius). Renders byte-deterministically to a 2.6 MB MP4 via `npx hyperframes render`. Voiceover not generated (no ElevenLabs key in env) — script in `voiceover-script.md`, captions ship without audio. Lint passes 0-error; 210 cosmetic selector warnings + 250 small-label contrast warnings documented as known limitations. Real screen recordings deferred — substituted with stylized HTML/CSS recreations per plan §6.

Files:
- `docs/product/product-video-plan.md`
- `docs/product/product-video-implementation-notes.md`
- `apps/web/product-video/index.html`
- `apps/web/product-video/design.md`
- `apps/web/product-video/voiceover-script.md`
- `apps/web/product-video/compositions/scene-{01..10}-*.html`
- `apps/web/product-video/compositions/captions.html`
- `apps/web/product-video/assets/brand/{logo,symbol,wordmark}.svg`
- `apps/web/product-video/out/weblab-explainer-v1.mp4`

Links: render path `apps/web/product-video/out/weblab-explainer-v1.mp4`

---

## 2026-05-09 — Production QA audit: security hardening + UX fixes

Author: Claude (agent)
Area: `apps/web/client` (chat API, chat input, canvas, invitation router), `packages/ai`, `packages/penpal`

Summary: Multi-batch production QA audit. Fixed invitation router missing authorization on list/delete, token leakage on get (stripped for non-invitees), role escalation guard on invite. Added SSRF guard on CMS adapter URLs via DNS resolution + IP blocklist. Fixed abort signal not being forwarded to `streamText` (wasted GPU tokens on cancelled requests). Fixed stop button hidden when input has content. Fixed canvas wheel handler not bypassing contenteditable elements. Fixed Penpal `PromisifiedPendpalChildMethods` type double-wrapping via `Awaited<ReturnType<...>>`. Fixed `setCmsSelectedCollectionId` compare-before-assign logic bug.

Files:
- `apps/web/client/src/server/api/routers/project/invitation.ts`
- `apps/web/client/src/server/api/routers/cms/adapters/index.ts`
- `apps/web/client/src/app/api/chat/route.ts`
- `apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-input/index.tsx`
- `apps/web/client/src/app/project/[id]/_components/canvas/index.tsx`
- `apps/web/client/src/components/store/editor/state/index.ts`
- `packages/ai/src/agents/root.ts`
- `packages/penpal/src/child.ts`

---

## 2026-05-09 — Semantic status tokens (success / warning) + chrome de-hardcoding

Author: Claude (agent)
Area: `packages/ui` design tokens, project editor chrome (left/right panel,
canvas overlay), callback pages, project list cards, marketing landing
mockups.

Summary: Added eight CSS variables — `--foreground-success`,
`--background-success`, `--background-success-secondary`, `--border-success`
plus the `*-warning` quartet — to `packages/ui/src/globals.css` (light + dark)
and exposed Tailwind utilities (`text-foreground-success`,
`bg-background-success[/-secondary]`, `border-success`, etc.) in
`packages/ui/tailwind.config.ts`. Default values alias to the blue palette
because `packages/ui/tokens.ts` already maps green/yellow/teal/amber → blue;
this preserves today's render while giving us a single switch to flip the
entire app's status colors. Then refactored ~30 chrome surfaces from raw
Tailwind palette utilities (`text-green-500`, `bg-amber-500/10`,
`border-yellow-300`, `bg-blue-400`, `outline-teal-400`) and inline hex
literals (`#22c55e`, `#3b82f6`, `#109BFF`, `#181412`, `#1c1c1c`, `#282828`)
to tokens. Documented the new semantic group in the design-system page
(visual + usage block) and inline in `globals.css` with a header comment
covering when to use which token. To switch from blue-aliased to real
green/amber, edit only the eight lines per mode in `globals.css` — no
component code needs to change.

Files: `packages/ui/src/globals.css`, `packages/ui/tailwind.config.ts`,
`apps/web/client/src/app/design-system/page.tsx`, plus chrome refactors
across `apps/web/client/src/app/project/[id]/_components/**`,
`apps/web/client/src/app/projects/_components/select/**`,
`apps/web/client/src/app/callback/{figma,github}/**`,
`apps/web/client/src/app/_components/landing-page/**`,
`apps/web/client/src/components/ui/ai-chat-input-styles.ts`,
`packages/ui/src/components/ai-elements/{tool,web-preview}.tsx`.

---

## 2026-05-24 — Desktop auth window and sign-in drag fix

Author: Codex (agent)
Area: desktop shell, sign-in
Summary: Desktop OAuth provider redirects now open in a small Weblab-owned auth
BrowserWindow that shares the app's `persist:weblab` session, then closes when a
Weblab callback URL is reached and finishes sign-in in the main window. The
desktop sign-in screen also restores a usable top drag strip without blocking
the normal web sign-in page. Follow-up: email OTP sign-in now clears a stale
Clerk client session once and retries, fixing the false "You're already signed
in" error when the page renders signed-out but Clerk still has a leftover
session.
Files: `apps/desktop/main.js`, `apps/desktop/preload.js`,
`apps/web/client/src/app/layout.tsx`,
`apps/web/client/src/app/sign-in/[[...rest]]/sign-in-client.tsx`,
`apps/web/client/src/app/sign-in/_components/clerk-auth-form.tsx`,
`apps/desktop/RELEASES.md`.

---

## 2026-05-24 — Production security release-blocker remediation

Author: Codex (agent)
Area: dependencies, AI API routes, CSP, production build
Summary: Upgraded the hosted web stack to Next.js 16.2.6 / React 19.2.6,
removed an unused vulnerable AI dependency, added root dependency overrides for
patched transitive audit findings, added byte/count payload caps to chat,
inline-edit, and tab-complete, replaced internal AI route errors with stable
public responses, removed `unsafe-eval` from production CSP, and fixed the
Next.js 16.2 production build regression caused by browser-visible `@weblab/git`
type imports.
Validation: `bun audit --audit-level=moderate`, `bun typecheck`, and
`bun --filter @weblab/web-client build` pass. `bun --filter @weblab/web-client
lint` exits successfully with existing warnings. Repository-wide `bun lint`
still fails on unrelated package lint debt/project-service config.
Files: `package.json`, `bun.lock`, `apps/web/client/package.json`,
`apps/docs/package.json`, `packages/email/package.json`,
`packages/ai/package.json`, `apps/web/client/next.config.ts`,
`apps/web/client/src/app/api/chat/**`,
`apps/web/client/src/app/api/ai/**`,
`apps/web/client/src/components/store/editor/git/git.ts`,
`apps/web/client/src/components/ui/settings-modal/versions/version-row.tsx`,
`docs/security/production-readiness-security-review-2026-05-24.md`.

---

## 2026-05-14 — Faster project creation, editor open, and imports

Author: Codex (agent)
Area: project creation/open/import flows
Summary: Blank project creation now uses a single server-side `project.createBlank`
mutation that forks the template, creates all project rows, and cleans up the
orphan sandbox if DB creation fails. `/project/[id]` now uses a consolidated
`project.getEditorBootstrap` payload for project, branches, canvas/frames,
conversations, and pending create requests; existing projects render the editor
chrome immediately while sandbox/canvas/chat finish inside the canvas. Local,
GitHub, and Figma import finalizing states now show explicit phases, and local
/ Figma file uploads use bounded parallel writes instead of fully serial writes.
Files: `apps/web/client/src/server/api/routers/project/project.ts`,
`apps/web/client/src/hooks/use-create-blank-project.ts`,
`apps/web/client/src/hooks/use-import-local-project.ts`,
`apps/web/client/src/app/project/[id]/**`,
`apps/web/client/src/app/projects/import/**`,
`apps/web/client/src/components/project-creation-loader.tsx`.

---

## 2026-05-09 — Documentation overhaul + agent memory system

Author: Claude (agent)
Area: `docs/agent-context/`, `docs/agent-memory/`, `CLAUDE.md`, `AGENTS.md`
Summary: Audited existing docs, fixed stale package count and router list,
added five new sub-docs (`packages-reference.md`, `trpc-routers-reference.md`,
`routes-reference.md`, `ai-chat-architecture.md`, `cms-architecture.md`,
`breakpoints-architecture.md`), and introduced the `docs/agent-memory/` folder
(`user-preferences.md`, `feature-log.md`, `architecture-decisions.md`) so
agents have persistent, repo-scoped context without bloating the rulebook
files.
Files:
- `docs/agent-context/README.md` (updated index)
- `docs/agent-context/repo-map.md`, `current-progress.md`, `editor-architecture.md`, `data-api-architecture.md` (refreshed)
- `docs/agent-context/packages-reference.md` (new)
- `docs/agent-context/trpc-routers-reference.md` (new)
- `docs/agent-context/routes-reference.md` (new)
- `docs/agent-context/ai-chat-architecture.md` (new)
- `docs/agent-context/cms-architecture.md` (new)
- `docs/agent-context/breakpoints-architecture.md` (new)
- `docs/agent-memory/*` (new folder)
- `CLAUDE.md`, `AGENTS.md` (added memory + read-protocol sections)
Links: n/a (internal docs)

---

## Pre-2026-05-09 — Historical context (not exhaustive)

This log started 2026-05-09; older work is partially recoverable from:

- `apps/web/client/src/lib/changelog-entries.ts` — public changelog
- `docs/*.md` (timestamped working notes)
- Git log

Highlights from `changelog-entries.ts`:

- **2026-05-01 — v1.5 AI Component Generation** — natural-language → typed,
  styled, inserted components.
- **2026-04-01 — v1.4 GitHub Sync** — auto-commit + pull from in-editor.
- **2026-03-01 — v1.3 Component Library** — sidebar shadcn / Radix browser.
- **2026-02-01 — v1.2 Live Collaboration** — multi-user real-time editing.
- **2026-01-01 — v1.1 Weblab Launch** — public release.

Notable in-flight work as of this log's creation (see
`docs/agent-context/current-progress.md`):

- TipTap rich-text AI chat composer with `@`/`/` commands
- CMS workspace
- Responsive frame breakpoints (migration `0029_frame_breakpoints.sql`)
- Framework auto-detection in project creation
- Local CLI bridge for desktop AI providers
- Marketing/SEO expansion (blog redesign, comparison pages, structured data)

---
