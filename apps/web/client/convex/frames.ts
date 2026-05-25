import { v } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { requireCap } from './lib/permissions';

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Returns a single frame, gated by project.view on its parent canvas's project.
 * Returns null when the frame or its canvas can't be found.
 */
export const get = query({
    args: { frameId: v.id('frames') },
    handler: async (ctx, { frameId }) => {
        const frame = await ctx.db.get(frameId);
        if (!frame) return null;
        const canvas = await ctx.db.get(frame.canvasId);
        if (!canvas) return null;
        await requireCap(ctx, 'project.view', { projectId: canvas.projectId });
        return frame;
    },
});

/**
 * Returns all frames on a canvas, ordered by (x, y). Empty array if the
 * canvas doesn't exist or the caller lacks view access (caller is expected
 * to check explicit access via requireCap on the parent project before
 * relying on this — soft-fail keeps the canvas tab usable for empty states).
 */
export const getByCanvas = query({
    args: { canvasId: v.id('canvases') },
    handler: async (ctx, { canvasId }) => {
        const canvas = await ctx.db.get(canvasId);
        if (!canvas) return [];
        await requireCap(ctx, 'project.view', { projectId: canvas.projectId });
        const frames = await ctx.db
            .query('frames')
            .withIndex('by_canvas', (q) => q.eq('canvasId', canvasId))
            .collect();
        return frames.sort((a, b) => {
            if (a.x !== b.x) return a.x - b.x;
            return a.y - b.y;
        });
    },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

export const create = mutation({
    args: {
        canvasId: v.id('canvases'),
        branchId: v.optional(v.id('branches')),
        url: v.string(),
        x: v.number(),
        y: v.number(),
        width: v.number(),
        height: v.number(),
        groupId: v.optional(v.string()),
        breakpointId: v.optional(v.string()),
        breakpointName: v.optional(v.string()),
        breakpointOrder: v.optional(v.number()),
        type: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const canvas = await ctx.db.get(args.canvasId);
        if (!canvas) throw new Error('NOT_FOUND: Canvas not found');
        await requireCap(ctx, 'project.update', { projectId: canvas.projectId });
        // Integrity: a frame's branch must live in the same project as its
        // canvas. Without this a caller with update access to project A could
        // attach a frame referencing a branch id from project B (the Drizzle
        // FK used to enforce this).
        if (args.branchId) {
            const branch = await ctx.db.get(args.branchId);
            if (!branch || branch.projectId !== canvas.projectId) {
                throw new Error('BAD_REQUEST: branch does not belong to canvas project');
            }
        }
        const id = await ctx.db.insert('frames', args);
        return (await ctx.db.get(id))!;
    },
});

export const update = mutation({
    args: {
        frameId: v.id('frames'),
        url: v.optional(v.string()),
        x: v.optional(v.number()),
        y: v.optional(v.number()),
        width: v.optional(v.number()),
        height: v.optional(v.number()),
        groupId: v.optional(v.union(v.string(), v.null())),
        breakpointId: v.optional(v.union(v.string(), v.null())),
        breakpointName: v.optional(v.union(v.string(), v.null())),
        breakpointOrder: v.optional(v.union(v.number(), v.null())),
        type: v.optional(v.union(v.string(), v.null())),
        branchId: v.optional(v.union(v.id('branches'), v.null())),
    },
    handler: async (ctx, { frameId, ...rest }) => {
        const existing = await ctx.db.get(frameId);
        if (!existing) throw new Error('NOT_FOUND: Frame not found');
        const canvas = await ctx.db.get(existing.canvasId);
        if (!canvas) throw new Error('NOT_FOUND: Canvas not found');
        await requireCap(ctx, 'project.update', { projectId: canvas.projectId });
        // Integrity (mirrors frames.create): if the caller reassigns the
        // frame's branchId, the new branch must live in the same project as
        // the canvas. Without this, a caller with update access to project A
        // could point one of A's frames at a branch from project B and leak
        // B's preview iframe URL into A's canvas (or orphan the frame from
        // B's cascade deletes).
        if (rest.branchId) {
            const branch = await ctx.db.get(rest.branchId);
            if (!branch || branch.projectId !== canvas.projectId) {
                throw new Error('BAD_REQUEST: branch does not belong to canvas project');
            }
        }

        const patch: Partial<Doc<'frames'>> = {};
        for (const [k, value] of Object.entries(rest)) {
            if (value === undefined) continue;
            (patch as Record<string, unknown>)[k] = value === null ? undefined : value;
        }
        await ctx.db.patch(frameId, patch);
        return (await ctx.db.get(frameId))!;
    },
});

export const remove = mutation({
    args: { frameId: v.id('frames') },
    handler: async (ctx, { frameId }) => {
        const existing = await ctx.db.get(frameId);
        if (!existing) throw new Error('NOT_FOUND: Frame not found');
        const canvas = await ctx.db.get(existing.canvasId);
        if (!canvas) throw new Error('NOT_FOUND: Canvas not found');
        await requireCap(ctx, 'project.update', { projectId: canvas.projectId });
        await ctx.db.delete(frameId);
        return { ok: true } as const;
    },
});
