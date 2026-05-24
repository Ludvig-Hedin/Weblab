import { v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { requireCap } from './lib/permissions';

const PAGE_PATH_RE = /^\/[A-Za-z0-9\-_/[\]]*$/;

function validatePagePath(path: string): string {
    const trimmed = path.trim();
    if (trimmed.length === 0 || trimmed.length > 255 || !PAGE_PATH_RE.test(trimmed)) {
        throw new Error(
            'BAD_REQUEST: Page path must start with / and only use letters, numbers, dashes, slashes, [ or ]',
        );
    }
    return trimmed;
}

function validateFieldKey(key: string): string {
    const trimmed = key.trim();
    if (trimmed.length === 0 || trimmed.length > 64) {
        throw new Error('BAD_REQUEST: matchFieldKey 1-64');
    }
    return trimmed;
}

export const list = query({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        await requireCap(ctx, 'project.view', { projectId });
        const rows = await ctx.db
            .query('cmsCollectionPages')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .collect();
        rows.sort((a, b) => a._creationTime - b._creationTime);
        return rows;
    },
});

export const getForPath = query({
    args: {
        projectId: v.id('projects'),
        pagePath: v.string(),
    },
    handler: async (ctx, { projectId, pagePath }) => {
        await requireCap(ctx, 'project.view', { projectId });
        const row = await ctx.db
            .query('cmsCollectionPages')
            .withIndex('by_project_path', (q) =>
                q.eq('projectId', projectId).eq('pagePath', pagePath),
            )
            .first();
        return row;
    },
});

export const upsert = mutation({
    args: {
        projectId: v.id('projects'),
        collectionId: v.id('cmsCollections'),
        pagePath: v.string(),
        matchFieldKey: v.string(),
    },
    handler: async (ctx, { projectId, collectionId, pagePath, matchFieldKey }) => {
        await requireCap(ctx, 'project.update', { projectId });
        const path = validatePagePath(pagePath);
        const field = validateFieldKey(matchFieldKey);
        const collection = await ctx.db.get(collectionId);
        if (!collection || collection.projectId !== projectId) {
            throw new Error('NOT_FOUND: collection');
        }
        const existing = await ctx.db
            .query('cmsCollectionPages')
            .withIndex('by_project_path', (q) => q.eq('projectId', projectId).eq('pagePath', path))
            .first();
        const now = Date.now();
        if (existing) {
            await ctx.db.patch(existing._id, {
                collectionId,
                matchFieldKey: field,
                updatedAt: now,
            });
            return (await ctx.db.get(existing._id))!;
        }
        const id = await ctx.db.insert('cmsCollectionPages', {
            projectId,
            collectionId,
            pagePath: path,
            matchFieldKey: field,
            updatedAt: now,
        });
        return (await ctx.db.get(id))!;
    },
});

export const remove = mutation({
    args: {
        projectId: v.id('projects'),
        id: v.id('cmsCollectionPages'),
    },
    handler: async (ctx, { projectId, id }) => {
        await requireCap(ctx, 'project.update', { projectId });
        const existing = await ctx.db.get(id);
        if (!existing || existing.projectId !== projectId) {
            // Idempotent delete — silently succeed if the row is gone.
            return { success: true, orphanedBindingCount: 0 } as const;
        }
        await ctx.db.delete(id);
        // Surface a warning count for the UI: PAGE_ITEM_FIELD bindings
        // are orphaned when no more page registrations exist for the project.
        const remainingPages = await ctx.db
            .query('cmsCollectionPages')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .collect();
        let orphanedBindingCount = 0;
        if (remainingPages.length === 0) {
            const allBindings = await ctx.db
                .query('cmsBindings')
                .withIndex('by_project', (q) => q.eq('projectId', projectId))
                .collect();
            orphanedBindingCount = allBindings.filter(
                (b) =>
                    !!b.binding &&
                    typeof b.binding === 'object' &&
                    (b.binding as { kind?: string }).kind === 'page-item-field',
            ).length;
        }
        return { success: true, orphanedBindingCount } as const;
    },
});
