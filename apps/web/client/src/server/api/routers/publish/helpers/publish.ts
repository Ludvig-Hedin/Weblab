import { TRPCError } from '@trpc/server';
import { and, eq } from 'drizzle-orm';

import type { Provider } from '@weblab/code-provider';
import type { Deployment, DrizzleDb } from '@weblab/db';
import { DefaultSettings } from '@weblab/constants';
import { hostingProviderConnections, pageAccess } from '@weblab/db';
import {
    DeploymentStatus,
    DeploymentType,
    HOSTING_PROVIDER_LABELS,
    HostingProvider,
} from '@weblab/models';

import { decryptProviderToken } from '@/server/utils/provider-tokens';
import { HostingProviderFactory } from '../../domain/hosting-factory';
import { PublishManager } from '../manager';
import { generateAccessMiddleware, isWeblabGeneratedMiddleware } from './access-middleware';
import { deployFreestyle } from './deploy';
import { extractEnvVarsFromSandbox } from './env';
import { forkBuildSandbox } from './fork';
import { getProjectUrls, updateDeployment } from './helpers';

/**
 * Apply per-page access control to the forked sandbox by writing (or removing)
 * `middleware.ts`. Called between fork and build so the generated middleware
 * is included in the deployed bundle.
 *
 * Safety: only overwrites a `middleware.ts` we previously generated (matched
 * by the marker comment). A user-authored middleware is left untouched and a
 * warning is logged — the password protection won't take effect until they
 * remove their custom middleware or we add proper merging.
 */
async function applyAccessMiddleware(
    db: DrizzleDb,
    provider: Provider,
    projectId: string,
): Promise<void> {
    const rows = await db.query.pageAccess.findMany({
        where: eq(pageAccess.projectId, projectId),
    });
    const protectedPages = rows
        .filter(
            (row): row is typeof row & { passwordHash: string } =>
                row.accessType === 'password' && Boolean(row.passwordHash),
        )
        .map((row) => ({ pagePath: row.pagePath, passwordHash: row.passwordHash }));

    // Locate the middleware target. Prefer `src/middleware.ts` when the
    // project uses a `src/` layout (`src/app/` present); otherwise root.
    const usesSrcLayout = await provider
        .statFile({ args: { path: 'src/app' } })
        .then((s) => s.type === 'directory')
        .catch(() => false);
    const middlewarePath = usesSrcLayout ? 'src/middleware.ts' : 'middleware.ts';

    const existing = await provider
        .readFile({ args: { path: middlewarePath } })
        .then((res) => res.file.toString())
        .catch(() => null);

    const source = generateAccessMiddleware(protectedPages);

    if (existing && !isWeblabGeneratedMiddleware(existing)) {
        // Don't clobber user-authored middleware. Surface a warning in the
        // deployment log; the access control simply won't take effect for
        // this publish.
        if (source) {
            console.warn(
                `[publish] User-authored ${middlewarePath} detected; skipping access middleware generation. ` +
                    'Password-protected pages will not be gated until the user-authored middleware is removed or merged.',
            );
        }
        return;
    }

    if (!source) {
        // No protected pages. Remove a previously-generated middleware so
        // stale gates don't linger after the user flips pages back to public.
        if (existing) {
            try {
                await provider.deleteFiles({ args: { path: middlewarePath } });
            } catch (error) {
                console.warn(
                    `[publish] Failed to delete generated ${middlewarePath}: ${
                        error instanceof Error ? error.message : String(error)
                    }`,
                );
            }
        }
        return;
    }

    await provider.writeFile({
        args: { path: middlewarePath, content: source, overwrite: true },
    });
}

