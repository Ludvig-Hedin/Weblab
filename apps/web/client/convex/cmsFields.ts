import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { vCmsFieldType } from './lib/enums';
import { mergeFieldConfig } from './lib/cmsFieldConfig';
import { cmsRevision, nextCmsRevision } from './lib/cmsRevision';
import { validateAndCleanItemValues } from './lib/cmsValueValidation';
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

async function requireNativeCollection(ctx: MutationCtx, collectionId: Id<'cmsCollections'>): Promise<void> {
    const collection = await ctx.db.get(collectionId);
    const source = collection ? await ctx.db.get(collection.sourceId) : null;
    if (!collection || !source || source.projectId !== collection.projectId) throw new Error('NOT_FOUND: source');
    if (source.type !== 'weblab') throw new Error('READ_ONLY: Manage these fields in the external CMS.');
}

async function collectionItems(ctx: MutationCtx, collectionId: Id<'cmsCollections'>): Promise<Doc<'cmsItems'>[]> {
    const items = await ctx.db.query('cmsItems').withIndex('by_collection', (q) => q.eq('collectionId', collectionId)).take(501);
    if (items.length > 500) throw new Error('BAD_REQUEST: Field changes support up to 500 saved items. No settings were changed.');
    return items;
}

async function validateConfigTarget(ctx: MutationCtx, projectId: Id<'projects'>, field: Pick<Doc<'cmsFields'>, 'type' | 'config'>): Promise<void> {
    if (field.type !== 'reference') return;
    const config = field.config as Record<string, unknown>;
    const id = typeof config.collectionId === 'string' ? ctx.db.normalizeId('cmsCollections', config.collectionId) : null;
    const target = id ? await ctx.db.get(id) : null;
    if (!target || target.projectId !== projectId) throw new Error('BAD_REQUEST: The reference collection must belong to this project.');
}

async function validateSavedValues(ctx: MutationCtx, field: Doc<'cmsFields'>, items: Doc<'cmsItems'>[]): Promise<void> {
    let referencesChecked = 0;
    for (const item of items) {
        const cleaned = validateAndCleanItemValues([field], item.values ?? {});
        if (field.type !== 'reference' || cleaned[field.key] === undefined) continue;
        const value = cleaned[field.key];
        const references = Array.isArray(value) ? value as string[] : [value as string];
        referencesChecked += references.length;
        if (referencesChecked > 500) throw new Error('BAD_REQUEST: Too many saved references to validate this field change. No settings were changed.');
        const config = field.config as Record<string, unknown>;
        for (const reference of references) {
            const id = ctx.db.normalizeId('cmsItems', reference);
            const target = id ? await ctx.db.get(id) : null;
            if (!target || target.collectionId !== config.collectionId) throw new Error('BAD_REQUEST: Existing references do not belong to the selected collection.');
        }
    }
}

async function invalidateItemEditors(ctx: MutationCtx, items: Doc<'cmsItems'>[]): Promise<void> {
    // Metadata changes must invalidate open content forms too, even when values stay intact.
    for (const item of items) await ctx.db.patch(item._id, { revision: cmsRevision(item) + 1, updatedAt: Date.now() });
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
            .take(501);
        if (rows.length > 500) throw new Error('BAD_REQUEST: Too many collection fields.');
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
        await requireNativeCollection(ctx, args.collectionId);
        const name = validateName(args.name);
        const key = validateFieldKey(args.key);
        if (args.helpText !== undefined && args.helpText.length > 200) {
            throw new Error('BAD_REQUEST: helpText max 200');
        }
        const existing = await ctx.db
            .query('cmsFields')
            .withIndex('by_collection', (q) => q.eq('collectionId', args.collectionId))
            .take(501);
        if (existing.length >= 500) throw new Error('BAD_REQUEST: A collection supports up to 500 fields.');
        if (existing.some((f) => f.key === key)) {
            throw new Error(
                `CONFLICT: A field with key "${key}" already exists in this collection`,
            );
        }
        const config = mergeFieldConfig(args.type, {}, args.config);
        const candidate = { key, name, type: args.type, config, required: args.required ?? false } as Doc<'cmsFields'>;
        await validateConfigTarget(ctx, args.projectId, candidate);
        const items = await collectionItems(ctx, args.collectionId);
        await validateSavedValues(ctx, candidate, items);
        const order = existing.length;
        const id = await ctx.db.insert('cmsFields', {
            collectionId: args.collectionId,
            name,
            key,
            type: args.type,
            revision: 1,
            helpText: args.helpText,
            required: args.required ?? false,
            config,
            order,
            updatedAt: Date.now(),
        });
        await invalidateItemEditors(ctx, items);
        return (await ctx.db.get(id))!;
    },
});

