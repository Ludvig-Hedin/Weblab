import { paginationOptsValidator } from 'convex/server';
import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { internalMutation, mutation, query } from './_generated/server';
import { validateAndCleanItemValues } from './lib/cmsValueValidation';
import { cmsRevision, nextCmsRevision } from './lib/cmsRevision';
import { vCmsItemStatus } from './lib/enums';
import { requireCap } from './lib/permissions';

// Ported from src/server/api/routers/cms/item.ts.
//
// Value validation (buildItemValuesSchema in the tRPC era) is re-enforced
// server-side via validateAndCleanItemValues — same per-field-type rules
// without the Zod dependency. The client also runs its own validation but
// we don't trust it.

async function loadCollectionFields(
    ctx: MutationCtx,
    collectionId: Id<'cmsCollections'>,
): Promise<Doc<'cmsFields'>[]> {
    const fields = await ctx.db
        .query('cmsFields')
        .withIndex('by_collection_order', (q) => q.eq('collectionId', collectionId))
        .take(501);
    if (fields.length > 500) throw new Error('BAD_REQUEST: Too many collection fields.');
    fields.sort((a, b) => a.order - b.order || a._creationTime - b._creationTime);
    return fields;
}

export const list = query({
    args: {
        projectId: v.id('projects'),
        collectionId: v.id('cmsCollections'),
        limit: v.optional(v.number()),
        archived: v.optional(v.boolean()),
    },
    handler: async (ctx, { projectId, collectionId, limit, archived }) => {
        await requireCap(ctx, 'project.view', { projectId });
        const collection = await ctx.db.get(collectionId);
        if (!collection || collection.projectId !== projectId) {
            throw new Error('NOT_FOUND: collection');
        }
        if (limit !== undefined && (!Number.isSafeInteger(limit) || limit < 1)) throw new Error('BAD_REQUEST: Limit must be a positive integer.');
        const requestedLimit = Math.min(Math.max(limit ?? 100, 1), 500);
        const result = await ctx.db.query('cmsItems')
            .withIndex('by_collection_updated', (q) => q.eq('collectionId', collectionId))
            .order('desc').filter((q) => archived === true ? q.neq(q.field('archivedAt'), undefined) : q.eq(q.field('archivedAt'), undefined))
            .paginate({ cursor: null, numItems: requestedLimit, maximumRowsRead: 1000, maximumBytesRead: 4 * 1024 * 1024 });
        if (!result.isDone && result.page.length < requestedLimit) throw new Error('BAD_REQUEST: Use the paginated item list for this collection.');
        return result.page;
    },
});

export const listPage = query({
    args: {
        projectId: v.id('projects'),
        collectionId: v.id('cmsCollections'),
        paginationOpts: paginationOptsValidator,
        archived: v.optional(v.boolean()),
    },
    handler: async (ctx, { projectId, collectionId, paginationOpts, archived }) => {
        await requireCap(ctx, 'project.view', { projectId });
        const collection = await ctx.db.get(collectionId);
        if (!collection || collection.projectId !== projectId) throw new Error('NOT_FOUND: collection');
        if (!Number.isSafeInteger(paginationOpts.numItems) || paginationOpts.numItems < 1 || paginationOpts.numItems > 100) {
            throw new Error('BAD_REQUEST: Page size must be 1-100.');
        }
        for (const budget of [paginationOpts.maximumRowsRead, paginationOpts.maximumBytesRead]) {
            if (budget !== undefined && (!Number.isSafeInteger(budget) || budget < 1)) throw new Error('BAD_REQUEST: Pagination scan limits must be positive integers.');
        }
        return ctx.db.query('cmsItems')
            .withIndex('by_collection_updated', (q) => q.eq('collectionId', collectionId))
            .order('desc').filter((q) => archived === true ? q.neq(q.field('archivedAt'), undefined) : q.eq(q.field('archivedAt'), undefined))
            .paginate({ ...paginationOpts, maximumRowsRead: Math.min(paginationOpts.maximumRowsRead ?? 1000, 1000), maximumBytesRead: Math.min(paginationOpts.maximumBytesRead ?? 4 * 1024 * 1024, 4 * 1024 * 1024) });
    },
});

