import { v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { audit } from './lib/audit';
import { vProjectMemberRole } from './lib/enums';
import { requireCap, requireUser } from './lib/permissions';

const MANAGER = 'manager' as const;

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Last-manager-on-restricted guard. Returns true if removing/demoting the
 * given user would leave a restricted project with zero managers.
 */
async function wouldLeaveRestrictedProjectWithoutManager(
    ctx: QueryCtx | MutationCtx,
    projectId: Id<'projects'>,
    targetUserId: Id<'users'>,
): Promise<boolean> {
    const project = await ctx.db.get(projectId);
    if (!project || project.accessMode !== 'restricted') return false;

    const others = await ctx.db
        .query('projectMembers')
        .withIndex('by_project_user', (q) => q.eq('projectId', projectId))
        .collect();
    const otherManagers = others.filter((m) => m.userId !== targetUserId && m.role === MANAGER);
    return otherManagers.length === 0;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Lists explicit project members joined with their user records.
 */
export const list = query({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        await requireCap(ctx, 'project.view', { projectId });
        const rows = await ctx.db
            .query('projectMembers')
            .withIndex('by_project_user', (q) => q.eq('projectId', projectId))
            .collect();
        return Promise.all(
            rows.map(async (m) => {
                const u = await ctx.db.get(m.userId);
                return {
                    memberRole: m.role,
                    user: u
                        ? {
                              id: u._id,
                              email: u.email ?? null,
                              firstName: u.firstName ?? null,
                              lastName: u.lastName ?? null,
                              displayName: u.displayName ?? u.firstName ?? u.email ?? null,
                              avatarUrl: u.avatarUrl ?? null,
                          }
                        : null,
                };
            }),
        );
    },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Remove a member from a project. Self-leave is allowed even without invite
 * cap. Refuses to leave a restricted project without a remaining manager.
 */
export const remove = mutation({
    args: { projectId: v.id('projects'), userId: v.id('users') },
    handler: async (ctx, { projectId, userId }) => {
        const caller = await requireUser(ctx);
        const isSelfLeave = userId === caller._id;
        if (!isSelfLeave) {
            await requireCap(ctx, 'project.invite', { projectId });
        }

        const target = await ctx.db
            .query('projectMembers')
            .withIndex('by_project_user', (q) => q.eq('projectId', projectId).eq('userId', userId))
            .unique();
        if (!target) throw new Error('NOT_FOUND: Membership not found');

        if (target.role === MANAGER) {
            const wouldOrphan = await wouldLeaveRestrictedProjectWithoutManager(
                ctx,
                projectId,
                userId,
            );
            if (wouldOrphan) {
                throw new Error(
                    'BAD_REQUEST: Cannot remove the last manager on a restricted project. Add another manager first or change the project access mode.',
                );
            }
        }

        await ctx.db.delete(target._id);

        await audit(ctx, {
            event: 'project_member.removed',
            projectId,
            actorUserId: caller._id,
            payload: { userId, selfLeave: isSelfLeave },
        });

        return { ok: true } as const;
    },
});

/**
 * Update a member's project role. Refuses to demote the last manager on a
 * restricted project.
 */
export const updateRole = mutation({
    args: {
        projectId: v.id('projects'),
        userId: v.id('users'),
        memberRole: vProjectMemberRole,
    },
    handler: async (ctx, { projectId, userId, memberRole }) => {
        const { user } = await requireCap(ctx, 'project.invite', { projectId });
        const target = await ctx.db
            .query('projectMembers')
            .withIndex('by_project_user', (q) => q.eq('projectId', projectId).eq('userId', userId))
            .unique();
        if (!target) throw new Error('NOT_FOUND: Membership not found');

        if (target.role === MANAGER && memberRole !== MANAGER) {
            const wouldOrphan = await wouldLeaveRestrictedProjectWithoutManager(
                ctx,
                projectId,
                userId,
            );
            if (wouldOrphan) {
                throw new Error(
                    'BAD_REQUEST: Cannot demote the last manager on a restricted project. Promote another member first or change the project access mode.',
                );
            }
        }

        await ctx.db.patch(target._id, { role: memberRole, updatedAt: Date.now() });

        await audit(ctx, {
            event: 'project_member.role_changed',
            projectId,
            actorUserId: user._id,
            payload: { userId, from: target.role, to: memberRole },
        });

        return (await ctx.db.get(target._id))!;
    },
});
