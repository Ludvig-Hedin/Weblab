import { v } from 'convex/values';
import type { Id } from './_generated/dataModel';
import type { MutationCtx } from './_generated/server';
import { internalMutation, mutation, query } from './_generated/server';
import { cloudEditorRole } from './cloudEditorAccessSchema';
import { requireCloudAccess } from './cloudEditorAccess';
import { can } from './lib/auth';
import { cloudError, cloudScope } from './lib/cloudEditor';
import { requireUserJIT } from './lib/permissions';

const WEEK = 7 * 24 * 60 * 60_000;
const normalizeEmail = (email: string) => email.trim().toLowerCase();
const invalid = () => cloudError('CLOUD_INVITATION_UNAVAILABLE');

/** The inviter's authority is read again inside claim, not remembered from creation. */
async function currentIssuer(ctx: MutationCtx, scope: { projectId: Id<'projects'>; branchId: Id<'branches'> }, issuerId: Id<'users'>) {
    const project = await ctx.db.get(scope.projectId);
    const branch = await ctx.db.get(scope.branchId);
    const state = await ctx.db.query('cloudEditorStates').withIndex('by_branchId', q => q.eq('branchId', scope.branchId)).unique();
    if (!project || !branch || branch.projectId !== project._id || !state || state.version !== 1 ||
        state.projectId !== project._id || state.workspaceId !== project.workspaceId) return invalid();
    const workspace = await ctx.db.get(project.workspaceId);
    const issuer = await ctx.db.get(issuerId);
    if (!workspace || !issuer?.clerkUserId) return invalid();
    const wm = await ctx.db.query('workspaceMembers').withIndex('by_workspace_user', q => q.eq('workspaceId', workspace._id).eq('userId', issuerId)).unique();
    const pm = await ctx.db.query('projectMembers').withIndex('by_project_user', q => q.eq('projectId', project._id).eq('userId', issuerId)).unique();
    const grant = await ctx.db.query('cloudEditorGrants').withIndex('by_projectId_userId', q => q.eq('projectId', project._id).eq('userId', issuerId)).unique();
    const role = grant?.role ?? (state.createdByUserId === issuerId ? 'responsible' : null);
    const resource = { workspace: { id: workspace._id, createdByUserId: workspace.createdByUserId }, workspaceRole: wm?.role ?? null,
        project: { id: project._id, accessMode: project.accessMode, workspaceId: workspace._id }, projectRole: pm?.role ?? null };
    if (role !== 'responsible' || !can('project.view', resource) || !can('project.invite', resource)) return invalid();
    return { workspace, state };
}

export const _create = internalMutation({
    args: { ...cloudScope, subject: v.string(), email: v.string(), role: cloudEditorRole, publish: v.boolean(), tokenHash: v.string() },
    handler: async (ctx, args) => {
        const auth = await ctx.auth.getUserIdentity();
        const access = await requireCloudAccess(ctx, args, 'responsible');
        if (auth?.subject !== args.subject || access.user.clerkUserId !== args.subject) return invalid();
        const email = normalizeEmail(args.email);
        if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^[a-f0-9]{64}$/.test(args.tokenHash)) return invalid();
        const rows = await ctx.db.query('cloudEditorInvitations').withIndex('by_projectId', q => q.eq('projectId', args.projectId)).take(501);
        if (rows.length > 500 || rows.filter(r => r.status === 'pending' && r.expiresAt > Date.now()).length >= 20) return cloudError('CLOUD_INVITATION_LIMIT');
        if (rows.some(r => r.email === email && r.status === 'pending' && r.expiresAt > Date.now())) return cloudError('CLOUD_INVITATION_EXISTS');
        return ctx.db.insert('cloudEditorInvitations', {
            projectId: args.projectId, branchId: args.branchId, issuerId: access.user._id,
            email, role: args.role, publish: args.publish, tokenHash: args.tokenHash,
            createdAt: Date.now(), expiresAt: Date.now() + WEEK, status: 'pending',
        });
    },
});

