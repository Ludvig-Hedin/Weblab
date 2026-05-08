/**
 * Syncs Drizzle's migration tracking table with migrations already applied by
 * the Supabase CLI. Run this once after "bun backend:start" if "bun db:migrate"
 * fails with "already exists" errors.
 *
 * drizzle-kit migrate tracks applied migrations in drizzle.__drizzle_migrations.
 * It skips everything with created_at <= the last recorded entry. Since Supabase
 * applied all migrations but Drizzle's table only knows about some of them, we
 * insert a sentinel for the latest migration so drizzle-kit won't re-run the rest.
 */
import { Client } from "pg";
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

try {
    await client.connect();
    console.log("Connected");

    await client.query(`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
    await client.query(`
        CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
            id SERIAL PRIMARY KEY,
            hash text NOT NULL,
            created_at bigint
        )
    `);

    const { rows } = await client.query(
        `SELECT id, hash, created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC LIMIT 1`,
    );
    const last = rows[0];

    // Timestamp of 0028_missing_indexes from the local forward sync script.
    const latestWhen = 1778104815128;
    const latestTag = "0028_missing_indexes";

    if (!last || Number(last.created_at) < latestWhen) {
        await client.query(
            `INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)`,
            [latestTag, latestWhen],
        );
        console.log(`✅ Inserted sentinel for ${latestTag}`);
    } else {
        console.log("✅ Already up to date:", last.hash, "@", last.created_at);
    }
} catch (e) {
    console.error("❌ Error:", e);
    throw e;
} finally {
    await client.end();
}

console.log("Done. Run: bun db:migrate");
