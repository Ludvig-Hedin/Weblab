# Weblab Web Client

This is the primary Weblab web application. It uses Next.js App Router, React,
TypeScript, TailwindCSS, tRPC, Supabase, Drizzle, MobX editor stores, and shared
`@weblab/*` workspace packages.

Most contributors should run commands from the repository root so workspace
dependencies and scripts resolve consistently.

## Local Development

From the repo root:

```bash
bun install
bun backend:start
bun run setup:env
bun db:push
bun db:seed
bun dev
```

Useful validation commands:

```bash
bun --filter @weblab/web-client typecheck
bun --filter @weblab/web-client lint
bun --filter @weblab/web-client build
```

Do not run `bun db:gen`; migration generation is reserved for the maintainer.

## Important Paths

- `src/app` - App Router routes, layouts, route handlers, webhooks, marketing
  pages, project editor, and import flows.
- `src/server/api` - tRPC setup and routers. Add new routers to
  `src/server/api/root.ts`.
- `src/components/store/editor` - MobX `EditorEngine` and editor managers for
  canvas, frames, sandbox, code, AST, chat, comments, images, and more.
- `src/components/ui` - app-local UI and feature modals.
- `src/trpc` - tRPC client/server helpers and React Query integration.
- `src/utils/supabase` - server, browser, admin, middleware, and request-server
  Supabase clients.
- `src/env.ts` - typed environment schema. Update this whenever env changes.
- `messages/*` and `src/i18n` - next-intl messages and i18n helpers.

For deeper agent context, see `../../../docs/agent-context/`.

## Auth Notes

- The development-only "Sign in as demo user" button uses the seeded Supabase demo account and then routes through `/auth/redirect` so the browser session is established before protected queries run.
- When pointing the app at a hosted Supabase project, you must set `NEXT_PUBLIC_SUPABASE_URL`, either `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, plus `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_DATABASE_URL`, then run the database schema and seed steps against that hosted database before the demo account can use the app end-to-end.

## Architecture Notes

- Default to Server Components. Use `use client` only for events, state/effects,
  browser APIs, MobX observers, or client-only libraries.
- Keep server-only clients out of client components.
- Use `@weblab/ui` and existing local UI patterns before adding new primitives.
- Import `APP_NAME` from `@weblab/constants`; do not hardcode the product brand
  in JSX or metadata.
- Editor store instances must stay stable across renders. Preserve the
  `useState(() => new Store())` and async cleanup patterns used by the editor.

## Current Progress Notes

Recent durable context is documented in:

- `../../../docs/project-runtime-modes.md`
- `../../../docs/user-settings-migration-2026-05-06.md`
- `../../../docs/ai-chat-input-unification-2026-05-06.md`
- `../../../docs/editor-project-flow-fixes-2026-05-06.md`
