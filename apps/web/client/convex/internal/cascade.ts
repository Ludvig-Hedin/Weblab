import { v } from 'convex/values';

import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import { internalMutation } from '../_generated/server';

// Manual cascade helpers — Convex has no FK constraints. Every
// `onDelete: 'cascade'` from Drizzle is owned by code here. Call these from
// the corresponding public mutations (workspace.remove, projects.remove,
// etc.) or from the Clerk webhook user.deleted handler.
//
// These are `internalMutation` so they can't be invoked from client code —
// public mutations wrap them.

// ─── Low-level fan-out helpers ───────────────────────────────────────────────

async function deleteCanvasInternal(ctx: MutationCtx, canvasId: Id<'canvases'>) {
    const frames = await ctx.db
        .query('frames')
        .withIndex('by_canvas', (q) => q.eq('canvasId', canvasId))
        .collect();
    for (const f of frames) await ctx.db.delete(f._id);

    const userCanvases = await ctx.db
        .query('userCanvases')
        .withIndex('by_canvas', (q) => q.eq('canvasId', canvasId))
        .collect();
    for (const uc of userCanvases) await ctx.db.delete(uc._id);

    await ctx.db.delete(canvasId);
}

async function deleteBranchInternal(ctx: MutationCtx, branchId: Id<'branches'>) {
    const frames = await ctx.db
        .query('frames')
        .withIndex('by_branch', (q) => q.eq('branchId', branchId))
        .collect();
    for (const f of frames) await ctx.db.delete(f._id);
    await ctx.db.delete(branchId);
}

async function deleteConversationInternal(ctx: MutationCtx, conversationId: Id<'conversations'>) {
    const messages = await ctx.db
        .query('messages')
        .withIndex('by_conversation', (q) => q.eq('conversationId', conversationId))
        .collect();
    for (const m of messages) await ctx.db.delete(m._id);
    await ctx.db.delete(conversationId);
}

async function deleteCommentInternal(ctx: MutationCtx, commentId: Id<'projectComments'>) {
    const replies = await ctx.db
        .query('commentReplies')
        .withIndex('by_comment', (q) => q.eq('commentId', commentId))
        .collect();
    for (const r of replies) await ctx.db.delete(r._id);
    await ctx.db.delete(commentId);
}

async function deleteCmsCollectionInternal(ctx: MutationCtx, collectionId: Id<'cmsCollections'>) {
    const fields = await ctx.db
        .query('cmsFields')
        .withIndex('by_collection', (q) => q.eq('collectionId', collectionId))
        .collect();
    for (const f of fields) await ctx.db.delete(f._id);

    const items = await ctx.db
        .query('cmsItems')
        .withIndex('by_collection', (q) => q.eq('collectionId', collectionId))
        .collect();
    for (const i of items) await ctx.db.delete(i._id);

    const pages = await ctx.db
        .query('cmsCollectionPages')
        .withIndex('by_collection', (q) => q.eq('collectionId', collectionId))
        .collect();
    for (const p of pages) await ctx.db.delete(p._id);

    await ctx.db.delete(collectionId);
}

async function deleteCmsSourceInternal(ctx: MutationCtx, sourceId: Id<'cmsSources'>) {
    const collections = await ctx.db
        .query('cmsCollections')
        .withIndex('by_source', (q) => q.eq('sourceId', sourceId))
        .collect();
    for (const c of collections) await deleteCmsCollectionInternal(ctx, c._id);
    await ctx.db.delete(sourceId);
}

async function deleteCustomDomainInternal(ctx: MutationCtx, customDomainId: Id<'customDomains'>) {
    const pcds = await ctx.db
        .query('projectCustomDomains')
        .withIndex('by_domain_project', (q) => q.eq('customDomainId', customDomainId))
        .collect();
    for (const p of pcds) await ctx.db.delete(p._id);

    const verifs = await ctx.db
        .query('customDomainVerification')
        .withIndex('by_custom_domain', (q) => q.eq('customDomainId', customDomainId))
        .collect();
    for (const v of verifs) await ctx.db.delete(v._id);

    await ctx.db.delete(customDomainId);
}

async function deleteSubscriptionInternal(ctx: MutationCtx, subscriptionId: Id<'subscriptions'>) {
    const limits = await ctx.db
        .query('rateLimits')
        .withIndex('by_subscription', (q) => q.eq('subscriptionId', subscriptionId))
        .collect();
    for (const l of limits) await ctx.db.delete(l._id);
    await ctx.db.delete(subscriptionId);
}

