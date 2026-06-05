# Current Progress Snapshot

Last updated: 2026-06-05.

> **TL;DR for fresh sessions:** Weblab is on Clerk + Convex (not Supabase + tRPC) and
> Vercel Sandbox (not CodeSandbox). Read [`agents-onboarding.md`](./agents-onboarding.md) for the
> 5-minute "everything you need" digest before planning work.

## Product Direction

Weblab is an open-source visual-first AI code editor. Users describe an app
(or import one), and the editor renders the running site in an iframe canvas
with element-level visual editing, chat-driven code generation, branches,
checkpoints, comments, CMS bindings, animation interactions, publishing,
multi-workspace billing, and a desktop shell. Stack target: Next.js 15
(default), Vite/React, Remix, Astro, TanStack Start, plus static HTML.

The current web product ships:

- project creation from prompt, blank frameworks, templates,
  images, Figma, GitHub clone, or local folders, with **framework auto-detection**
  via `@weblab/framework`
- visual editing on an iframe canvas with code-backed style and structure
  edits, **per-frame responsive breakpoints**, and **Figma-style layout guides
  + canvas rulers**
- AI chat for project generation/edits via a **shared TipTap composer** with
  `@` mentions, `/` slash commands, structured context pills, image attachments,
  and a unified `useChat`/`useSummarizer` pipeline
- project branches, checkpoints, comments, members, domains, publishing,
  subscription/usage plumbing, **workspaces** (multi-tenant billing), and
  **project invitations**
- **CMS workspace** for binding canvas elements to external content sources
- **Brand token editor** (color groups, variable tokens, text styles)
- **Animation interactions system** with a timeline editor
- **Page settings drawer** with schema markup parser + access controls
- **Hosting adapters** for multi-provider publish (Vercel/Cloudflare-class)
  with a redesigned publish UI
- a public marketing/docs surface (`weblab.build`, `docs.weblab.build`)
- desktop shell v0.2.0 (drag fallback, crash recovery, vibrancy)

## Backend, Runtime, Auth — current cut

| Concern | Current | Replaces |
|---|---|---|
| Auth | **Clerk** (issuer `convex` JWT template wired in `auth.config.ts`) | Supabase Auth |
| DB / API | **Convex** (`apps/web/client/convex/*` — `query`/`mutation`/`action`) | Supabase + tRPC routers |
| File / sandbox runtime | **Vercel Sandbox** (`@weblab/code-provider/providers/vercel-sandbox`) | CodeSandbox SDK |
| Hosting | **Railway** (`weblab.build` + `docs.weblab.build`) | not Vercel |
| Vestigial tRPC | only `sandbox` + `components` routers in `apps/web/server/src/router/` — used by the editor → Fastify sandbox lifecycle | rest of routers gone |
| Webhooks | Convex HTTP actions in `convex/http.ts` (Clerk users, Stripe billing) | Next.js webhook routes |

**Disabled / blocked paths until snapshot-fork or follow-up fixes land:**

- `project.fork`, `branch.fork`, `publish` — throw clear errors, tracked as
  `TODO(sandbox-fork)` / `TODO(publish-vercel)`.
- Website clone from URL provisions a project, opens the editor, and auto-runs
  the seeded clone prompt after the 2026-06-05 chat state flush fix.
- Marketplace Startd template provisions and boots locally after the 2026-06-05
  legacy Next normalization to Next 12/React 17.
- GitHub import requires a connected GitHub account; Figma import requires a
  Figma URL + personal access token; local-folder import requires a native
  directory picker.

**Working create paths verified on localhost 2026-06-05:** prompt create,
blank Next.js, blank static HTML, clone-from-URL, and Startd marketplace
creation opened editor sandboxes with preview frames; clone-from-URL returned
`/api/chat` 200 and Startd preview returned HTTP 200 directly. Production E2E
requires a live deployment of these local fixes plus a production auth session;
see `docs/agent-context/prod-e2e-testing.md`.

**Working create paths:** "Start blank" CTA (hero + dashboard) →
`api.projectActions.createBlank` → `scaffoldNextProject` /
`scaffoldStaticHtmlProject`. Vite/Remix/Astro/TanStack Start are gated upstream
in `@weblab/framework` until their scaffolders land.

## Recent Significant Ships

