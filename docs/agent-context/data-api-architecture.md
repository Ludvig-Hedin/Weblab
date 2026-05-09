# Data And API Architecture

## tRPC

Primary API root:

- `apps/web/client/src/server/api/root.ts`
- `apps/web/client/src/server/api/trpc.ts`
- routers in `apps/web/client/src/server/api/routers/**`

Rules:

- Add new routers to `root.ts` or the endpoint is unreachable.
- Use `publicProcedure`/`protectedProcedure` from local tRPC setup.
- Validate inputs with Zod.
- Return plain serializable objects/arrays; SuperJSON handles serialization.
- Keep authorization checks close to the router operation.

Current routers (21 total): `sandbox`, `user`, `invitation`, `project`,
`provider`, `branch`, `settings`, `chat`, `cms`, `comment`, `figma`, `frame`,
`userCanvas`, `utils`, `member`, `domain`, `github`, `subscription`, `usage`,
`publish`, `forward`. **See `trpc-routers-reference.md` for purpose, paths,
and add-a-router protocol.**

## Supabase Clients

Use the right client for the environment:

- Server components/actions/routes:
  `apps/web/client/src/utils/supabase/server.ts`
- Browser/client components:
  `apps/web/client/src/utils/supabase/client/index.ts`
- Admin/server-only operations:
  `apps/web/client/src/utils/supabase/admin.ts`
- Middleware/request helpers:
  `apps/web/client/src/utils/supabase/middleware.ts` and
  `apps/web/client/src/utils/supabase/request-server.ts`

Never import server-only Supabase clients into client components.

## Drizzle And Models

Database package:

- schema: `packages/db/src/schema/**`
- mappers: `packages/db/src/mappers/**`
- defaults: `packages/db/src/defaults/**`
- client/export surface: `packages/db/src/index.ts`

Shared model package:

- `packages/models/src/**`

When a persisted shape changes, usually update all of these together:

- Drizzle schema
- Supabase migration
- DB mapper/default
- shared model type
- tRPC router input/output behavior
- UI consumers
- docs and setup notes

## Auth And Membership

Auth is Supabase-backed. Protected project data should check user/project
relationship before returning or mutating data. For collaboration-style features
such as comments, preserve project membership checks and stable ordering.

The development-only demo login uses the seeded Supabase demo account and then
routes through `/auth/redirect` so browser session state exists before
protected queries run.

## External Integrations

Common integrations:

- CodeSandbox for cloud project runtimes
- Freestyle for hosting/domain publishing
- OpenRouter and AI SDK for chat/model routing
- Morph/Relace for fast apply
- Supabase for auth, Postgres, storage, and realtime-ready data
- Stripe for subscription and usage flows
- GitHub and Figma for import/integration flows
- PostHog/Gleap/Langfuse/n8n for analytics, feedback, observability, and
  outbound workflows

Most integration env vars are optional, but route behavior should fail clearly
when a required key for that feature is missing.

## Migration Discipline

Do not change selected DB columns without checking local migrations. A common
failure mode is a Drizzle schema selecting columns that older local Supabase
databases do not have.

If DB shape changes:

- add or update migration SQL under `apps/backend/supabase/migrations`
- run `bun db:push` when safe
- document exact manual migration/config steps when not safe
- update `docs/agent-context/current-progress.md` or a feature note if the
  change is durable context