async function deleteProjectInternal(ctx: MutationCtx, projectId: Id<'projects'>) {
    // Project-scoped fan-outs (order: leaf-first where possible).

    // Canvas (→ frames + userCanvases)
    const canvases = await ctx.db
        .query('canvases')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect();
    for (const c of canvases) await deleteCanvasInternal(ctx, c._id);

    // Branches (→ frames already handled if branch FK)
    const branches = await ctx.db
        .query('branches')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect();
    for (const b of branches) await deleteBranchInternal(ctx, b._id);

    // Project settings
    const settings = await ctx.db
        .query('projectSettings')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect();
    for (const s of settings) await ctx.db.delete(s._id);

    // Project invitations
    const invites = await ctx.db
        .query('projectInvitations')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect();
    for (const i of invites) await ctx.db.delete(i._id);

    // Project members
    const members = await ctx.db
        .query('projectMembers')
        .withIndex('by_project_user', (q) => q.eq('projectId', projectId))
        .collect();
    for (const m of members) await ctx.db.delete(m._id);

    // Offline pins
    const pins = await ctx.db
        .query('projectOfflinePins')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect();
    for (const p of pins) await ctx.db.delete(p._id);

    // Page access
    const access = await ctx.db
        .query('pageAccess')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect();
    for (const a of access) await ctx.db.delete(a._id);

    // Create requests
    const reqs = await ctx.db
        .query('projectCreateRequests')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect();
    for (const r of reqs) await ctx.db.delete(r._id);

    // Conversations (→ messages)
    const conversations = await ctx.db
        .query('conversations')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect();
    for (const c of conversations) await deleteConversationInternal(ctx, c._id);

    // Comments (→ replies)
    const comments = await ctx.db
        .query('projectComments')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect();
    for (const c of comments) await deleteCommentInternal(ctx, c._id);

    // CMS sources (→ collections → fields/items/pages)
    const cmsSources = await ctx.db
        .query('cmsSources')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect();
    for (const s of cmsSources) await deleteCmsSourceInternal(ctx, s._id);

    // CMS bindings + collection pages not under a source
    const bindings = await ctx.db
        .query('cmsBindings')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect();
    for (const b of bindings) await ctx.db.delete(b._id);

    const collPages = await ctx.db
        .query('cmsCollectionPages')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect();
    for (const p of collPages) await ctx.db.delete(p._id);

    // Project custom domains + verifications
    const pcds = await ctx.db
        .query('projectCustomDomains')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect();
    for (const p of pcds) await ctx.db.delete(p._id);

    const verifs = await ctx.db
        .query('customDomainVerification')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect();
    for (const v of verifs) await ctx.db.delete(v._id);

    // Preview domains tied to project
    const previews = await ctx.db
        .query('previewDomains')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect();
    for (const p of previews) await ctx.db.delete(p._id);

    // Deployments
    const deployments = await ctx.db
        .query('deployments')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect();
    for (const d of deployments) await ctx.db.delete(d._id);

    // Skills tied to this project (user-global skills survive — `projectId`
    // undefined). Drizzle had onDelete:cascade for per-project skills.
    const skills = await ctx.db
        .query('skills')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .collect();
    for (const s of skills) await ctx.db.delete(s._id);

    // Also delete preview image blob if any
    const project = await ctx.db.get(projectId);
    if (project?.previewImgStorageId) {
        // Best-effort: storage.delete throws if id is invalid; swallow.
        try {
            await ctx.storage.delete(project.previewImgStorageId);
        } catch {
            // ignore
        }
    }

    await ctx.db.delete(projectId);
}

async function deleteWorkspaceInternal(ctx: MutationCtx, workspaceId: Id<'workspaces'>) {
    // RESTRICT: workspace must have no projects. (Mirrors public
    // workspaces.remove guard but keep belt-and-suspenders here for the user
    // delete cascade.)
    const projects = await ctx.db
        .query('projects')
        .withIndex('by_workspace', (q) => q.eq('workspaceId', workspaceId))
        .collect();
    for (const p of projects) await deleteProjectInternal(ctx, p._id);

    const members = await ctx.db
        .query('workspaceMembers')
        .withIndex('by_workspace_user', (q) => q.eq('workspaceId', workspaceId))
        .collect();
    for (const m of members) await ctx.db.delete(m._id);

    const invites = await ctx.db
        .query('workspaceInvitations')
        .withIndex('by_workspace_email_status', (q) => q.eq('workspaceId', workspaceId))
        .collect();
    for (const i of invites) await ctx.db.delete(i._id);

    await ctx.db.delete(workspaceId);
}

