import { TRPCError } from '@trpc/server';

import { type Deployment, type DrizzleDb } from '@weblab/db';
import { DeploymentStatus } from '@weblab/models';

import { deployFreestyle } from './deploy';
import { updateDeployment } from './helpers';

export const unpublish = async (db: DrizzleDb, deployment: Deployment, urls: string[]) => {
    if (!deployment) {
        throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Deployment not found',
        });
    }
    await updateDeployment(db, {
        id: deployment.id,
        status: DeploymentStatus.IN_PROGRESS,
        message: 'Unpublishing project...',
        progress: 20,
        envVars: deployment.envVars ?? {},
    });

    try {
        await deployFreestyle({
            files: {},
            urls,
            envVars: {},
        });

        await updateDeployment(db, {
            id: deployment.id,
            status: DeploymentStatus.COMPLETED,
            message: 'Project unpublished!',
            progress: 100,
            envVars: deployment.envVars ?? {},
        });
    } catch (error) {
        // CR-120: guard the terminal-status write so it never swallows the
        // original error. If updateDeployment itself throws, we log and
        // continue to re-throw the pipeline error.
        await updateDeployment(db, {
            id: deployment.id,
            status: DeploymentStatus.FAILED,
            error: error instanceof Error ? error.message : 'Unknown error',
            progress: 100,
            envVars: deployment.envVars ?? {},
        }).catch((statusErr: unknown) => {
            console.error('[unpublish] failed to write terminal FAILED status', statusErr);
        });
        throw error;
    }
};
