-- Agent Skills authored by users. Two scopes split on project_id:
--   * NULL → user-global, shared across all the user's projects.
--   * set  → per-project, only loaded for that project.
--
-- Resolution at chat time gives project rows priority over user-global,
-- then filesystem (dev), then EMBEDDED_SKILLS (built-ins). Same `name`
-- higher in the chain wins, so users can override built-ins by creating
-- a same-named skill at user-global or project scope.

CREATE TABLE IF NOT EXISTS "skills" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "project_id" uuid REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "name" text NOT NULL,
    "description" text NOT NULL DEFAULT '',
    "content" text NOT NULL DEFAULT '',
    "enabled" boolean NOT NULL DEFAULT true,
    "created_at" timestamptz NOT NULL DEFAULT now(),
    "updated_at" timestamptz NOT NULL DEFAULT now()
);

-- Postgres treats NULL as distinct in regular UNIQUE constraints, so we
-- enforce per-scope name uniqueness with two partial indexes.
CREATE UNIQUE INDEX IF NOT EXISTS "skills_user_global_name_unique"
    ON "skills" ("user_id", "name") WHERE "project_id" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "skills_user_project_name_unique"
    ON "skills" ("user_id", "project_id", "name") WHERE "project_id" IS NOT NULL;

-- Lookup indexes for the two access patterns the chat route hits.
CREATE INDEX IF NOT EXISTS "skills_user_idx" ON "skills" ("user_id");
CREATE INDEX IF NOT EXISTS "skills_project_idx" ON "skills" ("project_id") WHERE "project_id" IS NOT NULL;

ALTER TABLE "skills" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "skills_select_policy" ON "skills";
CREATE POLICY "skills_select_policy" ON "skills"
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "skills_insert_policy" ON "skills";
CREATE POLICY "skills_insert_policy" ON "skills"
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "skills_update_policy" ON "skills";
CREATE POLICY "skills_update_policy" ON "skills"
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "skills_delete_policy" ON "skills";
CREATE POLICY "skills_delete_policy" ON "skills"
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
