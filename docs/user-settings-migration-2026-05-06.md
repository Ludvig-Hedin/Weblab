# User Settings Migration - 2026-05-06

## Summary

Added a forward-only Supabase migration for the missing `user_settings` preference columns used by `api.user.settings.get`.

## Rationale

The projects page loads shared UI providers that call `user.settings.get`. The Drizzle schema selects all user preference columns, but the existing migration history only created the original chat flags and later added `should_warn_delete`. Local databases that were created from these migrations fail when the router selects columns such as `default_model`, `theme`, `auto_commit`, or `custom_shortcuts`.

## User-Facing Impact

This is user-facing because it removes the tRPC failure shown on the projects page and allows the settings-backed UI to load.

## Architectural Notes

The migration mirrors `packages/db/src/schema/user/settings.ts` without changing router behavior. It uses `ADD COLUMN IF NOT EXISTS` so it can be applied safely to databases that already have some or all of these columns.

## Verification

- Ran `bun run db:push` against the default local database.
- Verified the `user_settings` table includes every column selected by `api.user.settings.get`.
- Verified the failing SELECT shape runs successfully against the local database.