async function requireNativeCollection(ctx: MutationCtx, collection: Doc<'cmsCollections'>): Promise<void> {
    const source = await ctx.db.get(collection.sourceId);
    if (!source || source.projectId !== collection.projectId) throw new Error('NOT_FOUND: source');
    if (source.status === 'deleting') throw new Error('CONFLICT: Source removal is in progress.');
    if (source.type !== 'weblab') {
        throw new Error('READ_ONLY: Edit this content in its external CMS. Weblab cannot safely save changes to this source yet.');
    }
}

async function uniqueSlug(ctx: MutationCtx, collectionId: Id<'cmsCollections'>, slug: string | null | undefined, except?: Id<'cmsItems'>): Promise<string | undefined> {
    if (slug === null || slug === undefined) return undefined;
    const normalized = slug.trim();
    if (!normalized || normalized.length > 120 || !/^[\p{L}\p{N}_-]+$/u.test(normalized)) {
        throw new Error('BAD_REQUEST: Use a slug of 1-120 letters, numbers, dashes or underscores.');
    }
    const matches = await ctx.db.query('cmsItems')
        .withIndex('by_collection_slug', (q) => q.eq('collectionId', collectionId).eq('slug', normalized)).take(2);
    if (matches.some((item) => item._id !== except)) throw new Error('CONFLICT: This slug is already used in the collection.');
    return normalized;
}

async function cleanValues(ctx: MutationCtx, projectId: Id<'projects'>, collectionId: Id<'cmsCollections'>, values: unknown): Promise<Record<string, unknown>> {
    const fields = await loadCollectionFields(ctx, collectionId);
    const cleaned = validateAndCleanItemValues(fields, values);
    let referencesChecked = 0;
    for (const field of fields) {
        if (field.type !== 'reference' || cleaned[field.key] === undefined) continue;
        const references = Array.isArray(cleaned[field.key]) ? cleaned[field.key] as string[] : [cleaned[field.key] as string];
        const config = field.config as { collectionId?: unknown; multiple?: unknown } | null;
        referencesChecked += references.length;
        if (referencesChecked > 500) throw new Error('BAD_REQUEST: Too many item references.');
        const configuredId = typeof config?.collectionId === 'string' ? ctx.db.normalizeId('cmsCollections', config.collectionId) : null;
        const configuredCollection = configuredId ? await ctx.db.get(configuredId) : null;
        if (!configuredCollection || configuredCollection.projectId !== projectId) throw new Error(`BAD_REQUEST: Configure a reference collection for ${field.name}.`);
        for (const reference of references) {
            const id = ctx.db.normalizeId('cmsItems', reference);
            const item = id ? await ctx.db.get(id) : null;
            const collection = item ? await ctx.db.get(item.collectionId) : null;
            if (!collection || collection.projectId !== projectId || collection._id !== configuredId) {
                throw new Error(`BAD_REQUEST: ${field.name} must reference an item in the allowed project collection.`);
            }
        }
    }
    return cleaned;
}

export const get = query({
    args: {
        projectId: v.id('projects'),
        itemId: v.id('cmsItems'),
    },
    handler: async (ctx, { projectId, itemId }) => {
        await requireCap(ctx, 'project.view', { projectId });
        const item = await ctx.db.get(itemId);
        if (!item) return null;
        const collection = await ctx.db.get(item.collectionId);
        if (!collection || collection.projectId !== projectId) {
            throw new Error('NOT_FOUND: item');
        }
        return { ...item, revision: cmsRevision(item) };
    },
});

