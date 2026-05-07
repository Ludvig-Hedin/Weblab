import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

config({ path: new URL('../../.env', import.meta.url).pathname, quiet: true });
config({ path: new URL('../../.env.local', import.meta.url).pathname, override: true, quiet: true });

const DEFAULT_DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

export default defineConfig({
    schema: './src/schema',
    out: '../../apps/backend/supabase/migrations',
    dialect: "postgresql",
    schemaFilter: ["public"],
    verbose: true,
    dbCredentials: {
        url: process.env.SUPABASE_DATABASE_URL ?? DEFAULT_DATABASE_URL,
    },
    entities: {
        roles: {
            provider: 'supabase'
        }
    }
});
