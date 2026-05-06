import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { projectComments } from '@weblab/db';

import { createTRPCRouter, protectedProcedure } from '../../trpc';
import { verifyProjectAccess } from '../project/helper';
import { sanitiseAuthorName } from './helpers';

export const commentRouter = createTRPCRouter({
    list: protectedProcedure
        .input(z.object({ projectId: z.string() }))
        .query(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            return ctx.db.query.projectComments.findMany({
                where: eq(projectComments.projectId, input.projectId),
                with: {
                    replies: {
                        orderBy: (commentReplies, { asc }) => [asc(commentReplies.createdAt)],
                    },
                },
                orderBy: (projectComments, { asc }) => [asc(projectComments.createdAt)],
            });
        }),
    create: protectedProcedure
        .input(
            z.object({
                projectId: z.string(),
                canvasX: z.number(),
                canvasY: z.number(),
                elementSelector: z.string().optional(),
                content: z.string().min(1),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            const [comment] = await ctx.db
                .insert(projectComments)
                .values({
                    projectId: input.projectId,
                    canvasX: input.canvasX,
                    canvasY: input.canvasY,
                    elementSelector: input.elementSelector ?? null,
                    content: input.content,
                    authorId: ctx.user.id,
                    authorName: sanitiseAuthorName(
                        ctx.user.user_metadata?.name ??
                            ctx.user.user_metadata?.full_name ??
                            ctx.user.email,
                    ),
                })
                .returning();
            if (!comment) throw new Error('Comment not created');
            return { ...comment, replies: [] };
        }),
    update: protectedProcedure
        .input(z.object({ commentId: z.string(), content: z.string().min(1) }))
        .mutation(async ({ ctx, input }) => {
            const existingComment = await ctx.db.query.projectComments.findFirst({
                where: eq(projectComments.id, input.commentId),
            });
            if (!existingComment) {
                throw new Error('Comment not found');
            }
            await verifyProjectAccess(ctx.db, ctx.user.id, existingComment.projectId);

            const [comment] = await ctx.db
                .update(projectComments)
                .set({ content: input.content, updatedAt: new Date() })
                .where(
                    and(
                        eq(projectComments.id, input.commentId),
                        eq(projectComments.authorId, ctx.user.id),
                    ),
                )
                .returning();
            if (!comment) throw new Error('Comment not found or unauthorized');
            return comment;
        }),
    delete: protectedProcedure
        .input(z.object({ commentId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const existingComment = await ctx.db.query.projectComments.findFirst({
                where: eq(projectComments.id, input.commentId),
            });
            if (!existingComment) {
                throw new Error('Comment not found');
            }
            await verifyProjectAccess(ctx.db, ctx.user.id, existingComment.projectId);

            const [deleted] = await ctx.db
                .delete(projectComments)
                .where(
                    and(
                        eq(projectComments.id, input.commentId),
                        eq(projectComments.authorId, ctx.user.id),
                    ),
                )
                .returning();
            if (!deleted) {
                throw new Error('Comment not found or unauthorized');
            }
            return deleted;
        }),
    resolve: protectedProcedure
        .input(z.object({ commentId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const existingComment = await ctx.db.query.projectComments.findFirst({
                where: eq(projectComments.id, input.commentId),
            });
            if (!existingComment) {
                throw new Error('Comment not found');
            }
            await verifyProjectAccess(ctx.db, ctx.user.id, existingComment.projectId);

            const [comment] = await ctx.db
                .update(projectComments)
                .set({ resolvedAt: new Date(), updatedAt: new Date() })
                .where(eq(projectComments.id, input.commentId))
                .returning();
            if (!comment) throw new Error('Comment not found');
            return comment;
        }),
    unresolve: protectedProcedure
        .input(z.object({ commentId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const existingComment = await ctx.db.query.projectComments.findFirst({
                where: eq(projectComments.id, input.commentId),
            });
            if (!existingComment) {
                throw new Error('Comment not found');
            }
            await verifyProjectAccess(ctx.db, ctx.user.id, existingComment.projectId);

            const [comment] = await ctx.db
                .update(projectComments)
                .set({ resolvedAt: null, updatedAt: new Date() })
                .where(eq(projectComments.id, input.commentId))
                .returning();
            if (!comment) throw new Error('Comment not found');
            return comment;
        }),
});
