import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import { internalMutation, mutation, query } from './_generated/server';
import { vHostingProvider } from './lib/enums';
import { requireUser } from './lib/permissions';

// Convex port of src/server/api/routers/hosting-connection/index.ts.
//
// DB-only surface. Token validation + encryption happen in
// `hostingConnectionActions.ts` (node runtime). This file never reads or
// writes the raw plaintext token — only the already-encrypted blob.

function stripTokenField(
    row: Doc<'hostingProviderConnections'>,
): Omit<Doc<'hostingProviderConnections'>, 'tokenEncrypted'> {
    const { tokenEncrypted: _drop, ...rest } = row;
    void _drop;
    return rest;
}

export const list = query({
    args: {},
    handler: async (ctx) => {
        const user = await requireUser(ctx);
        const rows = await ctx.db
            .query('hostingProviderConnections')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .collect();
        rows.sort((a, b) => b._creationTime - a._creationTime);
        return rows.map(stripTokenField);
    },
});

export const remove = mutation({
    args: { id: v.id('hostingProviderConnections') },
    handler: async (ctx, { id }) => {
        const user = await requireUser(ctx);
        const existing = await ctx.db.get(id);
        if (!existing || existing.userId !== user._id) {
            throw new Error('NOT_FOUND: Connection not found');
        }
        await ctx.db.delete(id);
        return { success: true } as const;
    },
});

/**
 * Internal upsert called from `hostingConnectionActions.createWithValidation`.
 * Accepts the already-encrypted blob and writes/updates one row per
 * (userId, provider). FREESTYLE is rejected at the action layer.
 */
export const _upsertRow = internalMutation({
    args: {
        provider: vHostingProvider,
        tokenEncrypted: v.string(),
        accountLabel: v.optional(v.union(v.string(), v.null())),
        accountId: v.optional(v.union(v.string(), v.null())),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);
        const existing = await ctx.db
            .query('hostingProviderConnections')
            .withIndex('by_user_provider', (q) =>
                q.eq('userId', user._id).eq('provider', args.provider),
            )
            .unique();
        const now = Date.now();
        const patch = {
            tokenEncrypted: args.tokenEncrypted,
            accountLabel: args.accountLabel ?? undefined,
            accountId: args.accountId ?? undefined,
            updatedAt: now,
        };
        let id: Id<'hostingProviderConnections'>;
        if (existing) {
            await ctx.db.patch(existing._id, patch);
            id = existing._id;
        } else {
            id = await ctx.db.insert('hostingProviderConnections', {
                userId: user._id,
                provider: args.provider,
                ...patch,
            });
        }
        return stripTokenField((await ctx.db.get(id))!);
    },
});
