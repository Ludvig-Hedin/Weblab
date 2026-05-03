import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { commentReplies, projectComments } from '@weblab/db';
import { createTRPCRouter, protectedProcedure } from '../../trpc';
import { verifyProjectAccess } from '../project/helper';
import { sanitiseAuthorName } from './helpers';

export const replyRouter = createTRPCRouter({
    create: protectedProcedure
        .input(
            z.object({
                commentId: z.string(),
                content: z.string().min(1),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const comment = await ctx.db.query.projectComments.findFirst({
                where: eq(projectComments.id, input.commentId),
            });
            if (!comment) {
                throw new Error('Comment not found');
            }
            await verifyProjectAccess(ctx.db, ctx.user.id, comment.projectId);

            const [reply] = await ctx.db
                .insert(commentReplies)
                .values({
                    commentId: input.commentId,
                    content: input.content,
                    authorId: ctx.user.id,
                    authorName: sanitiseAuthorName(
                        ctx.user.user_metadata?.name ??
                        ctx.user.user_metadata?.full_name ??
                        ctx.user.email,
                    ),
                })
                .returning();
            if (!reply) throw new Error('Reply not created');
            return reply;
        }),
    update: protectedProcedure
        .input(z.object({ replyId: z.string(), content: z.string().min(1) }))
        .mutation(async ({ ctx, input }) => {
            const existingReply = await ctx.db.query.commentReplies.findFirst({
                where: eq(commentReplies.id, input.replyId),
                with: {
                    comment: true,
                },
            });
            if (!existingReply) {
                throw new Error('Reply not found');
            }
            await verifyProjectAccess(ctx.db, ctx.user.id, existingReply.comment.projectId);

            const [reply] = await ctx.db
                .update(commentReplies)
                .set({ content: input.content, updatedAt: new Date() })
                .where(
                    and(
                        eq(commentReplies.id, input.replyId),
                        eq(commentReplies.authorId, ctx.user.id),
                    ),
                )
                .returning();
            if (!reply) throw new Error('Reply not found or unauthorized');
            return reply;
        }),
    delete: protectedProcedure
        .input(z.object({ replyId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const existingReply = await ctx.db.query.commentReplies.findFirst({
                where: eq(commentReplies.id, input.replyId),
                with: {
                    comment: true,
                },
            });
            if (!existingReply) {
                throw new Error('Reply not found');
            }
            await verifyProjectAccess(ctx.db, ctx.user.id, existingReply.comment.projectId);

            const [deleted] = await ctx.db
                .delete(commentReplies)
                .where(
                    and(
                        eq(commentReplies.id, input.replyId),
                        eq(commentReplies.authorId, ctx.user.id),
                    ),
                )
                .returning();
            if (!deleted) {
                throw new Error('Reply not found or unauthorized');
            }
            return deleted;
        }),
});
