import { defineTable } from 'convex/server';
import { v } from 'convex/values';

export const cloudPreviewAccessTables = {
    cloudPreviewTickets: defineTable({
        projectId: v.id('projects'), branchId: v.id('branches'), userId: v.id('users'),
        sandboxId: v.string(), expiresAt: v.number(), nonce: v.string(), ticketHash: v.string(),
        updatedAt: v.number(),
    }).index('by_branchId_and_userId', ['branchId', 'userId'])
        .index('by_ticketHash', ['ticketHash']),
};
