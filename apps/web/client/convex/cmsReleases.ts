import { v } from 'convex/values';
import { makeFunctionReference } from 'convex/server';

import { internalMutation, mutation, query } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { CMS_RELEASE_LIMITS, serializeCmsRelease } from './lib/cmsReleaseSnapshot';
import { requireCap } from './lib/permissions';

/** The transaction pins one consistent CMS view. There is deliberately no update endpoint. */
export const freeze = mutation({
    args: { projectId: v.id('projects') },
    returns: v.object({ snapshotId: v.id('cmsReleaseSnapshots'), content: v.string() }),
    handler: async (ctx, { projectId }) => {
        await requireCap(ctx, 'project.publish', { projectId });
        const collections = await ctx.db.query('cmsCollections')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .take(CMS_RELEASE_LIMITS.collections + 1);
        const data = [];
        for (const collection of collections) {
            const source = await ctx.db.get(collection.sourceId);
            if (!source || source.projectId !== projectId) throw new Error('CMS_RELEASE_INVALID_SOURCE');
            // External content must use its provider's versioned release contract.
            if (source.type !== 'weblab') throw new Error('CMS_RELEASE_EXTERNAL_SOURCE_UNSUPPORTED');
            const fields = await ctx.db.query('cmsFields')
                .withIndex('by_collection_order', (q) => q.eq('collectionId', collection._id))
                .take(CMS_RELEASE_LIMITS.fields + 1);
            const items = await ctx.db.query('cmsItems')
                .withIndex('by_collection_status', (q) =>
                    q.eq('collectionId', collection._id).eq('status', 'published'))
                .filter((q) => q.eq(q.field('archivedAt'), undefined))
                .take(CMS_RELEASE_LIMITS.items + 1);
            data.push({ collection, fields, items });
        }
        const content = serializeCmsRelease(data);
        const snapshotId = await ctx.db.insert('cmsReleaseSnapshots', {
            projectId, content, createdAt: Date.now(),
        });
        return { snapshotId, content };
    },
});

export const get = query({
    args: { projectId: v.id('projects'), snapshotId: v.id('cmsReleaseSnapshots') },
    returns: v.object({ snapshotId: v.id('cmsReleaseSnapshots'), content: v.string(), createdAt: v.number() }),
    handler: async (ctx, { projectId, snapshotId }) => {
        await requireCap(ctx, 'project.view', { projectId });
        const snapshot = await ctx.db.get(snapshotId);
        if (!snapshot || snapshot.projectId !== projectId) throw new Error('NOT_FOUND: CMS release');
        return { snapshotId: snapshot._id, content: snapshot.content, createdAt: snapshot.createdAt };
    },
});

export const _removeForDeletedProject = internalMutation({
    args: { projectId: v.id('projects') },
    returns: v.null(),
    handler: async (ctx, { projectId }) => {
        if (await ctx.db.get(projectId)) throw new Error('CMS_RELEASE_PROJECT_STILL_EXISTS');
        const batch = await ctx.db.query('cmsReleaseSnapshots')
            .withIndex('by_project', (q) => q.eq('projectId', projectId)).take(5);
        for (const snapshot of batch) await ctx.db.delete(snapshot._id);
        if (batch.length === 5) {
            await ctx.scheduler.runAfter(0, makeFunctionReference<'mutation', { projectId: Id<'projects'> }>(
                'cmsReleases:_removeForDeletedProject'), { projectId });
        }
        return null;
    },
});
