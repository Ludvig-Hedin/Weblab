import { v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { requireCap } from './lib/permissions';

// ─── Queries ──────────────────────────────────────────────────────────────────

export const get = query({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        await requireCap(ctx, 'project.view', { projectId });
        return ctx.db
            .query('projectSettings')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .unique();
    },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const upsert = mutation({
    args: {
        projectId: v.id('projects'),
        runCommand: v.string(),
        buildCommand: v.string(),
        installCommand: v.string(),
    },
    handler: async (ctx, args) => {
        await requireCap(ctx, 'project.manage_settings', {
            projectId: args.projectId,
        });
        const existing = await ctx.db
            .query('projectSettings')
            .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
            .unique();
        if (existing) {
            await ctx.db.patch(existing._id, {
                runCommand: args.runCommand,
                buildCommand: args.buildCommand,
                installCommand: args.installCommand,
            });
            return (await ctx.db.get(existing._id))!;
        }
        const id = await ctx.db.insert('projectSettings', {
            projectId: args.projectId,
            runCommand: args.runCommand,
            buildCommand: args.buildCommand,
            installCommand: args.installCommand,
        });
        return (await ctx.db.get(id))!;
    },
});

export const remove = mutation({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        await requireCap(ctx, 'project.manage_settings', { projectId });
        const existing = await ctx.db
            .query('projectSettings')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .unique();
        if (existing) await ctx.db.delete(existing._id);
        return { ok: true } as const;
    },
});
