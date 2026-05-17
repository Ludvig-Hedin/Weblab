-- Workspaces feature, phase 2: idempotent data backfill.
--   * Personal workspace per existing user.
--   * Workspace owner row.
--   * Assign every project to its OWNER's personal workspace.
--   * Orphan fallback for projects without an OWNER row.
--   * Mark solo-owner projects access_mode='workspace' so the owner's dashboard
--     listing still includes the project. Multi-collaborator projects keep
--     the safe default 'restricted' — existing access never widens.
--   * Map legacy project_role → project_member_role on user_projects and
--     project_invitations.
--
-- Safe to re-run: every write is guarded by WHERE NOT EXISTS / IS NULL /
-- ON CONFLICT DO NOTHING.

BEGIN;

-- (0) Precondition guard.
-- The CASE statements below reference public.users columns (display_name,
-- first_name, email) and the legacy project_role enum values
-- (owner/admin/editor/viewer). All of these are introduced by migrations
-- 0001..0033. If any are missing, abort early with a clear message instead
-- of failing deep inside the backfill with a cryptic "column does not exist".
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'display_name'
    ) THEN
        RAISE EXCEPTION 'Workspaces backfill precondition failed: public.users.display_name missing. Apply migrations 0001..0033 first.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'first_name'
    ) THEN
        RAISE EXCEPTION 'Workspaces backfill precondition failed: public.users.first_name missing. Apply migrations 0001..0033 first.';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'email'
    ) THEN
        RAISE EXCEPTION 'Workspaces backfill precondition failed: public.users.email missing. Apply migrations 0001..0033 first.';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname = 'project_role' AND e.enumlabel = 'editor'
    ) THEN
        RAISE EXCEPTION 'Workspaces backfill precondition failed: project_role enum missing "editor" value. Apply migrations 0001..0033 first.';
    END IF;
END $$;

-- (a) Personal workspace per user.
INSERT INTO "workspaces" ("id", "name", "slug", "kind", "created_by_user_id")
SELECT
    gen_random_uuid(),
    COALESCE(
        NULLIF(TRIM(u."display_name"), ''),
        NULLIF(TRIM(u."first_name"), ''),
        NULLIF(TRIM(split_part(u."email", '@', 1)), ''),
        'Personal'
    ) || '''s Workspace',
    'personal-' || u."id"::text,
    'personal',
    u."id"
FROM "users" u
WHERE NOT EXISTS (
    SELECT 1 FROM "workspaces" w
    WHERE w."created_by_user_id" = u."id" AND w."kind" = 'personal'
);

-- (b) Workspace owner row.
INSERT INTO "workspace_members" ("workspace_id", "user_id", "role")
SELECT w."id", w."created_by_user_id", 'owner'
FROM "workspaces" w
WHERE w."kind" = 'personal'
ON CONFLICT DO NOTHING;

-- (c) Assign each project to its OWNER's personal workspace.
UPDATE "projects" p
SET "workspace_id" = w."id"
FROM "user_projects" up
JOIN "workspaces" w
  ON w."created_by_user_id" = up."user_id" AND w."kind" = 'personal'
WHERE up."project_id" = p."id"
  AND up."role" = 'owner'
  AND p."workspace_id" IS NULL;

-- (c2) Orphan fallback: project with no OWNER row → earliest member's personal workspace.
WITH orphan AS (
    SELECT DISTINCT ON (p."id") p."id" AS pid, up."user_id"
    FROM "projects" p
    JOIN "user_projects" up ON up."project_id" = p."id"
    WHERE p."workspace_id" IS NULL
    ORDER BY p."id", up."created_at" ASC
)
UPDATE "projects" p
SET "workspace_id" = w."id"
FROM orphan o
JOIN "workspaces" w
  ON w."created_by_user_id" = o."user_id" AND w."kind" = 'personal'
WHERE p."id" = o.pid;

-- (d) Access-mode preservation: only solo-owner projects flip to 'workspace';
--     anything with non-owner collaborators stays 'restricted' (DDL default).
UPDATE "projects" p
SET "access_mode" = 'workspace'
WHERE p."access_mode" = 'restricted'
  AND NOT EXISTS (
      SELECT 1 FROM "user_projects" up
      WHERE up."project_id" = p."id" AND up."role" <> 'owner'
  );

-- (e) Map legacy project_role → project_member_role.
UPDATE "user_projects"
SET "member_role" = CASE "role"
    WHEN 'owner'  THEN 'manager'::project_member_role
    WHEN 'admin'  THEN 'manager'::project_member_role
    WHEN 'editor' THEN 'editor'::project_member_role
    WHEN 'viewer' THEN 'viewer'::project_member_role
END
WHERE "member_role" IS NULL;

UPDATE "project_invitations"
SET "member_role" = CASE "role"
    WHEN 'owner'  THEN 'manager'::project_member_role
    WHEN 'admin'  THEN 'manager'::project_member_role
    WHEN 'editor' THEN 'editor'::project_member_role
    WHEN 'viewer' THEN 'viewer'::project_member_role
END
WHERE "member_role" IS NULL;

-- (f) Sanity: every project has a workspace after backfill.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "projects" WHERE "workspace_id" IS NULL) THEN
        RAISE EXCEPTION 'Workspaces backfill incomplete: orphan project(s) detected';
    END IF;
END $$;

COMMIT;
