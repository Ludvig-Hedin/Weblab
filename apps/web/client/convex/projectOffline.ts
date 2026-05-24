import { v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { requireCap, requireUser } from './lib/permissions';

// ─── Queries ──────────────────────────────────────────────────────────────────

export const listPinned = query({
    args: {},
    handler: async (ctx) => {
        const user = await requireUser(ctx);
        const rows = await ctx.db
            .query('projectOfflinePins')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .collect();
        return rows.map((r) => ({ projectId: r.projectId, pinnedAt: r.pinnedAt }));
    },
});

export const isPinned = query({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        const { user } = await requireCap(ctx, 'project.view', { projectId });
        const row = await ctx.db
            .query('projectOfflinePins')
            .withIndex('by_user_project', (q) =>
                q.eq('userId', user._id).eq('projectId', projectId),
            )
            .unique();
        return !!row;
    },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const pin = mutation({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        const { user } = await requireCap(ctx, 'project.view', { projectId });
        const existing = await ctx.db
            .query('projectOfflinePins')
            .withIndex('by_user_project', (q) =>
                q.eq('userId', user._id).eq('projectId', projectId),
            )
            .unique();
        if (!existing) {
            await ctx.db.insert('projectOfflinePins', {
                userId: user._id,
                projectId,
                pinnedAt: Date.now(),
            });
        }
        return { pinned: true } as const;
    },
});

export const unpin = mutation({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        const { user } = await requireCap(ctx, 'project.view', { projectId });
        const existing = await ctx.db
            .query('projectOfflinePins')
            .withIndex('by_user_project', (q) =>
                q.eq('userId', user._id).eq('projectId', projectId),
            )
            .unique();
        if (existing) await ctx.db.delete(existing._id);
        return { pinned: false } as const;
    },
});
