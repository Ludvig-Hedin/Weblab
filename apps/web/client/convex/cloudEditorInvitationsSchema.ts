import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { cloudEditorRole } from './cloudEditorAccessSchema';

export const cloudEditorInvitationTables = {
    cloudEditorMemberRemovals: defineTable({
        projectId: v.id('projects'), userId: v.id('users'), removedAt: v.number(),
    }).index('by_projectId_userId', ['projectId', 'userId']),
    cloudEditorInvitations: defineTable({
        projectId: v.id('projects'), branchId: v.id('branches'),
        issuerId: v.id('users'), email: v.string(), role: cloudEditorRole,
        publish: v.boolean(), tokenHash: v.string(), createdAt: v.number(), expiresAt: v.number(),
        status: v.union(v.literal('pending'), v.literal('accepted'), v.literal('revoked')),
        acceptedBy: v.optional(v.id('users')),
    }).index('by_projectId', ['projectId']).index('by_projectId_email', ['projectId', 'email']),
};
