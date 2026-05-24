import { v } from 'convex/values';

import { internal } from './_generated/api';
import { internalMutation } from './_generated/server';

// Convex-side Clerk webhook handlers. INTERNAL — not callable from clients.
// Invoked by `convex/http.ts::/clerk-webhook` after Svix signature verify.
//
// These are `internalMutation` rather than `mutation` so they cannot be
// reached from outside the Convex deployment. A previous shape exposed
// public mutations gated by a shared-secret arg, which was brute-forceable
// by anyone who knew `NEXT_PUBLIC_CONVEX_URL`.

export const upsertUser = internalMutation({
    args: {
        clerkUserId: v.string(),
        email: v.optional(v.string()),
        firstName: v.optional(v.string()),
        lastName: v.optional(v.string()),
        displayName: v.optional(v.string()),
        avatarUrl: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query('users')
            .withIndex('by_clerk_user_id', (q) => q.eq('clerkUserId', args.clerkUserId))
            .unique();
        const now = Date.now();
        if (existing) {
            await ctx.db.patch(existing._id, {
                email: args.email ?? existing.email,
                firstName: args.firstName ?? existing.firstName,
                lastName: args.lastName ?? existing.lastName,
                displayName: args.displayName ?? existing.displayName,
                avatarUrl: args.avatarUrl ?? existing.avatarUrl,
                updatedAt: now,
            });
            return existing._id;
        }
        return ctx.db.insert('users', { ...args, updatedAt: now });
    },
});

export const deleteUser = internalMutation({
    args: { clerkUserId: v.string() },
    handler: async (ctx, { clerkUserId }) => {
        const user = await ctx.db
            .query('users')
            .withIndex('by_clerk_user_id', (q) => q.eq('clerkUserId', clerkUserId))
            .unique();
        if (!user) return { ok: false, reason: 'NOT_FOUND' as const };

        // Full cascade — settings, providerConnections, memberships, owned
        // personal workspace + its projects, subscriptions, rateLimits,
        // usageRecords, hostingProviderConnections, feedbacks, skills.
        // Same path as `userActions.remove` (in-app account-delete flow), so
        // user-data hygiene is identical regardless of where the deletion
        // originated (Clerk dashboard webhook vs. account-settings UI).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await ctx.runMutation((internal as any)['internal/cascade'].deleteUserCascade, {
            userId: user._id,
        });
        return { ok: true } as const;
    },
});
