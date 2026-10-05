import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const cloudEditorUploadTables = {
    cloudEditorUploadAttempts: defineTable({
        projectId: v.id('projects'),
        branchId: v.id('branches'),
        userId: v.id('users'),
        operationId: v.string(),
        fingerprint: v.string(),
        status: v.union(v.literal('open'), v.literal('committed'), v.literal('closed')),
        storageIds: v.array(v.id('_storage')),
        bytes: v.number(),
        createdAt: v.number(),
        expiresAt: v.number(),
    }).index('by_projectId_createdAt', ['projectId', 'createdAt']).index('by_expiresAt', ['expiresAt']),
};
