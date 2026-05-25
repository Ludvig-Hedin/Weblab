import { v } from 'convex/values';

import type { Doc, Id } from './_generated/dataModel';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internal } from './_generated/api';
import { internalMutation, internalQuery, mutation, query } from './_generated/server';
import { vAgentType } from './lib/enums';
import { requireCap } from './lib/permissions';

// Convex port of apps/web/client/src/server/api/routers/chat/conversation.ts.

const loadConversation = async (
    ctx: QueryCtx | MutationCtx,
    conversationId: Id<'conversations'>,
): Promise<Doc<'conversations'>> => {
    const row = await ctx.db.get(conversationId);
    if (!row) throw new Error('NOT_FOUND: conversation');
    return row;
};

export const list = query({
    args: { projectId: v.id('projects') },
    handler: async (ctx, { projectId }) => {
        await requireCap(ctx, 'project.view', { projectId });
        // Defensive cap. Chat history is loaded eagerly on editor boot;
        // an unbounded list would balloon TTFR for long-running projects.
        // Add pagination/"load older" if a real user hits this ceiling.
        return ctx.db
            .query('conversations')
            .withIndex('by_project_updated', (q) => q.eq('projectId', projectId))
            .order('desc')
            .take(200);
    },
});

export const get = query({
    args: { conversationId: v.id('conversations') },
    handler: async (ctx, { conversationId }) => {
        const conversation = await loadConversation(ctx, conversationId);
        await requireCap(ctx, 'project.view', {
            projectId: conversation.projectId,
        });
        return conversation;
    },
});

export const upsert = mutation({
    args: {
        id: v.optional(v.id('conversations')),
        projectId: v.id('projects'),
        agentType: v.optional(vAgentType),
        displayName: v.optional(v.string()),
        suggestions: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        await requireCap(ctx, 'project.use_ai', { projectId: args.projectId });
        const now = Date.now();
        if (args.id) {
            const existing = await ctx.db.get(args.id);
            if (!existing) throw new Error('NOT_FOUND: conversation');
            if (existing.projectId !== args.projectId) {
                throw new Error('BAD_REQUEST: conversation project mismatch');
            }
            await ctx.db.patch(args.id, {
                agentType: args.agentType ?? existing.agentType,
                displayName: args.displayName ?? existing.displayName,
                suggestions: args.suggestions ?? existing.suggestions,
                updatedAt: now,
            });
            return (await ctx.db.get(args.id))!;
        }
        const id = await ctx.db.insert('conversations', {
            projectId: args.projectId,
            agentType: args.agentType ?? 'root',
            displayName: args.displayName,
            suggestions: args.suggestions,
            updatedAt: now,
        });
        return (await ctx.db.get(id))!;
    },
});

export const update = mutation({
    args: {
        conversationId: v.id('conversations'),
        agentType: v.optional(vAgentType),
        displayName: v.optional(v.string()),
        suggestions: v.optional(v.any()),
    },
    handler: async (ctx, args) => {
        const existing = await loadConversation(ctx, args.conversationId);
        await requireCap(ctx, 'project.use_ai', { projectId: existing.projectId });
        const patch: Partial<Doc<'conversations'>> = { updatedAt: Date.now() };
        if (args.agentType !== undefined) patch.agentType = args.agentType;
        if (args.displayName !== undefined) patch.displayName = args.displayName;
        if (args.suggestions !== undefined) patch.suggestions = args.suggestions;
        await ctx.db.patch(args.conversationId, patch);
        return (await ctx.db.get(args.conversationId))!;
    },
});

export const remove = mutation({
    args: { conversationId: v.id('conversations') },
    handler: async (ctx, { conversationId }) => {
        const existing = await loadConversation(ctx, conversationId);
        await requireCap(ctx, 'project.use_ai', { projectId: existing.projectId });
        // Cascade messages, then delete conversation. Helper in
        // internal/cascade.ts owns the ordering.
        await ctx.runMutation(internal.internal.cascade.deleteConversationCascade, {
            conversationId,
        });
        return { ok: true } as const;
    },
});

/**
 * Internal write used by chatActions.generateTitle to update the displayName
 * after AI returns a title. Actions can't touch the DB directly.
 */
export const _setDisplayName = internalMutation({
    args: {
        conversationId: v.id('conversations'),
        displayName: v.string(),
    },
    handler: async (ctx, { conversationId, displayName }) => {
        await ctx.db.patch(conversationId, { displayName, updatedAt: Date.now() });
    },
});

/**
 * Internal write used by chatActions.generateSuggestions. Actions can't
 * touch the DB directly so the action calls this via `ctx.runMutation`.
 */
export const _setSuggestions = internalMutation({
    args: {
        conversationId: v.id('conversations'),
        suggestions: v.any(),
    },
    handler: async (ctx, { conversationId, suggestions }) => {
        await ctx.db.patch(conversationId, { suggestions, updatedAt: Date.now() });
    },
});

/**
 * Read the stored background summary + cursor for a conversation. Called
 * from the chat API route before building the LLM request — when present
 * and not stale, the request-builder swaps older messages for the summary
 * to keep the cache prefix warm.
 *
 * `requireCap('project.use_ai')` because this is invoked by the same
 * server-side path that runs the chat. Returns null when no summary exists.
 */
export const getSummary = query({
    args: { conversationId: v.id('conversations') },
    handler: async (ctx, { conversationId }) => {
        const conversation = await loadConversation(ctx, conversationId);
        await requireCap(ctx, 'project.use_ai', {
            projectId: conversation.projectId,
        });
        if (!conversation.summaryText || !conversation.summarizedUpToMessageId) {
            return null;
        }
        return {
            text: conversation.summaryText,
            upToMessageId: conversation.summarizedUpToMessageId,
            updatedAt: conversation.summaryUpdatedAt ?? null,
        };
    },
});

/**
 * Persist a freshly-computed summary. Called from the /api/chat/summarize
 * route after summarizeConversation() returns. We don't bump `updatedAt`
 * on the conversation row — that's reserved for user-visible mutations
 * (new messages); a background summary is invisible to the chat list.
 */
export const setSummary = mutation({
    args: {
        conversationId: v.id('conversations'),
        summaryText: v.string(),
        summarizedUpToMessageId: v.string(),
    },
    handler: async (ctx, args) => {
        const existing = await loadConversation(ctx, args.conversationId);
        await requireCap(ctx, 'project.use_ai', { projectId: existing.projectId });
        await ctx.db.patch(args.conversationId, {
            summaryText: args.summaryText,
            summarizedUpToMessageId: args.summarizedUpToMessageId,
            summaryUpdatedAt: Date.now(),
        });
        return { ok: true } as const;
    },
});

/**
 * Internal read used by chatActions to look up a conversation's projectId
 * for permission checks (actions can't run queries directly without going
 * through ctx.runQuery).
 */
export const _getForAction = internalQuery({
    args: { conversationId: v.id('conversations') },
    handler: async (ctx, { conversationId }) => {
        const conversation = await ctx.db.get(conversationId);
        if (!conversation) return null;
        // SECURITY: chatActions.generateTitle/generateSuggestions are public
        // actions whose only gate is this lookup. Auth identity propagates from
        // the calling action through ctx.runQuery, so enforce the same AI cap
        // the public conversation mutations require — otherwise any caller with
        // a conversationId could drive OpenRouter spend and overwrite another
        // project's conversation displayName/suggestions.
        await requireCap(ctx, 'project.use_ai', { projectId: conversation.projectId });
        return conversation;
    },
});
