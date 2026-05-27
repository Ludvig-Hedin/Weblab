# Repository Map

Weblab is a Bun workspaces monorepo. Use Bun for installs, scripts, tests, and
workspace commands. Last refreshed: 2026-05-27.

> Related references:
> - [`packages-reference.md`](./packages-reference.md) — full package catalog
> - [`routes-reference.md`](./routes-reference.md) — every Next.js route
> - [`../feature-catalog.md`](../feature-catalog.md) — master inventory of every feature, Convex module, package, and webhook (the post-Convex-migration source of truth)
> - [`trpc-routers-reference.md`](./trpc-routers-reference.md) — **stale**, retained only for history. Convex replaced almost all routers; the catalog is canonical.

## Workspace Shape

- `apps/web/client` — primary Next.js 15 App Router web client. Houses
  Convex backend (`convex/`), REST API route handlers (`src/app/api/`),
  the editor surface (`src/app/project/[id]/`), and marketing pages.
- `apps/web/server` — Fastify + tRPC websocket server (Bun runtime). Hosts
  the **vestigial** `sandbox` and `components` routers that drive the editor
  → sandbox lifecycle. Do **not** add new routers here.
- `apps/web/preload` — preload/instrumentation scripts injected into preview
  iframes (`weblab-preload-script.js`, `weblab-ix-runtime.js`).
- `apps/backend` — **read-only archive** of legacy Supabase migrations.
  Current schema lives in `convex/schema.ts`. Do not add new SQL migrations
  here.
- `apps/admin` — admin dashboard.
- `apps/desktop` — Electron desktop shell (v0.2.0). Uses `@weblab/ai-cli`
  adapters for local AI providers (Codex, Claude Code, Gemini, OpenCode,
  Cursor).
- `apps/ios` — iOS app shell.
- `apps/video` — video / promo asset workspace.
- `apps/docs` — Fumadocs Next.js documentation site published at
  `docs.weblab.build`.
- `packages/*` — 26 shared libraries scoped `@weblab/*` (see
  [`packages-reference.md`](./packages-reference.md)).
- `tooling/*` — shared ESLint, Prettier, TypeScript configuration.

> **Web-only assumption guard:** changes inside `apps/web/client` do **not**
> automatically apply to `apps/desktop` or `apps/ios`. If you change a shared
> contract or a package consumed by those apps, check them.

## High-Value Packages (quick reference)

For the full list, see [`packages-reference.md`](./packages-reference.md).

| Package | Purpose |
|---------|---------|
| `@weblab/constants` | Brand constants — always import `APP_NAME` |
| `@weblab/models` | Shared model types across app, Convex, editor |
| `@weblab/types` | Lower-level TypeScript utility types |
| `@weblab/db` | Drizzle schema + mappers (legacy; Convex schema is the live one) |
| `@weblab/auth` | Capability layer over Clerk |
| `@weblab/ui` | Radix/Tailwind primitives + shadcn |
| `@weblab/ai` | LLM SDK / OpenRouter / model router / cache blocks / summarizer / observability |
| `@weblab/ai-cli` | CLI adapters (Codex, Claude Code, Gemini, OpenCode, Cursor) |
| `@weblab/parser` | Babel JSX/TSX AST parsing + responsive class rebase |
| `@weblab/framework` | Framework adapter (Next.js, Vite, Remix, Astro, TanStack Start, static HTML) |
| `@weblab/code-provider` | Sandbox provider abstraction — **Vercel Sandbox only** in production; CSB retained as `@deprecated` |
| `@weblab/file-system` | File-system abstraction for editor providers |
| `@weblab/mcp` | Model Context Protocol server (file/bash/project tools for AI) |
| `@weblab/github` / `@weblab/figma` / `@weblab/figma-plugin` / `@weblab/git` / `@weblab/stripe` / `@weblab/email` | External integrations |
| `@weblab/penpal` / `@weblab/rpc` | Cross-frame RPC + tRPC contract types |
| `@weblab/fonts` / `@weblab/image-server` / `@weblab/growth` / `@weblab/scripts` / `@weblab/utility` | Supporting libraries |

## Web Client Layout

- `convex/` — **primary backend**. `query` / `mutation` / `action` per-domain
  module (`projects.ts`, `chatActions.ts`, `cmsBindings.ts`, …). Auth via
  `auth.config.ts` (Clerk JWT issuer). Webhooks in `http.ts`. Schema in
  `schema.ts`. Generated client + AI guidelines in `convex/_generated/`.
- `src/app` — Next.js App Router pages, layouts, route handlers, auth
  callbacks, webhooks, marketing pages, project editor, project import
  flows. See [`routes-reference.md`](./routes-reference.md).
- `src/app/api` — REST route handlers: `/api/ai/*` (chat, inline-edit,
  tab-complete), `/api/chat`, `/api/chat-images`, `/api/email-capture`,
  `/api/health`, `/api/models`, `/api/promo-resume`, `/api/transcribe`.
  Each delegates to Convex via the server client.
- `src/components/store/editor` — MobX editor engine and feature managers
  (sandbox/session, branch/manager, frames/manager, chat/conversation,
  style/properties-clipboard, …).
- `src/components/store/create` — project creation state machine.
- `src/components/store/hosting` — hosting / domain state.
- `src/components/ai-prompt-composer` — shared TipTap chat composer used on
  every AI-input surface. See [`ai-chat-architecture.md`](./ai-chat-architecture.md).