Newest first. Append in `docs/agent-memory/feature-log.md` for the canonical record.

- **2026-06-05** — Component registry + anti-slop design prompt (F-785), then
  extended to the **full catalog (1533)**. `component-registry/` catalogues all
  free shadcn/ui (78), shadcnblocks-free (293), Watermelon UI (964) + 198 vendored
  local pro blocks (catalog-first: install URL + description per item; vendor only
  pro + core). The builder agent is constrained to this catalog + one OKLCH palette
  via three cached prompt blocks (`<design-system>`, `<component-registry>`,
  `<anti-slop-checklist>`) in both `cache-blocks.ts` and `provider.ts`, plus an
  embedded `shadcn` skill (`read_skill`) carrying the full catalog index. Blank
  Next.js scaffolds bake the tokens into `globals.css` (on-brand pre-AI). Defaults
  to Next.js+React+shadcn, never invents colors/fonts, matches an existing
  project's stack/tokens when editing. ADR `2026-06-05`.
- **2026-05-24** — CodeSandbox archived. Vercel is sole runtime. CSB files +
  `@codesandbox/sdk` kept as `@deprecated` dead code for legacy DB rows.
  See `docs/notes/2026-05-13-vercel-sandbox-provider.md` and ADR `2026-05-24`.
- **2026-05-24** — Backend migration audit passes 1/2/3 closed CRITICAL IDORs
  (`upsertCanvasView`, `branchActions.fork/createBlank`, `setStripeCustomerId`,
  `revertIncrement` farmable refunds, `uploadServerSideBlob` unlimited binary
  upload), HIGH SSRF / cost-amplification / cross-project bugs, and 5 race
  conditions in `requireUserJIT` / clerk webhook readers. Full audit:
  `docs/agent-memory/backend-migration-audit.md`.
- **2026-05-24** — Landing-page asset restyle + light bg token shift
  (`#ffffff` → `#f7f7f4`).
- **2026-05-23** — Component system pass: button rewrite, dropdown/popover/menu
  unified, tabs animated, dark Codex palette + un-aliased status colors,
  un-blue success/warning/destructive. Light mode left with stubs.
- **2026-05-22** — Core flow QA fixes for login, editor boot, sandbox preview
  (dev magic-link, MobX history persister, presence channel idempotent,
  Vercel preview duplicate Next dev server).
- **2026-05-20** — Railway client hardened against silent crashes: stdout
  crash handlers, `restartPolicyMaxRetries 50`, `NODE_OPTIONS --max-old-space-size=2048`.
- **2026-05-16..18** — `feat(layout-guides)`: Figma-style canvas guides +
  rulers + tick step tests. `feat(brand-tokens)`: brand token editor with
  groups + variable tokens + text styles. `feat(interactions)`: animation
  timeline editor. `feat(page-settings)`: page settings drawer + schema markup
  parser + page access controls. `feat(hosting)`: multi-provider hosting
  adapters + publish UI redesign.
- **2026-05-14..15** — `feat(backend)`: Supabase → Clerk + Convex migration
  final cut. `feat(landing)`: marketing pages, design system, i18n updates.
  `feat(editor)`: editor store hardening + canvas/panel UI improvements.
- **2026-05-12..13** — `feat(desktop) v0.2.0`: drag fallback, crash recovery,
  vibrancy. `feat(auth)`: custom Clerk-powered sign-in form replacing prebuilt UI,
  Vercel OAuth, layout tightening.

## In-Flight (Visible In Worktree)

The worktree may contain unstaged work by the project owner or other agents.
Inspect each file before editing; never revert unrelated edits.

Observed active areas in `git status` and recent commits:

- **AI chat composer + summarizer pipeline** — `useSummarizer` hook + Convex
  `chatActions` summarizer pipeline, model router, cache blocks, observability.
  Files: `src/app/project/[id]/_hooks/use-chat/use-summarizer.ts`,
  `packages/ai/src/chat/summarizer.ts`, `packages/ai/src/chat/model-router.ts`,
  `packages/ai/src/chat/request-builder.ts`,
  `packages/ai/src/observability/index.ts`,
  `packages/ai/src/prompt/cache-blocks.ts`.
- **Properties clipboard** — copy/paste style props across selection.
  Files: `src/components/store/editor/style/properties-clipboard.ts` (+ tests).
