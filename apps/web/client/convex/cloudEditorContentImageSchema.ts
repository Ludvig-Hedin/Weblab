import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { cloudScope } from './lib/cloudEditor';
export const cloudImageTarget = { ...cloudScope, actorId: v.id('users'), path: v.string(), oid: v.string(), expectedRevision: v.number(), generation: v.number() };
export const cloudImagePin = v.object({ attemptId: v.id('cloudEditorContentImageAttempts'), path: v.string(), oid: v.string(), generation: v.number(), assetPath: v.string() });
export const cloudEditorContentImageTables = {
    cloudEditorContentImageAttempts: defineTable({
        ...cloudImageTarget, operationId: v.string(), createdAt: v.number(), expiresAt: v.number(),
        status: v.union(v.literal('open'), v.literal('ready'), v.literal('committed'), v.literal('closed')),
        storageId: v.optional(v.id('_storage')), hash: v.optional(v.string()), bytes: v.optional(v.number()),
        assetPath: v.optional(v.string()),
    }).index('by_projectId_and_createdAt', ['projectId', 'createdAt']).index('by_expiresAt', ['expiresAt'])
        .index('by_branchId_and_operationId', ['branchId', 'operationId']),
};
