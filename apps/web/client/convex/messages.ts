import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { mutation, query } from './_generated/server';
import { vMessageRole } from './lib/enums';
import { requireCap } from './lib/permissions';

// Convex port of apps/web/client/src/server/api/routers/chat/message.ts.

const projectIdForConversation = async (
    ctx: QueryCtx | MutationCtx,
    conversationId: Id<'conversations'>,
): Promise<Id<'projects'>> => {
    const row = await ctx.db.get(conversationId);
    if (!row) throw new Error('NOT_FOUND: conversation');
    return row.projectId;
};

const projectIdForMessage = async (
    ctx: QueryCtx | MutationCtx,
    messageId: Id<'messages'>,
): Promise<Id<'projects'>> => {
    const row = await ctx.db.get(messageId);
    if (!row) throw new Error('NOT_FOUND: message');
    return projectIdForConversation(ctx, row.conversationId);
};

const messageFields = {
    conversationId: v.id('conversations'),
    content: v.string(),
    role: vMessageRole,
    context: v.optional(v.any()),
    parts: v.optional(v.any()),
    checkpoints: v.optional(v.any()),
    usage: v.optional(v.any()),
    applied: v.optional(v.boolean()),
    commitOid: v.optional(v.string()),
    snapshots: v.optional(v.any()),
} as const;

const messageInsertArgs = v.object({
    id: v.optional(v.id('messages')),
    ...messageFields,
});

const normalizeInsert = (msg: {
    conversationId: Id<'conversations'>;
    content: string;
    role: Doc<'messages'>['role'];
    context?: unknown;
    parts?: unknown;
    checkpoints?: unknown;
    usage?: unknown;
    applied?: boolean;
    commitOid?: string;
    snapshots?: unknown;
}): Omit<Doc<'messages'>, '_id' | '_creationTime'> => ({
    conversationId: msg.conversationId,
    content: msg.content,
    role: msg.role,
    context: msg.context ?? [],
    parts: msg.parts ?? [],
    checkpoints: msg.checkpoints ?? [],
    usage: msg.usage,
    applied: msg.applied,
    commitOid: msg.commitOid,
    snapshots: msg.snapshots,
});

export const listByConversation = query({
    args: { conversationId: v.id('conversations') },
    handler: async (ctx, { conversationId }) => {
        const projectId = await projectIdForConversation(ctx, conversationId);
        await requireCap(ctx, 'project.view', { projectId });
        return ctx.db
            .query('messages')
            .withIndex('by_conversation', (q) => q.eq('conversationId', conversationId))
            .order('asc')
            .collect();
    },
});

export const upsert = mutation({
    args: { message: messageInsertArgs },
    handler: async (ctx, { message }) => {
        const projectId = await projectIdForConversation(ctx, message.conversationId);
        await requireCap(ctx, 'project.use_ai', { projectId });
        const normalized = normalizeInsert(message);
        if (message.id) {
            const existing = await ctx.db.get(message.id);
            if (existing) {
                // The cap was checked against message.conversationId; verify the
                // stored row actually belongs to it, else a user with AI access
                // on conversation A could patch/re-parent a message from B.
                if (existing.conversationId !== message.conversationId) {
                    throw new Error('BAD_REQUEST: message conversationId mismatch');
                }
                await ctx.db.patch(message.id, normalized);
                return (await ctx.db.get(message.id))!;
            }
            // Client passed a `message.id` that no longer resolves — most
            // commonly because the row was cascade-deleted (conversation
            // truncate / project unshare race). Refusing the upsert keeps
            // the client cache consistent: silently inserting a NEW row
            // with a fresh id would let the client render the original
            // (now-deleted) id alongside the new row as a duplicate.
            throw new Error('NOT_FOUND: message');
        }
        const id = await ctx.db.insert('messages', normalized);
        return (await ctx.db.get(id))!;
    },
});

