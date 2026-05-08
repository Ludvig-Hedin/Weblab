-- Add FK constraints from comment author_id to users table.
-- author_id becomes nullable so ON DELETE SET NULL can work:
-- when a user is deleted, their comments remain but author_id is set to null.
-- author_name stays as a denormalized display fallback.

ALTER TABLE "project_comments" ALTER COLUMN "author_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "comment_replies" ALTER COLUMN "author_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "project_comments" ADD CONSTRAINT "project_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "comment_replies" ADD CONSTRAINT "comment_replies_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;
