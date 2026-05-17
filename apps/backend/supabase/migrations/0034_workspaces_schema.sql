-- Workspaces feature, phase 2: additive schema only.
--   * New enums for workspace/project roles, invitation status, access mode, audit events.
--   * New tables: workspaces, workspace_members, workspace_invitations,
--                 project_members, audit_log.
--   * Additive columns on projects (workspace_id nullable, access_mode default
--     'restricted'), user_projects (member_role nullable),
--     project_invitations (member_role nullable, status w/ default 'pending',
--     accepted_at, revoked_at).
--
-- Backfill runs in 0035. Constraints (SET NOT NULL, partial unique pending)
-- run in 0036. Legacy enum / column drop runs in 0037 during Phase 9 ONLY.

BEGIN;

-- 1. Enums
DO $$ BEGIN
    CREATE TYPE "workspace_kind" AS ENUM ('personal', 'team');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "workspace_role" AS ENUM ('owner', 'admin', 'member', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "project_member_role" AS ENUM ('manager', 'editor', 'reviewer', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "project_access_mode" AS ENUM ('workspace', 'restricted');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "invitation_status" AS ENUM ('pending', 'accepted', 'revoked', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE "audit_event_kind" AS ENUM (
        'workspace.created',
        'workspace.renamed',
        'workspace.deleted',
        'workspace_member.invited',
        'workspace_invite.accepted',
        'workspace_invite.revoked',
        'workspace_member.role_changed',
        'workspace_member.removed',
        'project.access_mode_changed',
        'project_member.invited',
        'project_invite.accepted',
        'project_invite.revoked',
        'project_member.role_changed',
        'project_member.removed'
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Tables
CREATE TABLE IF NOT EXISTS "workspaces" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" varchar NOT NULL,
    "slug" varchar NOT NULL,
    "kind" "workspace_kind" NOT NULL DEFAULT 'team',
    "avatar_url" text,
    "created_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "workspaces_slug_unique" ON "workspaces" ("slug");
CREATE INDEX IF NOT EXISTS "workspaces_created_by_user_idx" ON "workspaces" ("created_by_user_id");
ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "workspace_members" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "role" "workspace_role" NOT NULL,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_members_workspace_user_unique"
    ON "workspace_members" ("workspace_id", "user_id");
CREATE INDEX IF NOT EXISTS "workspace_members_user_idx" ON "workspace_members" ("user_id");
ALTER TABLE "workspace_members" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "workspace_invitations" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "email" varchar NOT NULL,
    "role" "workspace_role" NOT NULL,
    "token" varchar NOT NULL UNIQUE,
    "status" "invitation_status" NOT NULL DEFAULT 'pending',
    "invited_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "expires_at" timestamptz NOT NULL,
    "accepted_at" timestamptz,
    "revoked_at" timestamptz,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "workspace_invitations_email_workspace_status_idx"
    ON "workspace_invitations" ("email", "workspace_id", "status");
-- Block duplicate pending invites per (workspace, email)
CREATE UNIQUE INDEX IF NOT EXISTS "workspace_invitations_pending_unique"
    ON "workspace_invitations" ("workspace_id", "email") WHERE "status" = 'pending';
ALTER TABLE "workspace_invitations" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "project_members" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "role" "project_member_role" NOT NULL,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "project_members_project_user_unique"
    ON "project_members" ("project_id", "user_id");
CREATE INDEX IF NOT EXISTS "project_members_user_idx" ON "project_members" ("user_id");
ALTER TABLE "project_members" ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS "audit_log" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "workspace_id" uuid REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    "event" "audit_event_kind" NOT NULL,
    "payload" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "audit_log_workspace_idx" ON "audit_log" ("workspace_id", "created_at");
CREATE INDEX IF NOT EXISTS "audit_log_project_idx" ON "audit_log" ("project_id", "created_at");
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;

-- 3. Additive columns on existing tables
ALTER TABLE "projects"
    ADD COLUMN IF NOT EXISTS "workspace_id" uuid REFERENCES "workspaces"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD COLUMN IF NOT EXISTS "access_mode" "project_access_mode" NOT NULL DEFAULT 'restricted';
CREATE INDEX IF NOT EXISTS "projects_workspace_idx" ON "projects" ("workspace_id");

ALTER TABLE "user_projects"
    ADD COLUMN IF NOT EXISTS "member_role" "project_member_role";

ALTER TABLE "project_invitations"
    ADD COLUMN IF NOT EXISTS "member_role" "project_member_role",
    ADD COLUMN IF NOT EXISTS "status" "invitation_status" NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS "accepted_at" timestamptz,
    ADD COLUMN IF NOT EXISTS "revoked_at" timestamptz;
CREATE INDEX IF NOT EXISTS "project_invitations_status_idx" ON "project_invitations" ("status");
-- Block duplicate pending project invites per (project, email)
CREATE UNIQUE INDEX IF NOT EXISTS "project_invitations_pending_unique"
    ON "project_invitations" ("project_id", "invitee_email") WHERE "status" = 'pending';

COMMIT;
