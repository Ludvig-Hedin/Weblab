import { v } from 'convex/values';

import { mutation, query } from './_generated/server';
import { getCapabilities, getOptionalUser, requireUser, requireUserJIT } from './lib/permissions';

const DEFAULT_USER_SETTINGS = {
    autoApplyCode: true,
    expandCodeBlocks: true,
    showSuggestions: true,
    showMiniChat: false,
    maxImages: 5,
    shouldWarnDelete: true,
    enableBunReplace: true,
    buildFlags: '--no-lint',
    theme: 'system',
    accentColor: 'blue',
    fontFamily: 'sans',
    fontSize: 'medium',
    uiDensity: 'comfortable',
    locale: 'en',
    autoCommit: false,
    autoPush: false,
    commitMessageFormat: 'feat: {description}',
    defaultBranchPattern: 'feature/{timestamp}',
    customShortcuts: {},
} as const;

export const me = query({
    args: {},
    handler: async (ctx) => getOptionalUser(ctx),
});

export const getByClerkId = query({
    args: { clerkUserId: v.string() },
    handler: async (ctx, { clerkUserId }) => {
        return ctx.db
            .query('users')
            .withIndex('by_clerk_user_id', (q) => q.eq('clerkUserId', clerkUserId))
            .unique();
    },
});

export const ensureCurrent = mutation({
    args: {},
    handler: async (ctx) => requireUserJIT(ctx),
});

export const updateProfile = mutation({
    args: {
        firstName: v.optional(v.string()),
        lastName: v.optional(v.string()),
        displayName: v.optional(v.string()),
        avatarUrl: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);
        await ctx.db.patch(user._id, {
            firstName: args.firstName ?? user.firstName,
            lastName: args.lastName ?? user.lastName,
            displayName: args.displayName ?? user.displayName,
            avatarUrl: args.avatarUrl ?? user.avatarUrl,
            updatedAt: Date.now(),
        });
        return (await ctx.db.get(user._id))!;
    },
});

export const setStripeCustomerId = mutation({
    args: { stripeCustomerId: v.string() },
    handler: async (ctx, { stripeCustomerId }) => {
        const user = await requireUser(ctx);
        await ctx.db.patch(user._id, { stripeCustomerId, updatedAt: Date.now() });
    },
});

export const setGithubInstallationId = mutation({
    args: { githubInstallationId: v.union(v.string(), v.null()) },
    handler: async (ctx, { githubInstallationId }) => {
        const user = await requireUser(ctx);
        await ctx.db.patch(user._id, {
            githubInstallationId: githubInstallationId ?? undefined,
            updatedAt: Date.now(),
        });
    },
});

export const getSettings = query({
    args: {},
    handler: async (ctx) => {
        const user = await getOptionalUser(ctx);
        if (!user) return null;
        const row = await ctx.db
            .query('userSettings')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .unique();
        return row;
    },
});

export const ensureSettings = mutation({
    args: {},
    handler: async (ctx) => {
        const user = await requireUser(ctx);
        const existing = await ctx.db
            .query('userSettings')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .unique();
        if (existing) return existing;
        const id = await ctx.db.insert('userSettings', {
            userId: user._id,
            ...DEFAULT_USER_SETTINGS,
        });
        return (await ctx.db.get(id))!;
    },
});

