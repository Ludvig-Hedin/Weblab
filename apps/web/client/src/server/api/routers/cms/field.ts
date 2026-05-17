import { TRPCError } from '@trpc/server';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { DrizzleDb } from '@weblab/db';
import { cmsCollections, cmsFields } from '@weblab/db';
import { CmsFieldType } from '@weblab/models';

import { requireCap } from '@/server/api/permissions/requireCap';
import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';

const fieldKeySchema = z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-zA-Z_][a-zA-Z0-9_]*$/, {
        message:
            'Field key must start with a letter or underscore and contain only letters, numbers, or underscores',
    });

const fieldTypeSchema = z.nativeEnum(CmsFieldType);

async function assertCollectionInProject(
    db: DrizzleDb,
    projectId: string,
    collectionId: string,
): Promise<void> {
    const found = await db.query.cmsCollections.findFirst({
        where: and(eq(cmsCollections.id, collectionId), eq(cmsCollections.projectId, projectId)),
    });
    if (!found) throw new Error('Collection not found');
}

export const cmsFieldRouter = createTRPCRouter({
    listByCollection: protectedProcedure
        .input(
            z.object({
                projectId: z.string().uuid(),
                collectionId: z.string().uuid(),
            }),
        )
        .query(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'project.view', { projectId: input.projectId });
            await assertCollectionInProject(ctx.db, input.projectId, input.collectionId);
            return ctx.db.query.cmsFields.findMany({
                where: eq(cmsFields.collectionId, input.collectionId),
                orderBy: (f, { asc }) => [asc(f.order), asc(f.createdAt)],
            });
        }),
    create: protectedProcedure
        .input(
            z.object({
                projectId: z.string().uuid(),
                collectionId: z.string().uuid(),
                name: z.string().trim().min(1).max(64),
                key: fieldKeySchema,
                type: fieldTypeSchema,
                helpText: z.string().max(200).optional(),
                required: z.boolean().default(false),
                config: z.record(z.string(), z.unknown()).default({}),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'project.update', { projectId: input.projectId });
            await assertCollectionInProject(ctx.db, input.projectId, input.collectionId);
            const existing = await ctx.db.query.cmsFields.findMany({
                where: eq(cmsFields.collectionId, input.collectionId),
            });
            // App-level uniqueness check until the (collectionId, key) DB
            // unique constraint is added (CR-074). Two concurrent creates can
            // still race, but the common UI path is single-tab single-user.
            if (existing.some((f) => f.key === input.key)) {
                throw new Error(
                    `A field with key "${input.key}" already exists in this collection`,
                );
            }
            const order = existing.length;
            const [created] = await ctx.db
                .insert(cmsFields)
                .values({
                    collectionId: input.collectionId,
                    name: input.name,
                    key: input.key,
                    type: input.type,
                    helpText: input.helpText,
                    required: input.required,
                    config: input.config,
                    order,
                })
                .returning();
            if (!created) throw new Error('Failed to create field');
            return created;
        }),
    update: protectedProcedure
        .input(
            z.object({
                projectId: z.string().uuid(),
                fieldId: z.string().uuid(),
                name: z.string().trim().min(1).max(64).optional(),
                helpText: z.string().max(200).optional(),
                required: z.boolean().optional(),
                config: z.record(z.string(), z.unknown()).optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'project.update', { projectId: input.projectId });
            const existing = await ctx.db.query.cmsFields.findFirst({
                where: eq(cmsFields.id, input.fieldId),
                with: { collection: true },
            });
            if (!existing || existing.collection.projectId !== input.projectId) {
                throw new Error('Field not found');
            }
            const patch: Partial<typeof cmsFields.$inferInsert> & { updatedAt: Date } = {
                updatedAt: new Date(),
            };
            if (input.name !== undefined) patch.name = input.name;
            if (input.helpText !== undefined) patch.helpText = input.helpText;
            if (input.required !== undefined) patch.required = input.required;
            if (input.config !== undefined) patch.config = input.config;
            const [updated] = await ctx.db
                .update(cmsFields)
                .set(patch)
                .where(eq(cmsFields.id, input.fieldId))
                .returning();
            if (!updated) throw new Error('Field not found');
            return updated;
        }),
    reorder: protectedProcedure
        .input(
            z.object({
                projectId: z.string().uuid(),
                collectionId: z.string().uuid(),
                orderedFieldIds: z.array(z.string().uuid()),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'project.update', { projectId: input.projectId });
            await assertCollectionInProject(ctx.db, input.projectId, input.collectionId);
            await ctx.db.transaction(async (tx) => {
                // CR-114: fetch all fields in one query, then do one bulk UPDATE
                // instead of N per-field updates.
                const existing = await tx.query.cmsFields.findMany({
                    where: eq(cmsFields.collectionId, input.collectionId),
                    columns: { id: true },
                });
                const validIds = new Set(existing.map((f) => f.id));
                for (const id of input.orderedFieldIds) {
                    if (!validIds.has(id)) {
                        throw new TRPCError({
                            code: 'BAD_REQUEST',
                            message: `Field ${id} does not belong to this collection`,
                        });
                    }
                }
                if (input.orderedFieldIds.length === 0) return;

                // Build a single CASE expression: CASE WHEN id = $1 THEN $2 … END
                const whenClauses = input.orderedFieldIds.map(
                    (id, i) => sql`WHEN ${cmsFields.id} = ${id}::uuid THEN ${i}`,
                );
                const orderExpr = sql`CASE ${sql.join(whenClauses, sql` `)} ELSE ${cmsFields.order} END`;

                await tx
                    .update(cmsFields)
                    .set({ order: orderExpr as unknown as number, updatedAt: new Date() })
                    .where(
                        and(
                            inArray(cmsFields.id, input.orderedFieldIds),
                            eq(cmsFields.collectionId, input.collectionId),
                        ),
                    );
            });
            return { success: true };
        }),
    delete: protectedProcedure
        .input(z.object({ projectId: z.string().uuid(), fieldId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'project.update', { projectId: input.projectId });
            const existing = await ctx.db.query.cmsFields.findFirst({
                where: eq(cmsFields.id, input.fieldId),
                with: { collection: true },
            });
            if (!existing || existing.collection.projectId !== input.projectId) {
                throw new Error('Field not found');
            }
            await ctx.db.delete(cmsFields).where(eq(cmsFields.id, input.fieldId));
            return { success: true };
        }),
});
