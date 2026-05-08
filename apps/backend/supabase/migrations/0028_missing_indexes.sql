-- Add indexes on frequently-queried foreign key columns that were missing.
-- These are used in RLS policy subqueries and common list queries.

CREATE INDEX IF NOT EXISTS "conversations_project_id_idx" ON "conversations" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_conversation_id_idx" ON "messages" USING btree ("conversation_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deployments_project_id_idx" ON "deployments" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deployments_requested_by_idx" ON "deployments" USING btree ("requested_by");
