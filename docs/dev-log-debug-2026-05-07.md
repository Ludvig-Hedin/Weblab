# Dev Log Debug - 2026-05-07

## Summary

Investigated fresh `bun dev` logs for `/project/[id]` where comment and user settings tRPC procedures were repeatedly failing.

## Findings

- `comment.comment.list` failed because the database used by `SUPABASE_DATABASE_URL` was missing the `project_comments` and `comment_replies` tables, even though the default local Supabase database on port `54322` already had them.
- `user.settings.get` selected the full current `user_settings` shape. The router already returns defaults when no settings row exists, so failures here are schema/table issues rather than missing-row issues.
- The configured project `57144d95-15a8-40ea-b241-9fb1eebaabf8` and user `e51c05c0-1f4d-41c2-ad7e-48f8f3d14ad9` exist in the configured database and the user has project membership.
- `streamdown` still brings a nested `shiki@3.13.0` while the web client uses `shiki@4.0.2`. This explains the Next.js `shiki/wasm` externalization warning and needs a dependency resolution update.

## Changes

- Updated the pending DB repair script to use `SUPABASE_DATABASE_URL`, create missing comment/settings tables idempotently, apply missing settings/runtime migrations, and add missing indexes.
- Updated DB tooling to load the repo root `.env` / `.env.local` even when scripts run from `packages/db`, preventing `bun db:migrate` from silently falling back to the local `127.0.0.1:54322` database.
- Extended the DB sync to safely apply later hand-written DB edits: comment author FKs, `project_settings` primary key, billing FK delete restrictions, auth user creation trigger, and Drizzle migration tracking.
- Hardened the editor comment manager to avoid overlapping loads, stop polling after auth/schema failures, and log the client-side comment load failure once.
- Reduced React Query retry behavior for auth failures and reduced default tRPC dev link logging unless `NEXT_PUBLIC_VERBOSE_TRPC_LOGS=true`.
- Deduplicated identical tRPC server error logs for 30 seconds and included the underlying database error code/message when available.
- Suppressed optional local PostHog/Langfuse warnings when keys are not configured.

## Verification

- Ran `bun packages/db/apply-pending.ts` against the configured database.
- Ran `bun db:migrate`; it now targets the configured database and exits successfully.
- Verified the Drizzle `projectComments.findMany({ with: { replies: ... } })` query now succeeds for project `57144d95-15a8-40ea-b241-9fb1eebaabf8`.
- Verified the selected `user_settings` columns exist and a settings row is present for user `e51c05c0-1f4d-41c2-ad7e-48f8f3d14ad9`.
- Verified billing foreign keys use restrict deletes, comment author FKs use `ON DELETE SET NULL`, `project_settings` has a primary key, and `auth.users` has the `on_auth_user_created` trigger.

## Follow-Up

- Align the `streamdown`/`shiki` dependency tree so only one compatible Shiki major is installed.
- Consider replacing the four `publish.deployment.getByType` calls with a combined deployment endpoint in a separate focused change.
