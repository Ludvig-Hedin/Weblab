// Local replacement for `@supabase/supabase-js`'s `User` type. The migration
// to Clerk + Convex removed the runtime Supabase Auth client, but two helpers
// (`clerk-bridge.ts`, `current-user.ts`) still emit a synthetic user object in
// the legacy Supabase shape so existing call sites keep compiling. Importing
// `User` from `@supabase/supabase-js` only resolves because the Bun workspace
// hoists the package from `apps/backend`'s `supabase` CLI dependency — that
// graph is incidental and can break the typecheck the moment the backend
// package drops the CLI. Define the minimal shape we actually consume.
//
// Keep this list narrow. If a new field is needed at a call site, add it
// here deliberately — do not re-introduce the @supabase/supabase-js import.

export interface BridgedUser {
    id: string;
    aud: string;
    role: string;
    email: string;
    app_metadata: {
        provider?: string;
        providers?: string[];
        [key: string]: unknown;
    };
    user_metadata: {
        first_name?: string;
        last_name?: string;
        full_name?: string;
        avatar_url?: string;
        [key: string]: unknown;
    };
    identities: unknown[];
    created_at: string;
    updated_at: string;
}