- `src/components/ui` — app-local UI components and feature modals.
- `src/utils/auth/clerk-bridge.ts` — Clerk → app `BridgedUser` adapter. Logs
  loudly if the `convex` JWT template is misconfigured.
- `src/utils/supabase/*` — **stub clients** retained as a type-only safety
  net during the Clerk/Convex migration. Functional only for legacy code
  paths; new code should not call them. Will be deleted once all callers
  are migrated.
- `src/i18n` + `messages/*` — next-intl setup and localized strings.
- `src/env.ts` — typed environment schema. Update for every new env var.
- `src/lib/changelog-entries.ts` — public changelog data
  (see `CLAUDE.md` → "Changelog & Blog").

## Convex Module Map (selected)

Full enumeration in `docs/feature-catalog.md` sections 25–26.

| Module | Responsibility |
|---|---|
| `convex/auth.config.ts` | Clerk JWT issuer config |
| `convex/http.ts` | HTTP actions (Clerk users webhook, Stripe webhook) |
| `convex/schema.ts` | Single source of truth for tables + indexes |
| `convex/projects.ts` / `projectActions.ts` | Project CRUD + create-blank action |
| `convex/branches.ts` / `branchActions.ts` | Branch CRUD + sandbox provisioning |
| `convex/frames.ts` | Editor frames (per-breakpoint preview viewports) |
| `convex/chatActions.ts` / `conversations.ts` / `messages.ts` | AI chat pipeline |
| `convex/cms*.ts` | CMS sources, collections, items, fields, bindings |
| `convex/hostingConnections.ts` / `hostingConnectionActions.ts` | Multi-provider hosting |
| `convex/domains.ts` / `domainActions.ts` / `domainActionsDb.ts` | Custom domains |
| `convex/publishActions.ts` / `publishActionsDb.ts` | Publish lifecycle |
| `convex/workspaces.ts` | Multi-tenant workspaces (billing parent) |
| `convex/users.ts` / `userActions*.ts` | User profile, settings, cascade delete |
| `convex/usage.ts` / `aiUsageEvents.ts` | Usage records, rate limits, AI event log |
| `convex/subscriptions.ts` / `subscriptionActions.ts` | Stripe subscriptions |
| `convex/skills.ts` / `skillActions.ts` | Embedded AI agent skills |
| `convex/comments.ts` / `commentReplies.ts` | In-editor comments |
| `convex/presence.ts` / `cursors` index | Live cursor presence |
| `convex/layoutGuideStyles.ts` | Figma-style layout guides per canvas |
| `convex/pageAccess.ts` | Per-page access control |
| `convex/projectInvitations*.ts` / `projectMembers.ts` | Membership + invite lifecycle |
| `convex/storage.ts` / `storageActions.ts` | Convex file storage |
| `convex/crons.ts` | Scheduled jobs (cleanup, stale redeploys) |
| `convex/lib/permissions.ts` | `requireCap` / `requireProjectCreateCap` / `requireProjectUpdateCap` gates |
| `convex/lib/stripeWebhook.ts` | Stripe webhook handler logic |
| `convex/lib/publishHelpers.ts` | Publish/build sandbox helpers |
| `convex/internal/cascade.ts` | Internal cascade-delete helpers |

## Vestigial tRPC (do not extend)

Only two routers remain, at `apps/web/server/src/router/`:

- `sandbox` — editor → Fastify sandbox lifecycle hooks
- `components` — shadcn block / component metadata

Both exist to keep the Fastify side of the editor working. **Do not add new
routers.** Anything new goes into `convex/`.

## Main Runtime Flow

1. User signs in via **Clerk**. Clerk webhook (`convex/http.ts`) upserts the
   user row in Convex. Sign-out invalidates the Clerk session; Convex
   queries get an unauthenticated identity and refuse protected reads.
2. User creates a project ("Start blank") or accepts an invitation.
   `api.projectActions.createBlank` writes the project row + initial branch
   + canvas + frame in one Convex mutation, then dispatches a Vercel Sandbox
   provisioning action. Prompt / template / GitHub imports are currently
   gated behind `TODO(sandbox-port)`.
3. The branch's sandbox runs on **Vercel Sandbox** (`@weblab/code-provider`).
   `scaffoldNextProject` (Next.js 15 + Tailwind v4 + Turbopack) or
   `scaffoldStaticHtmlProject` (single `index.html` + `serve`) provisions
   the runtime.
4. The editor embeds the running app in iframe frames (with optional
   responsive breakpoints — see [`breakpoints-architecture.md`](./breakpoints-architecture.md)).
5. The preload/frame bridge (`apps/web/preload`, `@weblab/penpal`) maps DOM
   elements back to source code.
6. Editor managers update preview state, AST/code, files, screenshots,
   comments, chat context, CMS bindings (see [`cms-architecture.md`](./cms-architecture.md)),
   layout guides, animation interactions, and brand tokens.
7. Publishing flows route through hosting adapters
   (`convex/hostingConnections*.ts`); `publish` itself is currently disabled
   pending Vercel snapshot fork.

## Project Modes

- `cloud` — production path; sandbox provisioned via Vercel.
- `local` — desktop-first; the desktop app provides file IO, watching,
  terminal/dev process management, git, and safe write behavior.
- `hybrid` — planned with explicit sync controls; must never silently
  overwrite local repo changes.

Read [`docs/notes/2026-05-06-project-runtime-modes.md`](../notes/2026-05-06-project-runtime-modes.md) before changing runtime-mode behavior.
