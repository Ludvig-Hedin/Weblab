import { and, count, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';

import { cmsCollections, cmsItems } from '@weblab/db';

import { requireCap } from '@/server/api/permissions/requireCap';
import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';
import { ensureDefaultWeblabSource } from './source';
import { encodeRemoteRef, readRemoteRef, stripRemoteRef } from './sync';

const slugSchema = z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, {
        message: 'Slug must be lowercase letters, numbers, and dashes',
    });

export const cmsCollectionRouter = createTRPCRouter({
    list: protectedProcedure
        .input(z.object({ projectId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'project.view', { projectId: input.projectId });
            const collections = await ctx.db.query.cmsCollections.findMany({
                where: eq(cmsCollections.projectId, input.projectId),
                orderBy: (c, { asc }) => [asc(c.createdAt)],
            });
            // Item counts are surfaced in the sidebar badge. Aggregate in a
            // single grouped query so we stay O(1) instead of O(n collections).
            const counts = new Map<string, number>();
            if (collections.length > 0) {
                const rows = await ctx.db
                    .select({
                        collectionId: cmsItems.collectionId,
                        count: count(cmsItems.id),
                    })
                    .from(cmsItems)
                    .where(
                        inArray(
                            cmsItems.collectionId,
                            collections.map((c) => c.id),
                        ),
                    )
                    .groupBy(cmsItems.collectionId);
                for (const row of rows) {
                    counts.set(row.collectionId, row.count);
                }
            }
            return collections.map((c) => ({
                ...c,
                description: stripRemoteRef(c.description),
                itemCount: counts.get(c.id) ?? 0,
            }));
        }),
    get: protectedProcedure
        .input(
            z.object({
                projectId: z.string().uuid(),
                collectionId: z.string().uuid(),
            }),
        )
        .query(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'project.view', { projectId: input.projectId });
            const collection = await ctx.db.query.cmsCollections.findFirst({
                where: and(
                    eq(cmsCollections.id, input.collectionId),
                    eq(cmsCollections.projectId, input.projectId),
                ),
                with: {
                    fields: {
                        orderBy: (f, { asc }) => [asc(f.order), asc(f.createdAt)],
                    },
                },
            });
            if (!collection) return null;
            return { ...collection, description: stripRemoteRef(collection.description) };
        }),
    create: protectedProcedure
        .input(
            z.object({
                projectId: z.string().uuid(),
                name: z.string().trim().min(1).max(64),
                slug: slugSchema.max(64),
                description: z.string().max(500).optional(),
                icon: z.string().max(64).optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'project.update', { projectId: input.projectId });
            return ctx.db.transaction(async (tx) => {
                // App-level slug uniqueness check until the (projectId, slug)
                // DB unique constraint is added (CR-074).
                const dup = await tx.query.cmsCollections.findFirst({
                    where: and(
                        eq(cmsCollections.projectId, input.projectId),
                        eq(cmsCollections.slug, input.slug),
                    ),
                });
                if (dup) {
                    throw new Error(
                        `A collection with slug "${input.slug}" already exists in this project`,
                    );
                }
                const sourceId = await ensureDefaultWeblabSource(tx, input.projectId);
                const [created] = await tx
                    .insert(cmsCollections)
                    .values({
                        projectId: input.projectId,
                        sourceId,
                        name: input.name,
                        slug: input.slug,
                        description: input.description,
                        icon: input.icon,
                    })
                    .returning();
                if (!created) throw new Error('Failed to create collection');
                return created;
            });
        }),
    update: protectedProcedure
        .input(
            z.object({
                projectId: z.string().uuid(),
                collectionId: z.string().uuid(),
                name: z.string().trim().min(1).max(64).optional(),
                slug: slugSchema.max(64).optional(),
                description: z.string().max(500).optional(),
                icon: z.string().max(64).optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'project.update', { projectId: input.projectId });
            const { projectId, collectionId, description, ...patch } = input;
            // Preserve any remote-ref prefix already encoded in the
            // existing description. Without this, editing the user-facing
            // description on an external-source collection wipes the
            // sync's link to the remote collection (BUG #37 from review).
            let nextDescription: string | undefined;
            if (description !== undefined) {
                const existing = await ctx.db.query.cmsCollections.findFirst({
                    where: and(
                        eq(cmsCollections.id, collectionId),
                        eq(cmsCollections.projectId, projectId),
                    ),
                });
                const remoteRef = readRemoteRef(existing?.description ?? null);
                nextDescription = remoteRef ? encodeRemoteRef(remoteRef, description) : description;
            }
            const [updated] = await ctx.db
                .update(cmsCollections)
                .set({
                    ...patch,
                    ...(nextDescription !== undefined ? { description: nextDescription } : {}),
                    updatedAt: new Date(),
                })
                .where(
                    and(
                        eq(cmsCollections.id, collectionId),
                        eq(cmsCollections.projectId, projectId),
                    ),
                )
                .returning();
            if (!updated) throw new Error('Collection not found');
            return { ...updated, description: stripRemoteRef(updated.description) };
        }),
    delete: protectedProcedure
        .input(
            z.object({
                projectId: z.string().uuid(),
                collectionId: z.string().uuid(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'project.update', { projectId: input.projectId });
            await ctx.db
                .delete(cmsCollections)
                .where(
                    and(
                        eq(cmsCollections.id, input.collectionId),
                        eq(cmsCollections.projectId, input.projectId),
                    ),
                );
            return { success: true };
        }),
});
