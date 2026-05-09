CREATE TABLE "cms_binding" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"oid" varchar NOT NULL,
	"binding" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cms_binding" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cms_collection" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"name" varchar NOT NULL,
	"slug" varchar NOT NULL,
	"icon" varchar,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cms_collection" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cms_field" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"name" varchar NOT NULL,
	"key" varchar NOT NULL,
	"type" varchar NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"help_text" varchar,
	"required" boolean DEFAULT false NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cms_field" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cms_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collection_id" uuid NOT NULL,
	"slug" varchar,
	"status" varchar DEFAULT 'draft' NOT NULL,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "cms_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cms_source" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" varchar NOT NULL,
	"type" varchar DEFAULT 'weblab' NOT NULL,
	"credentials" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" varchar DEFAULT 'connected' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cms_source" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "rate_limits" DROP CONSTRAINT "rate_limits_subscription_id_subscriptions_id_fk";
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_price_id_prices_id_fk";
--> statement-breakpoint
ALTER TABLE "frames" ADD COLUMN "group_id" text;--> statement-breakpoint
ALTER TABLE "frames" ADD COLUMN "breakpoint_id" text;--> statement-breakpoint
ALTER TABLE "frames" ADD COLUMN "breakpoint_name" text;--> statement-breakpoint
ALTER TABLE "frames" ADD COLUMN "breakpoint_order" numeric;--> statement-breakpoint
ALTER TABLE "cms_binding" ADD CONSTRAINT "cms_binding_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "cms_collection" ADD CONSTRAINT "cms_collection_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "cms_collection" ADD CONSTRAINT "cms_collection_source_id_cms_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."cms_source"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "cms_field" ADD CONSTRAINT "cms_field_collection_id_cms_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."cms_collection"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "cms_item" ADD CONSTRAINT "cms_item_collection_id_cms_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."cms_collection"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "cms_source" ADD CONSTRAINT "cms_source_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "rate_limits" ADD CONSTRAINT "rate_limits_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_price_id_prices_id_fk" FOREIGN KEY ("price_id") REFERENCES "public"."prices"("id") ON DELETE cascade ON UPDATE cascade;