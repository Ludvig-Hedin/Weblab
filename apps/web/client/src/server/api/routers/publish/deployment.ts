import { TRPCError } from '@trpc/server';
import { and, desc, eq, or } from 'drizzle-orm';
import { z } from 'zod';

import { deployments, deploymentUpdateSchema } from '@weblab/db';
import { DeploymentStatus, DeploymentType } from '@weblab/models';

import { createTRPCRouter, protectedProcedure } from '../../trpc';
import { verifyProjectAccess } from '../project/helper';
import { updateDeployment } from './helpers';
import { createDeployment, publish } from './helpers/index.ts';

export const deploymentRouter = createTRPCRouter({
    getByType: protectedProcedure
        .input(
            z.object({
                projectId: z.string(),
                type: z.nativeEnum(DeploymentType),
            }),
        )
        .query(async ({ ctx, input }) => {
            const { projectId, type } = input;
            await verifyProjectAccess(ctx.db, ctx.user.id, projectId);
            const deployment = await ctx.db.query.deployments.findFirst({
                where: and(eq(deployments.projectId, projectId), eq(deployments.type, type)),
                orderBy: desc(deployments.createdAt),
            });
            return deployment ?? null;
        }),
    update: protectedProcedure.input(deploymentUpdateSchema).mutation(async ({ ctx, input }) => {
        const existing = await ctx.db.query.deployments.findFirst({
            where: eq(deployments.id, input.id),
        });
        if (!existing) {
            throw new TRPCError({
                code: 'NOT_FOUND',
                message: 'Deployment not found',
            });
        }
        await verifyProjectAccess(ctx.db, ctx.user.id, existing.projectId);
        return await updateDeployment(ctx.db, input);
    }),
    create: protectedProcedure
        .input(
            z.object({
                projectId: z.string(),
                type: z.enum(DeploymentType),
                sandboxId: z.string(),
                buildScript: z.string().optional(),
                buildFlags: z.string().optional(),
                envVars: z.record(z.string(), z.string()).optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const { projectId, type, sandboxId, buildScript, buildFlags, envVars } = input;

            await verifyProjectAccess(ctx.db, ctx.user.id, projectId);

            const userId = ctx.user.id;

            const existingDeployment = await ctx.db.query.deployments.findFirst({
                where: and(
                    eq(deployments.projectId, projectId),
                    eq(deployments.type, type),
                    or(
                        eq(deployments.status, DeploymentStatus.IN_PROGRESS),
                        eq(deployments.status, DeploymentStatus.PENDING),
                    ),
                ),
            });
            if (existingDeployment) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message:
                        existingDeployment.status === DeploymentStatus.IN_PROGRESS
                            ? 'Deployment in progress'
                            : 'Deployment already exists',
                });
            }

            return await createDeployment({
                db: ctx.db,
                projectId,
                type,
                userId,
                sandboxId,
                buildScript,
                buildFlags,
                envVars,
            });
        }),
    run: protectedProcedure
        .input(
            z.object({
                deploymentId: z.string(),
            }),
        )
        .mutation(async ({ ctx, input }): Promise<void> => {
            const { deploymentId } = input;
            const deploymentRow = await ctx.db.query.deployments.findFirst({
                where: eq(deployments.id, deploymentId),
            });
            if (!deploymentRow) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Deployment not found',
                });
            }
            await verifyProjectAccess(ctx.db, ctx.user.id, deploymentRow.projectId);
            const existingDeployment = await ctx.db.query.deployments.findFirst({
                where: and(
                    eq(deployments.id, deploymentId),
                    or(
                        eq(deployments.status, DeploymentStatus.IN_PROGRESS),
                        eq(deployments.status, DeploymentStatus.PENDING),
                    ),
                ),
            });
            if (!existingDeployment) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Deployment not found',
                });
            }
            if (existingDeployment.status === DeploymentStatus.IN_PROGRESS) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Deployment in progress',
                });
            }
            if (existingDeployment.status === DeploymentStatus.CANCELLED) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Deployment cancelled',
                });
            }
            try {
                await publish({
                    db: ctx.db,
                    deployment: existingDeployment,
                    sandboxId: existingDeployment.sandboxId!,
                });
                await updateDeployment(ctx.db, {
                    id: deploymentId,
                    status: DeploymentStatus.COMPLETED,
                    message: 'Deployment Success!',
                    envVars: existingDeployment.envVars ?? {},
                });
            } catch (error) {
                console.error(error);
                await updateDeployment(ctx.db, {
                    id: deploymentId,
                    status: DeploymentStatus.FAILED,
                    message: 'Failed to publish deployment',
                    envVars: existingDeployment.envVars ?? {},
                });
                throw error;
            }
        }),
    cancel: protectedProcedure
        .input(
            z.object({
                deploymentId: z.string(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const { deploymentId } = input;
            const deployment = await ctx.db.query.deployments.findFirst({
                where: eq(deployments.id, deploymentId),
            });

            if (!deployment) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Deployment not found',
                });
            }
            await verifyProjectAccess(ctx.db, ctx.user.id, deployment.projectId);

            await updateDeployment(ctx.db, {
                id: deploymentId,
                status: DeploymentStatus.CANCELLED,
                message: 'Cancelled by user',
                envVars: deployment.envVars ?? {},
            });
        }),
});
