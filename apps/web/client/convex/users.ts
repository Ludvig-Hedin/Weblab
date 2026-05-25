import { v } from 'convex/values';

import { mutation, query } from './_generated/server';
import {
    getCapabilities,
    getOptionalUser,
    getUserByClerkIdSafe,
    requireCap,
    requireUser,
    requireUserJIT,
} from './lib/permissions';

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
        // SECURITY: a caller may only resolve their OWN row. Without this gate
        // any signed-in user could pass an arbitrary clerkUserId and read that
        // user's email + stripeCustomerId + githubInstallationId (PII / billing
        // enumeration). The only caller (auth/clerk-bridge) always queries the
        // authenticated user's own id, so the legit path is unaffected.
        const identity = await ctx.auth.getUserIdentity();
        if (identity?.subject !== clerkUserId) return null;
        // `.collect()` + dedupe — never `.unique()` on by_clerk_user_id. A
        // duplicate row from the JIT/webhook race would otherwise brick the
        // RSC bridge and redirect-loop the user.
        return getUserByClerkIdSafe(ctx, clerkUserId);
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
        const user = await requireUserJIT(ctx);
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
        // SECURITY: enforce one-to-one mapping between users and Stripe
        // customer ids. Without this guard a signed-in caller could pre-claim
        // a victim's stripeCustomerId (`cus_VICTIM`) — the next Stripe
        // webhook for that customer would resolve to the attacker via
        // `findUserByStripeCustomerId`, transferring the victim's
        // subscription + rateLimits + Pro entitlements to the attacker.
        // Format guard rejects obviously bogus values that aren't even
        // Stripe customer ids (Stripe prefix is `cus_`).
        if (!stripeCustomerId.startsWith('cus_')) {
            throw new Error('BAD_REQUEST: stripeCustomerId must be a Stripe customer id');
        }
        const conflict = await ctx.db
            .query('users')
            .withIndex('by_stripe_customer_id', (q) => q.eq('stripeCustomerId', stripeCustomerId))
            .first();
        if (conflict && conflict._id !== user._id) {
            throw new Error('CONFLICT: Stripe customer is already linked to another account');
        }
        await ctx.db.patch(user._id, { stripeCustomerId, updatedAt: Date.now() });
    },
});

export const setGithubInstallationId = mutation({
    args: { githubInstallationId: v.union(v.string(), v.null()) },
    handler: async (ctx, { githubInstallationId }) => {
        const user = await requireUser(ctx);
        // SECURITY: enforce one-to-one mapping between users and GitHub App
        // installations. The install-callback flow (`githubActions.handleInstallationCallbackUrl`)
        // verifies a signed `state` only against the caller's userId — it does
        // NOT bind to the installationId, so an attacker who knows a victim's
        // installationId can pass it in along with a state signed for their
        // own account, causing this row to claim the victim's installation and
        // grant Octokit access to the victim's private repos. Reject the write
        // if any other user already owns this installationId.
        if (githubInstallationId) {
            const conflict = await ctx.db
                .query('users')
                .withIndex('by_github_installation_id', (q) =>
                    q.eq('githubInstallationId', githubInstallationId),
                )
                .first();
            if (conflict && conflict._id !== user._id) {
                throw new Error(
                    'CONFLICT: GitHub installation is already linked to another account',
                );
            }
        }
        await ctx.db.patch(user._id, {
            githubInstallationId: githubInstallationId ?? undefined,
            updatedAt: Date.now(),
        });
    },
});

