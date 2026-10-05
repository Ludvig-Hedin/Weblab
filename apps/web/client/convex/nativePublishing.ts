import { v } from 'convex/values';

import { query } from './_generated/server';
import { requireCap } from './lib/permissions';

export const authorize = query({
    args: { projectId: v.id('projects'), branchId: v.id('branches') },
    returns: v.object({ userId: v.string(), projectId: v.id('projects'), branchId: v.id('branches'), rootPath: v.string(), cmsRequired: v.boolean(), productionSwitchEnabled: v.literal(false) }),
    handler: async (ctx, { projectId, branchId }) => {
        const access = await requireCap(ctx, 'project.publish', { projectId });
        const branch = await ctx.db.get(branchId);
        if (!branch || branch.projectId !== projectId || branch.runtimeType !== 'local') {
            throw new Error('NOT_FOUND: local branch');
        }
        const metadata = branch.runtimeMetadata as { local?: { rootPath?: unknown } } | null;
        const rootPath = metadata?.local?.rootPath;
        if (typeof rootPath !== 'string' || !rootPath) throw new Error('LOCAL_PROJECT_PATH_MISSING');
        const sources = await ctx.db.query('cmsSources').withIndex('by_project', (q) => q.eq('projectId', projectId)).take(101);
        const bindings = await ctx.db.query('cmsBindings').withIndex('by_project', (q) => q.eq('projectId', projectId)).take(1);
        const collections = await ctx.db.query('cmsCollections').withIndex('by_project', (q) => q.eq('projectId', projectId)).take(1);
        const blogConnections = await ctx.db.query('cmsSanityBlogConnections').withIndex('by_project', (q) => q.eq('projectId', projectId)).take(1);
        const cmsRequired = sources.length > 100 || sources.some((source) => source.type !== 'weblab') || bindings.length > 0 || collections.length > 0 || blogConnections.length > 0;
        // A per-device lock cannot serialize different customers or work copies.
        // Keep live switches unavailable until the shared destination worker exists.
        return { userId: access.user.clerkUserId, projectId, branchId, rootPath, cmsRequired, productionSwitchEnabled: false as const };
    },
});
