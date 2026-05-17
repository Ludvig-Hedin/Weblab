-- Workspaces feature, phase 2: backfill verification.
--
-- 0035 backfilled workspace_id, user_projects.member_role, and
-- project_invitations.member_role on every existing row. We DO NOT promote
-- these columns to NOT NULL here — that lands in 0037 during Phase 9 once
-- every server write path on every deployed bundle has been updated to fill
-- both the legacy and new columns. Keeping them nullable during the
-- transition lets a half-deployed cluster still write new rows safely.
--
-- This file is therefore a no-op assertion: a hard error if backfill is
-- inconsistent, so an admin re-running the migrations spots the drift early.

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "projects" WHERE "workspace_id" IS NULL) THEN
        RAISE EXCEPTION 'Workspaces constraint check failed: project rows missing workspace_id (re-run 0035)';
    END IF;
    IF EXISTS (SELECT 1 FROM "user_projects" WHERE "member_role" IS NULL) THEN
        RAISE EXCEPTION 'Workspaces constraint check failed: user_projects rows missing member_role (re-run 0035)';
    END IF;
    IF EXISTS (SELECT 1 FROM "project_invitations" WHERE "member_role" IS NULL) THEN
        RAISE EXCEPTION 'Workspaces constraint check failed: project_invitations rows missing member_role (re-run 0035)';
    END IF;
END $$;
