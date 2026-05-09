CREATE TABLE "user_provider_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"access_token_encrypted" text NOT NULL,
	"refresh_token_encrypted" text,
	"expires_at" timestamp with time zone,
	"scopes" text,
	"account_email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_provider_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_comments" DROP CONSTRAINT "project_comments_author_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "comment_replies" DROP CONSTRAINT "comment_replies_author_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "rate_limits" DROP CONSTRAINT "rate_limits_subscription_id_subscriptions_id_fk";
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_price_id_prices_id_fk";
--> statement-breakpoint
DROP TYPE "public"."price_keys";--> statement-breakpoint
CREATE TYPE "public"."price_keys" AS ENUM('PRO_MONTHLY_TIER_1', 'PRO_MONTHLY_TIER_2', 'PRO_MONTHLY_TIER_3', 'PRO_MONTHLY_TIER_4', 'PRO_MONTHLY_TIER_5', 'PRO_MONTHLY_TIER_6', 'PRO_MONTHLY_TIER_7', 'PRO_MONTHLY_TIER_8', 'PRO_MONTHLY_TIER_9', 'PRO_MONTHLY_TIER_10', 'PRO_MONTHLY_TIER_11');--> statement-breakpoint
DROP INDEX "conversations_project_id_idx";--> statement-breakpoint
DROP INDEX "messages_conversation_id_idx";--> statement-breakpoint
DROP INDEX "deployments_project_id_idx";--> statement-breakpoint
DROP INDEX "deployments_requested_by_idx";--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "conversations_project_id_idx" ON "conversations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_conversation_id_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deployments_project_id_idx" ON "deployments" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deployments_requested_by_idx" ON "deployments" USING btree ("requested_by");--> statement-breakpoint
ALTER TABLE "project_comments" ALTER COLUMN "author_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "comment_replies" ALTER COLUMN "author_id" SET NOT NULL;--> statement-breakpoint
DO $$
DECLARE
    pk_name TEXT;
BEGIN
    SELECT constraint_name INTO pk_name
    FROM information_schema.table_constraints
    WHERE table_schema = 'public'
        AND table_name = 'project_settings'
        AND constraint_type = 'PRIMARY KEY';

    IF pk_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE project_settings DROP CONSTRAINT %I', pk_name);
    END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "user_provider_connections" ADD CONSTRAINT "user_provider_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "user_provider_connections_user_provider_idx" ON "user_provider_connections" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "user_provider_connections_user_idx" ON "user_provider_connections" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "rate_limits" ADD CONSTRAINT "rate_limits_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_price_id_prices_id_fk" FOREIGN KEY ("price_id") REFERENCES "public"."prices"("id") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "project_settings" ADD CONSTRAINT "project_settings_project_id_unique" UNIQUE("project_id");