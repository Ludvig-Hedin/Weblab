import { TRPCError } from '@trpc/server';
import { and, eq, ne } from 'drizzle-orm';
import { z } from 'zod';

import { fromDbUser, projects, userProjects, users } from '@weblab/db';
import { AuditEventKind, ProjectAccessMode, ProjectMemberRole, ProjectRole } from '@weblab/models';

import { audit } from '../../permissions/audit';
import { requireCap } from '../../permissions/requireCap';
import { createTRPCRouter, protectedProcedure } from '../../trpc';

const PROJECT_ROLE_TO_MEMBER_ROLE: Record<ProjectRole, ProjectMemberRole> = {
    [ProjectRole.OWNER]: ProjectMemberRole.MANAGER,
    [ProjectRole.ADMIN]: ProjectMemberRole.MANAGER,
    [ProjectRole.EDITOR]: ProjectMemberRole.EDITOR,
    [ProjectRole.VIEWER]: ProjectMemberRole.VIEWER,
};

const MEMBER_ROLE_TO_PROJECT_ROLE: Record<ProjectMemberRole, ProjectRole> = {
    [ProjectMemberRole.MANAGER]: ProjectRole.ADMIN,
    [ProjectMemberRole.EDITOR]: ProjectRole.EDITOR,
    [ProjectMemberRole.REVIEWER]: ProjectRole.VIEWER,
    [ProjectMemberRole.VIEWER]: ProjectRole.VIEWER,
};

const effectiveMemberRole = (row: {
    role: ProjectRole;
    memberRole: ProjectMemberRole | null;
}): ProjectMemberRole => row.memberRole ?? PROJECT_ROLE_TO_MEMBER_ROLE[row.role];

/**
 * Last-manager-on-restricted guard. Returns true if removing/demoting the
 * given user would leave a restricted project with zero managers. Workspace
 * owners/admins still have recovery access, but the explicit project
 * manager seat must stay non-empty per spec §17.
 */
async function wouldLeaveRestrictedProjectWithoutManager(
    db: Parameters<typeof requireCap>[0] & {
        select: (...args: unknown[]) => unknown;
    },
    projectId: string,
    targetUserId: string,
): Promise<boolean> {
    const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId),
        columns: { accessMode: true },
    });
    if (!project || project.accessMode !== ProjectAccessMode.RESTRICTED) {
        return false;
    }
    // Widen for select — ctx.db at runtime is the full DrizzleDb. The narrow
    // permissions-helper type doesn't expose `select`.
    const fullDb = db as unknown as import('@weblab/db').DrizzleDb;
    const others = await fullDb
        .select({
            userId: userProjects.userId,
            role: userProjects.role,
            memberRole: userProjects.memberRole,
        })
        .from(userProjects)
        .where(and(eq(userProjects.projectId, projectId), ne(userProjects.userId, targetUserId)));
    const otherManagers = others.filter(
        (m: { role: string; memberRole: ProjectMemberRole | null }) =>
            effectiveMemberRole({
                role: m.role as ProjectRole,
                memberRole: m.memberRole,
            }) === ProjectMemberRole.MANAGER,
    );
    return otherManagers.length === 0;
}

