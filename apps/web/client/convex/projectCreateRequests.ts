import { v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { vProjectCreateRequestStatus } from './lib/enums';
import { requireCap } from './lib/permissions';

// ─── Queries ──────────────────────────────────────────────────────────────────

export const getPendingRequest = query({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        await requireCap(ctx, 'project.view', { projectId });
        const row = await ctx.db
            .query('projectCreateRequests')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .filter((q) => q.eq(q.field('status'), 'pending'))
            .first();
        return row ?? null;
    },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const updateStatus = mutation({
    args: {
        projectId: v.id('projects'),
        status: vProjectCreateRequestStatus,
    },
    handler: async (ctx, { projectId, status }) => {
        await requireCap(ctx, 'project.update', { projectId });
        const row = await ctx.db
            .query('projectCreateRequests')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .first();
        if (!row) return null;
        await ctx.db.patch(row._id, { status, updatedAt: Date.now() });
        return (await ctx.db.get(row._id))!;
    },
});
