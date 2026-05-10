import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import type { DrizzleDb } from '@weblab/db';
import { cmsCollections, cmsFields, cmsSources } from '@weblab/db';
import { CmsFieldType, CmsSourceType } from '@weblab/models';

import { createTRPCRouter, protectedProcedure } from '@/server/api/trpc';
import {
    decryptCmsCredentials,
    encryptCmsCredentials,
    isEncryptedBlob,
} from '@/server/utils/cms-credentials';
import { verifyProjectAccess } from '../project/helper';
import { getAdapter } from './adapters/dispatch';
import { encodeRemoteRef, runSourceSync } from './sync';

// External-source types accepted by the connect wizard. WEBLAB is created
// implicitly via `ensureDefaultWeblabSource` and is not user-creatable.
const externalSourceTypeSchema = z.enum([
    CmsSourceType.PAYLOAD,
    CmsSourceType.STRAPI,
    CmsSourceType.REST,
]);

const credentialsSchema = z.record(z.string(), z.unknown());

/**
 * v3: full CRUD + adapter dispatch for external sources. The default
 * `weblab` source is still seeded by `ensureDefaultWeblabSource` and
 * cannot be created/updated/deleted through this router.
 */
export const cmsSourceRouter = createTRPCRouter({
    list: protectedProcedure
        .input(z.object({ projectId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            // Strip `credentials` from the response — they're encrypted but
            // there's no reason to ship even the ciphertext to the client.
            const rows = await ctx.db.query.cmsSources.findMany({
                where: eq(cmsSources.projectId, input.projectId),
                orderBy: (s, { asc }) => [asc(s.createdAt)],
            });
            return rows.map(({ credentials: _credentials, ...rest }) => rest);
        }),
    get: protectedProcedure
        .input(z.object({ projectId: z.string().uuid(), sourceId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            const row = await ctx.db.query.cmsSources.findFirst({
                where: and(
                    eq(cmsSources.id, input.sourceId),
                    eq(cmsSources.projectId, input.projectId),
                ),
            });
            if (!row) return null;
            const { credentials: _credentials, ...rest } = row;
            return rest;
        }),
    /**
     * Health-check the credentials WITHOUT persisting them. Used by the
     * connect wizard's "Test connection" button.
     */
    testConnection: protectedProcedure
        .input(
            z.object({
                projectId: z.string().uuid(),
                type: externalSourceTypeSchema,
                credentials: credentialsSchema,
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            const adapter = getAdapter(input.type);
            if (!adapter) {
                return { ok: false as const, reason: 'Unsupported source type' };
            }
            return adapter.testConnection(input.credentials);
        }),
    /**
     * Re-test an already-saved source using its stored credentials. Used by
     * the "Test connection" button on each row in the sources tab so the
     * user can verify a rotation or remote outage without re-entering keys.
     */
    testExisting: protectedProcedure
        .input(z.object({ projectId: z.string().uuid(), sourceId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            const source = await ctx.db.query.cmsSources.findFirst({
                where: and(
                    eq(cmsSources.id, input.sourceId),
                    eq(cmsSources.projectId, input.projectId),
                ),
            });
            if (!source) throw new Error('Source not found');
            const adapter = getAdapter(source.type);
            if (!adapter) {
                return { ok: false as const, reason: 'Unsupported source type' };
            }
            if (!isEncryptedBlob(source.credentials)) {
                return { ok: false as const, reason: 'Source has no usable credentials' };
            }
            const creds = decryptCmsCredentials(source.credentials.encrypted);
            return adapter.testConnection(creds);
        }),
    create: protectedProcedure
        .input(
            z.object({
                projectId: z.string().uuid(),
                type: externalSourceTypeSchema,
                name: z.string().trim().min(1).max(80),
                credentials: credentialsSchema,
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            const encrypted = encryptCmsCredentials(input.credentials);
            const [created] = await ctx.db
                .insert(cmsSources)
                .values({
                    projectId: input.projectId,
                    name: input.name,
                    type: input.type,
                    credentials: { encrypted },
                    status: 'connected',
                })
                .returning();
            if (!created) throw new Error('Failed to create source');
            const { credentials: _credentials, ...rest } = created;
            return rest;
        }),
    update: protectedProcedure
        .input(
            z.object({
                projectId: z.string().uuid(),
                sourceId: z.string().uuid(),
                name: z.string().trim().min(1).max(80).optional(),
                /** Optional — only re-encrypt and replace when present. */
                credentials: credentialsSchema.optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            const existing = await ctx.db.query.cmsSources.findFirst({
                where: and(
                    eq(cmsSources.id, input.sourceId),
                    eq(cmsSources.projectId, input.projectId),
                ),
            });
            if (!existing) throw new Error('Source not found');
            if (existing.type === CmsSourceType.WEBLAB) {
                throw new Error('The default Weblab CMS source cannot be edited');
            }
            const patch: Record<string, unknown> = { updatedAt: new Date() };
            if (input.name !== undefined) patch.name = input.name;
            if (input.credentials !== undefined) {
                patch.credentials = { encrypted: encryptCmsCredentials(input.credentials) };
            }
            const [updated] = await ctx.db
                .update(cmsSources)
                .set(patch)
                .where(
                    and(
                        eq(cmsSources.id, input.sourceId),
                        eq(cmsSources.projectId, input.projectId),
                    ),
                )
                .returning();
            if (!updated) throw new Error('Source not found');
            const { credentials: _credentials, ...rest } = updated;
            return rest;
        }),
    delete: protectedProcedure
        .input(z.object({ projectId: z.string().uuid(), sourceId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            const existing = await ctx.db.query.cmsSources.findFirst({
                where: and(
                    eq(cmsSources.id, input.sourceId),
                    eq(cmsSources.projectId, input.projectId),
                ),
            });
            if (!existing) throw new Error('Source not found');
            if (existing.type === CmsSourceType.WEBLAB) {
                throw new Error('The default Weblab CMS source cannot be deleted');
            }
            // Refuse if any collection still references this source. Schema
            // cascades, but cascading would silently delete user content;
            // require an explicit collection cleanup first.
            const referencing = await ctx.db.query.cmsCollections.findMany({
                where: eq(cmsCollections.sourceId, input.sourceId),
                columns: { id: true },
            });
            if (referencing.length > 0) {
                throw new Error(
                    `Cannot delete: ${referencing.length} collection(s) still use this source`,
                );
            }
            await ctx.db.delete(cmsSources).where(eq(cmsSources.id, input.sourceId));
            return { success: true };
        }),
    /**
     * Fetches the remote content types via the adapter and returns them so
     * the user can map them onto Weblab collections in the wizard.
     */
    listRemoteCollections: protectedProcedure
        .input(z.object({ projectId: z.string().uuid(), sourceId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            const source = await ctx.db.query.cmsSources.findFirst({
                where: and(
                    eq(cmsSources.id, input.sourceId),
                    eq(cmsSources.projectId, input.projectId),
                ),
            });
            if (!source) throw new Error('Source not found');
            const adapter = getAdapter(source.type);
            if (!adapter) return [];
            if (!isEncryptedBlob(source.credentials)) return [];
            const creds = decryptCmsCredentials(source.credentials.encrypted);
            return adapter.listRemoteCollections(creds);
        }),
    /**
     * Pull items from the source for every collection that points at it,
     * upserting into `cms_item` keyed by `(collectionId, remoteId)`. Safe
     * to call repeatedly. Returns per-collection counts for UI feedback.
     */
    sync: protectedProcedure
        .input(
            z.object({
                projectId: z.string().uuid(),
                sourceId: z.string().uuid(),
                /**
                 * When true, locally-stored items whose remoteId is no longer
                 * in the adapter response are deleted. Default false (safe).
                 */
                prune: z.boolean().optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            return runSourceSync(ctx.db, input.projectId, input.sourceId, {
                prune: input.prune,
            });
        }),
    /**
     * Wizard step 6 — apply a batch of mappings from remote content types
     * to Weblab collections. For each mapping: create a new collection (with
     * inferred fields and the remote ref encoded in description), or attach
     * the remote ref to an existing collection. After the batch, runs a
     * sync so the user sees items immediately.
     */
    mapCollections: protectedProcedure
        .input(
            z.object({
                projectId: z.string().uuid(),
                sourceId: z.string().uuid(),
                mappings: z.array(
                    z.discriminatedUnion('mode', [
                        z.object({
                            mode: z.literal('create'),
                            remoteRef: z.string().min(1),
                            name: z.string().trim().min(1).max(64),
                            slug: z
                                .string()
                                .trim()
                                .min(1)
                                .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/),
                            fields: z.array(
                                z.object({
                                    key: z.string().min(1),
                                    name: z.string().min(1),
                                    type: z.nativeEnum(CmsFieldType),
                                }),
                            ),
                        }),
                        z.object({
                            mode: z.literal('attach'),
                            remoteRef: z.string().min(1),
                            collectionId: z.string().uuid(),
                        }),
                    ]),
                ),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await verifyProjectAccess(ctx.db, ctx.user.id, input.projectId);
            const source = await ctx.db.query.cmsSources.findFirst({
                where: and(
                    eq(cmsSources.id, input.sourceId),
                    eq(cmsSources.projectId, input.projectId),
                ),
            });
            if (!source) throw new Error('Source not found');

            await ctx.db.transaction(async (tx) => {
                for (const mapping of input.mappings) {
                    if (mapping.mode === 'create') {
                        const [created] = await tx
                            .insert(cmsCollections)
                            .values({
                                projectId: input.projectId,
                                sourceId: input.sourceId,
                                name: mapping.name,
                                slug: mapping.slug,
                                description: encodeRemoteRef(mapping.remoteRef),
                            })
                            .returning();
                        if (!created) throw new Error('Failed to create collection');
                        if (mapping.fields.length > 0) {
                            await tx.insert(cmsFields).values(
                                mapping.fields.map((field, index) => ({
                                    collectionId: created.id,
                                    name: field.name,
                                    key: field.key,
                                    type: field.type,
                                    order: index,
                                })),
                            );
                        }
                    } else {
                        // Attach: reset sourceId + description, leaving any
                        // existing items in place. The next sync will update
                        // their values to match the remote.
                        const existing = await tx.query.cmsCollections.findFirst({
                            where: and(
                                eq(cmsCollections.id, mapping.collectionId),
                                eq(cmsCollections.projectId, input.projectId),
                            ),
                        });
                        if (!existing) throw new Error('Collection not found');
                        await tx
                            .update(cmsCollections)
                            .set({
                                sourceId: input.sourceId,
                                description: encodeRemoteRef(
                                    mapping.remoteRef,
                                    existing.description ?? undefined,
                                ),
                                updatedAt: new Date(),
                            })
                            .where(eq(cmsCollections.id, mapping.collectionId));
                    }
                }
            });

            // Initial sync so items show up immediately. Best-effort —
            // adapter errors don't roll back the mapping.
            try {
                await runSourceSync(ctx.db, input.projectId, input.sourceId);
            } catch (err) {
                console.error('[cms.source.mapCollections] initial sync failed', err);
            }
            return { success: true };
        }),
});

/**
 * Returns the project's default Weblab CMS source, creating it lazily on
 * first call. Idempotent — safe to call from anywhere that needs the
 * source id. Accepts a db or tx interchangeably (transactions don't carry
 * the postgres-js `$client` field, hence the structural Pick).
 */
type DbWithInsert = Pick<DrizzleDb, 'query' | 'insert'>;
export async function ensureDefaultWeblabSource(
    db: DbWithInsert,
    projectId: string,
): Promise<string> {
    const existing = await db.query.cmsSources.findFirst({
        where: and(eq(cmsSources.projectId, projectId), eq(cmsSources.type, CmsSourceType.WEBLAB)),
    });
    if (existing) return existing.id;
    const [inserted] = await (db as DrizzleDb)
        .insert(cmsSources)
        .values({
            projectId,
            name: 'Weblab CMS',
            type: CmsSourceType.WEBLAB,
        })
        .onConflictDoNothing()
        .returning();
    if (!inserted) {
        // Another concurrent call inserted first — re-fetch to get the id.
        const refetch = await db.query.cmsSources.findFirst({
            where: and(
                eq(cmsSources.projectId, projectId),
                eq(cmsSources.type, CmsSourceType.WEBLAB),
            ),
        });
        if (!refetch) throw new Error('Failed to create default Weblab CMS source');
        return refetch.id;
    }
    return inserted.id;
}
