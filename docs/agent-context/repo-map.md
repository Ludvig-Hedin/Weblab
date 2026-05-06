# Repository Map

Weblab is a Bun workspace monorepo. Use Bun for installs, scripts, tests, and
workspace commands.

## Workspace Shape

- `apps/web/client` - primary Next.js App Router web client and full-stack API
  routes.
- `apps/web/server` - Fastify/tRPC websocket server code. Some real-time
  collaboration work may eventually move here.
- `apps/web/preload` - preload/instrumentation scripts used by previews.
- `apps/backend` - Supabase local backend wrapper, config, and migrations.
- `apps/desktop` and `apps/ios` - platform apps/release notes; do not assume
  web-only changes apply there.
- `docs` - Fumadocs/Next.js documentation site.
- `packages/*` - shared libraries used by the app and backend.
- `tooling/*` - shared ESLint, Prettier, and TypeScript configuration.

## High-Value Packages

- `@weblab/constants` - brand constants and shared constants. Import
  `APP_NAME`; do not hardcode the product name in JSX or metadata.
- `@weblab/models` - shared model types used across app, DB mappers, API, and
  editor stores.
- `@weblab/db` - Drizzle schema, database client, mappers, defaults, seed, and
  migration helpers.
- `@weblab/ui` - shared Radix/Tailwind UI primitives. Prefer this and local
  established components over new one-off UI.
- `@weblab/ai` - AI SDK/OpenRouter/provider integration and agents.
- `@weblab/parser` - JSX/TSX AST parsing and code transformation support.
- `@weblab/file-system` - file-system abstraction used by editor providers.
- `@weblab/github`, `@weblab/figma`, `@weblab/stripe`, `@weblab/email` -
  external integration packages.
- `@weblab/penpal` and `@weblab/rpc` - iframe/cross-context communication and
  shared RPC contracts.

## Web Client Layout

- `src/app` - Next.js App Router pages, layouts, route handlers, auth callbacks,
  webhooks, marketing pages, project editor, and project import flows.
- `src/server/api` - tRPC setup and routers. New routers must be exported from
  `src/server/api/root.ts`.
- `src/components/store/editor` - MobX editor engine and feature managers.
- `src/components/store/create` - project creation state.
- `src/components/store/hosting` - hosting/domain state.
- `src/components/ui` - app-local UI components and feature modals.
- `src/trpc` - client, React Query integration, server helpers, and request
  helpers.
- `src/utils/supabase` - browser, server, admin, middleware, and request-server
  Supabase clients.
- `src/i18n` and `messages/*` - next-intl setup and localized strings.
- `src/env.ts` - typed environment schema. Update it for env changes.

## Main Runtime Flow

1. A user creates or imports a project.
2. The app stores project, branch, canvas, frame, settings, conversation, and
   user data in Supabase via Drizzle/tRPC.
3. A branch starts a runtime provider, currently mainly CodeSandbox for cloud
   mode.
4. The editor embeds the running app in iframe frames.
5. The preload/frame bridge maps DOM elements back to source code.
6. Editor managers update preview state, AST/code, files, screenshots, comments,
   and chat context.
7. Publishing/domain flows deploy through hosting integrations such as
   Freestyle.

## Import And Project Modes

- `cloud` mode is the production path. Code is uploaded/forked into a sandbox.
- `local` mode is desktop-first plumbing. Local metadata exists, but the desktop
  provider must supply file IO, watching, terminal/dev process management, git,
  and safe write behavior.
- `hybrid` mode is planned and must include explicit sync controls. Never
  silently overwrite local repo changes.

Read `docs/project-runtime-modes.md` before changing runtime-mode behavior.
