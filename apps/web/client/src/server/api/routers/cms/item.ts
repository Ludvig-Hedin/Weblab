import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import type { DrizzleDb } from '@weblab/db';
import { cmsCollections, cmsFields, cmsItems } from '@weblab/db';
import { CmsItemStatus } from '@weblab/models';

import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';
import { verifyProjectAccess } from '../project/helper';
import { buildItemValuesSchema } from './values';

async function loadCollectionWithFields(db: DrizzleDb, projectId: string, collectionId: string) {
    const collection = await db.query.cmsCollections.findFirst({
        where: and(eq(cmsCollections.id, collectionId), eq(cmsCollections.projectId, projectId)),
    });
    if (!collection) throw new Error('Collection not found');
    const fields = await db.query.cmsFields.findMany({
        where: eq(cmsFields.collectionId, collectionId),
        orderBy: (f, { asc }) => [asc(f.order), asc(f.createdAt)],
    });
    return { collection, fields };
}

export const cmsItemRouter = createTRPCRouter({
    list: protectedProcedure
        .input(
            z.object({
                projectId: z.string().uuid(),
                collectionId: z.string().uuid(),
                limit: z.number().int().min(1).max(500).default(100),
            }),
        )
        .query(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            await loadCollectionWithFields(ctx.db, input.projectId, input.collectionId);
            return ctx.db.query.cmsItems.findMany({
                where: eq(cmsItems.collectionId, input.collectionId),
                orderBy: (i, { desc }) => [desc(i.updatedAt)],
                limit: input.limit,
            });
        }),
    get: protectedProcedure
        .input(z.object({ projectId: z.string().uuid(), itemId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            // Project-scope check via the collection. Items don't carry
            // projectId directly; we trust the collection FK.
            const item = await ctx.db.query.cmsItems.findFirst({
                where: eq(cmsItems.id, input.itemId),
                with: { collection: true },
            });
            if (!item || item.collection.projectId !== input.projectId) {
                throw new Error('Item not found');
            }
            return item;
        }),
    create: protectedProcedure
        .input(
            z.object({
                projectId: z.string().uuid(),
                collectionId: z.string().uuid(),
                slug: z.string().trim().min(1).max(120).optional(),
                values: z.record(z.string(), z.unknown()),
                status: z.nativeEnum(CmsItemStatus).default(CmsItemStatus.DRAFT),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            const { fields } = await loadCollectionWithFields(
                ctx.db,
                input.projectId,
                input.collectionId,
            );
            const schema = buildItemValuesSchema(fields);
            const validated = schema.parse(input.values);
            const [created] = await ctx.db
                .insert(cmsItems)
                .values({
                    collectionId: input.collectionId,
                    slug: input.slug,
                    status: input.status,
                    values: validated,
                    publishedAt: input.status === CmsItemStatus.PUBLISHED ? new Date() : null,
                })
                .returning();
            if (!created) throw new Error('Failed to create item');
            return created;
        }),
    update: protectedProcedure
        .input(
            z.object({
                projectId: z.string().uuid(),
                itemId: z.string().uuid(),
                slug: z.string().trim().min(1).max(120).optional(),
                values: z.record(z.string(), z.unknown()).optional(),
                status: z.nativeEnum(CmsItemStatus).optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            const existing = await ctx.db.query.cmsItems.findFirst({
                where: eq(cmsItems.id, input.itemId),
                with: { collection: true },
            });
            if (!existing || existing.collection.projectId !== input.projectId) {
                throw new Error('Item not found');
            }
            const patch: Record<string, unknown> = { updatedAt: new Date() };
            if (input.slug !== undefined) patch.slug = input.slug;
            if (input.status !== undefined) {
                patch.status = input.status;
                if (input.status === CmsItemStatus.PUBLISHED && !existing.publishedAt) {
                    patch.publishedAt = new Date();
                }
            }
            if (input.values !== undefined) {
                const fields = await ctx.db.query.cmsFields.findMany({
                    where: eq(cmsFields.collectionId, existing.collectionId),
                    orderBy: (f, { asc }) => [asc(f.order), asc(f.createdAt)],
                });
                const schema = buildItemValuesSchema(fields);
                patch.values = schema.parse({ ...existing.values, ...input.values });
            }
            const [updated] = await ctx.db
                .update(cmsItems)
                .set(patch)
                .where(eq(cmsItems.id, input.itemId))
                .returning();
            if (!updated) throw new Error('Item not found');
            return updated;
        }),
    delete: protectedProcedure
        .input(z.object({ projectId: z.string().uuid(), itemId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            const existing = await ctx.db.query.cmsItems.findFirst({
                where: eq(cmsItems.id, input.itemId),
                with: { collection: true },
            });
            if (!existing || existing.collection.projectId !== input.projectId) {
                throw new Error('Item not found');
            }
            await ctx.db.delete(cmsItems).where(eq(cmsItems.id, input.itemId));
            return { success: true };
        }),
});
