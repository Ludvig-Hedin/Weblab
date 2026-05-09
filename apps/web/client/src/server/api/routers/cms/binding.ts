import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { cmsBindings, cmsCollections, cmsItems } from '@weblab/db';
import { CmsBindingKind, CmsItemStatus } from '@weblab/models';

import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';
import { verifyProjectAccess } from '../project/helper';

const filterClauseSchema = z.discriminatedUnion('op', [
    z.object({
        fieldKey: z.string().min(1),
        op: z.enum(['eq', 'neq']),
        value: z.union([z.string(), z.number(), z.boolean()]),
    }),
    z.object({
        fieldKey: z.string().min(1),
        op: z.enum(['before', 'after']),
        value: z.string().min(1),
    }),
    z.object({
        fieldKey: z.string().min(1),
        op: z.enum(['contains', 'starts_with']),
        value: z.string(),
    }),
    z.object({
        fieldKey: z.string().min(1),
        op: z.enum(['is_set', 'is_unset']),
    }),
]);

const bindingPayloadSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal(CmsBindingKind.ITEM_FIELD),
        collectionId: z.string().uuid(),
        itemId: z.string().uuid(),
        fieldKey: z.string().min(1),
    }),
    z.object({
        kind: z.literal(CmsBindingKind.FIRST_FIELD),
        collectionId: z.string().uuid(),
        fieldKey: z.string().min(1),
        filters: z.array(filterClauseSchema).optional(),
        filterMode: z.enum(['and', 'or']).optional(),
    }),
    z.object({
        kind: z.literal(CmsBindingKind.REPEAT),
        collectionId: z.string().uuid(),
        sort: z
            .object({
                fieldKey: z.string().min(1),
                direction: z.enum(['asc', 'desc']),
            })
            .optional(),
        limit: z.number().int().min(1).max(500).optional(),
        filters: z.array(filterClauseSchema).optional(),
        filterMode: z.enum(['and', 'or']).optional(),
    }),
    z.object({
        kind: z.literal(CmsBindingKind.CURRENT_FIELD),
        fieldKey: z.string().min(1),
    }),
    z.object({
        kind: z.literal(CmsBindingKind.PAGE_ITEM_FIELD),
        fieldKey: z.string().min(1),
    }),
]);

export const cmsBindingRouter = createTRPCRouter({
    listForProject: protectedProcedure
        .input(z.object({ projectId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            return ctx.db.query.cmsBindings.findMany({
                where: eq(cmsBindings.projectId, input.projectId),
            });
        }),
    /**
     * One-shot snapshot used by the preview-data pusher. Returns all
     * bindings for the project, plus the items for every collection that
     * has at least one binding. Single query per refresh — keeps the
     * pusher's subscription model trivial.
     */
    snapshot: protectedProcedure
        .input(
            z.object({
                projectId: z.string().uuid(),
                /**
                 * When true, only items with status=PUBLISHED are returned.
                 * Used at publish time so drafts don't leak into production.
                 * Editor preview uses the default (false) so authors see
                 * their drafts as they edit (BUG #10 from review).
                 */
                publishedOnly: z.boolean().default(false),
            }),
        )
        .query(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            const bindings = await ctx.db.query.cmsBindings.findMany({
                where: eq(cmsBindings.projectId, input.projectId),
            });
            const collectionIds = Array.from(
                new Set(
                    bindings
                        .map((b) => {
                            const p = b.binding;
                            return 'collectionId' in p ? p.collectionId : null;
                        })
                        .filter((id): id is string => !!id),
                ),
            );
            if (collectionIds.length === 0) {
                return { bindings, items: [], collectionIds: [] };
            }
            // Project-scope guard: only return items whose collection
            // belongs to this project (defends against a binding that
            // somehow references a collection on a different project —
            // shouldn't happen, but cheap to verify).
            const collections = await ctx.db.query.cmsCollections.findMany({
                where: and(
                    eq(cmsCollections.projectId, input.projectId),
                    inArray(cmsCollections.id, collectionIds),
                ),
            });
            const validCollectionIds = collections.map((c) => c.id);
            if (validCollectionIds.length === 0) {
                return { bindings, items: [], collectionIds: [] };
            }
            // Editor preview includes drafts; publish-time pulls only
            // PUBLISHED items. Switch is per-call via `publishedOnly`.
            const items = await ctx.db.query.cmsItems.findMany({
                where: input.publishedOnly
                    ? and(
                          inArray(cmsItems.collectionId, validCollectionIds),
                          eq(cmsItems.status, CmsItemStatus.PUBLISHED),
                      )
                    : inArray(cmsItems.collectionId, validCollectionIds),
                orderBy: [asc(cmsItems.createdAt)],
            });
            return { bindings, items, collectionIds: validCollectionIds };
        }),
    upsert: protectedProcedure
        .input(
            z.object({
                projectId: z.string().uuid(),
                oid: z.string().min(1),
                binding: bindingPayloadSchema,
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            const existing = await ctx.db.query.cmsBindings.findFirst({
                where: and(
                    eq(cmsBindings.projectId, input.projectId),
                    eq(cmsBindings.oid, input.oid),
                ),
            });
            if (existing) {
                const [updated] = await ctx.db
                    .update(cmsBindings)
                    .set({ binding: input.binding, updatedAt: new Date() })
                    .where(eq(cmsBindings.id, existing.id))
                    .returning();
                return updated;
            }
            const [created] = await ctx.db
                .insert(cmsBindings)
                .values({
                    projectId: input.projectId,
                    oid: input.oid,
                    binding: input.binding,
                })
                .returning();
            return created;
        }),
    remove: protectedProcedure
        .input(z.object({ projectId: z.string().uuid(), oid: z.string().min(1) }))
        .mutation(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            await ctx.db
                .delete(cmsBindings)
                .where(
                    and(eq(cmsBindings.projectId, input.projectId), eq(cmsBindings.oid, input.oid)),
                );
            return { success: true };
        }),
    removeMany: protectedProcedure
        .input(
            z.object({
                projectId: z.string().uuid(),
                oids: z.array(z.string().min(1)),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            // Verify access first so unauthorized callers can't probe project
            // existence by varying `oids` between empty and non-empty.
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            if (input.oids.length === 0) return { success: true };
            await ctx.db
                .delete(cmsBindings)
                .where(
                    and(
                        eq(cmsBindings.projectId, input.projectId),
                        inArray(cmsBindings.oid, input.oids),
                    ),
                );
            return { success: true };
        }),
});