export const create = mutation({
    args: {
        projectId: v.id('projects'),
        collectionId: v.id('cmsCollections'),
        slug: v.optional(v.union(v.string(), v.null())),
        values: v.any(),
        status: v.optional(vCmsItemStatus),
    },
    handler: async (ctx, { projectId, collectionId, slug, values, status }) => {
        await requireCap(ctx, 'project.update', { projectId });
        const collection = await ctx.db.get(collectionId);
        if (!collection || collection.projectId !== projectId) {
            throw new Error('NOT_FOUND: collection');
        }
        await requireNativeCollection(ctx, collection);
        const finalStatus = status ?? 'draft';
        if (finalStatus === 'published') await requireCap(ctx, 'project.publish', { projectId });
        const now = Date.now();
        const normalizedSlug = await uniqueSlug(ctx, collectionId, slug);
        const cleanedValues = await cleanValues(ctx, projectId, collectionId, values);
        const id = await ctx.db.insert('cmsItems', {
            collectionId,
            slug: normalizedSlug,
            revision: 1,
            status: finalStatus,
            values: cleanedValues,
            publishedAt: finalStatus === 'published' ? now : undefined,
            updatedAt: now,
        });
        return (await ctx.db.get(id))!;
    },
});

export const update = mutation({
    args: {
        projectId: v.id('projects'),
        itemId: v.id('cmsItems'),
        expectedRevision: v.number(),
        slug: v.optional(v.union(v.string(), v.null())),
        values: v.optional(v.any()),
        status: v.optional(vCmsItemStatus),
    },
    handler: async (ctx, { projectId, itemId, expectedRevision, slug, values, status }) => {
        await requireCap(ctx, 'project.update', { projectId });
        const existing = await ctx.db.get(itemId);
        if (!existing) throw new Error('NOT_FOUND: item');
        const collection = await ctx.db.get(existing.collectionId);
        if (!collection || collection.projectId !== projectId) {
            throw new Error('NOT_FOUND: item');
        }
        await requireNativeCollection(ctx, collection);
        if (existing.remoteId !== undefined) throw new Error('READ_ONLY: External content cannot be saved locally.');
        if (existing.archivedAt !== undefined) throw new Error('READ_ONLY: Restore this archived item as a draft before saving.');
        const revision = nextCmsRevision(existing, expectedRevision);
        const finalStatus = status ?? 'draft';
        if (finalStatus === 'published') await requireCap(ctx, 'project.publish', { projectId });
        const patch: Partial<Doc<'cmsItems'>> = { updatedAt: Date.now(), revision, status: finalStatus };
        if (slug !== undefined) patch.slug = await uniqueSlug(ctx, existing.collectionId, slug, itemId);
        if (finalStatus === 'published' && !existing.publishedAt) patch.publishedAt = Date.now();
        if (values !== undefined && (!values || typeof values !== 'object' || Array.isArray(values))) throw new Error('BAD_REQUEST: Item values must be an object.');
        patch.values = await cleanValues(ctx, projectId, existing.collectionId, {
            ...(existing.values as Record<string, unknown>), ...(values as Record<string, unknown> | undefined),
        });
        await ctx.db.patch(itemId, patch);
        return (await ctx.db.get(itemId))!;
    },
});

export const remove = mutation({
    args: {
        projectId: v.id('projects'),
        itemId: v.id('cmsItems'),
        expectedRevision: v.number(),
    },
    handler: async (ctx, { projectId, itemId, expectedRevision }) => {
        await requireCap(ctx, 'project.update', { projectId });
        const existing = await ctx.db.get(itemId);
        if (!existing) throw new Error('NOT_FOUND: item');
        const collection = await ctx.db.get(existing.collectionId);
        if (!collection || collection.projectId !== projectId) {
            throw new Error('NOT_FOUND: item');
        }
        await requireNativeCollection(ctx, collection);
        if (existing.remoteId !== undefined) throw new Error('READ_ONLY: External content cannot be archived locally.');
        const revision = nextCmsRevision(existing, expectedRevision);
        if (existing.archivedAt !== undefined) throw new Error('CONFLICT: This item is already archived.');
        const now = Date.now();
        await ctx.db.patch(itemId, { archivedAt: now, updatedAt: now, revision });
        return { success: true } as const;
    },
});