// ─── Public internal mutations (called from server code) ─────────────────────

export const deleteUserCascade = internalMutation({
    args: { userId: v.id('users') },
    handler: async (ctx, { userId }) => {
        const user = await ctx.db.get(userId);
        if (!user) return { ok: false, reason: 'NOT_FOUND' as const };

        // Settings, provider connections
        const settings = await ctx.db
            .query('userSettings')
            .withIndex('by_user', (q) => q.eq('userId', userId))
            .collect();
        for (const s of settings) await ctx.db.delete(s._id);

        const conns = await ctx.db
            .query('providerConnections')
            .withIndex('by_user', (q) => q.eq('userId', userId))
            .collect();
        for (const c of conns) await ctx.db.delete(c._id);

        // Workspace memberships (delete; RESTRICT on workspaces.createdByUserId
        // enforced separately via personal workspace handling).
        const wsMembers = await ctx.db
            .query('workspaceMembers')
            .withIndex('by_user', (q) => q.eq('userId', userId))
            .collect();
        for (const m of wsMembers) await ctx.db.delete(m._id);

        // Personal workspace owned by this user → cascade
        const ownedWorkspaces = await ctx.db
            .query('workspaces')
            .withIndex('by_created_by_user', (q) => q.eq('createdByUserId', userId))
            .collect();
        for (const ws of ownedWorkspaces) {
            if (ws.kind === 'personal') {
                await deleteWorkspaceInternal(ctx, ws._id);
            }
            // Team workspaces with this user as creator stay (other members
            // remain). Ownership transfer is required to delete.
            // TODO(bug-hunt): this orphans sole-member team workspaces. The
            // cascade above deletes ALL of this user's workspaceMembers rows,
            // but only `personal` workspaces are cascaded — a team workspace
            // whose only member was the deleted user is left with zero
            // members, making it unreachable (no one can view it) and
            // undeletable (workspaces.remove requires a member with
            // workspace.delete), with its projects orphaned. Fix: after
            // removing memberships, delete (via deleteWorkspaceInternal) —
            // or transfer to another member — any team workspace with zero
            // remaining workspaceMembers rows.
        }

        // Project memberships
        const pms = await ctx.db
            .query('projectMembers')
            .withIndex('by_user', (q) => q.eq('userId', userId))
            .collect();
        for (const pm of pms) await ctx.db.delete(pm._id);

        // Pins
        const pins = await ctx.db
            .query('projectOfflinePins')
            .withIndex('by_user', (q) => q.eq('userId', userId))
            .collect();
        for (const p of pins) await ctx.db.delete(p._id);

        // Skills owned by user
        const skills = await ctx.db
            .query('skills')
            .withIndex('by_user', (q) => q.eq('userId', userId))
            .collect();
        for (const s of skills) await ctx.db.delete(s._id);

        // Subscriptions + rate limits + usage
        const subs = await ctx.db
            .query('subscriptions')
            .withIndex('by_user', (q) => q.eq('userId', userId))
            .collect();
        for (const s of subs) await deleteSubscriptionInternal(ctx, s._id);

        const usage = await ctx.db
            .query('usageRecords')
            .withIndex('by_user_time', (q) => q.eq('userId', userId))
            .collect();
        for (const u of usage) await ctx.db.delete(u._id);

        // AI usage analytics events (token counts + cost per request). The
        // FK is required (`v.id('users')`) so leaving rows behind would
        // dangle the reference and surface deleted users on the admin
        // /admin/usage dashboard (F-731).
        const aiUsage = await ctx.db
            .query('aiUsageEvents')
            .withIndex('by_user_createdAt', (q) => q.eq('userId', userId))
            .collect();
        for (const e of aiUsage) await ctx.db.delete(e._id);

        // Feedback rows → SET NULL on userId (mirror Drizzle onDelete:setNull)
        const feedbacks = await ctx.db
            .query('feedbacks')
            .withIndex('by_user', (q) => q.eq('userId', userId))
            .collect();
        for (const f of feedbacks) await ctx.db.patch(f._id, { userId: undefined });

        // Hosting provider connections
        const hpcs = await ctx.db
            .query('hostingProviderConnections')
            .withIndex('by_user', (q) => q.eq('userId', userId))
            .collect();
        for (const h of hpcs) await ctx.db.delete(h._id);

        // Deployments requested by user → reassign or delete? Drizzle cascaded
        // delete; mirror that to avoid orphaned references.
        const deployments = await ctx.db
            .query('deployments')
            .withIndex('by_requested_by', (q) => q.eq('requestedBy', userId))
            .collect();
        for (const d of deployments) await ctx.db.delete(d._id);

        // Project invitations created by this user. Indexed by inviter — a full
        // `projectInvitations` table scan here blew the Convex read limit (and
        // failed user deletion) once invitation volume grew.
        const invitesByUser = await ctx.db
            .query('projectInvitations')
            .withIndex('by_inviter', (q) => q.eq('inviterId', userId))
            .collect();
        for (const i of invitesByUser) await ctx.db.delete(i._id);

        // User canvases
        const ucs = await ctx.db
            .query('userCanvases')
            .withIndex('by_user_canvas', (q) => q.eq('userId', userId))
            .collect();
        for (const uc of ucs) await ctx.db.delete(uc._id);

        // Live-presence cursor rows. Without this cleanup, other tenants'
        // active sessions would continue showing this user's last cursor
        // position until the 5-second `presence.listActive` TTL elided it,
        // and the rows linger until the periodic purge cron runs.
        const cursors = await ctx.db
            .query('cursors')
            .withIndex('by_user', (q) => q.eq('userId', userId))
            .collect();
        for (const c of cursors) await ctx.db.delete(c._id);

        await ctx.db.delete(userId);
        return { ok: true } as const;
    },
});

