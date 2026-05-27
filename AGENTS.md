## Weblab Agents Guide

Actionable rules for repo agents—keep diffs minimal, safe, token‑efficient.

> **⚠️ Brand note for AI agents:** This product is **Weblab** (weblab.build, github.com/Ludvig-Hedin/Weblab). Brand constant: `APP_NAME` from `@weblab/constants`. Package scope `@weblab/*`. DOM attrs `data-weblab-*`. The local folder name `onlook/` is intentionally unchanged. Allowed remaining "Onlook" references: `LICENSE.md` (legal attribution), `CODE_REVIEW_BACKLOG.md` (history), `DEPRECATED_PRELOAD_SCRIPT_SRCS` in `packages/constants/src/files.ts`, and a few test fixtures with deprecated inputs.

### ⚠️ Brand — Critical for All Agents

> **This product is Weblab** (domain: weblab.build, GitHub: github.com/Ludvig-Hedin/Weblab).
>
> - Single source of truth: `APP_NAME = 'Weblab'` exported from `packages/constants/src/editor.ts`. Always import it; never hardcode the brand name as a string literal in JSX or metadata.
> - Package scope is `@weblab/*`. DOM attributes are `data-weblab-*`. URL protocol is `weblab://`. Cache dir is `.weblab`.
> - The repo folder on disk is named `onlook/` for backward compatibility with shell history and tooling — it's a local path, not a user-facing identifier.
> - Allowed remaining "Onlook" references (do not strip):
>   - `LICENSE.md` — Apache-2.0 derivative-work attribution to On Off, Inc.
>   - `docs/archive/code-review-backlog.md` — historical bug reports
>   - `DEPRECATED_PRELOAD_SCRIPT_SRCS` in `packages/constants/src/files.ts` — legacy CDN URLs the parser still recognizes and removes from old customer code
>   - Test fixtures with intentionally-deprecated inputs
> - Any other "Onlook" mention in code, docs, or UI is a bug — replace with `{APP_NAME}` (JSX) or `${APP_NAME}` (template literal).

### Purpose & Scope

- Audience: automated coding agents working within this repository.
- Goal: small, correct diffs aligned with the project’s architecture.
- Non-goals: editing generated artifacts, lockfiles, or `node_modules`.

### Documentation Map

All repository documentation is indexed in [`docs/README.md`](docs/README.md) — agent docs, human guides, audits, working notes, product/marketing, feature plans, and archive. Use it as a fast TOC when you don't know where something lives.

### Agent Memory — Read First (Every Session)

Persistent, repo-scoped memory lives in `docs/agent-memory/`:

- **`user-preferences.md`** — read at the start of every session.
- `feature-log.md` — append on significant ships.
- `architecture-decisions.md` — append on architectural choices worth
  remembering.

See `docs/agent-memory/README.md` for the read/write protocol.

### Optional Context Pack

Before broad or cross-cutting work — and **always before planning a big
edit, refactor, or feature addition** — read the relevant files in
`docs/agent-context/`:

Read order for most tasks:

- `current-progress.md` — active worktree context and recent progress.
- `repo-map.md` — monorepo map and runtime flow.
- `development-setup.md` — commands, env, validation, and migrations.

