# Weblab Backend

This workspace wraps the local Supabase backend used by Weblab for auth,
Postgres, storage, migrations, seed/reset workflows, and local development.

It enables online capabilities such as user accounts, projects, branches,
canvases, frames, chat history, comments, collaboration data, settings,
subscriptions, domains, and publishing metadata.

The long-term product should still support local/offline-first project editing
where possible, but the current web app expects Supabase for authenticated
project workflows.

## Local Usage

From the repo root:

```bash
bun backend:start
bun db:push
bun db:seed
```

From this workspace:

```bash
bun install
bun run start
bun run reset
```

`bun run reset` resets the local schema and seed state. It deletes local data.

## Migrations

Migration files live in `supabase/migrations`. Drizzle schema, mappers,
defaults, DB client, and seed logic live in `../../packages/db`.

Important rules:

- Run `bun db:push` after schema or selected-column changes.
- Do not run `bun db:gen`; migration generation is reserved for the maintainer.
- If a migration/config step cannot be run safely, document the exact manual
  command and expected impact.
- Keep migrations forward-safe for local databases where possible, for example
  with `ADD COLUMN IF NOT EXISTS` when backfilling missing columns.

Recent migration context:

- `0021_project_runtime_modes.sql` adds durable runtime metadata for `cloud`,
  `local`, and future `hybrid` project modes.
- `0022_user_settings_preferences.sql` aligns local `user_settings` columns with
  the Drizzle schema selected by `api.user.settings.get`.

## Environment

Local Supabase outputs the anon and service-role keys used by
`apps/web/client/src/env.ts`. Hosted Supabase setups must provide:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DATABASE_URL`