export async function publish({
    db,
    deployment,
    sandboxId,
}: {
    db: DrizzleDb;
    deployment: Deployment;
    sandboxId: string;
}) {
    const {
        id: deploymentId,
        projectId,
        type,
        buildScript,
        buildFlags,
        envVars,
        requestedBy: userId,
    } = deployment;
    try {
        const deploymentUrls = await getProjectUrls(db, projectId, type);
        const updateDeploymentResult1 = await updateDeployment(db, {
            id: deploymentId,
            status: DeploymentStatus.IN_PROGRESS,
            message: 'Creating build environment...',
            progress: 10,
            envVars: deployment.envVars ?? {},
        });
        if (!updateDeploymentResult1) {
            throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'Update deployment failed',
            });
        }

        const { provider, sandboxId: forkedSandboxId } = await forkBuildSandbox(
            sandboxId,
            userId,
            deploymentId,
        );

        try {
            const updateDeploymentResult2 = await updateDeployment(db, {
                id: deploymentId,
                status: DeploymentStatus.IN_PROGRESS,
                message: 'Creating optimized build...',
                progress: 20,
                sandboxId: forkedSandboxId,
                envVars: deployment.envVars ?? {},
            });
            if (!updateDeploymentResult2) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Update deployment failed',
                });
            }

            await applyAccessMiddleware(db, provider, projectId);

            const publishManager = new PublishManager(provider);
            const files = await publishManager.publish({
                deploymentId,
                skipBadge: type === DeploymentType.CUSTOM,
                buildScript: buildScript ?? DefaultSettings.COMMANDS.build,
                buildFlags: buildFlags ?? DefaultSettings.EDITOR_SETTINGS.buildFlags,
                envVars: deployment.envVars ?? {},
                updateDeployment: (deploymentUpdate) => updateDeployment(db, deploymentUpdate),
            });

            const updateDeploymentResult3 = await updateDeployment(db, {
                id: deploymentId,
                status: DeploymentStatus.IN_PROGRESS,
                message: 'Deploying build...',
                progress: 80,
                envVars: deployment.envVars ?? {},
            });
            if (!updateDeploymentResult3) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Update deployment failed',
                });
            }

            // Note: Prefer user provided env vars over sandbox env vars
            const sandboxEnvVars = await extractEnvVarsFromSandbox(provider);
            const mergedEnvVars = { ...sandboxEnvVars, ...(envVars ?? {}) };

            if (deployment.provider === HostingProvider.FREESTYLE) {
                await deployFreestyle({
                    files,
                    urls: deploymentUrls,
                    envVars: mergedEnvVars,
                });
            } else {
                // External provider: look up the user's connection, decrypt
                // their API token, build the adapter, hand off the files.
                const connection = await db.query.hostingProviderConnections.findFirst({
                    where: and(
                        eq(hostingProviderConnections.userId, userId),
                        eq(hostingProviderConnections.provider, deployment.provider),
                    ),
                });
                if (!connection) {
                    throw new Error(
                        `No connected ${HOSTING_PROVIDER_LABELS[deployment.provider]} account. Connect one in Hosting integrations.`,
                    );
                }
                const token = decryptProviderToken(connection.tokenEncrypted);
                const adapter = HostingProviderFactory.create(deployment.provider, { token });
                const externalFiles: Record<
                    string,
                    { content: string; encoding?: 'utf-8' | 'base64' }
                > = {};
                for (const [path, file] of Object.entries(files)) {
                    externalFiles[path] = {
                        content: file.content,
                        encoding: file.encoding === 'base64' ? 'base64' : 'utf-8',
                    };
                }
                const result = await adapter.deploy({
                    files: externalFiles,
                    config: {
                        domains: deploymentUrls,
                        entrypoint: 'server.js',
                        envVars: mergedEnvVars,
                    },
                });
                if (!result.success) {
                    throw new Error(
                        result.message ??
                            `Failed to deploy to ${HOSTING_PROVIDER_LABELS[deployment.provider]}.`,
                    );
                }
            }
        } finally {
            await provider.destroy();
        }
    } catch (error) {
        console.error(error);
        await updateDeployment(db, {
            id: deploymentId,
            status: DeploymentStatus.FAILED,
            error: error instanceof Error ? error.message : 'Unknown error',
            progress: 100,
            envVars: deployment.envVars ?? {},
        });
        throw error;
    }
}
