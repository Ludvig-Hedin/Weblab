-- Workspaces feature, Phase 9: drop legacy schema after soak.
--
-- DO NOT APPLY THIS MIGRATION UNTIL:
--   1. The workspace feature has been in production for ≥ 1 week.
--   2. Telemetry confirms every deployed bundle uses `member_role` /
--      `workspace_id` columns and the `requireCap` layer (no legacy
--      `project_role` reads from any app server).
--   3. A snapshot diff has confirmed `(userId, projectId : has_view)` is
--      unchanged vs the post-0035 baseline (no access widening).
--
-- The drop is irreversible: rolling back requires restoring the column +
-- enum + every row's legacy value.

BEGIN;

-- 1. Tighten NOT NULL on workspace + member_role columns now that all
--    write paths populate them.
ALTER TABLE "projects" ALTER COLUMN "workspace_id" SET NOT NULL;
ALTER TABLE "user_projects" ALTER COLUMN "member_role" SET NOT NULL;
ALTER TABLE "project_invitations" ALTER COLUMN "member_role" SET NOT NULL;

-- 2. Drop legacy `role` columns on user_projects and project_invitations.
ALTER TABLE "user_projects" DROP COLUMN IF EXISTS "role";
ALTER TABLE "project_invitations" DROP COLUMN IF EXISTS "role";

-- 3. Drop the legacy enum type now that nothing references it.
DROP TYPE IF EXISTS "project_role";

-- 4. Rename user_projects → project_members for clarity (the schema TS will
--    keep the join table name in sync). This requires updating all queries
--    that reference `user_projects`. Do this after the column drop above so
--    the rename is purely cosmetic.
--
-- NOTE: keeping `user_projects` until app code references the new name in
-- every router. If you choose to rename now, follow up the app PR with the
-- schema rename in the same release. Uncomment when ready:
--
-- ALTER TABLE "user_projects" RENAME TO "project_members_legacy";
--
-- (Or perform the rename in a separate migration once dual-mode reads
-- are removed from the codebase.)

COMMIT;
