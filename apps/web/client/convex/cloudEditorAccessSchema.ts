import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const cloudEditorRole = v.union(v.literal('responsible'), v.literal('designer'), v.literal('content'));
export const cloudEditorAccessTables = {
    cloudEditorGrants: defineTable({
        projectId: v.id('projects'), userId: v.id('users'), role: cloudEditorRole,
        publish: v.boolean(), updatedAt: v.number(),
    }).index('by_projectId_userId', ['projectId', 'userId']),
};
