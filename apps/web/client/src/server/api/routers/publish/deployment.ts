import { TRPCError } from '@trpc/server';
import { and, desc, eq, or } from 'drizzle-orm';
import { z } from 'zod';

import { deployments, deploymentUpdateSchema } from '@weblab/db';
import { DeploymentStatus, DeploymentType, HostingProvider } from '@weblab/models';

import { requireCap } from '@/server/api/permissions/requireCap';
import { createTRPCRouter, protectedProcedure } from '../../trpc';
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
            await requireCap(ctx.db, ctx.user.id, 'project.view', { projectId: projectId });
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
        await requireCap(ctx.db, ctx.user.id, 'project.deploy', { projectId: existing.projectId });
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
                provider: z.enum(HostingProvider).optional(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const { projectId, type, sandboxId, buildScript, buildFlags, envVars, provider } =
                input;

            await requireCap(ctx.db, ctx.user.id, 'project.publish', { projectId: projectId });

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
                provider,
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
            await requireCap(ctx.db, ctx.user.id, 'project.publish', {
                projectId: deploymentRow.projectId,
            });
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
            await requireCap(ctx.db, ctx.user.id, 'project.deploy', {
                projectId: deployment.projectId,
            });

            await updateDeployment(ctx.db, {
                id: deploymentId,
                status: DeploymentStatus.CANCELLED,
                message: 'Cancelled by user',
                envVars: deployment.envVars ?? {},
            });
        }),
    list: protectedProcedure
        .input(
            z.object({
                projectId: z.string(),
                limit: z.number().int().min(1).max(100).optional(),
            }),
        )
        .query(async ({ ctx, input }) => {
            const { projectId, limit = 25 } = input;
            await requireCap(ctx.db, ctx.user.id, 'project.view', { projectId: projectId });
            return ctx.db.query.deployments.findMany({
                where: eq(deployments.projectId, projectId),
                orderBy: desc(deployments.createdAt),
                limit,
            });
        }),
    redeploy: protectedProcedure
        .input(
            z.object({
                deploymentId: z.string(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const source = await ctx.db.query.deployments.findFirst({
                where: eq(deployments.id, input.deploymentId),
            });
            if (!source) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Deployment not found',
                });
            }
            await requireCap(ctx.db, ctx.user.id, 'project.deploy', {
                projectId: source.projectId,
            });
            if (!source.sandboxId) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'Original deployment has no sandbox; cannot redeploy.',
                });
            }
            const inFlight = await ctx.db.query.deployments.findFirst({
                where: and(
                    eq(deployments.projectId, source.projectId),
                    eq(deployments.type, source.type),
                    or(
                        eq(deployments.status, DeploymentStatus.IN_PROGRESS),
                        eq(deployments.status, DeploymentStatus.PENDING),
                    ),
                ),
            });
            if (inFlight) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'A deployment is already in progress for this target.',
                });
            }
            return createDeployment({
                db: ctx.db,
                projectId: source.projectId,
                type: source.type,
                userId: ctx.user.id,
                sandboxId: source.sandboxId,
                buildScript: source.buildScript ?? undefined,
                buildFlags: source.buildFlags ?? undefined,
                envVars: source.envVars ?? undefined,
                provider: source.provider,
            });
        }),
});
