import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internal } from './_generated/api';
import { mutation, query } from './_generated/server';
import { deriveAuthorName } from './lib/comments';
import { requireCap } from './lib/permissions';

// Convex port of apps/web/client/src/server/api/routers/comment/comment.ts.

// Cap user-supplied comment body length so any single comment row stays well
// below the 1MB Convex doc limit and the `list` query payload stays bounded.
const MAX_COMMENT_BYTES = 10_000;
const assertContentSize = (content: string) => {
    if (new TextEncoder().encode(content).length > MAX_COMMENT_BYTES) {
        throw new Error(`BAD_REQUEST: content exceeds ${MAX_COMMENT_BYTES} bytes`);
    }
};

const loadComment = async (
    ctx: QueryCtx | MutationCtx,
    commentId: Id<'projectComments'>,
): Promise<Doc<'projectComments'>> => {
    const row = await ctx.db.get(commentId);
    if (!row) throw new Error('NOT_FOUND: comment');
    return row;
};

export const list = query({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        await requireCap(ctx, 'project.view', { projectId });
        // Defensive cap: comments are polled by the canvas overlay and
        // an unbounded list on busy projects can blow the response payload.
        // 500 is well above any realistic active-comment count; add
        // pagination if a real-world project ever reaches it.
        const comments = await ctx.db
            .query('projectComments')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .order('asc')
            .take(500);
        const enriched = await Promise.all(
            comments.map(async (comment) => {
                // Defensive cap per thread: a single comment with thousands
                // of replies would otherwise blow the canvas-overlay payload.
                // 500 is well above any realistic thread length; add proper
                // pagination if real-world threads ever hit it.
                const replies = await ctx.db
                    .query('commentReplies')
                    .withIndex('by_comment', (q) => q.eq('commentId', comment._id))
                    .order('asc')
                    .take(500);
                return { ...comment, replies };
            }),
        );
        return enriched;
    },
});

export const create = mutation({
    args: {
        projectId: v.id('projects'),
        canvasX: v.number(),
        canvasY: v.number(),
        elementSelector: v.optional(v.string()),
        content: v.string(),
    },
    handler: async (ctx, args) => {
        if (args.content.trim().length === 0) {
            throw new Error('BAD_REQUEST: content empty');
        }
        assertContentSize(args.content);
        const { user } = await requireCap(ctx, 'project.comment', {
            projectId: args.projectId,
        });
        const now = Date.now();
        const id = await ctx.db.insert('projectComments', {
            projectId: args.projectId,
            canvasX: args.canvasX,
            canvasY: args.canvasY,
            elementSelector: args.elementSelector,
            content: args.content,
            authorId: user._id,
            authorName: deriveAuthorName(user),
            updatedAt: now,
        });
        const comment = (await ctx.db.get(id))!;
        return { ...comment, replies: [] as Doc<'commentReplies'>[] };
    },
});

export const update = mutation({
    args: {
        commentId: v.id('projectComments'),
        content: v.string(),
    },
    handler: async (ctx, { commentId, content }) => {
        if (content.trim().length === 0) {
            throw new Error('BAD_REQUEST: content empty');
        }
        assertContentSize(content);
        const existing = await loadComment(ctx, commentId);
        const { user } = await requireCap(ctx, 'project.comment', {
            projectId: existing.projectId,
        });
        // Author-only edit. Drizzle did `WHERE authorId = ctx.user.id`.
        if (existing.authorId !== user._id) {
            throw new Error('FORBIDDEN: not the comment author');
        }
        await ctx.db.patch(commentId, { content, updatedAt: Date.now() });
        return (await ctx.db.get(commentId))!;
    },
});

export const remove = mutation({
    args: { commentId: v.id('projectComments') },
    handler: async (ctx, { commentId }) => {
        const existing = await loadComment(ctx, commentId);
        const { user } = await requireCap(ctx, 'project.comment', {
            projectId: existing.projectId,
        });
        if (existing.authorId !== user._id) {
            throw new Error('FORBIDDEN: not the comment author');
        }
        // Cascade replies via internal helper.
        await ctx.runMutation(internal.internal.cascade.deleteCommentCascade, {
            commentId,
        });
        return { ok: true } as const;
    },
});

export const resolve = mutation({
    args: { commentId: v.id('projectComments') },
    handler: async (ctx, { commentId }) => {
        const existing = await loadComment(ctx, commentId);
        await requireCap(ctx, 'project.comment', { projectId: existing.projectId });
        const now = Date.now();
        await ctx.db.patch(commentId, { resolvedAt: now, updatedAt: now });
        return (await ctx.db.get(commentId))!;
    },
});

export const unresolve = mutation({
    args: { commentId: v.id('projectComments') },
    handler: async (ctx, { commentId }) => {
        const existing = await loadComment(ctx, commentId);
        await requireCap(ctx, 'project.comment', { projectId: existing.projectId });
        await ctx.db.patch(commentId, {
            resolvedAt: undefined,
            updatedAt: Date.now(),
        });
        return (await ctx.db.get(commentId))!;
    },
});
