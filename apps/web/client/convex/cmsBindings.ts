import { v } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { requireCap } from './lib/permissions';

// Ported from src/server/api/routers/cms/binding.ts.
//
// `binding` is stored as v.any() (CmsBindingPayload discriminated union
// — defined in packages/models/src/cms/index.ts). Args validate the shape
// via vBindingPayload below; the writer enforces the discriminator so
// downstream readers can trust `kind`.

const vFilterClause = v.union(
    v.object({
        fieldKey: v.string(),
        op: v.union(v.literal('eq'), v.literal('neq')),
        value: v.union(v.string(), v.number(), v.boolean()),
    }),
    v.object({
        fieldKey: v.string(),
        op: v.union(v.literal('before'), v.literal('after')),
        value: v.string(),
    }),
    v.object({
        fieldKey: v.string(),
        op: v.union(v.literal('contains'), v.literal('starts_with')),
        value: v.string(),
    }),
    v.object({
        fieldKey: v.string(),
        op: v.union(v.literal('is_set'), v.literal('is_unset')),
    }),
);

const vBindingPayload = v.union(
    v.object({
        kind: v.literal('item-field'),
        collectionId: v.string(),
        itemId: v.string(),
        fieldKey: v.string(),
    }),
    v.object({
        kind: v.literal('first-field'),
        collectionId: v.string(),
        fieldKey: v.string(),
        filters: v.optional(v.array(vFilterClause)),
        filterMode: v.optional(v.union(v.literal('and'), v.literal('or'))),
    }),
    v.object({
        kind: v.literal('repeat'),
        collectionId: v.string(),
        sort: v.optional(
            v.object({
                fieldKey: v.string(),
                direction: v.union(v.literal('asc'), v.literal('desc')),
            }),
        ),
        limit: v.optional(v.number()),
        filters: v.optional(v.array(vFilterClause)),
        filterMode: v.optional(v.union(v.literal('and'), v.literal('or'))),
    }),
    v.object({
        kind: v.literal('current-field'),
        fieldKey: v.string(),
    }),
    v.object({
        kind: v.literal('page-item-field'),
        fieldKey: v.string(),
    }),
);

const BINDING_LIMIT = 2000;

export const listForProject = query({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        await requireCap(ctx, 'project.view', { projectId });
        const rows = await ctx.db
            .query('cmsBindings')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .take(BINDING_LIMIT);
        return rows;
    },
});

/**
 * One-shot snapshot used by the preview-data pusher: returns all bindings
 * for the project, plus items for every collection that has at least one
 * binding. publishedOnly=true filters out drafts at publish time.
 */
export const snapshot = query({
    args: {
        projectId: v.id('projects'),
        publishedOnly: v.optional(v.boolean()),
    },
    handler: async (ctx, { projectId, publishedOnly }) => {
        await requireCap(ctx, 'project.view', { projectId });
        const bindings = await ctx.db
            .query('cmsBindings')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .take(BINDING_LIMIT);
        const collectionIds = Array.from(
            new Set(
                bindings
                    .map((b) => {
                        const p = b.binding as { collectionId?: string } | null;
                        return p && typeof p.collectionId === 'string' ? p.collectionId : null;
                    })
                    .filter((id): id is string => !!id),
            ),
        );
        if (collectionIds.length === 0) {
            return { bindings, items: [], collectionIds: [] as string[] };
        }

        // Project-scope guard: only include items whose collection actually
        // belongs to this project (defends against a binding that references
        // a foreign-project collection — shouldn't happen).
        const projectCollections = await ctx.db
            .query('cmsCollections')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .collect();
        const validIds = new Set(projectCollections.map((c) => c._id as unknown as string));
        const validCollectionIds = collectionIds.filter((id) => validIds.has(id));
        if (validCollectionIds.length === 0) {
            return { bindings, items: [], collectionIds: [] as string[] };
        }

        const allItems: Doc<'cmsItems'>[] = [];
        for (const cid of validCollectionIds) {
            // cid is a stringified Id<'cmsCollections'> — cast via unknown
            // because Convex types Id as a branded string at runtime.
            const items = await ctx.db
                .query('cmsItems')
                .withIndex('by_collection', (q) =>
                    q.eq('collectionId', cid as unknown as Doc<'cmsItems'>['collectionId']),
                )
                .collect();
            for (const it of items) {
                if (publishedOnly && it.status !== 'published') continue;
                allItems.push(it);
            }
        }
        allItems.sort((a, b) => a._creationTime - b._creationTime);
        return { bindings, items: allItems, collectionIds: validCollectionIds };
    },
});

export const upsert = mutation({
    args: {
        projectId: v.id('projects'),
        oid: v.string(),
        binding: vBindingPayload,
    },
    handler: async (ctx, { projectId, oid, binding }) => {
        await requireCap(ctx, 'project.update', { projectId });
        if (oid.length === 0) throw new Error('BAD_REQUEST: oid');
        // Bug 5 fix: Convex has no UNIQUE constraint and no
        // onConflictDoUpdate, so the classic "first() + insert/patch"
        // pattern can race when two concurrent calls both miss and both
        // INSERT. Mitigate with dedup-on-upsert + last-writer-wins:
        // after the read-then-write step, re-query ALL rows for
        // (projectId, oid) and delete every row older than the one we
        // just wrote. Subsequent reads see a single row.
        const existing = await ctx.db
            .query('cmsBindings')
            .withIndex('by_project_oid', (q) => q.eq('projectId', projectId).eq('oid', oid))
            .first();
        const now = Date.now();
        let writtenId;
        if (existing) {
            await ctx.db.patch(existing._id, { binding, updatedAt: now });
            writtenId = existing._id;
        } else {
            writtenId = await ctx.db.insert('cmsBindings', {
                projectId,
                oid,
                binding,
                updatedAt: now,
            });
        }

        // Dedup pass — collect all rows for (projectId, oid) and delete
        // every row that isn't the one we just wrote. Converts any race
        // into last-writer-wins.
        const allForKey = await ctx.db
            .query('cmsBindings')
            .withIndex('by_project_oid', (q) => q.eq('projectId', projectId).eq('oid', oid))
            .collect();
        if (allForKey.length > 1) {
            for (const row of allForKey) {
                if (row._id !== writtenId) {
                    await ctx.db.delete(row._id);
                }
            }
        }

        return (await ctx.db.get(writtenId))!;
    },
});

export const remove = mutation({
    args: {
        projectId: v.id('projects'),
        oid: v.string(),
    },
    handler: async (ctx, { projectId, oid }) => {
        await requireCap(ctx, 'project.update', { projectId });
        const existing = await ctx.db
            .query('cmsBindings')
            .withIndex('by_project_oid', (q) => q.eq('projectId', projectId).eq('oid', oid))
            .first();
        if (existing) await ctx.db.delete(existing._id);
        return { success: true } as const;
    },
});

export const removeMany = mutation({
    args: {
        projectId: v.id('projects'),
        oids: v.array(v.string()),
    },
    handler: async (ctx, { projectId, oids }) => {
        // requireCap first so unauthorized callers can't probe project
        // existence by varying `oids`.
        await requireCap(ctx, 'project.update', { projectId });
        if (oids.length === 0) return { success: true } as const;
        const toDelete = new Set(oids);
        const rows = await ctx.db
            .query('cmsBindings')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .collect();
        for (const row of rows) {
            if (toDelete.has(row.oid)) await ctx.db.delete(row._id);
        }
        return { success: true } as const;
    },
});
