import { v } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { ensureDefaultWeblabSourceId } from './cmsSources';
import { encodeRemoteRef, readRemoteRef, stripRemoteRef } from './lib/cmsRemoteRef';
import { requireCap } from './lib/permissions';

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

function validateSlug(slug: string): string {
    const trimmed = slug.trim();
    if (trimmed.length === 0 || trimmed.length > 64 || !SLUG_RE.test(trimmed)) {
        throw new Error('BAD_REQUEST: Slug must be lowercase letters, numbers, and dashes');
    }
    return trimmed;
}

function validateName(name: string): string {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed.length > 64) {
        throw new Error('BAD_REQUEST: name 1-64');
    }
    return trimmed;
}

export const list = query({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        await requireCap(ctx, 'project.view', { projectId });
        const collections = await ctx.db
            .query('cmsCollections')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .collect();
        collections.sort((a, b) => a._creationTime - b._creationTime);

        // Item counts — sidebar badge. Aggregate per collection so we
        // stay O(collections) not O(collections * items).
        const counts = new Map<string, number>();
        for (const c of collections) {
            const items = await ctx.db
                .query('cmsItems')
                .withIndex('by_collection', (q) => q.eq('collectionId', c._id))
                .collect();
            counts.set(c._id, items.length);
        }
        return collections.map((c) => ({
            ...c,
            description: stripRemoteRef(c.description),
            itemCount: counts.get(c._id) ?? 0,
        }));
    },
});

export const get = query({
    args: {
        projectId: v.id('projects'),
        collectionId: v.id('cmsCollections'),
    },
    handler: async (ctx, { projectId, collectionId }) => {
        await requireCap(ctx, 'project.view', { projectId });
        const collection = await ctx.db.get(collectionId);
        if (!collection || collection.projectId !== projectId) return null;
        const fields = await ctx.db
            .query('cmsFields')
            .withIndex('by_collection_order', (q) => q.eq('collectionId', collectionId))
            .collect();
        // Stable secondary sort: by creation time for ties on `order`.
        fields.sort((a, b) => a.order - b.order || a._creationTime - b._creationTime);
        return {
            ...collection,
            description: stripRemoteRef(collection.description),
            fields,
        };
    },
});

export const create = mutation({
    args: {
        projectId: v.id('projects'),
        name: v.string(),
        slug: v.string(),
        description: v.optional(v.string()),
        icon: v.optional(v.string()),
    },
    handler: async (ctx, { projectId, name, slug, description, icon }) => {
        await requireCap(ctx, 'project.update', { projectId });
        const trimmedName = validateName(name);
        const trimmedSlug = validateSlug(slug);
        if (description !== undefined && description.length > 500) {
            throw new Error('BAD_REQUEST: description max 500');
        }
        if (icon !== undefined && icon.length > 64) {
            throw new Error('BAD_REQUEST: icon max 64');
        }
        // App-level slug uniqueness — Convex has no UNIQUE constraint.
        const dup = await ctx.db
            .query('cmsCollections')
            .withIndex('by_project_slug', (q) =>
                q.eq('projectId', projectId).eq('slug', trimmedSlug),
            )
            .first();
        if (dup) {
            throw new Error(
                `CONFLICT: A collection with slug "${trimmedSlug}" already exists in this project`,
            );
        }
        const sourceId = await ensureDefaultWeblabSourceId(ctx, projectId);
        const id = await ctx.db.insert('cmsCollections', {
            projectId,
            sourceId,
            name: trimmedName,
            slug: trimmedSlug,
            description,
            icon,
            updatedAt: Date.now(),
        });
        return (await ctx.db.get(id))!;
    },
});

export const update = mutation({
    args: {
        projectId: v.id('projects'),
        collectionId: v.id('cmsCollections'),
        name: v.optional(v.string()),
        slug: v.optional(v.string()),
        description: v.optional(v.string()),
        icon: v.optional(v.string()),
    },
    handler: async (ctx, { projectId, collectionId, name, slug, description, icon }) => {
        await requireCap(ctx, 'project.update', { projectId });
        const existing = await ctx.db.get(collectionId);
        if (!existing || existing.projectId !== projectId) {
            throw new Error('NOT_FOUND: collection');
        }
        const patch: Partial<Doc<'cmsCollections'>> = { updatedAt: Date.now() };
        if (name !== undefined) patch.name = validateName(name);
        if (slug !== undefined) {
            const trimmedSlug = validateSlug(slug);
            if (trimmedSlug !== existing.slug) {
                const dup = await ctx.db
                    .query('cmsCollections')
                    .withIndex('by_project_slug', (q) =>
                        q.eq('projectId', projectId).eq('slug', trimmedSlug),
                    )
                    .first();
                if (dup && dup._id !== collectionId) {
                    throw new Error(`CONFLICT: slug "${trimmedSlug}" already in use`);
                }
            }
            patch.slug = trimmedSlug;
        }
        if (description !== undefined) {
            if (description.length > 500) throw new Error('BAD_REQUEST: description max 500');
            // Preserve any existing remote-ref prefix so editing the
            // user-facing description on an external-source collection
            // does not wipe the sync link to the remote collection.
            const remoteRef = readRemoteRef(existing.description ?? null);
            patch.description = remoteRef ? encodeRemoteRef(remoteRef, description) : description;
        }
        if (icon !== undefined) {
            if (icon.length > 64) throw new Error('BAD_REQUEST: icon max 64');
            patch.icon = icon;
        }
        await ctx.db.patch(collectionId, patch);
        const updated = (await ctx.db.get(collectionId))!;
        return { ...updated, description: stripRemoteRef(updated.description) };
    },
});

export const remove = mutation({
    args: {
        projectId: v.id('projects'),
        collectionId: v.id('cmsCollections'),
    },
    handler: async (ctx, { projectId, collectionId }) => {
        await requireCap(ctx, 'project.update', { projectId });
        const existing = await ctx.db.get(collectionId);
        if (!existing || existing.projectId !== projectId) {
            throw new Error('NOT_FOUND: collection');
        }
        // Inline cascade — fields, items, pages reference this collection.
        // Mirrors deleteCmsCollectionInternal in internal/cascade.ts so we
        // don't ship orphan rows.
        const fields = await ctx.db
            .query('cmsFields')
            .withIndex('by_collection', (q) => q.eq('collectionId', collectionId))
            .collect();
        for (const f of fields) await ctx.db.delete(f._id);

        const items = await ctx.db
            .query('cmsItems')
            .withIndex('by_collection', (q) => q.eq('collectionId', collectionId))
            .collect();
        for (const it of items) await ctx.db.delete(it._id);

        const pages = await ctx.db
            .query('cmsCollectionPages')
            .withIndex('by_collection', (q) => q.eq('collectionId', collectionId))
            .collect();
        for (const p of pages) await ctx.db.delete(p._id);

        // Bug 4 fix: cascade cmsBindings whose payload references this
        // collection. binding.collectionId is stored as a stringified
        // Convex Id; compare via the string form.
        const collectionIdStr = collectionId as unknown as string;
        const projectBindings = await ctx.db
            .query('cmsBindings')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .collect();
        for (const binding of projectBindings) {
            const payload = binding.binding as { collectionId?: string } | null;
            if (payload && payload.collectionId === collectionIdStr) {
                await ctx.db.delete(binding._id);
            }
        }

        await ctx.db.delete(collectionId);
        return { success: true } as const;
    },
});
