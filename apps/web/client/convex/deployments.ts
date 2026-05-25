import { v } from 'convex/values';

import type { Doc } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import { vDeploymentStatus, vDeploymentType, vHostingProvider } from './lib/enums';
import { requireCap, requireUser } from './lib/permissions';

// Convex port of src/server/api/routers/publish/deployment.ts.
//
// DB-only queries + mutations. Long-running deploy/unpublish/redeploy are
// in `publishActions.ts` (node runtime) and call back into the internal
// mutations exported here.

export const getByType = query({
    args: {
        projectId: v.id('projects'),
        type: vDeploymentType,
    },
    handler: async (ctx, { projectId, type }) => {
        await requireCap(ctx, 'project.view', { projectId });
        const rows = await ctx.db
            .query('deployments')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .collect();
        const matching = rows.filter((r) => r.type === type);
        matching.sort((a, b) => b._creationTime - a._creationTime);
        return matching[0] ?? null;
    },
});

export const list = query({
    args: {
        projectId: v.id('projects'),
        limit: v.optional(v.number()),
    },
    handler: async (ctx, { projectId, limit = 25 }) => {
        await requireCap(ctx, 'project.view', { projectId });
        const rows = await ctx.db
            .query('deployments')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .collect();
        rows.sort((a, b) => b._creationTime - a._creationTime);
        return rows.slice(0, limit);
    },
});

export const update = mutation({
    args: {
        id: v.id('deployments'),
        status: v.optional(vDeploymentStatus),
        message: v.optional(v.string()),
        buildLog: v.optional(v.string()),
        error: v.optional(v.string()),
        progress: v.optional(v.number()),
        sandboxId: v.optional(v.string()),
        urls: v.optional(v.array(v.string())),
        envVars: v.optional(v.record(v.string(), v.string())),
        provider: v.optional(vHostingProvider),
        type: v.optional(vDeploymentType),
        providerDeploymentId: v.optional(v.string()),
    },
    handler: async (ctx, { id, ...patch }) => {
        const existing = await ctx.db.get(id);
        if (!existing) throw new Error('NOT_FOUND: Deployment not found');
        await requireCap(ctx, 'project.deploy', { projectId: existing.projectId });
        return updateDeploymentRow(ctx, id, patch);
    },
});

export const cancel = mutation({
    args: { deploymentId: v.id('deployments') },
    handler: async (ctx, { deploymentId }) => {
        const deployment = await ctx.db.get(deploymentId);
        if (!deployment) throw new Error('NOT_FOUND: Deployment not found');
        await requireCap(ctx, 'project.deploy', {
            projectId: deployment.projectId,
        });
        await updateDeploymentRow(ctx, deploymentId, {
            status: 'cancelled',
            message: 'Cancelled by user',
        });
    },
});

export const create = mutation({
    args: {
        projectId: v.id('projects'),
        type: vDeploymentType,
        sandboxId: v.string(),
        buildScript: v.optional(v.string()),
        buildFlags: v.optional(v.string()),
        envVars: v.optional(v.record(v.string(), v.string())),
        provider: v.optional(vHostingProvider),
    },
    handler: async (ctx, args) => {
        await requireCap(ctx, 'project.publish', { projectId: args.projectId });
        const user = await requireUser(ctx);
        await assertNoInflight(ctx, args.projectId, args.type);
        return insertDeploymentRow(ctx, {
            ...args,
            userId: user._id,
            provider: args.provider ?? 'freestyle',
        });
    },
});

// ─── internal helpers used by publishActions.ts ──────────────────────────────

export const _create = internalMutation({
    args: {
        projectId: v.id('projects'),
        type: vDeploymentType,
        userId: v.id('users'),
        sandboxId: v.string(),
        buildScript: v.optional(v.string()),
        buildFlags: v.optional(v.string()),
        envVars: v.optional(v.record(v.string(), v.string())),
        provider: vHostingProvider,
    },
    handler: async (ctx, args) => insertDeploymentRow(ctx, args),
});

