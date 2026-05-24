import { v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { requireCap } from './lib/permissions';

// Live-cursor presence for the editor canvas. Replaces Supabase Realtime
// channels with a Convex-driven table:
//   - Client sends `heartbeat` ~every 2s with current cursor position.
//   - `listActive` query returns cursors with lastSeen > now-5s.
// Convex's live-query subscription handles the push.

const PRESENCE_TTL_MS = 5_000;

export const heartbeat = mutation({
    args: {
        projectId: v.id('projects'),
        cursorX: v.optional(v.number()),
        cursorY: v.optional(v.number()),
    },
    handler: async (ctx, { projectId, cursorX, cursorY }) => {
        // Gate on project access — without it any authenticated user could
        // write a cursor row into an arbitrary project (IDOR write).
        const { user } = await requireCap(ctx, 'project.view', { projectId });
        const existing = await ctx.db
            .query('cursors')
            .withIndex('by_project_user', (q) =>
                q.eq('projectId', projectId).eq('userId', user._id),
            )
            .unique();
        const displayName = user.displayName ?? user.firstName ?? user.email ?? 'User';
        const now = Date.now();
        if (existing) {
            await ctx.db.patch(existing._id, {
                cursorX,
                cursorY,
                lastSeen: now,
            });
            return existing._id;
        }
        return ctx.db.insert('cursors', {
            projectId,
            userId: user._id,
            cursorX,
            cursorY,
            displayName,
            avatarUrl: user.avatarUrl,
            lastSeen: now,
        });
    },
});

export const listActive = query({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        // Gate on project access — without it any authenticated user could
        // read other users' live cursors/displayName/avatar for any project.
        const { user: me } = await requireCap(ctx, 'project.view', { projectId });
        const now = Date.now();
        const rows = await ctx.db
            .query('cursors')
            .withIndex('by_project_lastSeen', (q) =>
                q.eq('projectId', projectId).gte('lastSeen', now - PRESENCE_TTL_MS),
            )
            .collect();
        // Strip caller's own cursor — the local renderer draws the live
        // mouse position, no need to round-trip through Convex.
        return rows
            .filter((r) => r.userId !== me._id)
            .map((r) => ({
                userId: r.userId,
                cursorX: r.cursorX,
                cursorY: r.cursorY,
                displayName: r.displayName,
                avatarUrl: r.avatarUrl,
            }));
    },
});

export const leave = mutation({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        const { user } = await requireCap(ctx, 'project.view', { projectId });
        const existing = await ctx.db
            .query('cursors')
            .withIndex('by_project_user', (q) =>
                q.eq('projectId', projectId).eq('userId', user._id),
            )
            .unique();
        if (existing) await ctx.db.delete(existing._id);
    },
});
