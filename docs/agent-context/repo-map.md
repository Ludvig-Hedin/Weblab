# Repository Map

Weblab is a Bun workspace monorepo. Use Bun for installs, scripts, tests, and
workspace commands.

> See `packages-reference.md` for the complete package catalog (25 packages),
> `trpc-routers-reference.md` for all 21 tRPC routers, and `routes-reference.md`
> for every Next.js route.

## Workspace Shape

- `apps/web/client` — primary Next.js App Router web client and full-stack API
  routes.
- `apps/web/server` — Fastify/tRPC websocket server. Some real-time
  collaboration work may eventually move here.
- `apps/web/preload` — preload/instrumentation scripts used by previews.
- `apps/backend` — Supabase local backend wrapper, config, and migrations.
- `apps/admin` — admin dashboard.
- `apps/desktop` — Electron desktop app (uses local CLI bridge for AI
  providers).
- `apps/ios` — iOS app shell.
- `docs/` — Fumadocs/Next.js documentation site (also contains agent docs).
- `packages/*` — 25 shared libraries (see `packages-reference.md`).
- `tooling/*` — shared ESLint, Prettier, and TypeScript configuration.

> **Web-only assumption guard:** changes inside `apps/web/client` do **not**
> automatically apply to `apps/desktop` or `apps/ios`. If you change a shared
> contract or a package consumed by those apps, check them.

## High-Value Packages (quick reference)

For the full list and detailed purposes, see `packages-reference.md`.

| Package | Purpose |
|---------|---------|
| `@weblab/constants` | Brand constants — always import `APP_NAME` |
| `@weblab/models` | Shared model types across app, DB, API, editor |
| `@weblab/db` | Drizzle schema, mappers, defaults, seed |
| `@weblab/ui` | Radix/Tailwind UI primitives + shadcn |
| `@weblab/ai` | AI SDK / OpenRouter / provider routing |
| `@weblab/ai-cli` | CLI adapters (Codex, Claude Code, Gemini, Cursor) |
| `@weblab/parser` | JSX/TSX AST parsing + responsive class rebase |
| `@weblab/framework` | Framework adapter (Next.js, Vite, Remix, Astro, TanStack Start, static HTML) |
| `@weblab/code-provider` | Code sandbox provider abstraction |
| `@weblab/file-system` | File-system abstraction for editor providers |
| `@weblab/mcp` | Model Context Protocol server (file/bash/project tools for AI) |
| `@weblab/github` / `@weblab/figma` / `@weblab/figma-plugin` / `@weblab/git` / `@weblab/stripe` / `@weblab/email` | External integrations |
| `@weblab/penpal` / `@weblab/rpc` | Cross-context + RPC contracts |
| `@weblab/fonts` / `@weblab/image-server` / `@weblab/growth` / `@weblab/scripts` / `@weblab/types` / `@weblab/utility` | Supporting libraries |

## Web Client Layout

- `src/app` — Next.js App Router pages, layouts, route handlers, auth
  callbacks, webhooks, marketing pages, project editor, and project import
  flows. (See `routes-reference.md`.)
- `src/server/api` — tRPC setup and routers. New routers must be exported
  from `src/server/api/root.ts`. (See `trpc-routers-reference.md`.)
- `src/components/store/editor` — MobX editor engine and feature managers.
- `src/components/store/create` — project creation state.
- `src/components/store/hosting` — hosting/domain state.
- `src/components/ai-prompt-composer` — shared TipTap chat composer used on
  every AI-input surface. (See `ai-chat-architecture.md`.)
- `src/components/ui` — app-local UI components and feature modals.
- `src/trpc` — client, React Query integration, server helpers, and request
  helpers.
- `src/utils/supabase` — browser, server, admin, middleware, and
  request-server Supabase clients.
- `src/i18n` and `messages/*` — next-intl setup and localized strings.
- `src/env.ts` — typed environment schema. Update it for env changes.
- `src/lib/changelog-entries.ts` — public changelog data (see
  `CLAUDE.md` → "Changelog & Blog").

## Main Runtime Flow

1. A user creates or imports a project.
2. The app stores project, branch, canvas, frame, settings, conversation, and
   user data in Supabase via Drizzle/tRPC.
3. A branch starts a runtime provider — currently mainly CodeSandbox for
   cloud mode.
4. The editor embeds the running app in iframe frames (with optional
   responsive breakpoints — see `breakpoints-architecture.md`).
5. The preload/frame bridge maps DOM elements back to source code.
6. Editor managers update preview state, AST/code, files, screenshots,
   comments, chat context, and CMS bindings (see `cms-architecture.md`).
7. Publishing/domain flows deploy through hosting integrations such as
   Freestyle.

## Import And Project Modes

- `cloud` mode is the production path. Code is uploaded/forked into a sandbox.
- `local` mode is desktop-first plumbing. Local metadata exists, but the
  desktop provider must supply file IO, watching, terminal/dev process
  management, git, and safe write behavior.
- `hybrid` mode is planned and must include explicit sync controls. Never
  silently overwrite local repo changes.

Read `docs/project-runtime-modes.md` before changing runtime-mode behavior.
