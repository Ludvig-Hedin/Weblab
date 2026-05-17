CREATE TYPE "public"."hosting_provider" AS ENUM('freestyle', 'vercel', 'netlify', 'cloudflare', 'railway', 'render');--> statement-breakpoint
CREATE TABLE "cms_collection_page" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"page_path" varchar NOT NULL,
	"match_field_key" varchar NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cms_collection_page_project_path_unique" UNIQUE("project_id","page_path")
);
--> statement-breakpoint
ALTER TABLE "cms_collection_page" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "hosting_provider_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "hosting_provider" NOT NULL,
	"token_encrypted" text NOT NULL,
	"account_label" text,
	"account_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hosting_provider_connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "project_offline_pins" (
	"user_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"pinned_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_offline_pins_user_id_project_id_pk" PRIMARY KEY("user_id","project_id")
);
--> statement-breakpoint
ALTER TABLE "project_offline_pins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"project_id" uuid,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "skills" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cms_item" ADD COLUMN "remote_id" varchar;--> statement-breakpoint
ALTER TABLE "deployments" ADD COLUMN "provider" "hosting_provider" DEFAULT 'freestyle' NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_collection_page" ADD CONSTRAINT "cms_collection_page_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "cms_collection_page" ADD CONSTRAINT "cms_collection_page_collection_id_cms_collection_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."cms_collection"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "hosting_provider_connections" ADD CONSTRAINT "hosting_provider_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "project_offline_pins" ADD CONSTRAINT "project_offline_pins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "project_offline_pins" ADD CONSTRAINT "project_offline_pins_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "hosting_provider_connections_user_provider_idx" ON "hosting_provider_connections" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "hosting_provider_connections_user_idx" ON "hosting_provider_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_offline_pins_user_idx" ON "project_offline_pins" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "skills_user_global_name_unique" ON "skills" USING btree ("user_id","name") WHERE "skills"."project_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "skills_user_project_name_unique" ON "skills" USING btree ("user_id","project_id","name") WHERE "skills"."project_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "cms_collection" ADD CONSTRAINT "cms_collection_project_slug_unique" UNIQUE("project_id","slug");--> statement-breakpoint
ALTER TABLE "cms_field" ADD CONSTRAINT "cms_field_collection_key_unique" UNIQUE("collection_id","key");--> statement-breakpoint
ALTER TABLE "cms_item" ADD CONSTRAINT "cms_item_collection_slug_unique" UNIQUE("collection_id","slug");--> statement-breakpoint
ALTER TABLE "cms_item" ADD CONSTRAINT "cms_item_collection_remote_id_unique" UNIQUE("collection_id","remote_id");