# Development Setup And Validation

## Runtime

- Package manager/runtime: Bun only.
- Root package manager version: `bun@1.3.1`.
- Node requirement from docs: `v20.16.0` minimum or newer.
- Docker is required for local Supabase.

## Common Root Commands

```bash
bun install
bun backend:start
bun run setup:env
bun db:push
bun db:seed
bun dev
```

Root scripts of interest:

- `bun build` - builds the web client.
- `bun dev` - starts the web workspace development process.
- `bun test` - runs workspace tests.
- `bun lint` - lints all workspaces.
- `bun format` - runs workspace format/fix scripts.
- `bun typecheck` - typechecks `@weblab/web-client`.
- `bun backend:start` - starts local Supabase through `apps/backend`.
- `bun db:push` - applies current Drizzle schema to local dev DB.
- `bun db:migrate` - runs migrations from `packages/db`.
- `bun db:seed` - seeds the DB.
- `bun db:reset` - resets local Supabase schema and reseeds.

Do not run `bun db:gen`; it is reserved for the maintainer.

## Environment

Primary env schema: `apps/web/client/src/env.ts`.

Common required development values have fallbacks in development for Supabase,
OpenRouter, and CodeSandbox, but real end-to-end AI/sandbox behavior needs real
keys:

- `CSB_API_KEY`
- `OPENROUTER_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_DATABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Optional feature/integration variables include Stripe, Freestyle, GitHub,
Figma, PostHog, Gleap, Langfuse, n8n, Firecrawl, Exa, Anthropic, OpenAI,
Google, AWS Bedrock, Morph, and Relace keys.

When adding an env var:

- add it to `src/env.ts`
- add client vars with `NEXT_PUBLIC_*`
- avoid `process.env` in client or shared code
- update setup docs and call out manual setup in the final answer

## Database And Migrations

Database source of truth:

- Drizzle schema: `packages/db/src/schema/**`
- mappers/defaults: `packages/db/src/mappers/**` and
  `packages/db/src/defaults/**`
- Supabase migrations: `apps/backend/supabase/migrations/**`
- Drizzle config: `packages/db/drizzle.config.ts`

If schema or selected columns change, run or clearly hand off:

```bash
bun db:push
```

If a committed migration is required, use existing migration patterns in
`apps/backend/supabase/migrations`. Do not generate migrations with `db:gen`
unless the maintainer explicitly says to.

Recent migration context:

- `0021_project_runtime_modes.sql` supports runtime metadata for project modes.
- `0022_user_settings_preferences.sql` adds missing user preference columns
  used by `api.user.settings.get`.

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
