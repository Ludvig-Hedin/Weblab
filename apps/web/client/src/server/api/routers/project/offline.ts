import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { projectOfflinePins } from '@weblab/db';

import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';
import { verifyProjectAccess } from './helper';

export const offlineRouter = createTRPCRouter({
    listPinned: protectedProcedure.query(async ({ ctx }) => {
        const rows = await ctx.db.query.projectOfflinePins.findMany({
            where: eq(projectOfflinePins.userId, ctx.user.id),
        });
        return rows.map((r) => ({
            projectId: r.projectId,
            pinnedAt: r.pinnedAt,
        }));
    }),

    isPinned: protectedProcedure
        .input(z.object({ projectId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            const row = await ctx.db.query.projectOfflinePins.findFirst({
                where: and(
                    eq(projectOfflinePins.userId, ctx.user.id),
                    eq(projectOfflinePins.projectId, input.projectId),
                ),
            });
            return !!row;
        }),

    pin: protectedProcedure
        .input(z.object({ projectId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            await ctx.db
                .insert(projectOfflinePins)
                .values({
                    userId: ctx.user.id,
                    projectId: input.projectId,
                })
                .onConflictDoNothing({
                    target: [projectOfflinePins.userId, projectOfflinePins.projectId],
                });
            return { pinned: true };
        }),

    unpin: protectedProcedure
        .input(z.object({ projectId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            await ctx.db
                .delete(projectOfflinePins)
                .where(
                    and(
                        eq(projectOfflinePins.userId, ctx.user.id),
                        eq(projectOfflinePins.projectId, input.projectId),
                    ),
                );
            return { pinned: false };
        }),
});
