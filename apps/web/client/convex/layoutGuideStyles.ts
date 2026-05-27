import { v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { requireCap } from './lib/permissions';

/**
 * Project-level saved layout guide styles — Figma's "Layout grid styles".
 *
 * The schema table (`layoutGuideStyles` in schema.ts) carries a `name` plus
 * the same `LayoutGuideConfig` shape used inline on `frames.layoutGuides`.
 * The frame-side `styleId` is the link; when set, the frame's local
 * config mirrors the saved style and detach/update flows up through this
 * file's mutations.
 *
 * UI for managing styles (save-as / detach / rename / delete) ships in a
 * follow-up — this file lays the data plumbing so the schema isn't an
 * orphan and the link path on frame `layoutGuides[].styleId` resolves.
 */

const layoutGuideArg = v.object({
    id: v.string(),
    type: v.union(v.literal('grid'), v.literal('columns'), v.literal('rows')),
    visible: v.boolean(),
    color: v.string(),
    size: v.optional(v.number()),
    count: v.optional(v.number()),
    alignment: v.optional(
        v.union(
            v.literal('stretch'),
            v.literal('left'),
            v.literal('center'),
            v.literal('right'),
            v.literal('top'),
            v.literal('bottom'),
        ),
    ),
    width: v.optional(v.union(v.number(), v.null())),
    margin: v.optional(v.number()),
    gutter: v.optional(v.number()),
    styleId: v.optional(v.union(v.id('layoutGuideStyles'), v.null())),
});

// ─── Queries ──────────────────────────────────────────────────────────────────

export const list = query({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        await requireCap(ctx, 'project.view', { projectId });
        return ctx.db
            .query('layoutGuideStyles')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .collect();
    },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const create = mutation({
    args: {
        projectId: v.id('projects'),
        name: v.string(),
        config: layoutGuideArg,
    },
    handler: async (ctx, { projectId, name, config }) => {
        await requireCap(ctx, 'project.update', { projectId });
        const id = await ctx.db.insert('layoutGuideStyles', {
            projectId,
            name,
            config,
            updatedAt: Date.now(),
        });
        return (await ctx.db.get(id))!;
    },
});

export const update = mutation({
    args: {
        styleId: v.id('layoutGuideStyles'),
        name: v.optional(v.string()),
        config: v.optional(layoutGuideArg),
    },
    handler: async (ctx, { styleId, name, config }) => {
        const existing = await ctx.db.get(styleId);
        if (!existing) throw new Error('NOT_FOUND: Layout guide style not found');
        await requireCap(ctx, 'project.update', { projectId: existing.projectId });
        const patch: { name?: string; config?: typeof existing.config; updatedAt: number } = {
            updatedAt: Date.now(),
        };
        if (name !== undefined) patch.name = name;
        if (config !== undefined) patch.config = config;
        await ctx.db.patch(styleId, patch);
        return (await ctx.db.get(styleId))!;
    },
});

export const remove = mutation({
    args: { styleId: v.id('layoutGuideStyles') },
    handler: async (ctx, { styleId }) => {
        const existing = await ctx.db.get(styleId);
        if (!existing) throw new Error('NOT_FOUND: Layout guide style not found');
        await requireCap(ctx, 'project.update', { projectId: existing.projectId });
        await ctx.db.delete(styleId);
        return { ok: true } as const;
    },
});