/** Restoring never makes content ready or live. Repairs use the same captured revision. */
export const restore = mutation({
    args: { projectId: v.id('projects'), itemId: v.id('cmsItems'), expectedRevision: v.number(), values: v.optional(v.any()) },
    handler: async (ctx, { projectId, itemId, expectedRevision, values }) => {
        await requireCap(ctx, 'project.update', { projectId });
        const existing = await ctx.db.get(itemId);
        if (!existing) throw new Error('NOT_FOUND: item');
        const collection = await ctx.db.get(existing.collectionId);
        if (!collection || collection.projectId !== projectId) throw new Error('NOT_FOUND: item');
        await requireNativeCollection(ctx, collection);
        if (existing.remoteId !== undefined) throw new Error('READ_ONLY: External content cannot be restored locally.');
        const revision = nextCmsRevision(existing, expectedRevision);
        if (existing.archivedAt === undefined) throw new Error('CONFLICT: This item is not archived.');
        if (values !== undefined && (!values || typeof values !== 'object' || Array.isArray(values))) throw new Error('BAD_REQUEST: Item values must be an object.');
        const repairs = (values ?? {}) as Record<string, unknown>;
        const fields = await loadCollectionFields(ctx, existing.collectionId);
        const allowed = new Set(fields.map((field) => field.key));
        if (Object.keys(repairs).some((key) => !allowed.has(key))) throw new Error('BAD_REQUEST: Unknown archived repair field.');
        const originalValues = existing.values as Record<string, unknown>;
        const cleaned = await cleanValues(ctx, projectId, existing.collectionId, { ...originalValues, ...repairs });
        const repairedValues = { ...originalValues };
        for (const key of Object.keys(repairs)) {
            if (cleaned[key] === undefined) delete repairedValues[key];
            else repairedValues[key] = cleaned[key];
        }
        await ctx.db.patch(itemId, {
            revision, archivedAt: undefined, status: 'draft', updatedAt: Date.now(),
            ...(values !== undefined ? { values: repairedValues } : {}),
        });
        return { success: true } as const;
    },
});

/**
 * Sync-time batch upsert. Called from cmsActions.sourceSync after the
 * adapter returns remote items. Keyed by `(collectionId, remoteId)`.
 *
 * Internal mutation — only invocable from server code (actions). The
 * caller is responsible for `requireCap` because actions run with full
 * privileges.
 */
export const _upsertBatch = internalMutation({
    args: {
        items: v.array(
            v.object({
                collectionId: v.id('cmsCollections'),
                remoteId: v.string(),
                slug: v.optional(v.string()),
                values: v.any(),
            }),
        ),
    },
    handler: async (ctx, { items }) => {
        const now = Date.now();
        let written = 0;
        for (const item of items) {
            const existing = await ctx.db
                .query('cmsItems')
                .withIndex('by_collection_remote', (q) =>
                    q.eq('collectionId', item.collectionId).eq('remoteId', item.remoteId),
                )
                .first();
            if (existing) {
                await ctx.db.patch(existing._id, {
                    slug: item.slug ?? existing.slug,
                    values: item.values,
                    revision: cmsRevision(existing) + 1,
                    updatedAt: now,
                });
            } else {
                await ctx.db.insert('cmsItems', {
                    collectionId: item.collectionId,
                    remoteId: item.remoteId,
                    revision: 1,
                    slug: item.slug,
                    // External items are treated as published — they
                    // come from an authoritative system.
                    status: 'published',
                    publishedAt: now,
                    values: item.values,
                    updatedAt: now,
                });
            }
            written += 1;
        }
        return { written };
    },
});

/**
 * Sync-time prune. Drop any local items in the collection whose remoteId
 * is not in `keepRemoteIds`. Only deletes rows with a non-null remoteId,
 * so native items in the same collection (legacy mixed mode) survive.
 */
export const _pruneBatch = internalMutation({
    args: {
        collectionId: v.id('cmsCollections'),
        keepRemoteIds: v.array(v.string()),
    },
    handler: async (ctx, { collectionId, keepRemoteIds }) => {
        const keep = new Set(keepRemoteIds);
        const all = await ctx.db
            .query('cmsItems')
            .withIndex('by_collection', (q) => q.eq('collectionId', collectionId))
            .collect();
        let pruned = 0;
        for (const item of all) {
            if (!item.remoteId) continue;
            if (keep.has(item.remoteId)) continue;
            await ctx.db.delete(item._id);
            pruned += 1;
        }
        return { pruned };
    },
});
