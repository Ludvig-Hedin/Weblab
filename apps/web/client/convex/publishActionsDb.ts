import { v } from 'convex/values';

import { internalMutation, internalQuery } from './_generated/server';
import { vDeploymentType, vHostingProvider } from './lib/enums';
import { requireCap } from './lib/permissions';

// V8-runtime DB helpers used by publishActions.ts. Split out so the action
// file can stay `"use node"` while these read/write through the regular Convex
// runtime (cheaper, no Node startup cost per call).

export const _requirePublishCap = internalQuery({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        await requireCap(ctx, 'project.publish', { projectId });
        return { ok: true } as const;
    },
});

export const _requireDeployCap = internalQuery({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        await requireCap(ctx, 'project.deploy', { projectId });
        return { ok: true } as const;
    },
});

export const _loadDomainsForUrls = internalQuery({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        const preview = await ctx.db
            .query('previewDomains')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .collect();
        const custom = await ctx.db
            .query('projectCustomDomains')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .collect();
        return {
            preview: preview.map((d) => ({ fullDomain: d.fullDomain })),
            custom: custom.map((d) => ({ fullDomain: d.fullDomain })),
        };
    },
});

export const _loadProtectedPages = internalQuery({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        const rows = await ctx.db
            .query('pageAccess')
            .withIndex('by_project', (q) => q.eq('projectId', projectId))
            .collect();
        return rows
            .filter(
                (r): r is typeof r & { passwordHash: string } =>
                    r.accessType === 'password' && Boolean(r.passwordHash),
            )
            .map((r) => ({ pagePath: r.pagePath, passwordHash: r.passwordHash }));
    },
});

export const _loadHostingConnection = internalQuery({
    args: {
        provider: vHostingProvider,
        userId: v.id('users'),
    },
    handler: async (ctx, { provider, userId }) => {
        const row = await ctx.db
            .query('hostingProviderConnections')
            .withIndex('by_user_provider', (q) => q.eq('userId', userId).eq('provider', provider))
            .unique();
        if (!row) return null;
        return { tokenEncrypted: row.tokenEncrypted };
    },
});

export const _createRedeployment = internalMutation({
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
    handler: async (ctx, args) => {
        // Block if another deployment is in-flight for the same type, mirroring
        // the public deployments.create check.
        const pending = await ctx.db
            .query('deployments')
            .withIndex('by_project_status', (q) =>
                q.eq('projectId', args.projectId).eq('status', 'pending'),
            )
            .collect();
        const inProgress = await ctx.db
            .query('deployments')
            .withIndex('by_project_status', (q) =>
                q.eq('projectId', args.projectId).eq('status', 'in_progress'),
            )
            .collect();
        const inFlight = [...pending, ...inProgress].find((d) => d.type === args.type);
        if (inFlight) {
            throw new Error('BAD_REQUEST: A deployment is already in progress for this target.');
        }
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
    },
});
