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

## Agent Memory — Read First (Every Session)

Persistent, repo-scoped memory lives in `docs/agent-memory/`:

- **`user-preferences.md`** — read at the start of every session. Short,
  durable preferences for the project owner (Ludvig).
- `feature-log.md` — append on significant ships.
- `architecture-decisions.md` — append on architectural choices worth
  remembering.

See `docs/agent-memory/README.md` for the read/write protocol.

## Optional Context Pack

For broad or cross-cutting work, read the relevant files in `docs/agent-context/`.
**Always read the relevant doc(s) before planning a big edit, refactor, or
feature addition.**

Read order for most tasks:

1. `current-progress.md` — active worktree context and recent progress.
2. `repo-map.md` — monorepo map and runtime flow.
3. `development-setup.md` — commands, env, validation, and migrations.

Reference (read for the area you're touching):

- `packages-reference.md` — every package in `packages/*` and what it does.
- `trpc-routers-reference.md` — every tRPC router and its purpose.
- `routes-reference.md` — every Next.js App Router route.

Deep dives:

- `editor-architecture.md` — canvas, iframe, MobX engine, sandbox, AI chat
  behavior.
- `ai-chat-architecture.md` — TipTap composer, mention/slash commands, AI
  pipeline.
- `cms-architecture.md` — CMS workspace, bindings, preview integration.
- `breakpoints-architecture.md` — responsive frame breakpoints, parser
  rebase.
- `data-api-architecture.md` — tRPC, Supabase, Drizzle, migrations, auth,
  integrations.
- `design-product-context.md` — brand, product, UI/design expectations.

## Validation, Migrations, and Config Changes

### Default: Run it yourself

**Always run required commands.** Do not ask the project owner to run something you can run. This includes:

- `bun typecheck` — after any TypeScript change
- `bun lint` — after any code change
- `bun test [file]` — after touching logic with tests
- `bun db:push` — after any Drizzle schema change
- `bun db:migrate` — after adding a migration file
- `bun db:seed` — if seed data changed
- `bun install` / `bun add <pkg>` — after adding a dependency
- `bun format` — after bulk edits to normalize style

Run these proactively, not only when asked. If a command fails, fix the root cause and re-run.

### Only leave for the project owner when genuinely blocked

You **must not** hand off a task to the owner unless one of these hard blockers applies:

| Blocker | Example |
|---------|---------|
| Missing required env var not in `.env.local` | `STRIPE_SECRET_KEY` needed at runtime |
| Requires login / OAuth browser flow | Supabase dashboard action, OAuth consent |
| Targets production or shared infrastructure | Prod DB migration, prod secret rotation |
| Interactive TTY prompt that cannot be automated | `bun db:reset` if it asks for confirmation |
| External service credential or manual click | Vercel dashboard toggle, Railway env var |

### When you cannot run a command

State the blocker **explicitly and immediately** at the end of your turn:

```
⚠️ MANUAL STEP REQUIRED
Command : bun db:migrate
Reason  : Requires production DB credentials not present locally.
Impact  : New `user_sessions` table will be missing in prod — auth will fail.
```

Never bury this in a paragraph. Never say "you may want to run…". Be direct: what to run, why you couldn't, what breaks if skipped.

- Do not mark a task complete until the app has been validated enough to confirm it is not left with avoidable runtime, build, type, lint, or config errors.
- Never leave the app in a known broken state.

## Documentation Discipline (for Agents)

Documentation is part of "done" — not optional polish.

**Before a big edit / refactor / feature addition:**

1. Read `docs/agent-memory/user-preferences.md`.
2. Read `docs/agent-context/current-progress.md` to know what's in flight.
3. Read the relevant `docs/agent-context/*.md` for the area you're touching
   (packages, routers, routes, editor, AI chat, CMS, breakpoints, data/API).
4. If recent changes might be relevant, scan `git log --oneline -30` and
   `docs/agent-memory/feature-log.md`.

**After a significant ship:**

1. Update the affected `docs/agent-context/*.md` if the change alters
   architecture, contracts, or how an area works.
2. Append an entry to `docs/agent-memory/feature-log.md` (see its README for
   what qualifies).
3. If the change establishes or rejects a pattern other agents should follow,
   append to `docs/agent-memory/architecture-decisions.md`.
4. If the change is user-facing, add a changelog entry (and blog post if it
   meets the "very major" bar — see below).
5. Update `docs/agent-context/current-progress.md` if the worktree state
   has shifted meaningfully.

**For new packages, routers, or top-level routes:**

Also update the matching reference:
`packages-reference.md`, `trpc-routers-reference.md`, `routes-reference.md`.

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
| `packages/*` | 25 shared libraries (full catalog: `docs/agent-context/packages-reference.md`) |
| `tooling/*` | Shared ESLint, TypeScript, Prettier configs |

### Key Shared Packages (highlights)

- **@weblab/ui** — Radix UI + TailwindCSS + shadcn component library; prefer it over custom components
- **@weblab/types** / **@weblab/models** — Shared TypeScript types; import from here, never re-declared locally
- **@weblab/db** — Drizzle ORM schema + Postgres migrations (source of truth for DB types)
- **@weblab/ai** — LLM integrations (OpenRouter primary, OpenAI fallback, multi-provider routing)
- **@weblab/ai-cli** — CLI adapters (Codex, Claude Code, Gemini, OpenCode, Cursor) for desktop local providers
- **@weblab/parser** — Babel-based JSX/TSX parser, AST edits, responsive class rebase
- **@weblab/framework** — Framework adapter (Next.js, Vite, Remix, Astro, TanStack Start, static HTML)
- **@weblab/code-provider** / **@weblab/file-system** — Code sandbox + file-system abstractions
- **@weblab/mcp** — Model Context Protocol server (file/bash/project tools for AI)
- **@weblab/rpc** / **@weblab/penpal** — tRPC contracts + cross-frame/iframe RPC

Full catalog (25 packages): `docs/agent-context/packages-reference.md`. Changes to a package ripple into dependents — scope changes narrowly.

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
