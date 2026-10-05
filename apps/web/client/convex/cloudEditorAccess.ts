import { v } from 'convex/values';

import type { Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { cloudEditorRole } from './cloudEditorAccessSchema';
import { can } from './lib/auth';
import { cloudError, cloudScope } from './lib/cloudEditor';
import { requireCap } from './lib/permissions';

export type CloudEditorRole = 'responsible' | 'designer' | 'content';
type Scope = { projectId: Id<'projects'>; branchId: Id<'branches'> };
type Context = MutationCtx | QueryCtx;
const rank: Record<CloudEditorRole, number> = { content: 1, designer: 2, responsible: 3 };
const MAX_MEMBERS = 100;

function requireEnabled() {
    if (process.env.WEBLAB_CLOUD_EDITOR_ENABLED !== 'true') cloudError('CLOUD_DISABLED');
}

/** A stored cloud grant never substitutes for current ordinary project access. */
export async function requireCloudAccess(ctx: Context, scope: Scope, minRole?: CloudEditorRole) {
    const legacy = await requireCap(ctx, 'project.view', { projectId: scope.projectId });
    const branch = await ctx.db.get(scope.branchId);
    const state = await ctx.db
        .query('cloudEditorStates')
        .withIndex('by_branchId', (q) => q.eq('branchId', scope.branchId))
        .unique();
    if (
        !branch ||
        branch.projectId !== scope.projectId ||
        !state ||
        state.projectId !== scope.projectId ||
        state.version !== 1 ||
        state.workspaceId !== legacy.workspace._id
    )
        return cloudError('CLOUD_NOT_ENROLLED');
    const grant = await ctx.db
        .query('cloudEditorGrants')
        .withIndex('by_projectId_userId', (q) =>
            q.eq('projectId', scope.projectId).eq('userId', legacy.user._id),
        )
        .unique();
    const creator = state.createdByUserId === legacy.user._id;
    const role: CloudEditorRole | null = grant?.role ?? (creator ? 'responsible' : null);
    const resource = {
        workspace: { id: legacy.workspace._id, createdByUserId: legacy.workspace.createdByUserId },
        workspaceRole: legacy.workspaceRole,
        project: {
            id: scope.projectId,
            accessMode: legacy.project!.accessMode,
            workspaceId: legacy.workspace._id,
        },
        projectRole: legacy.projectRole,
    };
    const update = can('project.update', resource);
    const canDesign = role !== null && rank[role] >= rank.designer && update;
    const canEditContent = role !== null;
    const canPublish = grant?.publish ?? creator;
    const canManage = role === 'responsible' && can('project.invite', resource);
    if (minRole) {
        requireEnabled();
        if (
            !role ||
            rank[role] < rank[minRole] ||
            (minRole !== 'content' && !update) ||
            (minRole === 'responsible' && !canManage)
        )
            return cloudError('CLOUD_ROLE_REQUIRED');
    }
    return { ...legacy, state, branch, role, canDesign, canEditContent, canPublish, canManage };
}

export const access = query({
    args: cloudScope,
    handler: async (ctx, scope) => {
        const { role, canDesign, canEditContent, canPublish, canManage } = await requireCloudAccess(
            ctx,
            scope,
        );
        return { role, canDesign, canEditContent, canPublish, canManage };
    },
});

/** A finite project allowance, not a fourth customer role or an open-ended subscription. */
export const previewAllowance = query({
    args: cloudScope,
    handler: async (ctx, scope) => {
        const { state } = await requireCloudAccess(ctx, scope);
        const allowance = state.contentPreviewAllowance;
        return allowance && allowance.expiresAt > Date.now() ? allowance : null;
    },
});

export const setPreviewAllowance = mutation({
    args: { ...cloudScope, starts: v.number() },
    handler: async (ctx, args) => {
        const { state } = await requireManager(ctx, args, true);
        if (!Number.isSafeInteger(args.starts) || args.starts < 0 || args.starts > 8)
            cloudError('CLOUD_INVALID_PREVIEW_ALLOWANCE');
        const generation = (state.contentPreviewAllowance?.generation ?? 0) + 1;
        if (!Number.isSafeInteger(generation)) cloudError('CLOUD_INVALID_PREVIEW_ALLOWANCE');
        await ctx.db.patch(state._id, {
            contentPreviewAllowance: {
                remainingStarts: args.starts,
                expiresAt: Date.now() + 24 * 60 * 60_000,
                generation,
            },
            ...(state.previewStartRequest?.kind === 'content'
                ? { previewStartRequest: undefined }
                : {}),
        });
        return null;
    },
});

async function requireManager(ctx: Context, scope: Scope, write = false) {
    const result = await requireCloudAccess(ctx, scope);
    if (!result.canManage) return cloudError('CLOUD_ROLE_REQUIRED');
    if (write) requireEnabled();
    return result;
}

export const listMembers = query({
    args: cloudScope,
    handler: async (ctx, scope) => {
        const { state, workspace, project } = await requireManager(ctx, scope);
        const grants = await ctx.db
            .query('cloudEditorGrants')
            .withIndex('by_projectId_userId', (q) => q.eq('projectId', scope.projectId))
            .take(MAX_MEMBERS + 1);
        if (grants.length > MAX_MEMBERS) return cloudError('CLOUD_MEMBER_LIMIT');
        const members = new Map(
            grants.map((grant) => [grant.userId, { role: grant.role, publish: grant.publish }]),
        );
        if (!members.has(state.createdByUserId))
            members.set(state.createdByUserId, { role: 'responsible', publish: true });
        return Promise.all(
            [...members].map(async ([userId, grant]) => {
                const user = await ctx.db.get(userId);
                const projectMember = await ctx.db
                    .query('projectMembers')
                    .withIndex('by_project_user', (q) =>
                        q.eq('projectId', scope.projectId).eq('userId', userId),
                    )
                    .unique();
                const workspaceMember = await ctx.db
                    .query('workspaceMembers')
                    .withIndex('by_workspace_user', (q) =>
                        q.eq('workspaceId', workspace._id).eq('userId', userId),
                    )
                    .unique();
                const active =
                    !!user &&
                    can('project.view', {
                        workspace: {
                            id: workspace._id,
                            createdByUserId: workspace.createdByUserId,
                        },
                        workspaceRole: workspaceMember?.role ?? null,
                        project: {
                            id: scope.projectId,
                            accessMode: project!.accessMode,
                            workspaceId: workspace._id,
                        },
                        projectRole: projectMember?.role ?? null,
                    });
                return {
                    userId,
                    email: user?.email ?? null,
                    displayName: user?.displayName ?? null,
                    ...grant,
                    active,
                    isCreator: userId === state.createdByUserId,
                };
            }),
        );
    },
});

export const setMember = mutation({
    args: { ...cloudScope, email: v.string(), role: cloudEditorRole, publish: v.boolean() },
    handler: async (ctx, args) => {
        const { state, workspace } = await requireManager(ctx, args, true);
        const email = args.email.trim();
        if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            return cloudError('CLOUD_INVALID_EMAIL');
        const normalized = email.toLowerCase();
        const users = await ctx.db
            .query('users')
            .withIndex('by_email', (q) => q.eq('email', normalized))
            .take(2);
        if (email !== normalized) {
            const exact = await ctx.db
                .query('users')
                .withIndex('by_email', (q) => q.eq('email', email))
                .take(2);
            for (const user of exact)
                if (!users.some((existing) => existing._id === user._id)) users.push(user);
        }
        if (users.length !== 1 || !users[0]?.clerkUserId)
            return cloudError('CLOUD_MEMBER_NOT_FOUND');
        const userId = users[0]._id;
        if (userId === state.createdByUserId && args.role !== 'responsible')
            return cloudError('CLOUD_CREATOR_PROTECTED');
        const workspaceMember = await ctx.db
            .query('workspaceMembers')
            .withIndex('by_workspace_user', (q) =>
                q.eq('workspaceId', workspace._id).eq('userId', userId),
            )
            .unique();
        if (
            args.role === 'content' &&
            (workspace.createdByUserId === userId ||
                workspaceMember?.role === 'owner' ||
                workspaceMember?.role === 'admin')
        )
            return cloudError('CLOUD_WORKSPACE_AUTHORITY_CONFLICT');
        const existing = await ctx.db
            .query('cloudEditorGrants')
            .withIndex('by_projectId_userId', (q) =>
                q.eq('projectId', args.projectId).eq('userId', userId),
            )
            .unique();
        if (!existing) {
            const members = await ctx.db
                .query('cloudEditorGrants')
                .withIndex('by_projectId_userId', (q) => q.eq('projectId', args.projectId))
                .take(MAX_MEMBERS);
            if (members.length >= MAX_MEMBERS) return cloudError('CLOUD_MEMBER_LIMIT');
        }
        const membership = await ctx.db
            .query('projectMembers')
            .withIndex('by_project_user', (q) =>
                q.eq('projectId', args.projectId).eq('userId', userId),
            )
            .unique();
        const updatedAt = Date.now();
        const role =
            args.role === 'responsible'
                ? 'manager'
                : args.role === 'designer'
                  ? 'editor'
                  : 'viewer';
        if (membership) await ctx.db.patch(membership._id, { role, updatedAt });
        else
            await ctx.db.insert('projectMembers', {
                projectId: args.projectId,
                userId,
                role,
                updatedAt,
            });
        if (existing)
            await ctx.db.patch(existing._id, { role: args.role, publish: args.publish, updatedAt });
        else
            await ctx.db.insert('cloudEditorGrants', {
                projectId: args.projectId,
                userId,
                role: args.role,
                publish: args.publish,
                updatedAt,
            });
        return { userId };
    },
});

export const removeMember = mutation({
    args: { ...cloudScope, userId: v.id('users') },
    handler: async (ctx, args) => {
        const { state } = await requireManager(ctx, args, true);
        if (args.userId === state.createdByUserId) return cloudError('CLOUD_CREATOR_PROTECTED');
        const removal = await ctx.db.query('cloudEditorMemberRemovals')
            .withIndex('by_projectId_userId', q => q.eq('projectId', args.projectId).eq('userId', args.userId)).unique();
        if (removal) await ctx.db.patch(removal._id, { removedAt: Date.now() });
        else await ctx.db.insert('cloudEditorMemberRemovals', { projectId: args.projectId, userId: args.userId, removedAt: Date.now() });
        const removedUser = await ctx.db.get(args.userId);
        if (removedUser?.email) {
            const pendingInvites = await ctx.db.query('cloudEditorInvitations')
                .withIndex('by_projectId_email', q => q.eq('projectId', args.projectId).eq('email', removedUser.email!.trim().toLowerCase())).take(501);
            if (pendingInvites.length > 500) return cloudError('CLOUD_INVITATION_LIMIT');
            for (const invite of pendingInvites) if (invite.status === 'pending') await ctx.db.patch(invite._id, { status: 'revoked' });
        }
        const grant = await ctx.db
            .query('cloudEditorGrants')
            .withIndex('by_projectId_userId', (q) =>
                q.eq('projectId', args.projectId).eq('userId', args.userId),
            )
            .unique();
        const membership = await ctx.db
            .query('projectMembers')
            .withIndex('by_project_user', (q) =>
                q.eq('projectId', args.projectId).eq('userId', args.userId),
            )
            .unique();
        const ticket = await ctx.db.query('cloudPreviewTickets')
            .withIndex('by_branchId_and_userId', q => q.eq('branchId', args.branchId).eq('userId', args.userId)).unique();
        if (ticket?.projectId === args.projectId) await ctx.db.delete(ticket._id);
        if (grant) await ctx.db.delete(grant._id);
        if (membership) await ctx.db.delete(membership._id);
        return null;
    },
});

/** Scheduled workers have no session. Resolve the request's stored actor against current records. */
export async function authorizeCloudPreviewStart(
    ctx: Context,
    scope: Scope,
    requestGeneration: number,
    token?: string,
): Promise<boolean> {
    if (process.env.WEBLAB_CLOUD_EDITOR_ENABLED !== 'true') return false;
    const state = await ctx.db
        .query('cloudEditorStates')
        .withIndex('by_branchId', (q) => q.eq('branchId', scope.branchId))
        .unique();
    const request = state?.previewStartRequest;
    if (
        !state ||
        state.projectId !== scope.projectId ||
        state.version !== 1 ||
        !request ||
        request.generation !== requestGeneration ||
        request.expiresAt <= Date.now() ||
        (request.reservedToken !== undefined && request.reservedToken !== token)
    )
        return false;
    const user = await ctx.db.get(request.actorId);
    const project = await ctx.db.get(scope.projectId);
    const branch = await ctx.db.get(scope.branchId);
    if (
        !user?.clerkUserId ||
        !project ||
        !branch ||
        branch.projectId !== project._id ||
        project.workspaceId !== state.workspaceId
    )
        return false;
    const workspace = await ctx.db.get(project.workspaceId);
    if (!workspace) return false;
    const workspaceMember = await ctx.db
        .query('workspaceMembers')
        .withIndex('by_workspace_user', (q) =>
            q.eq('workspaceId', workspace._id).eq('userId', user._id),
        )
        .unique();
    const projectMember = await ctx.db
        .query('projectMembers')
        .withIndex('by_project_user', (q) => q.eq('projectId', project._id).eq('userId', user._id))
        .unique();
    const resource = {
        workspace: { id: workspace._id, createdByUserId: workspace.createdByUserId },
        workspaceRole: workspaceMember?.role ?? null,
        project: { id: project._id, accessMode: project.accessMode, workspaceId: workspace._id },
        projectRole: projectMember?.role ?? null,
    };
    if (!can('project.view', resource)) return false;
    const grant = await ctx.db
        .query('cloudEditorGrants')
        .withIndex('by_projectId_userId', (q) =>
            q.eq('projectId', project._id).eq('userId', user._id),
        )
        .unique();
    const role = grant?.role ?? (state.createdByUserId === user._id ? 'responsible' : null);
    if (!role) return false;
    if (request.kind === 'design')
        return rank[role] >= rank.designer && can('project.update', resource);
    const allowance = state.contentPreviewAllowance;
    if (
        !allowance ||
        allowance.expiresAt <= Date.now() ||
        (allowance.generation ?? 0) !== request.allowanceGeneration
    )
        return false;
    return hasCloudPreviewLock(ctx, scope);
}

/** Content members may use a builder's resolved dependencies, never resolve or seal new ones. */
export async function hasCloudPreviewLock(ctx: Context, scope: Scope): Promise<boolean> {
    for (const path of ['bun.lock', 'bun.lockb']) {
        const file = await ctx.db
            .query('cloudEditorFiles')
            .withIndex('by_branchId_path', (q) => q.eq('branchId', scope.branchId).eq('path', path))
            .unique();
        if (
            file?.projectId === scope.projectId &&
            file.kind === 'file' &&
            file.bytes > 0 &&
            (typeof file.text === 'string' || file.storageId)
        )
            return true;
    }
    return false;
}
