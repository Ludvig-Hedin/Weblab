import { Client } from "pg";
import { readFileSync } from "fs";
import { config } from "dotenv";

config({ path: new URL("../../.env", import.meta.url).pathname, quiet: true });
config({ path: new URL("../../.env.local", import.meta.url).pathname, override: true, quiet: true });

const client = new Client({
    connectionString:
        process.env.SUPABASE_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    ssl:
        process.env.SUPABASE_DATABASE_URL?.includes("supabase.com") === true
            ? { rejectUnauthorized: false }
            : undefined,
});

function splitStatements(sql: string): string[] {
    const cleaned = sql
        .replace(/--> statement-breakpoint/g, "")
        .split("\n")
        .filter((line) => !line.trim().startsWith("--"))
        .join("\n");
    const statements: string[] = [];
    let current = "";
    let dollarTag: string | null = null;

    for (let i = 0; i < cleaned.length; i++) {
        if (!dollarTag && cleaned[i] === "$") {
            const match = cleaned.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
            if (match) {
                dollarTag = match[0];
                current += dollarTag;
                i += dollarTag.length - 1;
                continue;
            }
        }

        if (dollarTag && cleaned.startsWith(dollarTag, i)) {
            current += dollarTag;
            i += dollarTag.length - 1;
            dollarTag = null;
            continue;
        }

        if (!dollarTag && cleaned[i] === ";") {
            const statement = current.trim();
            if (statement.length > 0) {
                statements.push(statement);
            }
            current = "";
            continue;
        }

        current += cleaned[i];
    }

    const remaining = current.trim();
    if (remaining.length > 0) {
        statements.push(remaining);
    }
    return statements;
}

async function applyFile(filePath: string, label: string) {
    console.log(`\nApplying ${label}...`);
    const sql = readFileSync(filePath, "utf-8");
    const statements = splitStatements(sql);

    for (const stmt of statements) {
        try {
            await client.query(stmt);
            const preview = stmt.slice(0, 90).replace(/\s+/g, " ");
            console.log(`  ✓ ${preview}`);
        } catch (e: unknown) {
            const preview = stmt.slice(0, 90).replace(/\s+/g, " ");
            const code = typeof e === "object" && e !== null && "code" in e ? String(e.code) : undefined;
            const message = e instanceof Error ? e.message : String(e);
            if (
                code === "42701" || // duplicate_column
                code === "42710" || // duplicate_object
                message.includes("already exists")
            ) {
                console.log(`  ⚠ Already exists, skipped: ${preview}`);
            } else {
                console.error(`  ✗ Failed (${code}): ${message}`);
                console.error(`  SQL: ${preview}`);
                throw e;
            }
        }
    }
    console.log(`  ✅ ${label} done`);
}

async function getCount(sql: string): Promise<number> {
    const result = await client.query<{ count: string | number }>(sql);
    const value = result.rows[0]?.count ?? 0;
    return Number(value);
}

async function constraintExists(name: string): Promise<boolean> {
    const result = await client.query<{ exists: boolean }>(
        `SELECT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE connamespace = 'public'::regnamespace
              AND conname = $1
        )`,
        [name],
    );
    return result.rows[0]?.exists === true;
}

async function foreignKeyDeleteAction(name: string): Promise<string | null> {
    const result = await client.query<{ confdeltype: string }>(
        `SELECT confdeltype
         FROM pg_constraint
         WHERE connamespace = 'public'::regnamespace
           AND conname = $1`,
        [name],
    );
    return result.rows[0]?.confdeltype ?? null;
}