export const _update = internalMutation({
    args: {
        id: v.id('deployments'),
        status: v.optional(vDeploymentStatus),
        message: v.optional(v.string()),
        buildLog: v.optional(v.string()),
        error: v.optional(v.string()),
        progress: v.optional(v.number()),
        sandboxId: v.optional(v.string()),
        urls: v.optional(v.array(v.string())),
        envVars: v.optional(v.record(v.string(), v.string())),
        provider: v.optional(vHostingProvider),
        type: v.optional(vDeploymentType),
        providerDeploymentId: v.optional(v.string()),
    },
    handler: async (ctx, { id, ...patch }) => {
        return updateDeploymentRow(ctx, id, patch);
    },
});

export const _get = internalQuery({
    args: { deploymentId: v.id('deployments') },
    handler: async (ctx, { deploymentId }) => ctx.db.get(deploymentId),
});

export const _assertReadyToRun = internalQuery({
    args: { deploymentId: v.id('deployments') },
    handler: async (ctx, { deploymentId }) => {
        const row = await ctx.db.get(deploymentId);
        if (!row) throw new Error('NOT_FOUND: Deployment not found');
        if (row.status === 'in_progress') throw new Error('BAD_REQUEST: Deployment in progress');
        if (row.status === 'cancelled') throw new Error('BAD_REQUEST: Deployment cancelled');
        return row;
    },
});

// ─── shared row helpers ──────────────────────────────────────────────────────

// A deploy action that dies without writing a terminal status (Convex's ~10-min
// action timeout — see the warning in publishActions.run — an OOM, or an infra
// restart) leaves a `pending`/`in_progress` row behind. Without a TTL, that row
// would block EVERY future publish/retry for the project forever (and the
// publish button would spin "Publishing" indefinitely). Rows older than this are
// treated as stale so they no longer block a fresh deploy; the threshold is
// comfortably past the action timeout to avoid racing a slow-but-live build.
const STALE_DEPLOYMENT_MS = 15 * 60 * 1000;

async function assertNoInflight(
    ctx: QueryCtx | MutationCtx,
    projectId: Doc<'projects'>['_id'],
    type: Doc<'deployments'>['type'],
): Promise<void> {
    const rows = await ctx.db
        .query('deployments')
        .withIndex('by_project_status', (q) => q.eq('projectId', projectId).eq('status', 'pending'))
        .collect();
    const inProgress = await ctx.db
        .query('deployments')
        .withIndex('by_project_status', (q) =>
            q.eq('projectId', projectId).eq('status', 'in_progress'),
        )
        .collect();
    const now = Date.now();
    const both = [...rows, ...inProgress].filter(
        (r) => r.type === type && now - r._creationTime < STALE_DEPLOYMENT_MS,
    );
    if (both.length > 0) {
        throw new Error(
            both[0]!.status === 'in_progress'
                ? 'BAD_REQUEST: Deployment in progress'
                : 'BAD_REQUEST: Deployment already exists',
        );
    }
}

async function insertDeploymentRow(
    ctx: MutationCtx,
    args: {
        projectId: Doc<'projects'>['_id'];
        type: Doc<'deployments'>['type'];
        userId: Doc<'users'>['_id'];
        sandboxId: string;
        buildScript?: string;
        buildFlags?: string;
        envVars?: Record<string, string>;
        provider: Doc<'deployments'>['provider'];
    },
) {
    const id = await ctx.db.insert('deployments', {
        projectId: args.projectId,
        sandboxId: args.sandboxId,
        type: args.type,
        buildScript: args.buildScript,
        buildFlags: args.buildFlags,
        envVars: args.envVars,
        provider: args.provider,
        status: 'pending',
        requestedBy: args.userId,
        message: 'Creating deployment...',
        progress: 0,
        updatedAt: Date.now(),
    });
    return (await ctx.db.get(id))!;
}

async function updateDeploymentRow(
    ctx: MutationCtx,
    id: Doc<'deployments'>['_id'],
    patch: Partial<Omit<Doc<'deployments'>, '_id' | '_creationTime'>>,
) {
    try {
        const existing = await ctx.db.get(id);
        if (!existing) return null;
        // Mirror tRPC behavior: do not overwrite a CANCELLED row's terminal state.
        if (existing.status === 'cancelled' && patch.status && patch.status !== 'cancelled') {
            return existing;
        }
        await ctx.db.patch(id, { ...patch, updatedAt: Date.now() });
        return (await ctx.db.get(id))!;
    } catch (error) {
        console.error(`Failed to update deployment ${id}:`, error);
        return null;
    }
}
