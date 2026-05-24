'use node';

import { v } from 'convex/values';

import { EXTERNAL_HOSTING_PROVIDERS, HostingProvider } from '@weblab/models';

import { api, internal } from './_generated/api';
import { action } from './_generated/server';
import { HostingProviderFactory } from './lib/hostingFactory';
import { encryptProviderToken } from './lib/providerTokens';

// Convex port of src/server/api/routers/hosting-connection/index.ts (mutations
// that touch the provider). Encryption runs in Node here; DB writes happen
// via `ctx.runMutation(internal.hostingConnections._upsertRow, …)`.

const EXTERNAL_PROVIDER_SET = new Set<HostingProvider>(EXTERNAL_HOSTING_PROVIDERS);

const externalProvider = v.union(
    v.literal('vercel'),
    v.literal('netlify'),
    v.literal('cloudflare'),
    v.literal('railway'),
    v.literal('render'),
);

function assertExternalProvider(provider: HostingProvider): void {
    if (!EXTERNAL_PROVIDER_SET.has(provider)) {
        throw new Error(`BAD_REQUEST: ${provider} cannot be stored as a hosting connection`);
    }
}

export const validateToken = action({
    args: {
        provider: externalProvider,
        token: v.string(),
    },
    handler: async (ctx, { provider, token }) => {
        const me = await ctx.runQuery(api.users.me, {});
        if (!me) throw new Error('UNAUTHORIZED');

        const trimmed = token.trim();
        if (trimmed.length === 0) throw new Error('BAD_REQUEST: token required');

        const provEnum = provider as HostingProvider;
        assertExternalProvider(provEnum);

        const adapter = HostingProviderFactory.create(provEnum);
        if (!adapter.validateToken) {
            return {
                ok: false as const,
                message: 'This provider does not support token validation.',
            };
        }
        return adapter.validateToken(trimmed);
    },
});

export const createWithValidation = action({
    args: {
        provider: externalProvider,
        token: v.string(),
        accountLabel: v.optional(v.string()),
    },
    handler: async (ctx, { provider, token, accountLabel }): Promise<unknown> => {
        const me = await ctx.runQuery(api.users.me, {});
        if (!me) throw new Error('UNAUTHORIZED');

        const trimmedToken = token.trim();
        if (trimmedToken.length === 0) throw new Error('BAD_REQUEST: token required');

        const provEnum = provider as HostingProvider;
        assertExternalProvider(provEnum);

        const adapter = HostingProviderFactory.create(provEnum);
        let label = accountLabel?.trim() || null;
        let accountId: string | null = null;

        if (adapter.validateToken) {
            const validation = await adapter.validateToken(trimmedToken);
            if (!validation.ok) {
                throw new Error(`BAD_REQUEST: ${validation.message ?? 'Token validation failed.'}`);
            }
            label = label ?? validation.accountLabel ?? null;
            accountId = validation.accountId ?? null;
        }

        const tokenEncrypted = encryptProviderToken(trimmedToken);

        return ctx.runMutation(internal.hostingConnections._upsertRow, {
            provider: provEnum,
            tokenEncrypted,
            accountLabel: label,
            accountId,
        });
    },
});
