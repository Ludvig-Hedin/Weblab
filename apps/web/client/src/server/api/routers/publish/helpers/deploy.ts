import { randomUUID } from 'crypto';
import { TRPCError } from '@trpc/server';
import { type FreestyleFile } from 'freestyle-sandboxes';

import type { Deployment, DrizzleDb } from '@weblab/db';
import type { DeploymentType } from '@weblab/models';
import { deployments } from '@weblab/db';
import { DeploymentStatus, HostingProvider } from '@weblab/models';

import { trackEvent } from '@/utils/analytics/server.ts';
import { HostingProviderFactory } from '../../domain/hosting-factory.ts';

export const deployFreestyle = async ({
    files,
    urls,
    envVars,
}: {
    files: Record<string, FreestyleFile>;
    urls: string[];
    envVars?: Record<string, string>;
}): Promise<{
    success: boolean;
    message?: string;
}> => {
    const entrypoint = 'server.js';
    const adapter = HostingProviderFactory.create(HostingProvider.FREESTYLE);
    const deploymentFiles: Record<string, { content: string; encoding?: 'utf-8' | 'base64' }> = {};
    for (const [path, file] of Object.entries(files)) {
        deploymentFiles[path] = {
            content: file.content,
            encoding: file.encoding === 'base64' ? 'base64' : 'utf-8',
        };
    }

    const result = await adapter.deploy({
        files: deploymentFiles,
        config: {
            domains: urls,
            entrypoint,
            envVars,
        },
    });

    if (!result.success) {
        throw new Error(result.message ?? 'Failed to deploy project');
    }

    return result;
};

export async function createDeployment({
    db,
    projectId,
    type,
    userId,
    sandboxId,
    buildScript,
    buildFlags,
    envVars,
    provider = HostingProvider.FREESTYLE,
}: {
    db: DrizzleDb;
    projectId: string;
    type: DeploymentType;
    userId: string;
    sandboxId: string;
    buildScript?: string;
    buildFlags?: string;
    envVars?: Record<string, string>;
    provider?: HostingProvider;
}): Promise<Deployment> {
    const [deployment] = await db
        .insert(deployments)
        .values({
            id: randomUUID(),
            projectId,
            sandboxId,
            type,
            buildScript,
            buildFlags,
            envVars,
            provider,
            status: DeploymentStatus.PENDING,
            requestedBy: userId,
            message: 'Creating deployment...',
            progress: 0,
        })
        .returning();

    if (!deployment) {
        throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create deployment',
        });
    }

    trackEvent({
        distinctId: userId,
        event: 'user_deployed_project',
        properties: {
            type,
            projectId,
            deploymentId: deployment.id,
        },
    });

    return deployment;
}