export const upsertMany = mutation({
    args: { messages: v.array(messageInsertArgs) },
    handler: async (ctx, { messages: list }) => {
        if (list.length === 0) return { count: 0 } as const;
        const conversationIds = Array.from(new Set(list.map((m) => m.conversationId)));
        // Verify access for every distinct conversation referenced.
        const projectIds = await Promise.all(
            conversationIds.map((id) => projectIdForConversation(ctx, id)),
        );
        await Promise.all(
            Array.from(new Set(projectIds)).map((projectId) =>
                requireCap(ctx, 'project.use_ai', { projectId }),
            ),
        );
        // Insert-only semantics (onConflictDoNothing in Drizzle).
        // For upserts pre-existing rows are skipped.
        let inserted = 0;
        for (const m of list) {
            if (m.id) {
                const existing = await ctx.db.get(m.id);
                if (existing) {
                    if (existing.conversationId !== m.conversationId) {
                        throw new Error('BAD_REQUEST: message conversationId mismatch');
                    }
                    continue;
                }
            }
            await ctx.db.insert('messages', normalizeInsert(m));
            inserted += 1;
        }
        return { count: inserted } as const;
    },
});

export const update = mutation({
    args: {
        messageId: v.id('messages'),
        content: v.optional(v.string()),
        role: v.optional(vMessageRole),
        context: v.optional(v.any()),
        parts: v.optional(v.any()),
        checkpoints: v.optional(v.any()),
        usage: v.optional(v.any()),
        applied: v.optional(v.boolean()),
        commitOid: v.optional(v.string()),
        snapshots: v.optional(v.any()),
    },
    handler: async (ctx, { messageId, ...patch }) => {
        const projectId = await projectIdForMessage(ctx, messageId);
        await requireCap(ctx, 'project.use_ai', { projectId });
        const cleanPatch = Object.fromEntries(
            Object.entries(patch).filter(([, value]) => value !== undefined),
        );
        await ctx.db.patch(messageId, cleanPatch);
        return (await ctx.db.get(messageId))!;
    },
});

export const updateCheckpoints = mutation({
    args: {
        messageId: v.id('messages'),
        checkpoints: v.array(
            v.object({
                type: v.string(),
                oid: v.string(),
                branchId: v.string(),
                createdAt: v.number(),
            }),
        ),
    },
    handler: async (ctx, { messageId, checkpoints }) => {
        const projectId = await projectIdForMessage(ctx, messageId);
        await requireCap(ctx, 'project.use_ai', { projectId });
        await ctx.db.patch(messageId, { checkpoints });
    },
});

export const remove = mutation({
    args: { messageIds: v.array(v.id('messages')) },
    handler: async (ctx, { messageIds }) => {
        if (messageIds.length === 0) throw new Error('BAD_REQUEST: messageIds empty');
        // Resolve every targeted message to its project and verify access
        // for each distinct project the caller is touching.
        const rows = await Promise.all(messageIds.map((id) => ctx.db.get(id)));
        if (rows.some((r) => !r)) {
            throw new Error('NOT_FOUND: one or more messages not found');
        }
        const conversationIds = Array.from(
            new Set(rows.map((r) => (r as Doc<'messages'>).conversationId)),
        );
        const projectIds = await Promise.all(
            conversationIds.map((id) => projectIdForConversation(ctx, id)),
        );
        await Promise.all(
            Array.from(new Set(projectIds)).map((projectId) =>
                requireCap(ctx, 'project.use_ai', { projectId }),
            ),
        );
        for (const id of messageIds) {
            await ctx.db.delete(id);
        }
        return { ok: true } as const;
    },
});

export const replaceConversationMessages = mutation({
    args: {
        conversationId: v.id('conversations'),
        messages: v.array(messageInsertArgs),
    },
    handler: async (ctx, { conversationId, messages: list }) => {
        const projectId = await projectIdForConversation(ctx, conversationId);
        await requireCap(ctx, 'project.use_ai', { projectId });
        // Delete existing messages for this conversation.
        const existing = await ctx.db
            .query('messages')
            .withIndex('by_conversation', (q) => q.eq('conversationId', conversationId))
            .collect();
        for (const m of existing) await ctx.db.delete(m._id);
        // Insert new messages, all tied to this conversation. Reject if the
        // caller hands us cross-conversation rows (would otherwise silently
        // succeed and orphan messages into another thread).
        for (const m of list) {
            if (m.conversationId !== conversationId) {
                throw new Error('BAD_REQUEST: message conversationId mismatch');
            }
            await ctx.db.insert('messages', normalizeInsert(m));
        }
        await ctx.db.patch(conversationId, { updatedAt: Date.now() });
        return { ok: true } as const;
    },
});
