import { v } from 'convex/values';

import { internalMutation } from './_generated/server';

// Convex-side Clerk webhook handlers. INTERNAL — not callable from clients.
//
// During Phase 5, the Next.js webhook handler at
// `apps/web/client/src/app/api/clerk/webhook/route.ts` is the single trust
// boundary: it Svix-verifies the request, then writes the canonical user
// row to Drizzle (the live data store). Convex `users` is dormant — no
// production router reads from it yet — so this module currently exists as
// scaffolding for Phase 4 when Convex becomes a real consumer.
//
// These functions are `internalMutation` rather than `mutation` so they
// cannot be invoked from outside the Convex deployment. A previous shape
// exposed them as public mutations gated by a shared-secret arg, which was
// brute-forceable by anyone who knew `NEXT_PUBLIC_CONVEX_URL`. To wire
// these up safely in Phase 4, add an `httpAction` (in `convex/http.ts`)
// that Svix-verifies the request inside Convex and calls these
// internalMutations via `ctx.runMutation`.

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

        const settings = await ctx.db
            .query('userSettings')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .collect();
        for (const s of settings) await ctx.db.delete(s._id);

        const canvases = await ctx.db
            .query('userCanvases')
            .withIndex('by_user_canvas', (q) => q.eq('userId', user._id))
            .collect();
        for (const c of canvases) await ctx.db.delete(c._id);

        const conns = await ctx.db
            .query('providerConnections')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .collect();
        for (const c of conns) await ctx.db.delete(c._id);

        const memberships = await ctx.db
            .query('workspaceMembers')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .collect();
        for (const m of memberships) await ctx.db.delete(m._id);

        const projectMemberships = await ctx.db
            .query('projectMembers')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .collect();
        for (const pm of projectMemberships) await ctx.db.delete(pm._id);

        await ctx.db.delete(user._id);
        return { ok: true } as const;
    },
});