Reference (read for the area you're touching):

- `packages-reference.md` — every package in `packages/*` (25 total).
- `trpc-routers-reference.md` — **STALE post-Convex migration.** Treat [`docs/feature-catalog.md`](docs/feature-catalog.md) sections 24–25 as source of truth.
- `routes-reference.md` — every Next.js App Router route.

Deep dives:

- `editor-architecture.md` — canvas, iframe, MobX engine, sandbox.
- `ai-chat-architecture.md` — TipTap composer, mention/slash commands.
- `cms-architecture.md` — CMS workspace and bindings.
- `breakpoints-architecture.md` — responsive frame breakpoints.
- `data-api-architecture.md` — tRPC, Supabase, Drizzle, migrations, auth.
- `design-product-context.md` — brand, product, UI/design expectations.

### Repo Map

- Monorepo managed by Bun workspaces (see root `package.json`).
- App: `apps/web/client` (Next.js App Router + TailwindCSS).
- Backend: **Convex** at [apps/web/client/convex/](apps/web/client/convex/) (queries, mutations, actions). Full enumeration in [docs/feature-catalog.md](docs/feature-catalog.md) sections 25–26.
- REST route handlers: [apps/web/client/src/app/api/](apps/web/client/src/app/api/) — chat / inline-edit / transcribe / etc.
- Vestigial tRPC: only `sandbox` and `components` routers in [apps/web/server/src/router/](apps/web/server/src/router/) — do **not** add new routers there.
- Shared utilities: `packages/*` (e.g., `packages/utility`).

### Stack & Runtimes

- UI: Next.js App Router, TailwindCSS.
- API: **Convex** ([apps/web/client/convex/](apps/web/client/convex/)) + Next.js route handlers + vestigial tRPC ([apps/web/server/src/router/](apps/web/server/src/router/)).
- Package manager: Bun only — use Bun for all installs and scripts; do not use
  npm, yarn, or pnpm.
- Deployment: `apps/web/client` is deployed on **Railway** (not Vercel). Do not
  check Vercel for deployment status or production logs.

### Agent Priorities

- Correctness first: minimal scope and targeted edits.
- Respect client/server boundaries in App Router.
- Prefer local patterns and existing abstractions; avoid one-off frameworks.
- Do not modify build outputs, generated files, or lockfiles.
- Use Bun for all scripts; do not introduce npm/yarn.
- Avoid running the local dev server in automation contexts.
- Respect type safety; avoid `any` unless necessary.

### Validation, Migrations, and Config Changes

#### Default: Run it yourself

**Always run required commands.** Do not instruct the project owner to run
something you can run. This includes:

- `bun typecheck` — after any TypeScript change
- `bun lint` — after any code change
- `bun test [file]` — after touching logic that has tests
- `bun db:push` — after any Drizzle schema change
- `bun db:migrate` — after adding a migration file
- `bun db:seed` — if seed data changed
- `bun install` / `bun add <pkg>` — after adding a dependency
- `bun format` — after bulk edits

Run these proactively. If a command fails, fix the root cause and re-run — do
not silence errors.

#### Only leave for the project owner when genuinely blocked

Only hand off a step when one of these hard blockers applies:

| Blocker | Example |
|---------|---------|
| Missing required env var not in `.env.local` | `STRIPE_SECRET_KEY` at runtime |
| Requires login / OAuth browser flow | Supabase dashboard, OAuth consent |
| Targets production or shared infrastructure | Prod DB migration, prod secret rotation |
| Interactive TTY prompt that cannot be automated | Confirmation prompts in `db:reset` |
| External service credential or manual click | Vercel dashboard toggle, Railway env var |

#### When you cannot run a command

State the blocker **explicitly and immediately** at the end of your response:

```
⚠️ MANUAL STEP REQUIRED
Command : bun db:migrate
Reason  : Requires production DB credentials not present locally.
Impact  : New `user_sessions` table missing in prod — auth will fail.
```

Never bury this in a paragraph. Never say "you may want to run…". Be direct:
what to run, why you couldn't, what breaks if skipped.

- Do not mark a task complete until the app has been validated enough to confirm
  it is not left with avoidable runtime, build, type, lint, or config errors.
- Never leave the app in a known broken state.

### Documentation Discipline

Documentation is part of "done" — not optional polish.

#### Backlog — read at session start, append on every deferred bug/TODO

The repo-root [`BACKLOG.md`](BACKLOG.md) is the canonical list of known bugs,
follow-ups, and deferred TODOs.

- **Read it once at the start of any non-trivial session.** If an entry there
  intersects the task you were given, fix it as part of the work instead of
  duplicating the entry.
- **Append to it whenever you defer a bug or TODO.** If you discover a real
  defect, latent issue, or follow-up that you cannot fix in the current
  change — log it in `BACKLOG.md` (entry template is in the file). Do not
  leave it buried in a chat transcript, code comment, or PR description.
- Move closed items to the **Resolved** section with the resolution date and
  PR/commit, rather than deleting them.

#### Feature Catalog & Test Plan — read + update every feature task

The master inventory of every feature is **[`docs/feature-catalog.md`](docs/feature-catalog.md)**. Each entry has a stable `F-XXX` ID, tags (`#editor`, `#ai`, `#public`, `#auth-gated`, `#cms`, `#billing`, `#admin`, `#api`, `#integration`, `#convex`, `#deprecated`, …), path, sub-features, and "Used when". The matching test matrix is **[`docs/test-plan.md`](docs/test-plan.md)** — every catalog row maps to at least one `T-XXX` test row.

**Reusable validation prompt:** [`docs/prompts/validate-feature.md`](docs/prompts/validate-feature.md) — chains the right skills (`anthropic-skills:frontend-testing-debugging`, `anthropic-skills:webapp-testing`, `superpowers:verification-before-completion`) to validate a single feature, tag, section, or branch diff. Code-level + frontend-level in one pass.

**Always:**

1. **Read [`docs/feature-catalog.md`](docs/feature-catalog.md) before** answering "where does X live", planning a feature, writing tests, or doing any cross-cutting audit. Grep by tag (`#ai`) or feature ID (`F-280`) to find every relevant entry.
2. **Update [`docs/feature-catalog.md`](docs/feature-catalog.md) after** adding or renaming any of: a top-level route, an editor modal/panel/tab, a Convex module or table, a `@weblab/*` package, a `/api/*` route handler, or a webhook. Follow the [Change Protocol](docs/feature-catalog.md#change-protocol). Append to the Change Log.
3. **Pair every catalog change with [`docs/test-plan.md`](docs/test-plan.md)** — add at least one `T-XXX` row referencing the new `F-XXX` ID.
4. **Never reuse IDs.** Deleting a feature → strike its row, don't remove it.

> Treat the feature catalog as the **source of truth** when the older `docs/agent-context/*-reference.md` files conflict (`trpc-routers-reference.md` is stale post-Convex migration — see catalog section 24).

**Before a big edit / refactor / feature addition:**

1. Read `docs/agent-memory/user-preferences.md`.
2. Read `docs/agent-context/current-progress.md`.
3. **Read [`docs/feature-catalog.md`](docs/feature-catalog.md)** — at minimum scan the section(s) matching the area you're touching.
4. Read the relevant `docs/agent-context/*.md` for the area you're touching.
5. Scan recent context if needed: `git log --oneline -30` and
   `docs/agent-memory/feature-log.md`.

**After a significant ship:**

1. **Update [`docs/feature-catalog.md`](docs/feature-catalog.md)** and **[`docs/test-plan.md`](docs/test-plan.md)** per the Change Protocol above.
2. Update affected `docs/agent-context/*.md` if architecture/contracts
   changed.
3. Append to `docs/agent-memory/feature-log.md` (qualifies = new feature, new
   router, new package, schema-shape change, significant refactor).
4. If a pattern is established or rejected, append to
   `docs/agent-memory/architecture-decisions.md`.
5. User-facing → add a changelog entry (and blog post if "very major").
6. Update `docs/agent-context/current-progress.md` if worktree state shifted.

**For new packages, routers, or top-level routes:** also update the matching
reference doc (`packages-reference.md`, `trpc-routers-reference.md`,
`routes-reference.md`) — *and* the feature catalog row.

### Changelog & Blog — Shipping Announcements

When you ship something user-facing, record it. Use your judgment on the tier:

| Tier | Threshold | Action |
|------|-----------|--------|
| **Major** | New user-facing feature, significant UI change, new page, important workflow or API change | Add a changelog entry |
| **Very major** | Full feature worth announcing publicly, major redesign, new integration, capability that changes how users work | Add a changelog entry **and** a blog post |

**Changelog entry** — `apps/web/client/src/lib/changelog-entries.ts`

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

Include a UI image when the change has a visible UI: save a representative SVG
or screenshot to `apps/web/client/public/assets/changelog/` and note the path
in the description or as a comment.

**Blog post** (very major only) — `apps/web/client/content/blog/<slug>.mdx`

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

Save a cover image to `apps/web/client/public/assets/blog/`. Reuse an existing
SVG from that directory if creating a new image would be complex.

### Next.js App Router

- Default to Server Components. Add `use client` when using events,
  state/effects, browser APIs, or client-only libs.
- App structure: `apps/web/client/src/app/**` (`page.tsx`, `layout.tsx`,
  `route.ts`).
- Client providers live behind a client boundary (e.g.,
  `apps/web/client/src/trpc/react.tsx`).
- Example roots: `apps/web/client/src/app/layout.tsx` (RSC shell, providers
  wired, scripts gated by env).
- Components using `mobx-react-lite`'s `observer` must be client components
  (include `use client`).

### API Layer (Convex primary; tRPC vestigial)

- **Convex is the primary backend** at [apps/web/client/convex/](apps/web/client/convex/). Functions are `query` / `mutation` / `action` per-domain module (e.g. `projects.ts`, `chatActions.ts`, `cmsBindings.ts`). Auth wired via [convex/auth.config.ts](apps/web/client/convex/auth.config.ts) (Clerk JWT issuer).
- REST route handlers under [apps/web/client/src/app/api/](apps/web/client/src/app/api/) — chat / inline-edit / tab-complete / transcribe / etc. Each calls Convex via the server client.
- Vestigial tRPC routers (`sandbox`, `components`) live at [apps/web/server/src/router/](apps/web/server/src/router/). Editor → Fastify sandbox lifecycle only. Do **not** add new logic to a non-existent `apps/web/client/src/server/api/` tree.
- Validate inputs with Zod (REST routes / tRPC) or `v` validators (Convex schema).
- Full enumeration: [docs/feature-catalog.md](docs/feature-catalog.md) sections 22–26.

### Auth & Supabase

- Server-side client: `apps/web/client/src/utils/supabase/server.ts` (uses Next
  headers/cookies). Use in server components, actions, and routes.
- Browser client: `apps/web/client/src/utils/supabase/client/index.ts` for
  client components.
- Never pass server-only clients into client code.

### Env & Config

- Define/validate env vars in `apps/web/client/src/env.ts` via
  `@t3-oss/env-nextjs`.
- Expose browser vars with `NEXT_PUBLIC_*` and declare in the `client` schema.
- Prefer `env` from `@/env`. In server-only helpers (e.g., base URL in
  `src/trpc/helpers.ts`), read `process.env` only for deployment vars like
  `VERCEL_URL`/`PORT`. Never use `process.env` in client code; in shared
  modules, guard with `typeof window === 'undefined'`.
- Import `./src/env` in `apps/web/client/next.config.ts` to enforce validation.

### Imports & Paths

- Use path aliases: `@/*` and `~/*` map to `apps/web/client/src/*` (see
  `apps/web/client/tsconfig.json`).
- Do not import server-only modules into client components. Limited exception:
  editor modules that already use `path`; reuse only there. Never import
  `process` in client code.
- Split code by environment if needed (server file vs client file).

### MobX + React Stores

- Create store instances with `useState(() => new Store())` for stability across
  renders.
- Keep active store in `useRef`; clean up async with
  `setTimeout(() => storeRef.current?.clear(), 0)` to avoid route-change races.
- Avoid `useMemo` for store instances; React may drop memoized values leading to
  data loss.
- Avoid putting the store instance in effect deps if it loops; split concerns
  (e.g., project vs branch).
- `observer` components are client-only. Place one client boundary at the
  feature entry; child observers need not include `use client` (e.g.,
  `apps/web/client/src/app/project/[id]/_components/main.tsx`).
- Example store: `apps/web/client/src/components/store/editor/engine.ts:1` (uses
  `makeAutoObservable`).

### Design System — Source of Truth

The living design system lives at **`/design-system`** (source: `apps/web/client/src/app/design-system/page.tsx`).

- **Accessible on localhost** without auth. On any other host it requires a password set via `DESIGN_SYSTEM_PASSWORD` in `.env.local`.
- **What it covers:** every `@weblab/ui` component with all variants/states, the full color palette, typography scale, spacing scale, border-radius scale, shadows, and brand assets.
- **When you add or modify a component, token, or visual pattern** — update `page.tsx` to reflect it. New `@weblab/ui` component → add a demo section. Changed token name or value → update the corresponding swatch or control on that page.
- Live editing (color pickers, sliders) injects CSS variable overrides for preview only — permanent token changes go into `apps/web/client/src/app/globals.css` or the relevant CSS file.
- Use the design system page to verify visual consistency before shipping UI work. It is the single reference for "what the app looks like" across all components.

### Styling & UI

- TailwindCSS-first styling; global styles are already imported in
  `apps/web/client/src/app/layout.tsx`.
- Prefer existing UI components from `@weblab/ui` and local patterns.
- Preserve dark theme defaults via `ThemeProvider` usage in layout.

### Internationalization

- `next-intl` is configured; provider lives in
  `apps/web/client/src/app/layout.tsx`.
- Strings live in `apps/web/client/messages/*`. Add/modify keys there; avoid
  hardcoded user-facing text.
- Keep keys stable; prefer additions over breaking renames.

### Common Pitfalls

- Missing `use client` where needed (events/browser APIs) causes unbound events;
  a single boundary at the feature root is sufficient.
- Adding API logic to a `src/server/api/*` tree — that directory no longer exists; new backend code goes in [convex/](apps/web/client/convex/) (endpoints
  unreachable).
- Env vars not typed/exposed in `src/env.ts` cause runtime/edge failures. Prefer
  `env`; avoid new `process.env` reads in client code.
- Importing server-only code into client components (bundling/runtime errors).
  Note: `path` is already used in specific client code-editor modules; avoid
  expanding Node API usage beyond those areas.
- Bypassing i18n by hardcoding strings instead of using message files/hooks.
- Avoid `useMemo` to create MobX stores (risk of lost references); avoid
  synchronous cleanup on route change (race conditions).

### Context Discipline (for Agents)

- Search narrowly with ripgrep; open only files you need.
- Read small sections; avoid `node_modules`, `.next`, large assets.
- Propose minimal diffs aligned with existing conventions; avoid wide refactors.

### Notes

- DO NOT run the dev server in automation contexts.
- DO NOT run `db:gen` — reserved for the maintainer.
- DO NOT use `any` type unless necessary.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