export const list = query({
    args: cloudScope,
    handler: async (ctx, scope) => {
        const access = await requireCloudAccess(ctx, scope);
        if (!access.canManage) return cloudError('CLOUD_ROLE_REQUIRED');
        const rows = await ctx.db.query('cloudEditorInvitations').withIndex('by_projectId', q => q.eq('projectId', scope.projectId)).take(501);
        return rows.filter(r => r.branchId === scope.branchId && r.status === 'pending' && r.expiresAt > Date.now())
            .map(r => ({ id: r._id, email: r.email, role: r.role, publish: r.publish, expiresAt: r.expiresAt }));
    },
});

export const revoke = mutation({
    args: { ...cloudScope, invitationId: v.id('cloudEditorInvitations') },
    handler: async (ctx, args) => {
        await requireCloudAccess(ctx, args, 'responsible');
        const row = await ctx.db.get(args.invitationId);
        if (!row || row.projectId !== args.projectId || row.branchId !== args.branchId) return invalid();
        if (row.status === 'pending') await ctx.db.patch(row._id, { status: 'revoked' });
        return null;
    },
});

/** Verified addresses come only from the authenticated Node action's Clerk lookup. */
export const _claim = internalMutation({
    args: { invitationId: v.id('cloudEditorInvitations'), tokenHash: v.string(), subject: v.string(), verifiedEmails: v.array(v.string()), verifiedAt: v.number() },
    handler: async (ctx, args) => {
        if (process.env.WEBLAB_CLOUD_EDITOR_ENABLED !== 'true') return cloudError('CLOUD_DISABLED');
        const identity = await ctx.auth.getUserIdentity();
        if (!identity || identity.subject !== args.subject || args.verifiedAt > Date.now() || args.verifiedAt < Date.now() - 60_000) return invalid();
        const invitation = await ctx.db.get(args.invitationId);
        if (!invitation || invitation.tokenHash !== args.tokenHash || invitation.status === 'revoked' ||
            !args.verifiedEmails.some(email => normalizeEmail(email) === invitation.email)) return invalid();
        const user = await requireUserJIT(ctx);
        const scope = { projectId: invitation.projectId, branchId: invitation.branchId };
        if (invitation.status === 'accepted') {
            if (invitation.acceptedBy !== user._id) return invalid();
            await requireCloudAccess(ctx, scope, 'content');
            return scope;
        }
        if (invitation.expiresAt <= Date.now()) return invalid();
        const { workspace, state } = await currentIssuer(ctx, scope, invitation.issuerId);
        const removal = await ctx.db.query('cloudEditorMemberRemovals')
            .withIndex('by_projectId_userId', q => q.eq('projectId', scope.projectId).eq('userId', user._id)).unique();
        // A pending invitation to any verified alias must not resurrect removed access.
        if (removal && invitation.createdAt <= removal.removedAt) return invalid();
        if (state.createdByUserId === user._id) return invalid();
        const existing = await ctx.db.query('cloudEditorGrants').withIndex('by_projectId_userId', q => q.eq('projectId', scope.projectId).eq('userId', user._id)).unique();
        const membership = await ctx.db.query('projectMembers').withIndex('by_project_user', q => q.eq('projectId', scope.projectId).eq('userId', user._id)).unique();
        if (existing || membership) return cloudError('CLOUD_INVITATION_MEMBER_EXISTS');
        const wm = await ctx.db.query('workspaceMembers').withIndex('by_workspace_user', q => q.eq('workspaceId', workspace._id).eq('userId', user._id)).unique();
        if (invitation.role === 'content' && (workspace.createdByUserId === user._id || wm?.role === 'owner' || wm?.role === 'admin')) return cloudError('CLOUD_WORKSPACE_AUTHORITY_CONFLICT');
        const grants = await ctx.db.query('cloudEditorGrants').withIndex('by_projectId_userId', q => q.eq('projectId', scope.projectId)).take(100);
        if (grants.length >= 100) return cloudError('CLOUD_MEMBER_LIMIT');
        const updatedAt = Date.now();
        await ctx.db.insert('projectMembers', { projectId: scope.projectId, userId: user._id,
            role: invitation.role === 'responsible' ? 'manager' : invitation.role === 'designer' ? 'editor' : 'viewer', updatedAt });
        await ctx.db.insert('cloudEditorGrants', { projectId: scope.projectId, userId: user._id, role: invitation.role, publish: invitation.publish, updatedAt });
        await ctx.db.patch(invitation._id, { status: 'accepted', acceptedBy: user._id });
        return scope;
    },
});
