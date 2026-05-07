import { Client } from "pg";
import { readFileSync } from "fs";

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

const migrationsDir = new URL("../../apps/backend/supabase/migrations", import.meta.url).pathname;

try {
    await client.connect();
    console.log("✓ Connected to database");

    await ensureCommentTables();
    await ensureUserSettingsTable();
    await applyFile(`${migrationsDir}/0022_user_settings_preferences.sql`, "0022_user_settings_preferences");
    await applyFile(`${migrationsDir}/0023_project_runtime_modes.sql`, "0023_project_runtime_modes");
    await applyFile(`${migrationsDir}/0028_missing_indexes.sql`, "0028_missing_indexes");

    console.log("\n🎉 Done! Restart bun dev to pick up the changes.");
} catch (e) {
    console.error("\n❌ Error:", e);
    process.exitCode = 1;
} finally {
    await client.end();
}
