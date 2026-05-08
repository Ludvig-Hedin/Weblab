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

## Deployment

`apps/web/client` is deployed on **Railway** (not Vercel). When verifying deployments or checking production logs, use the Railway dashboard or CLI — do not look in Vercel. The GitHub remote is `https://github.com/Ludvig-Hedin/Weblab.git`.

## Optional Context Pack

For broad or cross-cutting work, read the relevant files in `docs/agent-context/`:

- `README.md` - suggested read order.
- `current-progress.md` - active worktree context and recent progress.
- `repo-map.md` - monorepo map and runtime flow.
- `development-setup.md` - commands, env, validation, and migrations.
- `editor-architecture.md` - canvas, iframe, MobX engine, sandbox, and AI chat behavior.
- `data-api-architecture.md` - tRPC, Supabase, Drizzle, migrations, auth, and integrations.
- `design-product-context.md` - brand, product, and UI/design expectations.

## Validation, Migrations, and Config Changes

- Never leave the app in a broken state with known errors. Before ending work, run the relevant validation for the files touched, such as typecheck, lint, tests, build checks, or targeted scripts.
- If a change requires database migrations, config updates, env changes, setup steps, or generated artifacts, either run the required local migration/config command yourself or clearly tell the project owner exactly what they must run manually.
- When migration or config commands cannot be run safely in the current environment, document the blocker, the exact command or file change still needed, and the expected impact if it is skipped.
- Do not mark a task complete until the app has been validated enough to confirm it is not left with avoidable runtime, build, type, lint, or config errors.

## Changelog & Blog — Shipping Announcements

When you ship something user-facing, record it. Use your judgment on the tier:

| Tier | Threshold | Action |
|------|-----------|--------|
| **Major** | New user-facing feature, significant UI change, new page, important workflow or API change | Add a changelog entry |
| **Very major** | Full feature worth announcing publicly, major redesign, new integration, capability that changes how users work | Add a changelog entry **and** a blog post |

### Changelog entry

File: `apps/web/client/src/lib/changelog-entries.ts`

Prepend a new object to `CHANGELOG_ENTRIES` (array is newest-first):

```ts
{
    slug: 'v1-6-short-slug',       // kebab-case, matches version prefix
    version: '1.6',                // bump the last entry's version by 0.1
    title: 'Feature Name',
    description: 'One or two sentences. What it does and why it matters.',
    date: 'YYYY-MM-DD',            // today's date
    tags: ['Tag1', 'Tag2'],        // 2–4 short labels
}
```

Include a UI image when the change has a visible UI: save a representative SVG or screenshot to `apps/web/client/public/assets/changelog/` and note the path in the description or as a comment.

### Blog post

File: `apps/web/client/content/blog/<slug>.mdx`

Use this frontmatter:

```mdx
---
title: "Post Title"
description: "One sentence summary shown in cards and OG."
date: "YYYY-MM-DD"
author: "Your Name"
authorImage: "https://github.com/<handle>.png"
category: "Product"        # Engineering | Product | Deep Dive
tags: ["tag1", "tag2"]
coverImage: "/assets/blog/<slug>.svg"
---
```

Save a cover image to `apps/web/client/public/assets/blog/` — use an existing SVG from that directory as a starting point if creating a new image would be complex.

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

## Design System — Source of Truth

The living design system lives at **`/design-system`** (source: `apps/web/client/src/app/design-system/page.tsx`).

- **Accessible on localhost** without auth. On any other host it requires `DESIGN_SYSTEM_PASSWORD` to be set — via `.env.local` for local development against a custom domain, or via the deployment platform's environment variable configuration (for example, Vercel project settings or a Docker Compose `environment:` block) for staging/production.
- **What it covers:** every `@weblab/ui` component with all variants/states, the full color palette, typography scale, spacing scale, border-radius scale, shadows, and brand assets.
- **When you add or modify a component, token, or visual pattern** — update `page.tsx` to reflect it. If you add a new component to `@weblab/ui`, add a demo section. If you change a token name or value, update the corresponding swatch or control on that page.
- Live editing (color pickers, sliders) injects CSS variable overrides for preview only — permanent token changes go into `apps/web/client/src/app/globals.css` or the relevant CSS file.
- Use the design system page to verify visual consistency before shipping UI work. It is the single reference for "what the app looks like" across all components.

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