export const memberRouter = createTRPCRouter({
    list: protectedProcedure
        .input(z.object({ projectId: z.string() }))
        .query(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'project.view', {
                projectId: input.projectId,
            });
            const rows = await ctx.db
                .select({
                    role: userProjects.role,
                    memberRole: userProjects.memberRole,
                    user: {
                        id: users.id,
                        firstName: users.firstName,
                        lastName: users.lastName,
                        displayName: users.displayName,
                        avatarUrl: users.avatarUrl,
                        email: users.email,
                        createdAt: users.createdAt,
                        updatedAt: users.updatedAt,
                        stripeCustomerId: users.stripeCustomerId,
                        githubInstallationId: users.githubInstallationId,
                    },
                })
                .from(userProjects)
                .innerJoin(users, eq(userProjects.userId, users.id))
                .where(eq(userProjects.projectId, input.projectId));

            return rows.map((row) => ({
                // Keep legacy `role` (ProjectRole) for backwards compatibility
                // with existing UI (`member-row.tsx`, `members-content.tsx`).
                // Phase 9 drops the legacy field; until then both are returned.
                role: row.role as ProjectRole,
                memberRole: effectiveMemberRole({
                    role: row.role as ProjectRole,
                    memberRole: row.memberRole,
                }),
                user: fromDbUser(row.user),
            }));
        }),
    remove: protectedProcedure
        .input(z.object({ userId: z.string(), projectId: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const isSelfLeave = input.userId === ctx.user.id;
            if (!isSelfLeave) {
                await requireCap(ctx.db, ctx.user.id, 'project.invite', {
                    projectId: input.projectId,
                });
            }

            const target = await ctx.db.query.userProjects.findFirst({
                where: and(
                    eq(userProjects.userId, input.userId),
                    eq(userProjects.projectId, input.projectId),
                ),
            });
            if (!target) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Membership not found',
                });
            }

            const targetMemberRole = effectiveMemberRole({
                role: target.role as ProjectRole,
                memberRole: target.memberRole,
            });
            if (targetMemberRole === ProjectMemberRole.MANAGER) {
                const wouldOrphan = await wouldLeaveRestrictedProjectWithoutManager(
                    ctx.db,
                    input.projectId,
                    input.userId,
                );
                if (wouldOrphan) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message:
                            'Cannot remove the last manager on a restricted project. Add another manager first or change the project access mode.',
                    });
                }
            }

            await ctx.db
                .delete(userProjects)
                .where(
                    and(
                        eq(userProjects.userId, input.userId),
                        eq(userProjects.projectId, input.projectId),
                    ),
                );

            await audit(ctx.db, {
                event: AuditEventKind.PROJECT_MEMBER_REMOVED,
                projectId: input.projectId,
                actorUserId: ctx.user.id,
                payload: { userId: input.userId, selfLeave: isSelfLeave },
            });

            return { ok: true };
        }),
    updateRole: protectedProcedure
        .input(
            z.object({
                projectId: z.string(),
                userId: z.string(),
                memberRole: z.nativeEnum(ProjectMemberRole),
            }),
        )
        .mutation(async ({ ctx, input }) => {
            await requireCap(ctx.db, ctx.user.id, 'project.invite', {
                projectId: input.projectId,
            });
            const target = await ctx.db.query.userProjects.findFirst({
                where: and(
                    eq(userProjects.userId, input.userId),
                    eq(userProjects.projectId, input.projectId),
                ),
            });
            if (!target) {
                throw new TRPCError({
                    code: 'NOT_FOUND',
                    message: 'Membership not found',
                });
            }
            const currentMemberRole = effectiveMemberRole({
                role: target.role as ProjectRole,
                memberRole: target.memberRole,
            });
            if (
                currentMemberRole === ProjectMemberRole.MANAGER &&
                input.memberRole !== ProjectMemberRole.MANAGER
            ) {
                const wouldOrphan = await wouldLeaveRestrictedProjectWithoutManager(
                    ctx.db,
                    input.projectId,
                    input.userId,
                );
                if (wouldOrphan) {
                    throw new TRPCError({
                        code: 'BAD_REQUEST',
                        message:
                            'Cannot demote the last manager on a restricted project. Promote another member first or change the project access mode.',
                    });
                }
            }
            await ctx.db
                .update(userProjects)
                .set({
                    role: MEMBER_ROLE_TO_PROJECT_ROLE[input.memberRole],
                    memberRole: input.memberRole,
                })
                .where(
                    and(
                        eq(userProjects.userId, input.userId),
                        eq(userProjects.projectId, input.projectId),
                    ),
                );
            await audit(ctx.db, {
                event: AuditEventKind.PROJECT_MEMBER_ROLE_CHANGED,
                projectId: input.projectId,
                actorUserId: ctx.user.id,
                payload: {
                    userId: input.userId,
                    from: currentMemberRole,
                    to: input.memberRole,
                },
            });
            return { ok: true };
        }),
});
