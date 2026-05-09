-- Per-user, per-project "available offline" pin. Used by the web client to
-- pre-cache pinned projects in IndexedDB so the editor can boot without a
-- network round-trip. Composite PK (user_id, project_id) prevents duplicates.

CREATE TABLE IF NOT EXISTS "project_offline_pins" (
    "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "pinned_at" timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY ("user_id", "project_id")
);

CREATE INDEX IF NOT EXISTS "project_offline_pins_user_idx"
    ON "project_offline_pins" ("user_id");

ALTER TABLE "project_offline_pins" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_offline_pins_select_policy" ON "project_offline_pins";
CREATE POLICY "project_offline_pins_select_policy" ON "project_offline_pins"
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "project_offline_pins_insert_policy" ON "project_offline_pins";
CREATE POLICY "project_offline_pins_insert_policy" ON "project_offline_pins"
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "project_offline_pins_delete_policy" ON "project_offline_pins";
CREATE POLICY "project_offline_pins_delete_policy" ON "project_offline_pins"
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);
