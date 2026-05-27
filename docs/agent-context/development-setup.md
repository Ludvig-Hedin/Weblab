# Development Setup And Validation

## Runtime

- Package manager/runtime: Bun only.
- Root package manager version: `bun@1.3.1`.
- Node requirement from docs: `v20.16.0` minimum or newer.
- Convex CLI: `bunx convex dev` for local backend (no Docker / Supabase
  needed for the active backend; legacy Supabase tooling is archived).

## Common Root Commands

```bash
bun install
bun dev                  # Next.js client (:3000)
bun docs                 # Fumadocs site
bunx convex dev          # apply Convex schema + watch functions
```

Root scripts of interest:

- `bun build` — builds the web client.
- `bun dev` — starts the web workspace development process.
- `bun test` — runs workspace tests.
- `bun lint` — lints all workspaces (max-warnings 0).
- `bun format` — runs workspace format/fix scripts.
- `bun typecheck` — typechecks `@weblab/web-client`.
- `bun docs` — runs the Fumadocs site.

**Convex** (active backend):

- `bunx convex dev` — apply schema, watch functions, sync types.
- `bunx convex env list` — list deployment env vars (e.g.
  `CLERK_JWT_ISSUER_DOMAIN`).
- `bunx convex env set <key> <value>` — set a deployment env var.
- `bunx convex deploy` — production deploy (requires owner authorization).

Legacy Supabase/Drizzle commands (`bun backend:start`, `bun db:push`,
`bun db:migrate`, `bun db:seed`, `bun db:reset`) are retained for the
archived migration tree but are not part of the active dev loop. Do not
run `bun db:gen` (maintainer-only).

## Environment

Primary env schema: `apps/web/client/src/env.ts`.

Active stack env vars:

| Group | Required | Optional |
|---|---|---|
| Clerk | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | webhook signing key (for `convex/http.ts` clerk webhook) |
| Convex | `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_DEPLOYMENT` | — |
| Convex deployment env | `CLERK_JWT_ISSUER_DOMAIN` (set via `bunx convex env set`, **not** in `.env.local`) | Stripe webhook secret, price IDs |
| Vercel Sandbox | `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID`, `VERCEL_TOKEN` | `VERCEL_SANDBOX_TIMEOUT_MS` (default 45min), `VERCEL_BLANK_SNAPSHOT_ID`, `WEBLAB_VERCEL_VCPUS`, `WEBLAB_VERCEL_WARM_POOL_SIZE` |
| AI | `OPENROUTER_API_KEY` (or provider-specific key) | `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `MORPH_API_KEY`, `RELACE_API_KEY`, `FIRECRAWL_API_KEY`, `EXA_API_KEY`, `MEM0_API_KEY` |
| Stripe | (prod only) `STRIPE_SECRET_KEY`, webhook secret | — |
| Integrations | — | `GITHUB_*`, `FIGMA_*`, `POSTHOG_*`, `GLEAP_*`, `LANGFUSE_*`, `N8N_*`, `SENTRY_*` |

Legacy / vestigial:

- `SUPABASE_*` env vars are all **optional**. Set them only if you need to
  exercise a legacy Supabase code path that hasn't been migrated yet.
- `CSB_API_KEY` is **optional** and unused by new code. Retained only
  because the union literal `'code_sandbox'` still appears in old DB rows.
- `WEBLAB_CLOUD_PROVIDER` is **legacy** and no longer read by new code.

When adding an env var:

- add it to `src/env.ts`
- add client vars with `NEXT_PUBLIC_*`
- avoid `process.env` in client or shared code
- update setup docs and call out manual setup in the final answer

When adding an env var:

- add it to `src/env.ts`
- add client vars with `NEXT_PUBLIC_*`
- avoid `process.env` in client or shared code
- update setup docs and call out manual setup in the final answer

## Database And Migrations

**Active database: Convex.** Schema source of truth:
`apps/web/client/convex/schema.ts`. Tables, indexes, and validators live
there. Generated client: `apps/web/client/convex/_generated/api.d.ts`.

Applying schema changes:

```bash
bunx convex dev   # local: applies schema + regenerates types
bunx convex deploy # production: gated on owner authorization
```

Conventions:

- Additive fields ship with the code; no separate migration file required.
- Destructive changes (drop / rename) require a deliberate cutover written
  into the relevant Convex module — read
  `docs/agent-memory/backend-migration-audit.md` for prior precedent.
- Always read `apps/web/client/convex/_generated/ai/guidelines.md` before
  authoring schema or function code — it overrides what the model learned
  from Convex training data.

**Legacy: Drizzle + Supabase migrations** (archived, do not extend):

- Drizzle schema: `packages/db/src/schema/**` — lingers for type sharing
  and seed scripts.
- Supabase migration archive: `apps/backend/supabase/migrations/**` —
  read-only.
- No `bun db:push`, `bun db:migrate`, or `bun db:gen` for new work.

Recent Convex schema additions (post-migration):

- `usageRecords.linkedRateLimitId` — closes the farmable-refunds bug in
  `revertIncrement` (audit pass 3, 2026-05-24).
- `cursors by_user` index — speeds presence reads and supports cascade
  cleanup in `deleteUserCascade`.
- Layout-guide tables backing `convex/layoutGuideStyles.ts`.
- Page-access tables backing `convex/pageAccess.ts`.
- Hosting-connection tables backing `convex/hostingConnections.ts`.
- Skill tables backing `convex/skillActions.ts` / `skills.ts`.

Historical Supabase migration context (informational only, do not apply):

- `0029_frame_breakpoints.sql` — per-frame responsive breakpoints (see
  `breakpoints-architecture.md`).
- `0037_workspaces_drop_legacy.sql` — explicit "DO NOT APPLY" header until
  soak period elapses.

## Validation Guide

Choose the narrowest validation that proves the change:

- docs-only: `git diff --check` on edited docs
- TypeScript/client logic: `bun --filter @weblab/web-client typecheck`
- lint-sensitive UI/code: targeted `bun --filter @weblab/web-client lint` or
  ESLint on edited files
- package logic with tests: targeted `bun test` or package test script
- DB/schema: `bun db:push` against local dev DB, plus targeted query or
  route-level validation
- preload/canvas behavior: manual browser validation when a dev server is
  already appropriate; do not start a dev server in automation contexts unless
  explicitly needed and allowed by local rules

Never finish while known avoidable type, lint, build, runtime, migration, or
config errors remain unaddressed or undocumented.
