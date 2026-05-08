import { env } from '@/env';

export type OAuthProvider = 'codex' | 'cursor' | 'gemini' | 'opencode';

export type OAuthProviderConfig = {
    /** Provider-side authorization endpoint. */
    authorizationUrl: string;
    /** Provider-side token endpoint (POST). */
    tokenUrl: string;
    /** OAuth client id (env-backed). */
    clientId: string | undefined;
    /** OAuth client secret (env-backed). */
    clientSecret: string | undefined;
    /** Space-delimited scopes requested. */
    scope: string;
    /** Whether to request `offline_access` / `access_type=offline` to get a refresh token. */
    offline?: boolean;
};

/**
 * Provider-specific OAuth wiring. Gemini is the only fully-configured entry
 * because Google's OAuth endpoints and scopes are publicly documented;
 * Codex/Cursor/OpenCode use closed flows and need real client credentials
 * before the routes can complete an exchange. They ship as scaffolding so
 * adding the credentials in env is the only remaining step.
 */
export function getOAuthConfig(provider: OAuthProvider): OAuthProviderConfig | null {
    switch (provider) {
        case 'gemini':
            return {
                authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
                tokenUrl: 'https://oauth2.googleapis.com/token',
                clientId: env.GEMINI_OAUTH_CLIENT_ID,
                clientSecret: env.GEMINI_OAUTH_CLIENT_SECRET,
                scope: 'openid email https://www.googleapis.com/auth/generative-language.retriever',
                offline: true,
            };
        case 'opencode':
            return {
                // TODO: replace with the real OpenCode authorization/token endpoints once published.
                authorizationUrl: 'https://opencode.ai/oauth/authorize',
                tokenUrl: 'https://opencode.ai/oauth/token',
                clientId: env.OPENCODE_OAUTH_CLIENT_ID,
                clientSecret: env.OPENCODE_OAUTH_CLIENT_SECRET,
                scope: 'chat',
                offline: true,
            };
        case 'cursor':
            return {
                // TODO: confirm Cursor's public OAuth endpoints.
                authorizationUrl: 'https://www.cursor.com/oauth/authorize',
                tokenUrl: 'https://www.cursor.com/oauth/token',
                clientId: env.CURSOR_OAUTH_CLIENT_ID,
                clientSecret: env.CURSOR_OAUTH_CLIENT_SECRET,
                scope: 'agent',
                offline: true,
            };
        case 'codex':
            return {
                // TODO: ChatGPT login uses an OpenAI internal flow. Treat as
                // stub until OpenAI exposes a stable third-party OAuth surface.
                authorizationUrl: 'https://auth.openai.com/oauth/authorize',
                tokenUrl: 'https://auth.openai.com/oauth/token',
                clientId: env.CODEX_OAUTH_CLIENT_ID,
                clientSecret: env.CODEX_OAUTH_CLIENT_SECRET,
                scope: 'codex',
                offline: true,
            };
        default:
            return null;
    }
}

export function isProviderConfigured(provider: OAuthProvider): boolean {
    const cfg = getOAuthConfig(provider);
    return Boolean(cfg?.clientId && cfg.clientSecret);
}

const VALID_PROVIDERS: ReadonlyArray<OAuthProvider> = ['codex', 'cursor', 'gemini', 'opencode'];

export function parseProvider(value: string | undefined): OAuthProvider | null {
    if (!value) return null;
    return (VALID_PROVIDERS as ReadonlyArray<string>).includes(value)
        ? (value as OAuthProvider)
        : null;
}