export const deleteWorkspaceCascade = internalMutation({
    args: { workspaceId: v.id('workspaces') },
    handler: async (ctx, { workspaceId }) => {
        await deleteWorkspaceInternal(ctx, workspaceId);
        return { ok: true } as const;
    },
});

export const deleteProjectCascade = internalMutation({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        await deleteProjectInternal(ctx, projectId);
        return { ok: true } as const;
    },
});

export const deleteCanvasCascade = internalMutation({
    args: { canvasId: v.id('canvases') },
    handler: async (ctx, { canvasId }) => {
        await deleteCanvasInternal(ctx, canvasId);
        return { ok: true } as const;
    },
});

export const deleteBranchCascade = internalMutation({
    args: { branchId: v.id('branches') },
    handler: async (ctx, { branchId }) => {
        await deleteBranchInternal(ctx, branchId);
        return { ok: true } as const;
    },
});

export const deleteConversationCascade = internalMutation({
    args: { conversationId: v.id('conversations') },
    handler: async (ctx, { conversationId }) => {
        await deleteConversationInternal(ctx, conversationId);
        return { ok: true } as const;
    },
});

export const deleteCommentCascade = internalMutation({
    args: { commentId: v.id('projectComments') },
    handler: async (ctx, { commentId }) => {
        await deleteCommentInternal(ctx, commentId);
        return { ok: true } as const;
    },
});

export const deleteCustomDomainCascade = internalMutation({
    args: { customDomainId: v.id('customDomains') },
    handler: async (ctx, { customDomainId }) => {
        await deleteCustomDomainInternal(ctx, customDomainId);
        return { ok: true } as const;
    },
});

export const deleteSubscriptionCascade = internalMutation({
    args: { subscriptionId: v.id('subscriptions') },
    handler: async (ctx, { subscriptionId }) => {
        await deleteSubscriptionInternal(ctx, subscriptionId);
        return { ok: true } as const;
    },
});

/**
 * Demote any existing default branch in the project, then promote the
 * target. Replaces Drizzle's partial UNIQUE index.
 */
export const setDefaultBranch = internalMutation({
    args: {
        projectId: v.id('projects'),
        branchId: v.id('branches'),
    },
    handler: async (ctx, { projectId, branchId }) => {
        const existingDefaults = await ctx.db
            .query('branches')
            .withIndex('by_project_default', (q) =>
                q.eq('projectId', projectId).eq('isDefault', true),
            )
            .collect();
        for (const b of existingDefaults) {
            if (b._id !== branchId) {
                await ctx.db.patch(b._id, { isDefault: false, updatedAt: Date.now() });
            }
        }
        await ctx.db.patch(branchId, { isDefault: true, updatedAt: Date.now() });
    },
});