async function ensureCommentTables() {
    console.log("\nEnsuring comment tables...");
    await client.query(`
        CREATE TABLE IF NOT EXISTS "project_comments" (
            "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
            "project_id" uuid NOT NULL,
            "canvas_x" real NOT NULL,
            "canvas_y" real NOT NULL,
            "element_selector" text,
            "content" text NOT NULL,
            "author_id" uuid,
            "author_name" text NOT NULL,
            "created_at" timestamp with time zone DEFAULT now() NOT NULL,
            "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
            "resolved_at" timestamp with time zone
        )
    `);
    await client.query(`
        CREATE TABLE IF NOT EXISTS "comment_replies" (
            "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
            "comment_id" uuid NOT NULL,
            "content" text NOT NULL,
            "author_id" uuid,
            "author_name" text NOT NULL,
            "created_at" timestamp with time zone DEFAULT now() NOT NULL,
            "updated_at" timestamp with time zone DEFAULT now() NOT NULL
        )
    `);
    await client.query(`ALTER TABLE "project_comments" ENABLE ROW LEVEL SECURITY`);
    await client.query(`ALTER TABLE "comment_replies" ENABLE ROW LEVEL SECURITY`);
    await client.query(`ALTER TABLE "project_comments" ALTER COLUMN "author_id" DROP NOT NULL`);
    await client.query(`ALTER TABLE "comment_replies" ALTER COLUMN "author_id" DROP NOT NULL`);
    await client.query(
        `CREATE INDEX IF NOT EXISTS "project_comments_project_id_idx" ON "project_comments" USING btree ("project_id")`,
    );
    await client.query(
        `CREATE INDEX IF NOT EXISTS "project_comments_author_id_idx" ON "project_comments" USING btree ("author_id")`,
    );
    await client.query(
        `CREATE INDEX IF NOT EXISTS "comment_replies_comment_id_idx" ON "comment_replies" USING btree ("comment_id")`,
    );
    console.log("  ✅ comment tables ready");
}

async function ensureCommentAuthorForeignKeys() {
    console.log("\nEnsuring comment author foreign keys...");
    const orphanComments = await getCount(`
        SELECT count(*) FROM project_comments pc
        LEFT JOIN users u ON u.id = pc.author_id
        WHERE pc.author_id IS NOT NULL AND u.id IS NULL
    `);
    const orphanReplies = await getCount(`
        SELECT count(*) FROM comment_replies cr
        LEFT JOIN users u ON u.id = cr.author_id
        WHERE cr.author_id IS NOT NULL AND u.id IS NULL
    `);

    if (orphanComments > 0 || orphanReplies > 0) {
        throw new Error(
            `Refusing to add comment author FKs with orphan data: ${orphanComments} comments, ${orphanReplies} replies`,
        );
    }

    if (!(await constraintExists("project_comments_author_id_users_id_fk"))) {
        await client.query(`
            ALTER TABLE "project_comments"
            ADD CONSTRAINT "project_comments_author_id_users_id_fk"
            FOREIGN KEY ("author_id") REFERENCES "public"."users"("id")
            ON DELETE set null ON UPDATE cascade
        `);
    }
    if (!(await constraintExists("comment_replies_author_id_users_id_fk"))) {
        await client.query(`
            ALTER TABLE "comment_replies"
            ADD CONSTRAINT "comment_replies_author_id_users_id_fk"
            FOREIGN KEY ("author_id") REFERENCES "public"."users"("id")
            ON DELETE set null ON UPDATE cascade
        `);
    }
    console.log("  ✅ comment author foreign keys ready");
}

async function ensureUserSettingsTable() {
    console.log("\nEnsuring user_settings table...");
    await client.query(`
        CREATE TABLE IF NOT EXISTS "user_settings" (
            "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
            "user_id" uuid NOT NULL UNIQUE,
            "auto_apply_code" boolean DEFAULT true NOT NULL,
            "expand_code_blocks" boolean DEFAULT true NOT NULL,
            "show_suggestions" boolean DEFAULT true NOT NULL,
            "show_mini_chat" boolean DEFAULT false NOT NULL,
            "should_warn_delete" boolean DEFAULT true NOT NULL,
            "default_model" text,
            "ollama_base_url" text,
            "max_images" integer DEFAULT 5 NOT NULL,
            "enable_bun_replace" boolean DEFAULT true NOT NULL,
            "build_flags" text DEFAULT '--no-lint' NOT NULL,
            "theme" text DEFAULT 'system' NOT NULL,
            "accent_color" text DEFAULT 'blue' NOT NULL,
            "font_family" text DEFAULT 'sans' NOT NULL,
            "font_size" text DEFAULT 'medium' NOT NULL,
            "ui_density" text DEFAULT 'comfortable' NOT NULL,
            "locale" text DEFAULT 'en' NOT NULL,
            "auto_commit" boolean DEFAULT false NOT NULL,
            "auto_push" boolean DEFAULT false NOT NULL,
            "commit_message_format" text DEFAULT 'feat: {description}' NOT NULL,
            "default_branch_pattern" text DEFAULT 'feature/{timestamp}' NOT NULL,
            "custom_shortcuts" jsonb DEFAULT '{}'::jsonb NOT NULL
        )
    `);
    await client.query(`ALTER TABLE "user_settings" ENABLE ROW LEVEL SECURITY`);
    console.log("  ✅ user_settings table ready");
}