export const update = mutation({
    args: {
        projectId: v.id('projects'),
        fieldId: v.id('cmsFields'),
        expectedRevision: v.number(),
        name: v.optional(v.string()),
        helpText: v.optional(v.string()),
        required: v.optional(v.boolean()),
        config: v.optional(v.any()),
    },
    handler: async (ctx, { projectId, fieldId, expectedRevision, name, helpText, required, config }) => {
        await requireCap(ctx, 'project.update', { projectId });
        const existing = await ctx.db.get(fieldId);
        if (!existing) throw new Error('NOT_FOUND: field');
        const collection = await ctx.db.get(existing.collectionId);
        if (!collection || collection.projectId !== projectId) {
            throw new Error('NOT_FOUND: field');
        }
        await requireNativeCollection(ctx, existing.collectionId);
        const patch: Partial<Doc<'cmsFields'>> = { updatedAt: Date.now(), revision: nextCmsRevision(existing, expectedRevision) };
        if (name !== undefined) patch.name = validateName(name);
        if (helpText !== undefined) {
            if (helpText.length > 200) throw new Error('BAD_REQUEST: helpText max 200');
            patch.helpText = helpText;
        }
        if (required !== undefined) patch.required = required;
        if (config !== undefined) patch.config = mergeFieldConfig(existing.type, existing.config, config);
        const needsValidation = config !== undefined || required !== undefined;
        const items = needsValidation ? await collectionItems(ctx, existing.collectionId) : [];
        if (needsValidation) {
            const candidate = { ...existing, ...patch };
            await validateConfigTarget(ctx, projectId, candidate);
            await validateSavedValues(ctx, candidate, items);
        }
        await ctx.db.patch(fieldId, patch);
        await invalidateItemEditors(ctx, items);
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
            .take(501);
        await requireNativeCollection(ctx, collectionId);
        if (existing.length > 500) throw new Error('BAD_REQUEST: Too many collection fields.');
        const validIds = new Set(existing.map((f) => f._id));
        if (orderedFieldIds.length !== existing.length || new Set(orderedFieldIds).size !== orderedFieldIds.length) throw new Error('BAD_REQUEST: Supply every field exactly once.');
        for (const id of orderedFieldIds) {
            if (!validIds.has(id)) {
                throw new Error(`BAD_REQUEST: Field ${id} does not belong to this collection`);
            }
        }
        const now = Date.now();
        for (let i = 0; i < orderedFieldIds.length; i++) {
            const field = existing.find((entry) => entry._id === orderedFieldIds[i])!;
            await ctx.db.patch(field._id, { order: i, revision: cmsRevision(field) + 1, updatedAt: now });
        }
        return { success: true } as const;
    },
});

export const remove = mutation({
    args: {
        projectId: v.id('projects'),
        fieldId: v.id('cmsFields'),
        expectedRevision: v.number(),
    },
    handler: async (ctx, { projectId, fieldId, expectedRevision }) => {
        await requireCap(ctx, 'project.update', { projectId });
        const existing = await ctx.db.get(fieldId);
        if (!existing) throw new Error('NOT_FOUND: field');
        const collection = await ctx.db.get(existing.collectionId);
        if (!collection || collection.projectId !== projectId) {
            throw new Error('NOT_FOUND: field');
        }
        nextCmsRevision(existing, expectedRevision);
        const collectionId = existing.collectionId;
        await requireNativeCollection(ctx, collectionId);
        const fieldKey = existing.key;

        // Bug 3 fix: cleanup stale values + broken bindings.
        // (a) Strip values[fieldKey] from every item in the collection.
        const items = await collectionItems(ctx, collectionId);
        for (const item of items) {
            const itemValues = (item.values ?? {}) as Record<string, unknown>;
            const next: Record<string, unknown> = { ...itemValues };
            delete next[fieldKey];
            await ctx.db.patch(item._id, { values: next, revision: cmsRevision(item) + 1, updatedAt: Date.now() });
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
            .take(501);
        if (projectBindings.length > 500) throw new Error('BAD_REQUEST: Too many bindings to safely remove this field.');
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

        // (c) Remove detail-page routing configs that match items by this
        // field. `cmsCollectionPages.matchFieldKey` is a required non-empty
        // string, so it can't be cleared — a dangling key silently breaks
        // URL→item routing (data-pusher matches items by page.matchFieldKey).
        // Delete the now-broken page config rather than leave routing dead,
        // mirroring the broken-binding cleanup above.
        const collectionPages = await ctx.db
            .query('cmsCollectionPages')
            .withIndex('by_collection', (q) => q.eq('collectionId', collectionId))
            .take(501);
        if (collectionPages.length > 500) throw new Error('BAD_REQUEST: Too many page mappings to safely remove this field.');
        for (const page of collectionPages) {
            if (page.matchFieldKey === fieldKey) {
                await ctx.db.delete(page._id);
            }
        }

        await ctx.db.delete(fieldId);
        return { success: true } as const;
    },
});
