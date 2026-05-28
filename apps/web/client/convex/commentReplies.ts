import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { mutation } from './_generated/server';
import { deriveAuthorName } from './lib/comments';
import { requireCap } from './lib/permissions';

// Convex port of apps/web/client/src/server/api/routers/comment/reply.ts.

// Cap user-supplied reply length so any single reply row stays well below the
// 1MB Convex doc limit and the `comments.list` enriched payload stays bounded.
const MAX_REPLY_BYTES = 10_000;
const assertContentSize = (content: string) => {
    if (new TextEncoder().encode(content).length > MAX_REPLY_BYTES) {
        throw new Error(`BAD_REQUEST: content exceeds ${MAX_REPLY_BYTES} bytes`);
    }
};

const loadReply = async (
    ctx: QueryCtx | MutationCtx,
    replyId: Id<'commentReplies'>,
): Promise<{
    reply: Doc<'commentReplies'>;
    comment: Doc<'projectComments'>;
}> => {
    const reply = await ctx.db.get(replyId);
    if (!reply) throw new Error('NOT_FOUND: reply');
    const comment = await ctx.db.get(reply.commentId);
    if (!comment) throw new Error('NOT_FOUND: comment');
    return { reply, comment };
};

export const create = mutation({
    args: {
        commentId: v.id('projectComments'),
        content: v.string(),
    },
    handler: async (ctx, { commentId, content }) => {
        if (content.trim().length === 0) {
            throw new Error('BAD_REQUEST: content empty');
        }
        assertContentSize(content);
        const comment = await ctx.db.get(commentId);
        if (!comment) throw new Error('NOT_FOUND: comment');
        const { user } = await requireCap(ctx, 'project.comment', {
            projectId: comment.projectId,
        });
        const id = await ctx.db.insert('commentReplies', {
            commentId,
            content,
            authorId: user._id,
            authorName: deriveAuthorName(user),
            updatedAt: Date.now(),
        });
        return (await ctx.db.get(id))!;
    },
});

export const update = mutation({
    args: {
        replyId: v.id('commentReplies'),
        content: v.string(),
    },
    handler: async (ctx, { replyId, content }) => {
        if (content.trim().length === 0) {
            throw new Error('BAD_REQUEST: content empty');
        }
        assertContentSize(content);
        const { reply, comment } = await loadReply(ctx, replyId);
        const { user } = await requireCap(ctx, 'project.comment', {
            projectId: comment.projectId,
        });
        if (reply.authorId !== user._id) {
            throw new Error('FORBIDDEN: not the reply author');
        }
        await ctx.db.patch(replyId, { content, updatedAt: Date.now() });
        return (await ctx.db.get(replyId))!;
    },
});

export const remove = mutation({
    args: { replyId: v.id('commentReplies') },
    handler: async (ctx, { replyId }) => {
        const { reply, comment } = await loadReply(ctx, replyId);
        const { user } = await requireCap(ctx, 'project.comment', {
            projectId: comment.projectId,
        });
        if (reply.authorId !== user._id) {
            throw new Error('FORBIDDEN: not the reply author');
        }
        await ctx.db.delete(replyId);
        return { ok: true } as const;
    },
});
