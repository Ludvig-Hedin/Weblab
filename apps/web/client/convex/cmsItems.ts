import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { internalMutation, mutation, query } from './_generated/server';
import { validateAndCleanItemValues } from './lib/cmsValueValidation';
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
        .collect();
    fields.sort((a, b) => a.order - b.order || a._creationTime - b._creationTime);
    return fields;
}

export const list = query({
    args: {
        projectId: v.id('projects'),
        collectionId: v.id('cmsCollections'),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, { projectId, collectionId, limit }) => {
        await requireCap(ctx, 'project.view', { projectId });
        const collection = await ctx.db.get(collectionId);
        if (!collection || collection.projectId !== projectId) {
            throw new Error('NOT_FOUND: collection');
        }
        const requestedLimit = Math.min(Math.max(limit ?? 100, 1), 500);
        // Use `.order('desc')` on the by_collection index, then trim manually
        // because the index isn't on `updatedAt`. Items list ordering is
        // documented as "most recently updated first" — match that.
        const items = await ctx.db
            .query('cmsItems')
            .withIndex('by_collection', (q) => q.eq('collectionId', collectionId))
            .collect();
        items.sort((a, b) => b.updatedAt - a.updatedAt);
        return items.slice(0, requestedLimit);
    },
});

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
        return item;
    },
});

export const create = mutation({
    args: {
        projectId: v.id('projects'),
        collectionId: v.id('cmsCollections'),
        slug: v.optional(v.string()),
        values: v.any(),
        status: v.optional(vCmsItemStatus),
    },
    handler: async (ctx, { projectId, collectionId, slug, values, status }) => {
        await requireCap(ctx, 'project.update', { projectId });
        const collection = await ctx.db.get(collectionId);
        if (!collection || collection.projectId !== projectId) {
            throw new Error('NOT_FOUND: collection');
        }
        const finalStatus = status ?? 'draft';
        const now = Date.now();
        if (slug !== undefined) {
            const trimmed = slug.trim();
            if (trimmed.length === 0 || trimmed.length > 120) {
                throw new Error('BAD_REQUEST: slug 1-120');
            }
        }
        // Bug 1 fix: validate values against the collection's field list
        // and strip unknown keys before insert.
        const fields = await loadCollectionFields(ctx, collectionId);
        const cleanedValues = validateAndCleanItemValues(
            fields,
            (values ?? {}) as Record<string, unknown>,
        );
        const id = await ctx.db.insert('cmsItems', {
            collectionId,
            slug: slug?.trim(),
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
        slug: v.optional(v.string()),
        values: v.optional(v.any()),
        status: v.optional(vCmsItemStatus),
    },
    handler: async (ctx, { projectId, itemId, slug, values, status }) => {
        await requireCap(ctx, 'project.update', { projectId });
        const existing = await ctx.db.get(itemId);
        if (!existing) throw new Error('NOT_FOUND: item');
        const collection = await ctx.db.get(existing.collectionId);
        if (!collection || collection.projectId !== projectId) {
            throw new Error('NOT_FOUND: item');
        }
        const patch: Partial<Doc<'cmsItems'>> = { updatedAt: Date.now() };
        if (slug !== undefined) {
            const trimmed = slug.trim();
            if (trimmed.length === 0 || trimmed.length > 120) {
                throw new Error('BAD_REQUEST: slug 1-120');
            }
            patch.slug = trimmed;
        }
        if (status !== undefined) {
            patch.status = status;
            if (status === 'published' && !existing.publishedAt) {
                patch.publishedAt = Date.now();
            }
        }
        if (values !== undefined) {
            // Bug 1 fix: validate against current field list.
            // Bug 2 fix: merge then re-validate — validateAndCleanItemValues
            // drops null/undefined keys AND keys not present in the field
            // list, so orphans from renamed/deleted/type-changed fields are
            // pruned on every update.
            const fields = await loadCollectionFields(ctx, existing.collectionId);
            const merged = {
                ...((existing.values ?? {}) as Record<string, unknown>),
                ...(values as Record<string, unknown>),
            };
            patch.values = validateAndCleanItemValues(fields, merged);
        }
        await ctx.db.patch(itemId, patch);
        return (await ctx.db.get(itemId))!;
    },
});

export const remove = mutation({
    args: {
        projectId: v.id('projects'),
        itemId: v.id('cmsItems'),
    },
    handler: async (ctx, { projectId, itemId }) => {
        await requireCap(ctx, 'project.update', { projectId });
        const existing = await ctx.db.get(itemId);
        if (!existing) throw new Error('NOT_FOUND: item');
        const collection = await ctx.db.get(existing.collectionId);
        if (!collection || collection.projectId !== projectId) {
            throw new Error('NOT_FOUND: item');
        }
        await ctx.db.delete(itemId);
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
                    updatedAt: now,
                });
            } else {
                await ctx.db.insert('cmsItems', {
                    collectionId: item.collectionId,
                    remoteId: item.remoteId,
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
