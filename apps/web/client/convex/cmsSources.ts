import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { requireCap } from './lib/permissions';

// Port of src/server/api/routers/cms/source.ts. Mutations that need
// AES-256-GCM live in cmsActions.ts (Node runtime); this file is
// V8-only and never reads/writes the `credentials` blob shape.
//
// Exception: `create` accepts an already-encrypted ciphertext from the
// caller (an action wraps the plaintext credentials with
// encryptCmsCredentials before invoking this mutation). Keeps the
// encryption boundary entirely in cmsActions.ts.

const externalSourceTypes = v.union(v.literal('payload'), v.literal('strapi'), v.literal('rest'));

function stripCredentials<T extends { credentials?: unknown }>(row: T): Omit<T, 'credentials'> {
    const { credentials: _credentials, ...rest } = row;
    return rest;
}

export const list = query({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        await requireCap(ctx, 'project.view', { projectId });
        const rows = await ctx.db
            .query('cmsSources')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .collect();
        // Sort by creation time ascending to match Drizzle ordering.
        rows.sort((a, b) => a._creationTime - b._creationTime);
        return rows.map((row) => stripCredentials(row));
    },
});

export const get = query({
    args: {
        projectId: v.id('projects'),
        sourceId: v.id('cmsSources'),
    },
    handler: async (ctx, { projectId, sourceId }) => {
        await requireCap(ctx, 'project.view', { projectId });
        const row = await ctx.db.get(sourceId);
        if (!row || row.projectId !== projectId) return null;
        return stripCredentials(row);
    },
});

/**
 * Internal-grade getter that returns the raw `credentials` blob — used by
 * cmsActions.ts so the Node action can decrypt and dispatch to an
 * adapter. Still gated by requireCap so it can't be invoked from the
 * client by callers without project.update access; but the credentials
 * payload is whatever the encrypting writer stored.
 */
export const getWithCredentials = query({
    args: {
        projectId: v.id('projects'),
        sourceId: v.id('cmsSources'),
    },
    handler: async (ctx, { projectId, sourceId }) => {
        await requireCap(ctx, 'project.update', { projectId });
        const row = await ctx.db.get(sourceId);
        if (!row || row.projectId !== projectId) return null;
        return row;
    },
});

export const create = mutation({
    args: {
        projectId: v.id('projects'),
        type: externalSourceTypes,
        name: v.string(),
        /** Already-encrypted ciphertext produced by cmsActions encryption. */
        credentialsEncrypted: v.string(),
    },
    handler: async (ctx, { projectId, type, name, credentialsEncrypted }) => {
        await requireCap(ctx, 'project.update', { projectId });
        const trimmedName = name.trim();
        if (trimmedName.length === 0 || trimmedName.length > 80) {
            throw new Error('BAD_REQUEST: name 1-80');
        }
        const id = await ctx.db.insert('cmsSources', {
            projectId,
            name: trimmedName,
            type,
            credentials: { encrypted: credentialsEncrypted },
            status: 'connected',
            updatedAt: Date.now(),
        });
        const created = (await ctx.db.get(id))!;
        return stripCredentials(created);
    },
});

export const update = mutation({
    args: {
        projectId: v.id('projects'),
        sourceId: v.id('cmsSources'),
        name: v.optional(v.string()),
        /** Optional already-encrypted ciphertext; pass to rotate credentials. */
        credentialsEncrypted: v.optional(v.string()),
    },
    handler: async (ctx, { projectId, sourceId, name, credentialsEncrypted }) => {
        await requireCap(ctx, 'project.update', { projectId });
        const existing = await ctx.db.get(sourceId);
        if (!existing || existing.projectId !== projectId) {
            throw new Error('NOT_FOUND: source');
        }
        if (existing.type === 'weblab') {
            throw new Error('BAD_REQUEST: The default Weblab CMS source cannot be edited');
        }
        const patch: Partial<Doc<'cmsSources'>> = { updatedAt: Date.now() };
        if (name !== undefined) {
            const trimmed = name.trim();
            if (trimmed.length === 0 || trimmed.length > 80) {
                throw new Error('BAD_REQUEST: name 1-80');
            }
            patch.name = trimmed;
        }
        if (credentialsEncrypted !== undefined) {
            patch.credentials = { encrypted: credentialsEncrypted };
        }
        await ctx.db.patch(sourceId, patch);
        const updated = (await ctx.db.get(sourceId))!;
        return stripCredentials(updated);
    },
});

