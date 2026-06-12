import { v } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import { internalMutation, internalQuery } from './_generated/server';
import { encodeRemoteRef } from './lib/cmsRemoteRef';
import { requireCap } from './lib/permissions';

// Companion to cmsActions.ts. Lives outside "use node" so Convex compiles
// it in the V8 isolate where ctx.db is available. Public Node actions call
// these via `internal.cmsActionsInternal.*`.
//
// Authentication: these are internalMutation/internalQuery so they can
// only be invoked from server code. The caller (cmsActions) is responsible
// for any project-level capability checks before dispatching.

/**
 * Capability gate for Node ("use node") actions that can't call requireCap
 * directly (no ctx.db in the Node isolate). Throws unless the caller has
 * project.update on the project. Auth identity propagates from the action's
 * ctx.runQuery call. Used by sourceTestConnection, which has no sourceId to
 * route access through.
 */
export const _assertProjectUpdate = internalQuery({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        await requireCap(ctx, 'project.update', { projectId });
        return null;
    },
});

export const _listCollectionsForSource = internalQuery({
    args: {
        projectId: v.id('projects'),
        sourceId: v.id('cmsSources'),
    },
    handler: async (ctx, { projectId, sourceId }): Promise<Doc<'cmsCollections'>[]> => {
        const rows = await ctx.db
            .query('cmsCollections')
            .withIndex('by_source', (q) => q.eq('sourceId', sourceId))
            .collect();
        return rows.filter((c) => c.projectId === projectId);
    },
});

export const _wizardCreateCollection = internalMutation({
    args: {
        projectId: v.id('projects'),
        sourceId: v.id('cmsSources'),
        remoteRef: v.string(),
        name: v.string(),
        slug: v.string(),
        fields: v.array(
            v.object({
                key: v.string(),
                name: v.string(),
                type: v.string(),
            }),
        ),
    },
    handler: async (ctx, { projectId, sourceId, remoteRef, name, slug, fields }) => {
        // TODO(bug-hunt): unlike cmsCollections.create, this skips slug
        // validation and the duplicate-slug check — two remote types whose
        // names slugify identically (or a collision with an existing
        // collection) persist duplicate slugs, and non-latin names can
        // persist an empty slug. Reuse validateSlug + dup check here
        // (suffix on conflict).
        const now = Date.now();
        const description = encodeRemoteRef(remoteRef);
        const collectionId = await ctx.db.insert('cmsCollections', {
            projectId,
            sourceId,
            name,
            slug,
            description,
            updatedAt: now,
        });
        for (let i = 0; i < fields.length; i++) {
            const f = fields[i]!;
            // `type` arrives as a free-form string from the action's
            // wizard input. The action already constrains it to the
            // CmsFieldType enum values; we trust that contract here.
            await ctx.db.insert('cmsFields', {
                collectionId,
                name: f.name,
                key: f.key,
                type: f.type as Doc<'cmsFields'>['type'],
                config: {},
                required: false,
                order: i,
                updatedAt: now,
            });
        }
        return collectionId;
    },
});

export const _wizardAttachCollection = internalMutation({
    args: {
        projectId: v.id('projects'),
        sourceId: v.id('cmsSources'),
        collectionId: v.id('cmsCollections'),
        remoteRef: v.string(),
    },
    handler: async (ctx, { projectId, sourceId, collectionId, remoteRef }) => {
        const existing = await ctx.db.get(collectionId);
        if (!existing || existing.projectId !== projectId) {
            throw new Error('NOT_FOUND: collection');
        }
        await ctx.db.patch(collectionId, {
            sourceId,
            description: encodeRemoteRef(remoteRef, existing.description ?? undefined),
            updatedAt: Date.now(),
        });
    },
});