// Alias for setGithubInstallationId({ githubInstallationId: null }). Convenience
// for "disconnect GitHub" UI button — clearer call site than passing null.
export const disconnectGitHub = mutation({
    args: {},
    handler: async (ctx) => {
        const user = await requireUser(ctx);
        await ctx.db.patch(user._id, {
            githubInstallationId: undefined,
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

// Returns the legacy nested UserSettings shape (chat/editor/ai/appearance/
// language/git/customShortcuts) — the same shape `fromDbUserSettings` produced
// for the Drizzle pipeline. Several UI consumers (appearance-provider,
// settings-modal/ai-tab, code-editor, chat-tab-content, etc.) assume this
// nested structure. Port logic verbatim from packages/db/src/mappers/user/
// settings.ts so the migration is invisible to those callers.
//
// Defaults inlined (rather than imported from @weblab/constants) to keep the
// Convex bundle thin and avoid Node-only transitive imports.
const DEFAULTS = {
    autoApplyCode: true,
    expandCodeBlocks: true,
    showSuggestions: true,
    showMiniChat: false,
    defaultModel: 'anthropic/claude-3.5-sonnet',
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
} as const;

export const getMappedSettings = query({
    args: {},
    handler: async (ctx) => {
        const user = await getOptionalUser(ctx);
        if (!user) return null;
        const settings = await ctx.db
            .query('userSettings')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .unique();
        if (!settings) return null;
        return {
            id: settings._id,
            chat: {
                autoApplyCode: settings.autoApplyCode ?? DEFAULTS.autoApplyCode,
                expandCodeBlocks: settings.expandCodeBlocks ?? DEFAULTS.expandCodeBlocks,
                showSuggestions: settings.showSuggestions ?? DEFAULTS.showSuggestions,
                showMiniChat: settings.showMiniChat ?? DEFAULTS.showMiniChat,
                defaultModel: settings.defaultModel ?? DEFAULTS.defaultModel,
                ollamaBaseUrl: settings.ollamaBaseUrl ?? undefined,
            },
            editor: {
                shouldWarnDelete: settings.shouldWarnDelete ?? DEFAULTS.shouldWarnDelete,
                enableBunReplace: settings.enableBunReplace ?? DEFAULTS.enableBunReplace,
                buildFlags: settings.buildFlags ?? DEFAULTS.buildFlags,
            },
            ai: {
                defaultModel: settings.defaultModel ?? DEFAULTS.defaultModel,
                showSuggestions: settings.showSuggestions ?? DEFAULTS.showSuggestions,
                showMiniChat: settings.showMiniChat ?? DEFAULTS.showMiniChat,
                autoApplyCode: settings.autoApplyCode ?? DEFAULTS.autoApplyCode,
                expandCodeBlocks: settings.expandCodeBlocks ?? DEFAULTS.expandCodeBlocks,
                maxImages: settings.maxImages ?? DEFAULTS.maxImages,
            },
            appearance: {
                theme: settings.theme ?? DEFAULTS.theme,
                accentColor: settings.accentColor ?? DEFAULTS.accentColor,
                fontFamily: settings.fontFamily ?? DEFAULTS.fontFamily,
                fontSize: settings.fontSize ?? DEFAULTS.fontSize,
                uiDensity: settings.uiDensity ?? DEFAULTS.uiDensity,
            },
            language: {
                locale: settings.locale ?? DEFAULTS.locale,
            },
            git: {
                autoCommit: settings.autoCommit ?? DEFAULTS.autoCommit,
                autoPush: settings.autoPush ?? DEFAULTS.autoPush,
                commitMessageFormat: settings.commitMessageFormat ?? DEFAULTS.commitMessageFormat,
                defaultBranchPattern:
                    settings.defaultBranchPattern ?? DEFAULTS.defaultBranchPattern,
            },
            customShortcuts: settings.customShortcuts ?? {},
        };
    },
});

// Mutation that accepts the nested UserSettings shape and writes flat fields.
// Mirror of `toDbUserSettings` — kept here so UI code that previously called
// `api.user.settings.upsert({ settings: nested })` doesn't need to flatten
// before sending.
export const updateMappedSettings = mutation({
    args: {
        settings: v.object({
            chat: v.optional(
                v.object({
                    autoApplyCode: v.optional(v.boolean()),
                    expandCodeBlocks: v.optional(v.boolean()),
                    showSuggestions: v.optional(v.boolean()),
                    showMiniChat: v.optional(v.boolean()),
                    defaultModel: v.optional(v.string()),
                    ollamaBaseUrl: v.optional(v.string()),
                }),
            ),
            editor: v.optional(
                v.object({
                    shouldWarnDelete: v.optional(v.boolean()),
                    enableBunReplace: v.optional(v.boolean()),
                    buildFlags: v.optional(v.string()),
                }),
            ),
            ai: v.optional(
                v.object({
                    defaultModel: v.optional(v.string()),
                    showSuggestions: v.optional(v.boolean()),
                    showMiniChat: v.optional(v.boolean()),
                    autoApplyCode: v.optional(v.boolean()),
                    expandCodeBlocks: v.optional(v.boolean()),
                    maxImages: v.optional(v.number()),
                }),
            ),
            appearance: v.optional(
                v.object({
                    theme: v.optional(v.string()),
                    accentColor: v.optional(v.string()),
                    fontFamily: v.optional(v.string()),
                    fontSize: v.optional(v.string()),
                    uiDensity: v.optional(v.string()),
                }),
            ),
            language: v.optional(
                v.object({
                    locale: v.optional(v.string()),
                }),
            ),
            git: v.optional(
                v.object({
                    autoCommit: v.optional(v.boolean()),
                    autoPush: v.optional(v.boolean()),
                    commitMessageFormat: v.optional(v.string()),
                    defaultBranchPattern: v.optional(v.string()),
                }),
            ),
            customShortcuts: v.optional(v.record(v.string(), v.string())),
        }),
    },
    handler: async (ctx, { settings }) => {
        const user = await requireUser(ctx);
        // ai is canonical for shared flags (per toDbUserSettings); chat falls
        // back to ai. Mirror the legacy mapper precisely.
        const flat: Record<string, unknown> = {};
        if (settings.ai?.autoApplyCode !== undefined)
            flat.autoApplyCode = settings.ai.autoApplyCode;
        else if (settings.chat?.autoApplyCode !== undefined)
            flat.autoApplyCode = settings.chat.autoApplyCode;
        if (settings.ai?.expandCodeBlocks !== undefined)
            flat.expandCodeBlocks = settings.ai.expandCodeBlocks;
        else if (settings.chat?.expandCodeBlocks !== undefined)
            flat.expandCodeBlocks = settings.chat.expandCodeBlocks;
        if (settings.ai?.showSuggestions !== undefined)
            flat.showSuggestions = settings.ai.showSuggestions;
        else if (settings.chat?.showSuggestions !== undefined)
            flat.showSuggestions = settings.chat.showSuggestions;
        if (settings.ai?.showMiniChat !== undefined) flat.showMiniChat = settings.ai.showMiniChat;
        else if (settings.chat?.showMiniChat !== undefined)
            flat.showMiniChat = settings.chat.showMiniChat;
        if (settings.ai?.defaultModel !== undefined) flat.defaultModel = settings.ai.defaultModel;
        else if (settings.chat?.defaultModel !== undefined)
            flat.defaultModel = settings.chat.defaultModel;
        if (settings.ai?.maxImages !== undefined) flat.maxImages = settings.ai.maxImages;
        if (settings.chat?.ollamaBaseUrl !== undefined)
            flat.ollamaBaseUrl = settings.chat.ollamaBaseUrl;
        if (settings.editor?.shouldWarnDelete !== undefined)
            flat.shouldWarnDelete = settings.editor.shouldWarnDelete;
        if (settings.editor?.enableBunReplace !== undefined)
            flat.enableBunReplace = settings.editor.enableBunReplace;
        if (settings.editor?.buildFlags !== undefined) flat.buildFlags = settings.editor.buildFlags;
        if (settings.appearance?.theme !== undefined) flat.theme = settings.appearance.theme;
        if (settings.appearance?.accentColor !== undefined)
            flat.accentColor = settings.appearance.accentColor;
        if (settings.appearance?.fontFamily !== undefined)
            flat.fontFamily = settings.appearance.fontFamily;
        if (settings.appearance?.fontSize !== undefined)
            flat.fontSize = settings.appearance.fontSize;
        if (settings.appearance?.uiDensity !== undefined)
            flat.uiDensity = settings.appearance.uiDensity;
        if (settings.language?.locale !== undefined) flat.locale = settings.language.locale;
        if (settings.git?.autoCommit !== undefined) flat.autoCommit = settings.git.autoCommit;
        if (settings.git?.autoPush !== undefined) flat.autoPush = settings.git.autoPush;
        if (settings.git?.commitMessageFormat !== undefined)
            flat.commitMessageFormat = settings.git.commitMessageFormat;
        if (settings.git?.defaultBranchPattern !== undefined)
            flat.defaultBranchPattern = settings.git.defaultBranchPattern;
        if (settings.customShortcuts !== undefined) flat.customShortcuts = settings.customShortcuts;

        const existing = await ctx.db
            .query('userSettings')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .unique();
        if (existing) {
            await ctx.db.patch(existing._id, flat);
            return (await ctx.db.get(existing._id))!;
        }
        const id = await ctx.db.insert('userSettings', {
            userId: user._id,
            ...DEFAULT_USER_SETTINGS,
            ...flat,
        });
        return (await ctx.db.get(id))!;
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
        const id = await ctx.db.insert('providerConnections', {
            userId: user._id,
            ...args,
        });
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
    args: { canvasId: v.id('canvases') },
    handler: async (ctx, { canvasId }) => {
        const user = await getOptionalUser(ctx);
        if (!user) return null;
        // SECURITY: gate by `project.view` on the canvas's project. Without
        // this, any signed-in caller could enumerate canvasIds and learn that
        // a canvas exists (a row returned by `userCanvases` confirms it).
        const canvas = await ctx.db.get(canvasId);
        if (!canvas) return null;
        try {
            await requireCap(ctx, 'project.view', { projectId: canvas.projectId });
        } catch {
            // Soft-fail for unauthorized callers — match the rest of the
            // read-side surface which returns null rather than throwing for
            // missing access.
            return null;
        }
        return ctx.db
            .query('userCanvases')
            .withIndex('by_user_canvas', (q) => q.eq('userId', user._id).eq('canvasId', canvasId))
            .unique();
    },
});

export const upsertCanvasView = mutation({
    args: {
        canvasId: v.id('canvases'),
        scale: v.number(),
        x: v.number(),
        y: v.number(),
    },
    handler: async (ctx, { canvasId, scale, x, y }) => {
        // SECURITY: gate the write by `project.view` on the canvas's project.
        // Without this, any signed-in caller could write `userCanvases` rows
        // tied to (callerUserId, foreignCanvasId) for arbitrary canvases —
        // those rows then get nuked when the foreign project's cascade runs
        // (and leak the existence of foreign canvases to the attacker).
        const canvas = await ctx.db.get(canvasId);
        if (!canvas) throw new Error('NOT_FOUND: Canvas not found');
        const { user } = await requireCap(ctx, 'project.view', {
            projectId: canvas.projectId,
        });
        const existing = await ctx.db
            .query('userCanvases')
            .withIndex('by_user_canvas', (q) => q.eq('userId', user._id).eq('canvasId', canvasId))
            .unique();
        if (existing) {
            await ctx.db.patch(existing._id, { scale, x, y });
            return (await ctx.db.get(existing._id))!;
        }
        const id = await ctx.db.insert('userCanvases', {
            userId: user._id,
            canvasId,
            scale,
            x,
            y,
        });
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
