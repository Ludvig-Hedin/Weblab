# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ Brand — Read First

> **This product is Weblab** (domain: weblab.build, GitHub: github.com/Ludvig-Hedin/Weblab).
>
> - Brand constant: `APP_NAME = 'Weblab'` in `packages/constants/src/editor.ts` — always import it; never hardcode the name.
> - Package scope is `@weblab/*`. DOM attributes are `data-weblab-*`. URL protocol is `weblab://`. Cache dir is `.weblab`.
> - The folder name on disk (`onlook/`) is intentionally unchanged — it's a local path, not a user-facing identifier.
> - Allowed remaining "Onlook" references (do not strip):
>   - `LICENSE.md` — legal attribution to On Off, Inc. (original Onlook team) per Apache-2.0 derivative-work requirements
>   - `CODE_REVIEW_BACKLOG.md` — historical bug reports
>   - `DEPRECATED_PRELOAD_SCRIPT_SRCS` in `packages/constants/src/files.ts` — legacy CDN URLs the parser must still recognize and remove from old customer code
>   - Test fixtures with intentionally-deprecated inputs (e.g., `packages/parser/test/data/layout/does-not-duplicate/input.tsx`)
> - Any other "Onlook" mention in code, docs, or UI is a bug — replace it.

## Commands

```bash
# Development
bun dev              # Start Next.js client (port 3000) via Turbo
bun backend:start    # Start Supabase local backend

# Build
bun build            # Build @weblab/web-client for production

# Quality
bun typecheck        # TypeScript check (scoped to @weblab/web-client)
bun lint             # ESLint across all workspaces (max-warnings 0)
bun format           # Auto-fix lint issues

# Testing
bun test             # Run all unit tests across workspaces
bun test --timeout 30000 --coverage  # With coverage (as in CI)

# Database (Drizzle ORM)
bun db:push          # Apply schema changes to local dev DB
bun db:migrate       # Run migrations
bun db:seed          # Seed data
bun db:reset         # Reset schema + reseed
# DO NOT run db:gen — reserved for maintainer
```

> Refrain from running the dev server in automation contexts.
> Use Bun for all installs and scripts; do not use npm, yarn, or pnpm.

## Monorepo Structure

Bun workspaces monorepo with four workspace directories:

| Directory | Key Contents |
|-----------|-------------|
| `apps/web/client` | Next.js App Router frontend (primary app) |
| `apps/web/server` | Fastify + tRPC WebSocket server (Bun runtime) |
| `apps/backend` | Supabase CLI wrapper, Deno Edge Functions, DB migrations |
| `docs/` | Fumadocs documentation site |
| `packages/*` | 16 shared libraries (see below) |
| `tooling/*` | Shared ESLint, TypeScript, Prettier configs |

### Key Shared Packages

- **@weblab/ui** — Radix UI + TailwindCSS component library; prefer it over custom components
- **@weblab/types** — Shared TypeScript types; import types from here, not re-declared locally
- **@weblab/db** — Drizzle ORM schema + Postgres migrations (source of truth for DB types)
- **@weblab/ai** — LLM integrations (OpenRouter primary, OpenAI fallback, Langfuse observability)
- **@weblab/parser** — Babel-based JSX/TSX parser for code transformations
- **@weblab/rpc** — tRPC interface definitions shared between client and server
- **@weblab/penpal** — Cross-frame/iframe RPC (used for sandboxed code execution)
- **@weblab/github** — Octokit-based GitHub API client

Changes to any package ripple into the 12+ dependent packages — scope changes narrowly.

## App Router Rules (`apps/web/client`)

- Default to Server Components. Add `use client` only for events, state/effects, browser APIs, or client-only libs.
- App structure: `src/app/**` (`page.tsx`, `layout.tsx`, `route.ts`).
- Client providers live behind a client boundary (e.g., `src/trpc/react.tsx`).
- `observer` components from `mobx-react-lite` must be client components (add `use client`). Place one client boundary at the feature entry; child observers don't need `use client`.

## tRPC API

- Routers live in `src/server/api/routers/**` and must be exported from `src/server/api/root.ts`.
- Use `publicProcedure`/`protectedProcedure` from `src/server/api/trpc.ts`; validate inputs with Zod.
- Serialization handled by SuperJSON; return plain objects/arrays.
- Client usage via `src/trpc/react.tsx` (React Query + tRPC links).

## Auth & Supabase

- Server-side client: `src/utils/supabase/server.ts` — use in server components, actions, and routes.
- Browser client: `src/utils/supabase/client/index.ts` — use in client components.
- Never pass server-only clients into client code.

## Env & Config

- Define/validate env vars in `src/env.ts` via `@t3-oss/env-nextjs`.
- Expose browser vars with `NEXT_PUBLIC_*` and declare in the `client` schema.
- Prefer `env` from `@/env`. In server-only helpers, read `process.env` only for deployment vars like `VERCEL_URL`/`PORT`. Never use `process.env` in client code.
- DO NOT use `any` type unless necessary.

## Imports & Paths

- Path aliases: `@/*` and `~/*` map to `apps/web/client/src/*`.
- Do not import server-only modules into client components. Exception: editor modules that already use `path`; don't expand Node API usage beyond those.
- Split code by environment if needed (server file vs client file).

## MobX + React Stores

- Create store instances with `useState(() => new Store())` for stability across renders.
- Keep active store in `useRef`; clean up async with `setTimeout(() => storeRef.current?.clear(), 0)` to avoid route-change races.
- Avoid `useMemo` for store instances (React may drop memoized values → data loss).
- Avoid putting the store instance in effect deps if it loops; split concerns.
- Example store: `src/components/store/editor/engine.ts` (uses `makeAutoObservable`).

## Styling & UI

- TailwindCSS 4.x-first; global styles imported in `src/app/layout.tsx`.
- Prefer `@weblab/ui` components and local patterns over custom implementations.
- Preserve dark theme defaults via `ThemeProvider` in layout.

## Internationalization

- `next-intl` is configured; provider lives in `src/app/layout.tsx`.
- Strings live in `apps/web/client/messages/*`. Add/modify keys there; avoid hardcoded user-facing text.
- Keep keys stable; prefer additions over breaking renames.

## Common Pitfalls

- Missing `use client` where needed (events/browser APIs) causes unbound events.
- New tRPC routers not exported in `src/server/api/root.ts` → endpoints unreachable.
- Env vars not typed in `src/env.ts` cause runtime/edge failures.
- Importing server-only code into client components causes bundling errors.
- Bypassing i18n by hardcoding strings.
- `useMemo` for MobX stores risks lost references; synchronous cleanup on route change risks race conditions.

## Context Discipline

- Search narrowly with ripgrep; open only files you need.
- Avoid `node_modules`, `.next`, `dist`, large binary assets.
- Propose minimal diffs aligned with existing conventions; avoid wide refactors.
- Do not modify build outputs, generated files, or lockfiles.
