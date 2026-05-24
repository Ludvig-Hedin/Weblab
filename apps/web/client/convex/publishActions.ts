'use node';

import { v } from 'convex/values';

import type { DeploymentType } from '@weblab/models';
import { DefaultSettings } from '@weblab/constants';
import { HostingProvider } from '@weblab/models';

import type { ActionCtx } from './_generated/server';
import { api, internal } from './_generated/api';
import { action } from './_generated/server';
import { vDeploymentType } from './lib/enums';
import {
    applyAccessMiddleware,
    deployExternal,
    deployFreestyle,
    extractEnvVarsFromSandbox,
    forkBuildSandbox,
    getProjectUrlsFromRows,
} from './lib/publishHelpers';
import { PublishManager } from './lib/publishManager';

// Convex port of src/server/api/routers/publish/{index,deployment}.ts (run +
// unpublish + redeploy long-running entrypoints).
//
// NOTE: Convex action timeout is 10 min. The publish pipeline (fork sandbox,
// build, serialize, deploy) commonly takes 2–5 min for a Next.js project; the
// 10-min ceiling is tight on slow builds. If we hit it in practice, the
// follow-up is to migrate this to `@convex-dev/workflow` (durable execution
// with built-in step retries) rather than padding timeouts.

const FAILED_STATUS = 'failed' as const;
const COMPLETED_STATUS = 'completed' as const;

async function requireCaller(ctx: ActionCtx) {
    const me = await ctx.runQuery(api.users.me, {});
    if (!me) throw new Error('UNAUTHORIZED');
    return me;
}

async function loadProjectUrls(
    ctx: ActionCtx,
    projectId: import('./_generated/dataModel').Id<'projects'>,
    type: DeploymentType,
): Promise<string[]> {
    const { preview, custom } = await ctx.runQuery(internal.publishActionsDb._loadDomainsForUrls, {
        projectId,
    });
    return getProjectUrlsFromRows({ type, preview, custom });
}

export const run = action({
    args: { deploymentId: v.id('deployments') },
    handler: async (ctx, { deploymentId }): Promise<void> => {
        await requireCaller(ctx);

        const deployment = await ctx.runQuery(internal.deployments._assertReadyToRun, {
            deploymentId,
        });

        // requireCap on project.publish was already enforced by deployments.create.
        // Re-check here so a stale row from a cancelled session can't be revived
        // by an unauthorized caller.
        await ctx.runQuery(internal.publishActionsDb._requirePublishCap, {
            projectId: deployment.projectId,
        });

        const {
            projectId,
            type,
            buildScript,
            buildFlags,
            envVars,
            requestedBy: userId,
        } = deployment;

        try {
            const deploymentUrls = await loadProjectUrls(ctx, projectId, type as DeploymentType);

            await ctx.runMutation(internal.deployments._update, {
                id: deploymentId,
                status: 'in_progress',
                message: 'Creating build environment...',
                progress: 10,
                envVars: deployment.envVars ?? {},
            });

            const { provider, sandboxId: forkedSandboxId } = await forkBuildSandbox(
                deployment.sandboxId ?? '',
                userId,
                deploymentId,
            );

            try {
                await ctx.runMutation(internal.deployments._update, {
                    id: deploymentId,
                    status: 'in_progress',
                    message: 'Creating optimized build...',
                    progress: 20,
                    sandboxId: forkedSandboxId,
                    envVars: deployment.envVars ?? {},
                });

                const protectedPages = await ctx.runQuery(
                    internal.publishActionsDb._loadProtectedPages,
                    { projectId },
                );
                await applyAccessMiddleware(provider, protectedPages);

                const publishManager = new PublishManager(provider);
                const files = await publishManager.publish({
                    skipBadge: type === 'custom',
                    buildScript: buildScript ?? DefaultSettings.COMMANDS.build,
                    buildFlags: buildFlags ?? DefaultSettings.EDITOR_SETTINGS.buildFlags,
                    envVars: deployment.envVars ?? {},
                    updateDeployment: async (patch) =>
                        void (await ctx.runMutation(internal.deployments._update, {
                            id: deploymentId,
                            status: patch.status as 'in_progress' | undefined,
                            message: patch.message,
                            progress: patch.progress,
                            envVars: patch.envVars,
                            sandboxId: patch.sandboxId,
                        })),
                });

                await ctx.runMutation(internal.deployments._update, {
                    id: deploymentId,
                    status: 'in_progress',
                    message: 'Deploying build...',
                    progress: 80,
                    envVars: deployment.envVars ?? {},
                });

                const sandboxEnvVars = await extractEnvVarsFromSandbox(provider);
                const mergedEnvVars = { ...sandboxEnvVars, ...(envVars ?? {}) };

                if (deployment.provider === HostingProvider.FREESTYLE) {
                    await deployFreestyle({
                        files,
                        urls: deploymentUrls,
                        envVars: mergedEnvVars,
                    });
                } else {
                    const connection = await ctx.runQuery(
                        internal.publishActionsDb._loadHostingConnection,
                        { provider: deployment.provider as HostingProvider, userId },
                    );
                    if (!connection) {
                        throw new Error(
                            `No connected ${deployment.provider} account. Connect one in Hosting integrations.`,
                        );
                    }
                    await deployExternal({
                        provider: deployment.provider as HostingProvider,
                        tokenEncrypted: connection.tokenEncrypted,
                        files,
                        urls: deploymentUrls,
                        envVars: mergedEnvVars,
                    });
                }
            } finally {
                await provider.destroy();
            }

            await ctx.runMutation(internal.deployments._update, {
                id: deploymentId,
                status: COMPLETED_STATUS,
                message: 'Deployment Success!',
                envVars: deployment.envVars ?? {},
            });
        } catch (error) {
            console.error(error);
            await ctx.runMutation(internal.deployments._update, {
                id: deploymentId,
                status: FAILED_STATUS,
                message: 'Failed to publish deployment',
                error: error instanceof Error ? error.message : 'Unknown error',
                progress: 100,
                envVars: deployment.envVars ?? {},
            });
            throw error;
        }
    },
});

