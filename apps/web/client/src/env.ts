import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
    /**
     * Specify your server-side environment variables schema here. This way you can ensure the app
     * isn't built with invalid env vars.
     */
    server: {
        NODE_ENV: z.enum(['development', 'test', 'production']),
        CSB_API_KEY: z.string(),
        SUPABASE_URL: z.url(),
        SUPABASE_DATABASE_URL: z.url(),
        SUPABASE_SERVICE_ROLE_KEY: z.string(),
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
        NEXT_PUBLIC_SUPABASE_URL: z.string(),
        NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string(),
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
        NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
        NEXT_PUBLIC_POSTHOG_HOST: z.string().optional(),
        NEXT_PUBLIC_GLEAP_API_KEY: z.string().optional(),
        NEXT_PUBLIC_FEATURE_COLLABORATION: z.coerce.boolean().default(false),
        NEXT_PUBLIC_AUTH_PROVIDERS: z.string().default('github,google'),
        NEXT_PUBLIC_PROJECT_FILESYSTEM_ENABLED: z.coerce.boolean().default(false),
        NEXT_PUBLIC_MULTI_FRAMEWORK_ENABLED: z.coerce.boolean().default(true),
        NEXT_PUBLIC_PROVIDER_PICKER_V2: z.coerce.boolean().default(true),
        NEXT_PUBLIC_HOSTING_DOMAIN: z.string().optional(),
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
        CSB_API_KEY: process.env.CSB_API_KEY ?? (process.env.NODE_ENV === 'development' ? 'dev_csb_api_key' : undefined),
        RESEND_API_KEY: process.env.RESEND_API_KEY,
        NEXT_PUBLIC_FEATURE_COLLABORATION: process.env.NEXT_PUBLIC_FEATURE_COLLABORATION,
        NEXT_PUBLIC_AUTH_PROVIDERS: process.env.NEXT_PUBLIC_AUTH_PROVIDERS,
        NEXT_PUBLIC_PROJECT_FILESYSTEM_ENABLED: process.env.NEXT_PUBLIC_PROJECT_FILESYSTEM_ENABLED,
        NEXT_PUBLIC_MULTI_FRAMEWORK_ENABLED: process.env.NEXT_PUBLIC_MULTI_FRAMEWORK_ENABLED,
        NEXT_PUBLIC_PROVIDER_PICKER_V2: process.env.NEXT_PUBLIC_PROVIDER_PICKER_V2,

        // Supabase
        SUPABASE_URL:
            process.env.SUPABASE_URL ??
            (process.env.NODE_ENV === 'development' ? 'http://127.0.0.1:54321' : undefined),
        SUPABASE_DATABASE_URL:
            process.env.SUPABASE_DATABASE_URL ??
            (process.env.NODE_ENV === 'development'
                ? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
                : undefined),
        SUPABASE_SERVICE_ROLE_KEY:
            process.env.SUPABASE_SERVICE_ROLE_KEY ??
            (process.env.NODE_ENV === 'development' ? 'dev_supabase_service_role_key' : undefined),
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
            process.env.OPENROUTER_API_KEY ?? (process.env.NODE_ENV === 'development' ? 'dev_openrouter_api_key' : undefined),

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