export const remove = mutation({
    args: {
        projectId: v.id('projects'),
        sourceId: v.id('cmsSources'),
    },
    handler: async (ctx, { projectId, sourceId }) => {
        await requireCap(ctx, 'project.update', { projectId });
        const existing = await ctx.db.get(sourceId);
        if (!existing || existing.projectId !== projectId) {
            throw new Error('NOT_FOUND: source');
        }
        if (existing.type === 'weblab') {
            throw new Error('BAD_REQUEST: The default Weblab CMS source cannot be deleted');
        }
        // Refuse if any collection still references this source — schema
        // cascades, but cascading would silently delete user content.
        // Require an explicit collection cleanup first.
        const referencing = await ctx.db
            .query('cmsCollections')
            .withIndex('by_source', (q) => q.eq('sourceId', sourceId))
            .collect();
        if (referencing.length > 0) {
            throw new Error(
                `BAD_REQUEST: Cannot delete: ${referencing.length} collection(s) still use this source`,
            );
        }
        await ctx.db.delete(sourceId);
        return { success: true } as const;
    },
});

/**
 * Returns counts of what would be affected if this source were deleted:
 * - `collectionCount`: number of collections currently mapped from the
 *   source. They'd lose their sync link (the `remove` mutation refuses
 *   deletion while any remain, so the user sees an actionable number).
 * - `itemCount`: total items synced from those collections; these
 *   stay locally even after the source goes away.
 *
 * Used by the sources-tab delete confirmation to give the user a real
 * impact summary instead of a generic "are you sure?".
 */
export const getDeleteImpact = query({
    args: {
        projectId: v.id('projects'),
        sourceId: v.id('cmsSources'),
    },
    handler: async (ctx, { projectId, sourceId }) => {
        await requireCap(ctx, 'project.view', { projectId });
        const source = await ctx.db.get(sourceId);
        if (!source || source.projectId !== projectId) {
            return { collectionCount: 0, itemCount: 0 };
        }
        const collections = await ctx.db
            .query('cmsCollections')
            .withIndex('by_source', (q) => q.eq('sourceId', sourceId))
            .collect();
        let itemCount = 0;
        for (const c of collections) {
            const items = await ctx.db
                .query('cmsItems')
                .withIndex('by_collection', (q) => q.eq('collectionId', c._id))
                .collect();
            itemCount += items.length;
        }
        return { collectionCount: collections.length, itemCount };
    },
});

/**
 * Returns the project's default Weblab CMS source id, creating it lazily
 * on first call. Idempotent. Mirrors `ensureDefaultWeblabSource` from
 * the tRPC router so other mutations (e.g. collections.create) share the
 * same path.
 */
export const ensureDefaultWeblab = mutation({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        await requireCap(ctx, 'project.update', { projectId });
        return ensureDefaultWeblabSourceId(ctx, projectId);
    },
});

// Re-usable from other mutation handlers in this domain.
export async function ensureDefaultWeblabSourceId(
    ctx: MutationCtx,
    projectId: Id<'projects'>,
): Promise<Id<'cmsSources'>> {
    const existing = await ctx.db
        .query('cmsSources')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .filter((q) => q.eq(q.field('type'), 'weblab'))
        .first();
    if (existing) return existing._id;
    const id = await ctx.db.insert('cmsSources', {
        projectId,
        name: 'Weblab CMS',
        type: 'weblab',
        credentials: {},
        status: 'connected',
        updatedAt: Date.now(),
    });
    return id;
}