export const unpublish = action({
    args: {
        projectId: v.id('projects'),
        type: vDeploymentType,
    },
    handler: async (ctx, { projectId, type }): Promise<{ deploymentId: string }> => {
        const me = await requireCaller(ctx);
        await ctx.runQuery(internal.publishActionsDb._requireDeployCap, {
            projectId,
        });

        const deployment = await ctx.runMutation(internal.deployments._create, {
            projectId,
            type,
            userId: me._id,
            sandboxId: '',
            provider: 'freestyle',
        });

        const urls = await loadProjectUrls(ctx, projectId, type as DeploymentType);

        await ctx.runMutation(internal.deployments._update, {
            id: deployment._id,
            status: 'in_progress',
            message: 'Unpublishing project...',
            progress: 20,
            envVars: deployment.envVars ?? {},
        });

        try {
            await deployFreestyle({ files: {}, urls, envVars: {} });
            await ctx.runMutation(internal.deployments._update, {
                id: deployment._id,
                status: COMPLETED_STATUS,
                message: 'Project unpublished!',
                progress: 100,
                envVars: deployment.envVars ?? {},
            });
        } catch (error) {
            // Guard the terminal-status write so it never swallows the
            // original error.
            try {
                await ctx.runMutation(internal.deployments._update, {
                    id: deployment._id,
                    status: FAILED_STATUS,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    progress: 100,
                    envVars: deployment.envVars ?? {},
                });
            } catch (statusErr) {
                console.error('[unpublish] failed to write terminal FAILED status', statusErr);
            }
            throw error;
        }
        return { deploymentId: deployment._id };
    },
});

export const redeploy = action({
    args: { deploymentId: v.id('deployments') },
    handler: async (ctx, { deploymentId }): Promise<{ _id: string }> => {
        const me = await requireCaller(ctx);
        const source = await ctx.runQuery(internal.deployments._get, {
            deploymentId,
        });
        if (!source) throw new Error('NOT_FOUND: Deployment not found');
        await ctx.runQuery(internal.publishActionsDb._requireDeployCap, {
            projectId: source.projectId,
        });
        if (!source.sandboxId) {
            throw new Error('BAD_REQUEST: Original deployment has no sandbox; cannot redeploy.');
        }
        // Block if another deployment is in-flight for the same type. Use the
        // same DB-assert path as the public create mutation to keep behavior
        // consistent.
        const created = await ctx.runMutation(internal.publishActionsDb._createRedeployment, {
            projectId: source.projectId,
            type: source.type,
            userId: me._id,
            sandboxId: source.sandboxId,
            buildScript: source.buildScript ?? undefined,
            buildFlags: source.buildFlags ?? undefined,
            envVars: source.envVars ?? undefined,
            provider: source.provider,
        });
        return { _id: created._id };
    },
});
