# Archived Supabase Migrations

This directory is retained as a read-only archive of the legacy Supabase and
Drizzle migration history.

Weblab now uses Convex for application data and Clerk for authentication. Do
not use these migrations for new schema changes, local development setup, or
production deploys unless you are explicitly restoring or auditing the old
Supabase backend.

Rules for this archive:

- Treat files in `migrations/` as historical records.
- Do not edit existing migration files.
- Do not add new Supabase migrations for current product work.
- Do not run Supabase migration commands as part of normal validation.
- If historical analysis requires a change here, document why in
  `docs/agent-memory/architecture-decisions.md`.