async function ensureCommonIndexes() {
    console.log("\nEnsuring common indexes...");
    await client.query(
        `CREATE INDEX IF NOT EXISTS "conversations_project_id_idx" ON "conversations" USING btree ("project_id")`,
    );
    await client.query(
        `CREATE INDEX IF NOT EXISTS "messages_conversation_id_idx" ON "messages" USING btree ("conversation_id")`,
    );
    await client.query(
        `CREATE INDEX IF NOT EXISTS "deployments_project_id_idx" ON "deployments" USING btree ("project_id")`,
    );
    await client.query(
        `CREATE INDEX IF NOT EXISTS "deployments_requested_by_idx" ON "deployments" USING btree ("requested_by")`,
    );
    console.log("  ✅ common indexes ready");
}

async function ensureProjectSettingsPrimaryKey() {
    console.log("\nEnsuring project_settings primary key...");
    const duplicateProjectSettings = await getCount(`
        SELECT count(*) FROM (
            SELECT project_id
            FROM project_settings
            GROUP BY project_id
            HAVING count(*) > 1
        ) duplicates
    `);
    if (duplicateProjectSettings > 0) {
        throw new Error(
            `Refusing to add project_settings primary key with ${duplicateProjectSettings} duplicate project_id values`,
        );
    }

    if (!(await constraintExists("project_settings_pkey"))) {
        await client.query(
            `ALTER TABLE "project_settings" DROP CONSTRAINT IF EXISTS "project_settings_project_id_unique"`,
        );
        await client.query(`ALTER TABLE "project_settings" ADD PRIMARY KEY ("project_id")`);
    }
    console.log("  ✅ project_settings primary key ready");
}

async function ensureRestrictForeignKey({
    table,
    constraint,
    column,
    targetTable,
    targetColumn,
}: {
    table: string;
    constraint: string;
    column: string;
    targetTable: string;
    targetColumn: string;
}) {
    const deleteAction = await foreignKeyDeleteAction(constraint);
    if (deleteAction === "r" || deleteAction === "a") {
        return;
    }

    const orphanCount = await getCount(`
        SELECT count(*) FROM "${table}" source
        LEFT JOIN "${targetTable}" target ON target."${targetColumn}" = source."${column}"
        WHERE source."${column}" IS NOT NULL AND target."${targetColumn}" IS NULL
    `);
    if (orphanCount > 0) {
        throw new Error(
            `Refusing to update ${constraint}; found ${orphanCount} orphan ${table}.${column} values`,
        );
    }

    if (deleteAction !== null) {
        await client.query(`ALTER TABLE "${table}" DROP CONSTRAINT "${constraint}"`);
    }
    await client.query(`
        ALTER TABLE "${table}"
        ADD CONSTRAINT "${constraint}"
        FOREIGN KEY ("${column}") REFERENCES "public"."${targetTable}"("${targetColumn}")
        ON DELETE restrict ON UPDATE cascade
    `);
}

