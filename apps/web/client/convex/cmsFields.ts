import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { vCmsFieldType } from './lib/enums';
import { requireCap } from './lib/permissions';

const FIELD_KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

function validateFieldKey(key: string): string {
    const trimmed = key.trim();
    if (trimmed.length === 0 || trimmed.length > 64 || !FIELD_KEY_RE.test(trimmed)) {
        throw new Error(
            'BAD_REQUEST: Field key must start with a letter or underscore and contain only letters, numbers, or underscores',
        );
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

async function assertCollectionInProject(
    ctx: QueryCtx | MutationCtx,
    projectId: Id<'projects'>,
    collectionId: Id<'cmsCollections'>,
): Promise<void> {
    const collection = await ctx.db.get(collectionId);
    if (!collection || collection.projectId !== projectId) {
        throw new Error('NOT_FOUND: collection');
    }
}

export const listByCollection = query({
    args: {
        projectId: v.id('projects'),
        collectionId: v.id('cmsCollections'),
    },
    handler: async (ctx, { projectId, collectionId }) => {
        await requireCap(ctx, 'project.view', { projectId });
        await assertCollectionInProject(ctx, projectId, collectionId);
        const rows = await ctx.db
            .query('cmsFields')
            .withIndex('by_collection_order', (q) => q.eq('collectionId', collectionId))
            .collect();
        rows.sort((a, b) => a.order - b.order || a._creationTime - b._creationTime);
        return rows;
    },
});

export const create = mutation({
    args: {
        projectId: v.id('projects'),
        collectionId: v.id('cmsCollections'),
        name: v.string(),
        key: v.string(),
        type: vCmsFieldType,
        helpText: v.optional(v.string()),
        required: v.optional(v.boolean()),
        config: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        await requireCap(ctx, 'project.update', { projectId: args.projectId });
        await assertCollectionInProject(ctx, args.projectId, args.collectionId);
        const name = validateName(args.name);
        const key = validateFieldKey(args.key);
        if (args.helpText !== undefined && args.helpText.length > 200) {
            throw new Error('BAD_REQUEST: helpText max 200');
        }
        const existing = await ctx.db
            .query('cmsFields')
            .withIndex('by_collection', (q) => q.eq('collectionId', args.collectionId))
            .collect();
        if (existing.some((f) => f.key === key)) {
            throw new Error(
                `CONFLICT: A field with key "${key}" already exists in this collection`,
            );
        }
        const order = existing.length;
        const id = await ctx.db.insert('cmsFields', {
            collectionId: args.collectionId,
            name,
            key,
            type: args.type,
            helpText: args.helpText,
            required: args.required ?? false,
            config: args.config ?? {},
            order,
            updatedAt: Date.now(),
        });
        return (await ctx.db.get(id))!;
    },
});

export const update = mutation({
    args: {
        projectId: v.id('projects'),
        fieldId: v.id('cmsFields'),
        name: v.optional(v.string()),
        helpText: v.optional(v.string()),
        required: v.optional(v.boolean()),
        config: v.optional(v.any()),
    },
    handler: async (ctx, { projectId, fieldId, name, helpText, required, config }) => {
        await requireCap(ctx, 'project.update', { projectId });
        const existing = await ctx.db.get(fieldId);
        if (!existing) throw new Error('NOT_FOUND: field');
        const collection = await ctx.db.get(existing.collectionId);
        if (!collection || collection.projectId !== projectId) {
            throw new Error('NOT_FOUND: field');
        }
        const patch: Partial<Doc<'cmsFields'>> = { updatedAt: Date.now() };
        if (name !== undefined) patch.name = validateName(name);
        if (helpText !== undefined) {
            if (helpText.length > 200) throw new Error('BAD_REQUEST: helpText max 200');
            patch.helpText = helpText;
        }
        if (required !== undefined) patch.required = required;
        if (config !== undefined) patch.config = config;
        await ctx.db.patch(fieldId, patch);
        return (await ctx.db.get(fieldId))!;
    },
});

export const reorder = mutation({
    args: {
        projectId: v.id('projects'),
        collectionId: v.id('cmsCollections'),
        orderedFieldIds: v.array(v.id('cmsFields')),
    },
    handler: async (ctx, { projectId, collectionId, orderedFieldIds }) => {
        await requireCap(ctx, 'project.update', { projectId });
        await assertCollectionInProject(ctx, projectId, collectionId);
        const existing = await ctx.db
            .query('cmsFields')
            .withIndex('by_collection', (q) => q.eq('collectionId', collectionId))
            .collect();
        const validIds = new Set(existing.map((f) => f._id));
        for (const id of orderedFieldIds) {
            if (!validIds.has(id)) {
                throw new Error(`BAD_REQUEST: Field ${id} does not belong to this collection`);
            }
        }
        const now = Date.now();
        for (let i = 0; i < orderedFieldIds.length; i++) {
            await ctx.db.patch(orderedFieldIds[i]!, { order: i, updatedAt: now });
        }
        return { success: true } as const;
    },
});

export const remove = mutation({
    args: {
        projectId: v.id('projects'),
        fieldId: v.id('cmsFields'),
    },
    handler: async (ctx, { projectId, fieldId }) => {
        await requireCap(ctx, 'project.update', { projectId });
        const existing = await ctx.db.get(fieldId);
        if (!existing) throw new Error('NOT_FOUND: field');
        const collection = await ctx.db.get(existing.collectionId);
        if (!collection || collection.projectId !== projectId) {
            throw new Error('NOT_FOUND: field');
        }
        const collectionId = existing.collectionId;
        const fieldKey = existing.key;

        // Bug 3 fix: cleanup stale values + broken bindings.
        // (a) Strip values[fieldKey] from every item in the collection.
        const items = await ctx.db
            .query('cmsItems')
            .withIndex('by_collection', (q) => q.eq('collectionId', collectionId))
            .collect();
        for (const item of items) {
            const itemValues = (item.values ?? {}) as Record<string, unknown>;
            if (!(fieldKey in itemValues)) continue;
            const next: Record<string, unknown> = { ...itemValues };
            delete next[fieldKey];
            await ctx.db.patch(item._id, { values: next, updatedAt: Date.now() });
        }

        // (b) Delete bindings referencing this field on this collection.
        // bindings.binding is v.any() (CmsBindingPayload) — fieldKey lives
        // on item-field, first-field, repeat (sort.fieldKey/filter.fieldKey),
        // current-field, page-item-field. We only nuke bindings that
        // explicitly reference (collectionId, fieldKey). 'repeat' bindings
        // don't carry a top-level fieldKey, so they survive unless a sort/
        // filter targets the deleted key.
        const projectBindings = await ctx.db
            .query('cmsBindings')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .collect();
        const collectionIdStr = collectionId as unknown as string;
        for (const binding of projectBindings) {
            const payload = binding.binding as {
                kind?: string;
                collectionId?: string;
                fieldKey?: string;
                sort?: { fieldKey?: string };
                filters?: Array<{ fieldKey?: string }>;
            } | null;
            if (!payload || typeof payload !== 'object') continue;

            const targetsCollection =
                payload.collectionId === collectionIdStr ||
                payload.kind === 'current-field' ||
                payload.kind === 'page-item-field';

            const referencesField =
                payload.fieldKey === fieldKey ||
                payload.sort?.fieldKey === fieldKey ||
                (Array.isArray(payload.filters) &&
                    payload.filters.some((f) => f?.fieldKey === fieldKey));

            // current-field / page-item-field have no collectionId — only
            // delete if fieldKey matches (binding will be re-resolved at
            // render time anyway, but a stale fieldKey would silently fail).
            const isContextual =
                payload.kind === 'current-field' || payload.kind === 'page-item-field';

            if (isContextual && payload.fieldKey === fieldKey) {
                // We can't be sure these target THIS collection — they're
                // resolved from page context. Leave them alone; UI will
                // surface them as broken bindings on the relevant page.
                continue;
            }

            if (targetsCollection && referencesField) {
                await ctx.db.delete(binding._id);
            }
        }

        await ctx.db.delete(fieldId);
        return { success: true } as const;
    },
});
