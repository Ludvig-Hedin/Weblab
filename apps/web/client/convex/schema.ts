import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

import {
    vAuditEventKind,
    vInvitationStatus,
    vProjectAccessMode,
    vProjectMemberRole,
    vWorkspaceKind,
    vWorkspaceRole,
} from './lib/enums';

// Phase 4.1 schema — users + workspaces domain.
//
// `projects` is included as a STUB (only the fields referenced by workspace /
// audit / project-membership writes). The full projects schema lands in
// Phase 4.3 per docs/migration/MIGRATION_TASK.md.

export default defineSchema({
    users: defineTable({
        clerkUserId: v.string(),
        email: v.optional(v.string()),
        firstName: v.optional(v.string()),
        lastName: v.optional(v.string()),
        displayName: v.optional(v.string()),
        avatarUrl: v.optional(v.string()),
        stripeCustomerId: v.optional(v.string()),
        githubInstallationId: v.optional(v.string()),
        updatedAt: v.number(),
    })
        .index('by_clerk_user_id', ['clerkUserId'])
        .index('by_email', ['email'])
        .index('by_stripe_customer_id', ['stripeCustomerId']),

    userSettings: defineTable({
        userId: v.id('users'),
        autoApplyCode: v.boolean(),
        expandCodeBlocks: v.boolean(),
        showSuggestions: v.boolean(),
        showMiniChat: v.boolean(),
        defaultModel: v.optional(v.string()),
        ollamaBaseUrl: v.optional(v.string()),
        maxImages: v.number(),
        shouldWarnDelete: v.boolean(),
        enableBunReplace: v.boolean(),
        buildFlags: v.string(),
        theme: v.string(),
        accentColor: v.string(),
        fontFamily: v.string(),
        fontSize: v.string(),
        uiDensity: v.string(),
        locale: v.string(),
        autoCommit: v.boolean(),
        autoPush: v.boolean(),
        commitMessageFormat: v.string(),
        defaultBranchPattern: v.string(),
        customShortcuts: v.record(v.string(), v.string()),
    }).index('by_user', ['userId']),

    providerConnections: defineTable({
        userId: v.id('users'),
        provider: v.string(),
        accessTokenEncrypted: v.string(),
        refreshTokenEncrypted: v.optional(v.string()),
        expiresAt: v.optional(v.number()),
        scopes: v.optional(v.string()),
        accountEmail: v.optional(v.string()),
    })
        .index('by_user_provider', ['userId', 'provider'])
        .index('by_user', ['userId']),

    userCanvases: defineTable({
        userId: v.id('users'),
        canvasId: v.string(),
        scale: v.number(),
        x: v.number(),
        y: v.number(),
    }).index('by_user_canvas', ['userId', 'canvasId']),

    workspaces: defineTable({
        name: v.string(),
        slug: v.string(),
        kind: vWorkspaceKind,
        avatarUrl: v.optional(v.string()),
        createdByUserId: v.id('users'),
        updatedAt: v.number(),
    })
        .index('by_slug', ['slug'])
        .index('by_created_by_user', ['createdByUserId']),

    workspaceMembers: defineTable({
        workspaceId: v.id('workspaces'),
        userId: v.id('users'),
        role: vWorkspaceRole,
        updatedAt: v.number(),
    })
        .index('by_workspace_user', ['workspaceId', 'userId'])
        .index('by_user', ['userId']),

    workspaceInvitations: defineTable({
        workspaceId: v.id('workspaces'),
        email: v.string(),
        role: vWorkspaceRole,
        token: v.string(),
        status: vInvitationStatus,
        invitedByUserId: v.id('users'),
        expiresAt: v.number(),
        acceptedAt: v.optional(v.number()),
        revokedAt: v.optional(v.number()),
    })
        .index('by_token', ['token'])
        .index('by_workspace_email_status', ['workspaceId', 'email', 'status'])
        .index('by_email_status', ['email', 'status']),

    // Stub: the full projects table lands in Phase 4.3. For now we only need
    // the columns workspace-related writes reach for (accessMode, workspaceId).
    projects: defineTable({
        name: v.string(),
        workspaceId: v.id('workspaces'),
        createdByUserId: v.id('users'),
        accessMode: vProjectAccessMode,
        updatedAt: v.number(),
    })
        .index('by_workspace', ['workspaceId'])
        .index('by_created_by_user', ['createdByUserId']),

    projectMembers: defineTable({
        projectId: v.id('projects'),
        userId: v.id('users'),
        role: vProjectMemberRole,
        updatedAt: v.number(),
    })
        .index('by_project_user', ['projectId', 'userId'])
        .index('by_user', ['userId']),

    auditLog: defineTable({
        workspaceId: v.optional(v.id('workspaces')),
        projectId: v.optional(v.id('projects')),
        actorUserId: v.optional(v.id('users')),
        event: vAuditEventKind,
        payload: v.any(),
    })
        .index('by_workspace', ['workspaceId'])
        .index('by_project', ['projectId']),
});