async function ensureBillingRestrictForeignKeys() {
    console.log("\nEnsuring billing foreign keys use restrict deletes...");
    await ensureRestrictForeignKey({
        table: "subscriptions",
        constraint: "subscriptions_product_id_products_id_fk",
        column: "product_id",
        targetTable: "products",
        targetColumn: "id",
    });
    await ensureRestrictForeignKey({
        table: "subscriptions",
        constraint: "subscriptions_price_id_prices_id_fk",
        column: "price_id",
        targetTable: "prices",
        targetColumn: "id",
    });
    await ensureRestrictForeignKey({
        table: "rate_limits",
        constraint: "rate_limits_subscription_id_subscriptions_id_fk",
        column: "subscription_id",
        targetTable: "subscriptions",
        targetColumn: "id",
    });
    console.log("  ✅ billing foreign keys ready");
}

async function ensureAuthUserTrigger() {
    console.log("\nEnsuring auth user trigger...");
    await client.query(`
        CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
        RETURNS trigger
        LANGUAGE plpgsql
        SECURITY DEFINER
        SET search_path = public
        AS $$
        BEGIN
            IF NEW.email IS NULL THEN
                RETURN NEW;
            END IF;

            INSERT INTO public.users (id, email, first_name, last_name, avatar_url, created_at, updated_at)
            VALUES (
                NEW.id,
                NEW.email,
                COALESCE(
                    NEW.raw_user_meta_data ->> 'given_name',
                    NEW.raw_user_meta_data ->> 'first_name',
                    split_part(NEW.raw_user_meta_data ->> 'full_name', ' ', 1)
                ),
                COALESCE(
                    NEW.raw_user_meta_data ->> 'family_name',
                    NEW.raw_user_meta_data ->> 'last_name',
                    NULLIF(regexp_replace(NEW.raw_user_meta_data ->> 'full_name', '^[^ ]+ ?', ''), '')
                ),
                NEW.raw_user_meta_data ->> 'avatar_url',
                NOW(),
                NOW()
            )
            ON CONFLICT (id) DO NOTHING;
            RETURN NEW;
        END;
        $$;
    `);
    await client.query(`
        CREATE OR REPLACE TRIGGER on_auth_user_created
            AFTER INSERT ON auth.users
            FOR EACH ROW
            EXECUTE FUNCTION public.handle_new_auth_user()
    `);
    console.log("  ✅ auth user trigger ready");
}

async function syncDrizzleMigrationTracking() {
    console.log("\nSyncing Drizzle migration tracking...");
    await client.query(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
            id SERIAL PRIMARY KEY,
            hash text NOT NULL,
            created_at bigint
        )
    `);

    const latestWhen = 1778104815128;
    const latestTag = "0028_missing_indexes";
    const latest = await client.query<{ created_at: string | number }>(
        `SELECT created_at
         FROM "drizzle"."__drizzle_migrations"
         ORDER BY created_at DESC
         LIMIT 1`,
    );
    const lastCreatedAt = Number(latest.rows[0]?.created_at ?? 0);
    if (lastCreatedAt < latestWhen) {
        await client.query(
            `INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
            [latestTag, latestWhen],
        );
    }
    console.log("  ✅ Drizzle migration tracking ready");
}

const migrationsDir = new URL("../../apps/backend/supabase/migrations", import.meta.url).pathname;

try {
    await client.connect();
    console.log("✓ Connected to database");

    await ensureCommentTables();
    await ensureUserSettingsTable();
    await applyFile(`${migrationsDir}/0022_user_settings_preferences.sql`, "0022_user_settings_preferences");
    await applyFile(`${migrationsDir}/0023_project_runtime_modes.sql`, "0023_project_runtime_modes");
    await ensureCommonIndexes();
    await ensureCommentAuthorForeignKeys();
    await ensureProjectSettingsPrimaryKey();
    await ensureBillingRestrictForeignKeys();
    await ensureAuthUserTrigger();
    await syncDrizzleMigrationTracking();

    console.log("\n🎉 Done! Restart bun dev to pick up the changes.");
} catch (e) {
    console.error("\n❌ Error:", e);
    process.exitCode = 1;
} finally {
    await client.end();
}
