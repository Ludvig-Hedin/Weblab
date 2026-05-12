import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import type { UserCanvas } from '@weblab/db';
import {
    canvases,
    createDefaultUserCanvas,
    fromDbCanvas,
    fromDbFrame,
    projects,
    userCanvases,
    userCanvasUpdateSchema,
} from '@weblab/db';

import { createTRPCRouter, protectedProcedure } from '../../trpc';
import { verifyProjectAccess } from '../project/helper';

export const userCanvasRouter = createTRPCRouter({
    get: protectedProcedure
        .input(
            z.object({
                projectId: z.string(),
            }),
        )
        .query(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            const userCanvas = await ctx.db.query.userCanvases.findFirst({
                where: and(
                    eq(canvases.projectId, input.projectId),
                    eq(userCanvases.userId, ctx.user.id),
                ),
                with: {
                    canvas: true,
                },
            });

            if (!userCanvas) {
                throw new Error('User canvas not found');
            }
            return fromDbCanvas(userCanvas);
        }),
    getWithFrames: protectedProcedure
        .input(
            z.object({
                projectId: z.string(),
            }),
        )
        .query(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            const dbCanvas = await ctx.db.query.canvases.findFirst({
                where: eq(canvases.projectId, input.projectId),
                with: {
                    frames: true,
                    userCanvases: {
                        where: eq(userCanvases.userId, ctx.user.id),
                    },
                },
            });
            if (!dbCanvas) {
                return null;
            }
            const userCanvas: UserCanvas =
                dbCanvas.userCanvases[0] ?? createDefaultUserCanvas(ctx.user.id, dbCanvas.id);
            return {
                userCanvas: fromDbCanvas(userCanvas),
                frames: dbCanvas.frames.map(fromDbFrame),
            };
        }),
    update: protectedProcedure
        .input(
            z.object({
                projectId: z.string(),
                canvasId: z.string(),
                canvas: userCanvasUpdateSchema,
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            const updated = await ctx.db
                .update(userCanvases)
                .set(input.canvas)
                .where(
                    and(
                        eq(userCanvases.canvasId, input.canvasId),
                        eq(userCanvases.userId, ctx.user.id),
                    ),
                )
                .returning({ canvasId: userCanvases.canvasId });
            if (updated.length === 0) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'User canvas not found',
                });
            }
            await ctx.db
                .update(projects)
                .set({
                    updatedAt: new Date(),
                })
                .where(eq(projects.id, input.projectId));
            return true;
        }),
});
