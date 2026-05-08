-- Add explicit primary key to project_settings table.
-- Previously relied on unique(project_id) which doesn't give Drizzle proper PK semantics.

ALTER TABLE "project_settings" DROP CONSTRAINT IF EXISTS "project_settings_project_id_unique";
--> statement-breakpoint
ALTER TABLE "project_settings" ADD PRIMARY KEY ("project_id");
