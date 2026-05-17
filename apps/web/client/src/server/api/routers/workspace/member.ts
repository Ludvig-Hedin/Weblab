import { TRPCError } from '@trpc/server';
import { and, count, eq } from 'drizzle-orm';
import { z } from 'zod';

import { fromDbUser, workspaceMembers } from '@weblab/db';
import { AuditEventKind, WorkspaceRole } from '@weblab/models';

import { audit } from '../../permissions/audit';
import { requireCap } from '../../permissions/requireCap';
import { createTRPCRouter, protectedProcedure } from '../../trpc';

const ROLE_RANK: Record<WorkspaceRole, number> = {
    [WorkspaceRole.OWNER]: 3,
    [WorkspaceRole.ADMIN]: 2,
    [WorkspaceRole.MEMBER]: 1,
    [WorkspaceRole.VIEWER]: 0,
};

const workspaceRoleEnum = z.nativeEnum(WorkspaceRole);

export const workspaceMemberRouter = createTRPCRouter({
    /**
     * List members. Requires `workspace.view` minimum; cap layer enforces it.
     */
    list: protectedProcedure
        .input(z.object({ workspaceId: z.string().uuid() }))
        .query(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'workspace.view', {
                workspaceId: input.workspaceId,
            });
            const rows = await ctx.db.query.workspaceMembers.findMany({
                where: eq(workspaceMembers.workspaceId, input.workspaceId),
                with: { user: true },
                limit: 500,
            });
            return rows.map((r) => ({
                id: r.id,
                role: r.role,
                createdAt: r.createdAt,
                // @ts-expect-error - Drizzle relation pulls the full users row
                // but narrows the inferred type via Supabase auth.users overlap.
                user: r.user ? fromDbUser(r.user) : null,
            }));
        }),

    updateRole: protectedProcedure
        .input(
            z.object({
                workspaceId: z.string().uuid(),
                userId: z.string().uuid(),
                role: workspaceRoleEnum,
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const resource = await requireCap(ctx.db, ctx.user.id, 'workspace.manage_members', {
                workspaceId: input.workspaceId,
            });
            const callerRole = resource.workspaceRole;
            if (!callerRole) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a workspace member' });
            }

            const target = await ctx.db.query.workspaceMembers.findFirst({
                where: and(
                    eq(workspaceMembers.workspaceId, input.workspaceId),
                    eq(workspaceMembers.userId, input.userId),
                ),
            });
            if (!target) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });
            }

            // Cannot change the role of someone equal-or-higher than yourself.
            if (
                ROLE_RANK[target.role] >= ROLE_RANK[callerRole] &&
                callerRole !== WorkspaceRole.OWNER
            ) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'You cannot change the role of a peer or superior',
                });
            }
            // Cannot grant a role at or above your own (unless you are owner
            // granting non-owner roles).
            if (
                ROLE_RANK[input.role] >= ROLE_RANK[callerRole] &&
                !(callerRole === WorkspaceRole.OWNER && input.role !== WorkspaceRole.OWNER)
            ) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'Cannot grant a role at or above your own',
                });
            }
            // Owner role transfer is out of MVP scope.
            if (input.role === WorkspaceRole.OWNER || target.role === WorkspaceRole.OWNER) {
                // Last-owner guard if demoting the only owner.
                if (target.role === WorkspaceRole.OWNER && input.role !== WorkspaceRole.OWNER) {
                    const [{ value: ownerCount } = { value: 0 }] = await ctx.db
                        .select({ value: count() })
                        .from(workspaceMembers)
                        .where(
                            and(
                                eq(workspaceMembers.workspaceId, input.workspaceId),
                                eq(workspaceMembers.role, WorkspaceRole.OWNER),
                            ),
                        );
                    if (ownerCount <= 1) {
                        throw new TRPCError({
                            code: 'BAD_REQUEST',
                            message: 'Cannot demote the last owner',
                        });
                    }
                }
            }

            await ctx.db
                .update(workspaceMembers)
                .set({ role: input.role, updatedAt: new Date() })
                .where(
                    and(
                        eq(workspaceMembers.workspaceId, input.workspaceId),
                        eq(workspaceMembers.userId, input.userId),
                    ),
                );
            await audit(ctx.db, {
                event: AuditEventKind.WORKSPACE_MEMBER_ROLE_CHANGED,
                workspaceId: input.workspaceId,
                actorUserId: ctx.user.id,
                payload: { userId: input.userId, from: target.role, to: input.role },
            });
            return { ok: true };
        }),

    /**
     * Transfer workspace ownership from caller to another existing member.
     * Caller must be OWNER. Target becomes OWNER; caller demoted to ADMIN.
     * Unblocks "leave workspace" for the last owner.
     */
    transferOwnership: protectedProcedure
        .input(
            z.object({
                workspaceId: z.string().uuid(),
                toUserId: z.string().uuid(),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            const resource = await requireCap(ctx.db, ctx.user.id, 'workspace.manage_members', {
                workspaceId: input.workspaceId,
            });
            if (resource.workspaceRole !== WorkspaceRole.OWNER) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'Only an owner can transfer ownership',
                });
            }
            if (input.toUserId === ctx.user.id) {
                throw new TRPCError({
                    code: 'BAD_REQUEST',
                    message: 'You already own this workspace',
                });
            }
            const target = await ctx.db.query.workspaceMembers.findFirst({
                where: and(
                    eq(workspaceMembers.workspaceId, input.workspaceId),
                    eq(workspaceMembers.userId, input.toUserId),
                ),
            });
            if (!target) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Target user is not a workspace member',
                });
            }
            await ctx.db.transaction(async (tx) => {
                await tx
                    .update(workspaceMembers)
                    .set({ role: WorkspaceRole.OWNER, updatedAt: new Date() })
                    .where(
                        and(
                            eq(workspaceMembers.workspaceId, input.workspaceId),
                            eq(workspaceMembers.userId, input.toUserId),
                        ),
                    );
                await tx
                    .update(workspaceMembers)
                    .set({ role: WorkspaceRole.ADMIN, updatedAt: new Date() })
                    .where(
                        and(
                            eq(workspaceMembers.workspaceId, input.workspaceId),
                            eq(workspaceMembers.userId, ctx.user.id),
                        ),
                    );
            });
            await audit(ctx.db, {
                event: AuditEventKind.WORKSPACE_MEMBER_ROLE_CHANGED,
                workspaceId: input.workspaceId,
                actorUserId: ctx.user.id,
                payload: {
                    transferOwnership: true,
                    fromUserId: ctx.user.id,
                    toUserId: input.toUserId,
                },
            });
            return { ok: true };
        }),
    remove: protectedProcedure
        .input(z.object({ workspaceId: z.string().uuid(), userId: z.string().uuid() }))
        .mutation(async ({ ctx, input }) => {
            const resource = await requireCap(ctx.db, ctx.user.id, 'workspace.manage_members', {
                workspaceId: input.workspaceId,
            });
            const callerRole = resource.workspaceRole;
            if (!callerRole) {
                throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a workspace member' });
            }
            const target = await ctx.db.query.workspaceMembers.findFirst({
                where: and(
                    eq(workspaceMembers.workspaceId, input.workspaceId),
                    eq(workspaceMembers.userId, input.userId),
                ),
            });
            if (!target) {
                throw new TRPCError({ code: 'NOT_FOUND', message: 'Member not found' });
            }

            // Cannot remove a peer or superior.
            if (
                ROLE_RANK[target.role] >= ROLE_RANK[callerRole] &&
                ctx.user.id !== input.userId &&
                callerRole !== WorkspaceRole.OWNER
            ) {
                throw new TRPCError({
                    code: 'FORBIDDEN',
                    message: 'Cannot remove a peer or superior',
                });
            }

            if (target.role === WorkspaceRole.OWNER) {
                const [{ value: ownerCount } = { value: 0 }] = await ctx.db
                    .select({ value: count() })
                    .from(workspaceMembers)
                    .where(
                        and(
                            eq(workspaceMembers.workspaceId, input.workspaceId),
                            eq(workspaceMembers.role, WorkspaceRole.OWNER),
                        ),
                    );
                if (ownerCount <= 1) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message: 'Cannot remove the last owner',
                    });
                }
            }

            await ctx.db
                .delete(workspaceMembers)
                .where(
                    and(
                        eq(workspaceMembers.workspaceId, input.workspaceId),
                        eq(workspaceMembers.userId, input.userId),
                    ),
                );
            await audit(ctx.db, {
                event: AuditEventKind.WORKSPACE_MEMBER_REMOVED,
                workspaceId: input.workspaceId,
                actorUserId: ctx.user.id,
                payload: { userId: input.userId, role: target.role },
            });
            return { ok: true };
        }),
});
