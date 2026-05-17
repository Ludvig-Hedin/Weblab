import { TRPCError } from '@trpc/server';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { canvases, frameInsertSchema, frames, frameUpdateSchema, fromDbFrame } from '@weblab/db';

import { requireCap } from '@/server/api/permissions/requireCap';
import { createTRPCRouter, protectedProcedure } from '../../trpc';

export const frameRouter = createTRPCRouter({
    get: protectedProcedure
        .input(
            z.object({
                frameId: z.string(),
            }),
        )
        .query(async ({ ctx, input }) => {
            const dbFrame = await ctx.db.query.frames.findFirst({
                where: eq(frames.id, input.frameId),
            });
            if (!dbFrame) {
                return null;
            }
            const canvas = await ctx.db.query.canvases.findFirst({
                where: eq(canvases.id, dbFrame.canvasId),
            });
            if (!canvas) {
                return null;
            }
            await requireCap(ctx.db, ctx.user.id, 'project.view', { projectId: canvas.projectId });
            return fromDbFrame(dbFrame);
        }),
    getByCanvas: protectedProcedure
        .input(
            z.object({
                canvasId: z.string(),
            }),
        )
        .query(async ({ ctx, input }) => {
            const canvas = await ctx.db.query.canvases.findFirst({
                where: eq(canvases.id, input.canvasId),
            });
            if (!canvas) {
                return [];
            }
            await requireCap(ctx.db, ctx.user.id, 'project.view', { projectId: canvas.projectId });
            const dbFrames = await ctx.db.query.frames.findMany({
                where: eq(frames.canvasId, input.canvasId),
                orderBy: (frames, { asc }) => [asc(frames.x), asc(frames.y)],
            });
            return dbFrames.map((frame) => fromDbFrame(frame));
        }),
    create: protectedProcedure.input(frameInsertSchema).mutation(async ({ ctx, input }) => {
        if (!input.canvasId) {
            throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'canvasId is required',
            });
        }
        const canvas = await ctx.db.query.canvases.findFirst({
            where: eq(canvases.id, input.canvasId),
        });
        if (!canvas) {
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Canvas not found',
            });
        }
        await requireCap(ctx.db, ctx.user.id, 'project.update', { projectId: canvas.projectId });
        try {
            await ctx.db.insert(frames).values(input);
            return true;
        } catch (error) {
            console.error('Error creating frame', error);
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to create frame',
                cause: error,
            });
        }
    }),
    update: protectedProcedure.input(frameUpdateSchema).mutation(async ({ ctx, input }) => {
        const existing = await ctx.db.query.frames.findFirst({
            where: eq(frames.id, input.id),
        });
        if (!existing) {
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Frame not found',
            });
        }
        const canvas = await ctx.db.query.canvases.findFirst({
            where: eq(canvases.id, existing.canvasId),
        });
        if (!canvas) {
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Canvas not found',
            });
        }
        await requireCap(ctx.db, ctx.user.id, 'project.update', { projectId: canvas.projectId });
        try {
            await ctx.db.update(frames).set(input).where(eq(frames.id, input.id));
            return true;
        } catch (error) {
            console.error('Error updating frame', error);
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to update frame',
                cause: error,
            });
        }
    }),
    delete: protectedProcedure
        .input(
            z.object({
                frameId: z.string(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const existing = await ctx.db.query.frames.findFirst({
                where: eq(frames.id, input.frameId),
            });
            if (!existing) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Frame not found',
                });
            }
            const canvas = await ctx.db.query.canvases.findFirst({
                where: eq(canvases.id, existing.canvasId),
            });
            if (!canvas) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Canvas not found',
                });
            }
            await requireCap(ctx.db, ctx.user.id, 'project.update', {
                projectId: canvas.projectId,
            });
            try {
                await ctx.db.delete(frames).where(eq(frames.id, input.frameId));
                return true;
            } catch (error) {
                console.error('Error deleting frame', error);
                throw new TRPCError({
                    code: 'INTERNAL_SERVER_ERROR',
                    message: 'Failed to delete frame',
                    cause: error,
                });
            }
        }),
});