- **Layout guides + canvas rulers** — see `convex/layoutGuideStyles.ts`,
  `packages/models/src/project/canvas.ts`, `packages/models/src/project/frame.ts`,
  rulers tick step tests.
- **Workspaces (multi-tenant)** — `convex/workspaces.ts`, `/w/[slug]/settings/*`
  routes (general, members, invitations).
- **CMS deep work** — `convex/cmsActions.ts`, `cmsBindings.ts`,
  `cmsCollections.ts`, `cmsCollectionPages.ts`, `cmsFields.ts`, `cmsItems.ts`,
  `cmsSources.ts`.
- **Skills (AI agent capabilities)** — `convex/skillActions.ts`, `skills.ts`,
  `packages/ai/src/skills/embedded.ts`, embedded skills manifest.
- **Page access** — `convex/pageAccess.ts`.
- **Hosting connections** — `convex/hostingConnectionActions.ts`,
  `hostingConnections.ts`.
- **Publish flow** — `convex/publishActions.ts`, `publishActionsDb.ts`,
  Vercel-aware redeployment tracking.
- **Convex schema growth** — `convex/schema.ts` is the source of truth for
  Convex tables; usage records gained `linkedRateLimitId`, cursors gained
  `by_user`.
- **Project import polish** — local-folder framework picker, verify-project
  flow, figma credentials/context, github connect.
- **Sign-in / sign-up unification** — custom Clerk form, SSO callback, verify
  page, OAuth desktop window.
- **AI prompt composer** — model picker, pull-model dialog, slash-commands
  extension, mention extension.
- **Hero v2** — landing hero refresh with create flow integration.

## Useful working notes

Start here before deep work in an area:

- `docs/notes/2026-05-13-vercel-sandbox-provider.md` — full Vercel sandbox
  design + the `TODO(sandbox-fork)` / `TODO(publish-vercel)` follow-ups
- `docs/notes/2026-05-24-ai-chat-optimization-design.md` — AI chat pipeline
  design (model router, cache blocks, summarizer, observability)
- `docs/notes/2026-05-06-project-runtime-modes.md` — `cloud` / `local` /
  planned `hybrid` mode plumbing
- `docs/notes/2026-05-06-ai-chat-input-unification.md` — single TipTap
  composer
- `docs/notes/2026-05-06-editor-project-flow-fixes.md` — project bootstrap
- `docs/notes/2026-05-06-user-settings-migration.md` — settings shape
  alignment with Drizzle (now Convex)
- `docs/notes/2026-05-07-dev-log-debug.md` — dev-log triage workflow
- `docs/notes/2026-05-03-shadcn-blocks-editor-ai.md` — shadcn blocks injection

## Safety Rules For Current Work

- The current branch is allowed to be dirty. Before editing, inspect the
  target file and the existing diff for that file.
- Never revert unrelated changes. If a file already has unrelated edits, make
  a surgical patch that preserves them.
- Do not create a new branch unless the project owner explicitly asks.
- Commit only edited repo files for your task, and only after validation
  passes.
- Global files outside this repository (e.g. `~/.codex` or `~/CLAUDE.md`)
  cannot be part of a repo commit.
- **No new tRPC routers.** Backend work goes into Convex. The
  `src/server/api/` tree on the client no longer exists.
- **No new Supabase migrations.** `apps/backend/supabase/` is a read-only
  archive of the legacy schema; current schema lives in `convex/schema.ts`.
- **Do not re-introduce `@codesandbox/sdk` calls.** Use Vercel Sandbox.

## Completion Bar

A code task is not done until:

- relevant tests / typecheck / lint / build / targeted validation has run
- migrations / config / env changes have been run **or** clearly handed off
  in a `⚠️ MANUAL STEP REQUIRED` block at the end of the response
- docs updated with durable progress or architecture context
- code review of the session's changed code has been performed
  (`/caveman-review` or the equivalent), with all blocking issues fixed
- if significant, an entry appended to `docs/agent-memory/feature-log.md`
  (and `architecture-decisions.md` if architectural)
- the catalog (`docs/feature-catalog.md`) + test plan (`docs/test-plan.md`)
  updated if a new route / module / package / webhook landed
- the final answer lists files changed, validation status, manual steps,
  and a confidence note
