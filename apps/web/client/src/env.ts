import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
    /**
     * Specify your server-side environment variables schema here. This way you can ensure the app
     * isn't built with invalid env vars.
     */
    server: {
        NODE_ENV: z.enum(['development', 'test', 'production']),
        // CodeSandbox is archived (2026-05-24 — see
        // docs/notes/2026-05-13-vercel-sandbox-provider.md). Vercel Sandbox is
        // the only runtime. CSB_API_KEY is retained as optional so legacy
        // `.env.local` files don't trip the validator and so reading existing
        // CSB-backed projects (which still carry `cloudProvider: 'code_sandbox'`
        // in their DB row) doesn't crash during the rollout. New projects
        // never use it; the variable is scheduled for removal once all live
        // projects have been forked into Vercel sandboxes.
        CSB_API_KEY: z.string().optional(),
        // DEAD — retained only so existing `.env.local` files setting this
        // value don't trip the env validator. The 2026-05-24 CodeSandbox
        // archive made Vercel the only runtime; no code in the app reads
        // this variable anymore. Safe to remove from `.env.local`. Will
        // be deleted from this schema once all legacy CSB-backed DB rows
        // have been migrated and the literal `'code_sandbox'` is dropped
        // from `projects.sandboxRuntime.provider`.
        WEBLAB_CLOUD_PROVIDER: z
            .enum(['code_sandbox', 'vercel_sandbox'])
            .default('vercel_sandbox'),
        VERCEL_TEAM_ID: z.string().optional(),
        VERCEL_PROJECT_ID: z.string().optional(),
        VERCEL_TOKEN: z.string().optional(),
        VERCEL_SANDBOX_TIMEOUT_MS: z.coerce.number().positive().optional(),
        // Snapshot ID of a pre-built Vercel sandbox that contains a
        // post-`npm install` Next.js scaffold. When set, `sandbox.fork`
        // with the BLANK template resumes from this snapshot instead of
        // re-running scaffold + npm install (saves 60-180s per blank
        // project). Build with `bun scripts/create-vercel-template.mjs`
        // and copy the printed snapshot id here.
        VERCEL_BLANK_SNAPSHOT_ID: z.string().optional(),
        // vCPU count for Vercel sandboxes. Higher = faster cold compile
        // and dev-server warmup, more $$ per second. Range Vercel
        // supports: 1-8 (last verified Q2 2026). Default 4.
        WEBLAB_VERCEL_VCPUS: z.coerce.number().int().min(1).max(8).default(4),
        // Size of pre-attached warm sandbox pool. When > 0, server
        // maintains N idle resumed sandboxes ready for instant attach.
        // Big speed win (cuts ~3-8s VM resume), continuous VM-hour
        // cost. Default 0 = disabled. Toggle for demos.
        WEBLAB_VERCEL_WARM_POOL_SIZE: z.coerce.number().int().min(0).max(50).default(0),
        // When true, projects list cards prefetch /project/[id] on
        // hover. Cuts navigation latency, increases CDN + tRPC load.
        // Safe to leave on for low-traffic apps. Default off.
        WEBLAB_AGGRESSIVE_PREFETCH: z
            .enum(['true', 'false'])
            .default('false')
            .transform((v) => v === 'true'),
        // Legacy Supabase env vars. Post-migration nothing reads these at
        // runtime — kept optional so old `.env.local` files don't crash
        // startup and so an emergency rollback (WEBLAB_AUTH_PROVIDER=supabase)
        // can re-introduce them without a schema bump.
        SUPABASE_URL: z.url().optional(),
        SUPABASE_DATABASE_URL: z.url().optional(),
        SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

        // Clerk auth (Phase 3: added alongside Supabase during transition)
        CLERK_SECRET_KEY: z.string().optional(),
        CLERK_WEBHOOK_SECRET: z.string().optional(),
        CLERK_JWT_ISSUER_DOMAIN: z.url().optional(),

        // Phase 5 auth bridge: chooses identity provider for tRPC + middleware.
        // Post-migration default = 'clerk'. 'supabase' is retained for emergency
        // rollback; new deployments should never set it.
        WEBLAB_AUTH_PROVIDER: z.enum(['supabase', 'clerk']).default('clerk'),
        // Used by the Clerk webhook handler to delete the Clerk-side identity
        // when the user deletes their account from inside Weblab. Without
        // this the Clerk record orphans and the user can silently re-create
        // their account on the same email.

        RESEND_API_KEY: z.string().optional(),
        FREESTYLE_API_KEY: z.string().optional(),

        // Stripe
        STRIPE_WEBHOOK_SECRET: z.string().optional(),
        STRIPE_SECRET_KEY: z.string().optional(),

        // Apply models
        MORPH_API_KEY: z.string().optional(),
        RELACE_API_KEY: z.string().optional(),

        // Bedrock
        AWS_ACCESS_KEY_ID: z.string().optional(),
        AWS_SECRET_ACCESS_KEY: z.string().optional(),
        AWS_REGION: z.string().optional(),

        // Google Vertex AI
        GOOGLE_CLIENT_EMAIL: z.string().optional(),
        GOOGLE_PRIVATE_KEY: z.string().optional(),
        GOOGLE_PRIVATE_KEY_ID: z.string().optional(),

        // Model providers
        OPENROUTER_API_KEY: z.string(),
        ANTHROPIC_API_KEY: z.string().optional(),
        GOOGLE_AI_STUDIO_API_KEY: z.string().optional(),
        OPENAI_API_KEY: z.string().optional(),

        // n8n
        N8N_WEBHOOK_URL: z.string().optional(),
        N8N_API_KEY: z.string().optional(),
        N8N_LANDING_FORM_URL: z.string().url().optional(),
        N8N_LANDING_FORM_HEADER_NAME: z.string().optional(),
        N8N_LANDING_FORM_HEADER_VALUE: z.string().optional(),

        // Email
        // When 'true', sendInvitationEmail runs in dryRun mode (no actual email sent).
        // Default: emails always send unless explicitly disabled.
        EMAIL_DRY_RUN: z.enum(['true', 'false']).optional(),

        // Firecrawl
        FIRECRAWL_API_KEY: z.string().optional(),

        // Exa
        EXA_API_KEY: z.string().optional(),

        // Mem0
        MEM0_API_KEY: z.string().optional(),

        // Langfuse
        LANGFUSE_SECRET_KEY: z.string().optional(),
        LANGFUSE_PUBLIC_KEY: z.string().optional(),
        LANGFUSE_BASEURL: z.string().url().optional(),

        // GitHub
        GITHUB_APP_ID: z.string().optional(),
        GITHUB_APP_PRIVATE_KEY: z.string().optional(),
        GITHUB_APP_SLUG: z.string().optional(),

        // Figma
        FIGMA_PERSONAL_ACCESS_TOKEN: z.string().optional(),

        // Design system page password (required when not on localhost)
        DESIGN_SYSTEM_PASSWORD: z.string().optional(),

        // OAuth provider connection token encryption (32-byte base64 secret).
        // Required at runtime for `/api/auth/providers/*`; optional in build/dev.
        PROVIDER_TOKEN_ENCRYPTION_KEY: z.string().optional(),

        // External CMS source credential encryption (32-byte base64 secret).
        // Required at runtime to connect Payload/Strapi/REST sources; optional
        // in build/dev. Generate with `openssl rand -base64 32`.
        CMS_SOURCE_ENCRYPTION_KEY: z.string().optional(),

        // OAuth client credentials per provider.
        GEMINI_OAUTH_CLIENT_ID: z.string().optional(),
        GEMINI_OAUTH_CLIENT_SECRET: z.string().optional(),
        OPENCODE_OAUTH_CLIENT_ID: z.string().optional(),
        OPENCODE_OAUTH_CLIENT_SECRET: z.string().optional(),
        CURSOR_OAUTH_CLIENT_ID: z.string().optional(),
        CURSOR_OAUTH_CLIENT_SECRET: z.string().optional(),
        CODEX_OAUTH_CLIENT_ID: z.string().optional(),
        CODEX_OAUTH_CLIENT_SECRET: z.string().optional(),
    },
    /**
     * Specify your client-side environment variables schema here. This way you can ensure the app
     * isn't built with invalid env vars. To expose them to the client, prefix them with
     * `NEXT_PUBLIC_`.
     */
    client: {
        NEXT_PUBLIC_SITE_URL: z.url().default('http://localhost:3000'),
        NEXT_PUBLIC_SHOW_DEV_LOGIN: z.preprocess((value) => {
            if (value === undefined) return false;
            if (typeof value === 'string') return value === 'true';
            return value;
        }, z.boolean()),
        // Legacy Supabase public env vars. Post-migration unused at runtime;
        // see server-side note above. Optional so existing .env.local files
        // don't trip the validator.
        NEXT_PUBLIC_SUPABASE_URL: z.string().optional(),
        NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),

        // Convex (Phase 3: added alongside Drizzle during transition)
        NEXT_PUBLIC_CONVEX_URL: z.url().optional(),

        // Clerk client (Phase 3: added alongside Supabase Auth during transition)
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
        NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().default('/sign-in'),
        NEXT_PUBLIC_CLERK_SIGN_UP_URL: z.string().default('/sign-up'),
        NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: z.string().default('/projects'),
        NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: z.string().default('/profile-setup'),

        // Public mirror of WEBLAB_AUTH_PROVIDER. Post-migration default = 'clerk'.
        NEXT_PUBLIC_AUTH_PROVIDER: z.enum(['supabase', 'clerk']).default('clerk'),
        NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
        NEXT_PUBLIC_POSTHOG_HOST: z.string().optional(),
        NEXT_PUBLIC_GLEAP_API_KEY: z.string().optional(),
        NEXT_PUBLIC_FEATURE_COLLABORATION: z.coerce.boolean().default(true),
        NEXT_PUBLIC_AUTH_PROVIDERS: z.string().default('github,google'),
        NEXT_PUBLIC_PROJECT_FILESYSTEM_ENABLED: z.coerce.boolean().default(true),
        NEXT_PUBLIC_MULTI_FRAMEWORK_ENABLED: z.coerce.boolean().default(true),
        NEXT_PUBLIC_PROVIDER_PICKER_V2: z.coerce.boolean().default(true),
        NEXT_PUBLIC_STYLE_PANEL_V3: z.coerce.boolean().default(false),
        NEXT_PUBLIC_STYLE_PANEL_V4: z.coerce.boolean().default(true),
        // Client-side mirror of WEBLAB_AGGRESSIVE_PREFETCH. When true,
        // project cards prefetch tRPC bootstrap on hover (warms data
        // cache in addition to the route chunk). Off by default —
        // safe to enable for low-traffic apps or demo days.
        NEXT_PUBLIC_AGGRESSIVE_PREFETCH: z.coerce.boolean().default(false),
        NEXT_PUBLIC_HOSTING_DOMAIN: z.string().optional(),
        // URL of the apps/web/server Fastify sandbox tRPC WS server. Plain
        // http(s) URL — the client rewrites scheme to ws(s) automatically.
        // Defaults to ws://<current-host>:8080/api/trpc in dev when unset.
        NEXT_PUBLIC_SANDBOX_SERVER_URL: z.string().optional(),
        NEXT_PUBLIC_RB2B_ID: z.string().optional(),
        NEXT_PUBLIC_APP_NAME: z.string().default('Weblab'),
        NEXT_PUBLIC_APP_DOMAIN: z.string().default('weblab.build'),
        // Tri-state SW opt-in. Empty = production-only (default). 'true'
        // forces registration even in dev (for QAing offline locally).
        // 'false' disables SW entirely.
        NEXT_PUBLIC_ENABLE_SW: z.enum(['true', 'false']).optional(),
    },

    /**
     * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
     * middlewares) or client-side so we need to destruct manually.
     */
    runtimeEnv: {
        NODE_ENV: process.env.NODE_ENV,
        CSB_API_KEY: process.env.CSB_API_KEY,
        WEBLAB_CLOUD_PROVIDER: process.env.WEBLAB_CLOUD_PROVIDER,
        VERCEL_TEAM_ID: process.env.VERCEL_TEAM_ID,
        VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID,
        VERCEL_TOKEN: process.env.VERCEL_TOKEN,
        VERCEL_SANDBOX_TIMEOUT_MS: process.env.VERCEL_SANDBOX_TIMEOUT_MS,
        VERCEL_BLANK_SNAPSHOT_ID: process.env.VERCEL_BLANK_SNAPSHOT_ID,
        WEBLAB_VERCEL_VCPUS: process.env.WEBLAB_VERCEL_VCPUS,
        WEBLAB_VERCEL_WARM_POOL_SIZE: process.env.WEBLAB_VERCEL_WARM_POOL_SIZE,
        WEBLAB_AGGRESSIVE_PREFETCH: process.env.WEBLAB_AGGRESSIVE_PREFETCH,
        RESEND_API_KEY: process.env.RESEND_API_KEY,
        NEXT_PUBLIC_FEATURE_COLLABORATION: process.env.NEXT_PUBLIC_FEATURE_COLLABORATION,
        NEXT_PUBLIC_AUTH_PROVIDERS: process.env.NEXT_PUBLIC_AUTH_PROVIDERS,
        NEXT_PUBLIC_PROJECT_FILESYSTEM_ENABLED: process.env.NEXT_PUBLIC_PROJECT_FILESYSTEM_ENABLED,
        NEXT_PUBLIC_MULTI_FRAMEWORK_ENABLED: process.env.NEXT_PUBLIC_MULTI_FRAMEWORK_ENABLED,
        NEXT_PUBLIC_PROVIDER_PICKER_V2: process.env.NEXT_PUBLIC_PROVIDER_PICKER_V2,
        NEXT_PUBLIC_STYLE_PANEL_V3: process.env.NEXT_PUBLIC_STYLE_PANEL_V3,
        NEXT_PUBLIC_STYLE_PANEL_V4: process.env.NEXT_PUBLIC_STYLE_PANEL_V4,
        NEXT_PUBLIC_AGGRESSIVE_PREFETCH: process.env.NEXT_PUBLIC_AGGRESSIVE_PREFETCH,

        // Supabase — kept optional during transition; auth + storage migrated
        // to Clerk + Convex. Drizzle/Postgres is also being phased out; until
        // then Drizzle reads DATABASE_URL via SUPABASE_DATABASE_URL.
        SUPABASE_URL:
            process.env.SUPABASE_URL ??
            (process.env.NODE_ENV === 'development'
                ? 'http://127.0.0.1:54321'
                : 'http://unused.local'),
        SUPABASE_DATABASE_URL:
            process.env.SUPABASE_DATABASE_URL ??
            (process.env.NODE_ENV === 'development'
                ? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
                : 'postgresql://unused:unused@unused.local:5432/unused'),
        SUPABASE_SERVICE_ROLE_KEY:
            process.env.SUPABASE_SERVICE_ROLE_KEY ??
            (process.env.NODE_ENV === 'development'
                ? 'dev_supabase_service_role_key'
                : 'dev_supabase_service_role_key'),

        // Convex (server-side observability of the public URL is convenient)
        NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL ?? process.env.CONVEX_URL,

        // Clerk
        CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
        CLERK_WEBHOOK_SECRET: process.env.CLERK_WEBHOOK_SECRET,
        CLERK_JWT_ISSUER_DOMAIN: process.env.CLERK_JWT_ISSUER_DOMAIN,
        WEBLAB_AUTH_PROVIDER: process.env.WEBLAB_AUTH_PROVIDER,
        NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
            process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? process.env.CLERK_PUBLISHABLE_KEY,
        NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
        NEXT_PUBLIC_CLERK_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_UP_URL,
        NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL,
        NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: process.env.NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL,
        NEXT_PUBLIC_AUTH_PROVIDER: process.env.NEXT_PUBLIC_AUTH_PROVIDER,
        NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
        NEXT_PUBLIC_SHOW_DEV_LOGIN: process.env.NEXT_PUBLIC_SHOW_DEV_LOGIN,
        NEXT_PUBLIC_SUPABASE_URL:
            process.env.NEXT_PUBLIC_SUPABASE_URL ??
            (process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:54321' : undefined),
        NEXT_PUBLIC_SUPABASE_ANON_KEY:
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
            process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
            (process.env.NODE_ENV === 'development' ? 'dev_supabase_anon_key' : undefined),
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,

        // Posthog
        NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
        NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
        NEXT_PUBLIC_GLEAP_API_KEY: process.env.NEXT_PUBLIC_GLEAP_API_KEY,

        // RB2B
        NEXT_PUBLIC_RB2B_ID: process.env.NEXT_PUBLIC_RB2B_ID,

        // Brand
        NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
        NEXT_PUBLIC_APP_DOMAIN: process.env.NEXT_PUBLIC_APP_DOMAIN,
        NEXT_PUBLIC_ENABLE_SW: process.env.NEXT_PUBLIC_ENABLE_SW,

        // Hosting
        FREESTYLE_API_KEY: process.env.FREESTYLE_API_KEY,
        NEXT_PUBLIC_HOSTING_DOMAIN: process.env.NEXT_PUBLIC_HOSTING_DOMAIN,
        NEXT_PUBLIC_SANDBOX_SERVER_URL: process.env.NEXT_PUBLIC_SANDBOX_SERVER_URL,

        // Stripe
        STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
        STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,

        // Apply models
        MORPH_API_KEY: process.env.MORPH_API_KEY,
        RELACE_API_KEY: process.env.RELACE_API_KEY,

        // Bedrock
        AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
        AWS_REGION: process.env.AWS_REGION,

        // Google Vertex AI
        GOOGLE_CLIENT_EMAIL: process.env.GOOGLE_CLIENT_EMAIL,
        GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY,
        GOOGLE_PRIVATE_KEY_ID: process.env.GOOGLE_PRIVATE_KEY_ID,

        // Model providers
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        GOOGLE_AI_STUDIO_API_KEY: process.env.GOOGLE_AI_STUDIO_API_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        OPENROUTER_API_KEY:
            process.env.OPENROUTER_API_KEY ??
            (process.env.NODE_ENV === 'development' ? 'dev_openrouter_api_key' : undefined),

        // n8n
        N8N_WEBHOOK_URL: process.env.N8N_WEBHOOK_URL,
        N8N_API_KEY: process.env.N8N_API_KEY,
        N8N_LANDING_FORM_URL: process.env.N8N_LANDING_FORM_URL,
        N8N_LANDING_FORM_HEADER_NAME: process.env.N8N_LANDING_FORM_HEADER_NAME,
        N8N_LANDING_FORM_HEADER_VALUE: process.env.N8N_LANDING_FORM_HEADER_VALUE,

        // Email
        EMAIL_DRY_RUN: process.env.EMAIL_DRY_RUN,

        // Firecrawl
        FIRECRAWL_API_KEY: process.env.FIRECRAWL_API_KEY,

        // Exa
        EXA_API_KEY: process.env.EXA_API_KEY,

        // Mem0
        MEM0_API_KEY: process.env.MEM0_API_KEY,

        // Langfuse
        LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
        LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
        LANGFUSE_BASEURL: process.env.LANGFUSE_BASEURL,

        // GitHub
        GITHUB_APP_ID: process.env.GITHUB_APP_ID,
        GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY,
        GITHUB_APP_SLUG: process.env.GITHUB_APP_SLUG,

        // Figma
        FIGMA_PERSONAL_ACCESS_TOKEN: process.env.FIGMA_PERSONAL_ACCESS_TOKEN,

        // Design system
        DESIGN_SYSTEM_PASSWORD: process.env.DESIGN_SYSTEM_PASSWORD,

        // Provider OAuth (CLI provider sign-in on hosted web)
        PROVIDER_TOKEN_ENCRYPTION_KEY: process.env.PROVIDER_TOKEN_ENCRYPTION_KEY,
        CMS_SOURCE_ENCRYPTION_KEY: process.env.CMS_SOURCE_ENCRYPTION_KEY,
        GEMINI_OAUTH_CLIENT_ID: process.env.GEMINI_OAUTH_CLIENT_ID,
        GEMINI_OAUTH_CLIENT_SECRET: process.env.GEMINI_OAUTH_CLIENT_SECRET,
        OPENCODE_OAUTH_CLIENT_ID: process.env.OPENCODE_OAUTH_CLIENT_ID,
        OPENCODE_OAUTH_CLIENT_SECRET: process.env.OPENCODE_OAUTH_CLIENT_SECRET,
        CURSOR_OAUTH_CLIENT_ID: process.env.CURSOR_OAUTH_CLIENT_ID,
        CURSOR_OAUTH_CLIENT_SECRET: process.env.CURSOR_OAUTH_CLIENT_SECRET,
        CODEX_OAUTH_CLIENT_ID: process.env.CODEX_OAUTH_CLIENT_ID,
        CODEX_OAUTH_CLIENT_SECRET: process.env.CODEX_OAUTH_CLIENT_SECRET,
    },
    /**
     * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
     * useful for Docker builds.
     */
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
    /**
     * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
     * `SOME_VAR=''` will throw an error.
     */
    emptyStringAsUndefined: true,
});

// Server-only mirror check. `NEXT_PUBLIC_AUTH_PROVIDER` is frozen into the
// client bundle at build time and CANNOT be changed by flipping the runtime
// env at deploy time. If it diverges from the server-side flag, the editor
// renders sign-in routes for one provider while the API uses the other —
// a split-brain that produces auth bounces and 500s in production. Warn
// loudly at boot rather than waiting for the symptom to surface in the field.
if (typeof window === 'undefined' && !process.env.SKIP_ENV_VALIDATION) {
    if (env.WEBLAB_AUTH_PROVIDER !== env.NEXT_PUBLIC_AUTH_PROVIDER) {
        console.error(
            `[env] WEBLAB_AUTH_PROVIDER=${env.WEBLAB_AUTH_PROVIDER} but ` +
                `NEXT_PUBLIC_AUTH_PROVIDER=${env.NEXT_PUBLIC_AUTH_PROVIDER}. ` +
                `These MUST match — the public mirror is baked into the client ` +
                `bundle at build time. Sign-in URLs will diverge between server ` +
                `and client and cause auth bounces. Set both to the same value ` +
                `in your environment.`,
        );
    }
}
