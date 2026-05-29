import { v } from 'convex/values';

import { internalMutation, mutation, query } from './_generated/server';
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

// ─── Internal mutations ─────────────────────────────────────────────────────────

/**
 * Seed the pending create request that the editor auto-consumes on first open
 * (`use-start-project` reads `getPendingRequest`, replays the prompt/images into
 * the AI chat, then marks it COMPLETED). Called from `projectActions` right
 * after the project graph is inserted, so the AI create flow has a writer.
 */
export const _insertCreateRequest = internalMutation({
    args: {
        projectId: v.id('projects'),
        // CreateRequestContext[] — discriminated union; validated by the caller.
        context: v.any(),
    },
    handler: async (ctx, { projectId, context }) => {
        await ctx.db.insert('projectCreateRequests', {
            projectId,
            context,
            status: 'pending',
            updatedAt: Date.now(),
        });
    },
});
