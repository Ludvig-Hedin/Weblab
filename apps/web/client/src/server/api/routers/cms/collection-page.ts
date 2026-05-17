import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { cmsBindings, cmsCollectionPages, cmsCollections } from '@weblab/db';
import { CmsBindingKind } from '@weblab/models';

import { requireCap } from '@/server/api/permissions/requireCap';
import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';

const pagePathSchema = z
    .string()
    .trim()
    .min(1)
    .max(255)
    .regex(/^\/[A-Za-z0-9\-_/[\]]*$/, {
        message:
            'Page path must start with / and only use letters, numbers, dashes, slashes, [ or ]',
    });

const fieldKeySchema = z.string().trim().min(1).max(64);

/**
 * v4: maps a project page (`/blog/[slug]`) to a collection so the editor
 * knows which page is a "detail page" for which collection. The dynamic
 * segment is matched against `matchFieldKey` at preview/publish time.
 */
export const cmsCollectionPageRouter = createTRPCRouter({
    list: protectedProcedure
        .input(z.object({ projectId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'project.view', { projectId: input.projectId });
            return ctx.db.query.cmsCollectionPages.findMany({
                where: eq(cmsCollectionPages.projectId, input.projectId),
                orderBy: (p, { asc }) => [asc(p.createdAt)],
            });
        }),
    /**
     * Find the collection-page registration (if any) for a given page path.
     * The bind dialog calls this to decide whether to show the
     * "Current item from page" option.
     */
    getForPath: protectedProcedure
        .input(z.object({ projectId: z.string().uuid(), pagePath: z.string() }))
        .query(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'project.view', { projectId: input.projectId });
            return ctx.db.query.cmsCollectionPages.findFirst({
                where: and(
                    eq(cmsCollectionPages.projectId, input.projectId),
                    eq(cmsCollectionPages.pagePath, input.pagePath),
                ),
            });
        }),
    upsert: protectedProcedure
        .input(
            z.object({
                projectId: z.string().uuid(),
                collectionId: z.string().uuid(),
                pagePath: pagePathSchema,
                matchFieldKey: fieldKeySchema,
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'project.update', { projectId: input.projectId });
            // Sanity: collection must belong to the project.
            const collection = await ctx.db.query.cmsCollections.findFirst({
                where: and(
                    eq(cmsCollections.id, input.collectionId),
                    eq(cmsCollections.projectId, input.projectId),
                ),
            });
            if (!collection) throw new Error('Collection not found');

            const existing = await ctx.db.query.cmsCollectionPages.findFirst({
                where: and(
                    eq(cmsCollectionPages.projectId, input.projectId),
                    eq(cmsCollectionPages.pagePath, input.pagePath),
                ),
            });
            if (existing) {
                const [updated] = await ctx.db
                    .update(cmsCollectionPages)
                    .set({
                        collectionId: input.collectionId,
                        matchFieldKey: input.matchFieldKey,
                        updatedAt: new Date(),
                    })
                    .where(eq(cmsCollectionPages.id, existing.id))
                    .returning();
                if (!updated) throw new Error('Collection page was deleted during update');
                return updated;
            }
            const [created] = await ctx.db
                .insert(cmsCollectionPages)
                .values({
                    projectId: input.projectId,
                    collectionId: input.collectionId,
                    pagePath: input.pagePath,
                    matchFieldKey: input.matchFieldKey,
                })
                .returning();
            return created;
        }),
    delete: protectedProcedure
        .input(z.object({ projectId: z.string().uuid(), id: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'project.update', { projectId: input.projectId });
            await ctx.db
                .delete(cmsCollectionPages)
                .where(
                    and(
                        eq(cmsCollectionPages.id, input.id),
                        eq(cmsCollectionPages.projectId, input.projectId),
                    ),
                );
            // After delete, count PAGE_ITEM_FIELD bindings that may be
            // orphaned (no remaining page registration). The UI surfaces
            // this as a warning toast (BUG #8 from review).
            const remainingPages = await ctx.db.query.cmsCollectionPages.findMany({
                where: eq(cmsCollectionPages.projectId, input.projectId),
                columns: { id: true },
            });
            let orphanedBindingCount = 0;
            if (remainingPages.length === 0) {
                const allBindings = await ctx.db.query.cmsBindings.findMany({
                    where: eq(cmsBindings.projectId, input.projectId),
                    columns: { binding: true },
                });
                orphanedBindingCount = allBindings.filter(
                    (b) => b.binding.kind === CmsBindingKind.PAGE_ITEM_FIELD,
                ).length;
            }
            return { success: true, orphanedBindingCount };
        }),
});