export const updateSettings = mutation({
    args: {
        autoApplyCode: v.optional(v.boolean()),
        expandCodeBlocks: v.optional(v.boolean()),
        showSuggestions: v.optional(v.boolean()),
        showMiniChat: v.optional(v.boolean()),
        defaultModel: v.optional(v.string()),
        ollamaBaseUrl: v.optional(v.string()),
        maxImages: v.optional(v.number()),
        shouldWarnDelete: v.optional(v.boolean()),
        enableBunReplace: v.optional(v.boolean()),
        buildFlags: v.optional(v.string()),
        theme: v.optional(v.string()),
        accentColor: v.optional(v.string()),
        fontFamily: v.optional(v.string()),
        fontSize: v.optional(v.string()),
        uiDensity: v.optional(v.string()),
        locale: v.optional(v.string()),
        autoCommit: v.optional(v.boolean()),
        autoPush: v.optional(v.boolean()),
        commitMessageFormat: v.optional(v.string()),
        defaultBranchPattern: v.optional(v.string()),
        customShortcuts: v.optional(v.record(v.string(), v.string())),
    },
    handler: async (ctx, patch) => {
        const user = await requireUser(ctx);
        const existing = await ctx.db
            .query('userSettings')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .unique();
        if (existing) {
            const cleanPatch = Object.fromEntries(
                Object.entries(patch).filter(([, value]) => value !== undefined),
            );
            await ctx.db.patch(existing._id, cleanPatch);
            return (await ctx.db.get(existing._id))!;
        }
        const cleanPatchForInsert = Object.fromEntries(
            Object.entries(patch).filter(([, value]) => value !== undefined),
        );
        const id = await ctx.db.insert('userSettings', {
            userId: user._id,
            ...DEFAULT_USER_SETTINGS,
            ...cleanPatchForInsert,
        });
        return (await ctx.db.get(id))!;
    },
});

export const listProviderConnections = query({
    args: {},
    handler: async (ctx) => {
        const user = await getOptionalUser(ctx);
        if (!user) return [];
        return ctx.db
            .query('providerConnections')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .collect();
    },
});

export const upsertProviderConnection = mutation({
    args: {
        provider: v.string(),
        accessTokenEncrypted: v.string(),
        refreshTokenEncrypted: v.optional(v.string()),
        expiresAt: v.optional(v.number()),
        scopes: v.optional(v.string()),
        accountEmail: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
        const user = await requireUser(ctx);
        const existing = await ctx.db
            .query('providerConnections')
            .withIndex('by_user_provider', (q) =>
                q.eq('userId', user._id).eq('provider', args.provider),
            )
            .unique();
        if (existing) {
            await ctx.db.patch(existing._id, args);
            return (await ctx.db.get(existing._id))!;
        }
        const id = await ctx.db.insert('providerConnections', { userId: user._id, ...args });
        return (await ctx.db.get(id))!;
    },
});

export const deleteProviderConnection = mutation({
    args: { provider: v.string() },
    handler: async (ctx, { provider }) => {
        const user = await requireUser(ctx);
        const existing = await ctx.db
            .query('providerConnections')
            .withIndex('by_user_provider', (q) => q.eq('userId', user._id).eq('provider', provider))
            .unique();
        if (existing) await ctx.db.delete(existing._id);
    },
});

export const getCanvasView = query({
    args: { canvasId: v.string() },
    handler: async (ctx, { canvasId }) => {
        const user = await getOptionalUser(ctx);
        if (!user) return null;
        return ctx.db
            .query('userCanvases')
            .withIndex('by_user_canvas', (q) => q.eq('userId', user._id).eq('canvasId', canvasId))
            .unique();
    },
});

export const upsertCanvasView = mutation({
    args: {
        canvasId: v.string(),
        scale: v.number(),
        x: v.number(),
        y: v.number(),
    },
    handler: async (ctx, { canvasId, scale, x, y }) => {
        const user = await requireUser(ctx);
        const existing = await ctx.db
            .query('userCanvases')
            .withIndex('by_user_canvas', (q) => q.eq('userId', user._id).eq('canvasId', canvasId))
            .unique();
        if (existing) {
            await ctx.db.patch(existing._id, { scale, x, y });
            return (await ctx.db.get(existing._id))!;
        }
        const id = await ctx.db.insert('userCanvases', { userId: user._id, canvasId, scale, x, y });
        return (await ctx.db.get(id))!;
    },
});

export const capabilities = query({
    args: {
        workspaceId: v.optional(v.id('workspaces')),
        projectId: v.optional(v.id('projects')),
    },
    handler: async (ctx, scope) => getCapabilities(ctx, scope),
});
