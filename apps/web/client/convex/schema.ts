import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

import {
    vAgentType,
    vAuditEventKind,
    vBranchRuntimeType,
    vCmsFieldType,
    vCmsItemStatus,
    vCmsSourceType,
    vDeploymentStatus,
    vDeploymentType,
    vHostingProvider,
    vInvitationStatus,
    vMessageRole,
    vPageAccessType,
    vPriceKey,
    vProductType,
    vProjectAccessMode,
    vProjectCreateRequestStatus,
    vProjectCustomDomainStatus,
    vProjectMemberRole,
    vProjectRoleLegacy,
    vProjectStorageMode,
    vScheduledSubscriptionAction,
    vSubscriptionStatus,
    vUsageType,
    vVerificationRequestStatus,
    vWorkspaceKind,
    vWorkspaceRole,
} from './lib/enums';

// =============================================================================
// Convex schema — full port from Drizzle (apps/web/client/convex).
//
// Single-user migration; downtime OK. No dual-write, no rollback.
//
// CHANGE LOG (vs. Drizzle):
//   * IDs: all `uuid` PKs become Convex `_id`. FK columns become `v.id(...)`.
//     Foreign keys to `auth.users` are dropped (Clerk-managed identity lives
//     only in `users.clerkUserId`).
//   * Timestamps: all `timestamp` columns become epoch-ms `v.number()`. The
//     Drizzle-managed `created_at` is dropped in favor of Convex's built-in
//     `_creationTime`; `updated_at` is kept as an explicit numeric field
//     (`updatedAt`) because mutations need to bump it deterministically.
//   * Numerics (`numeric`, `real`): collapsed to `v.number()`. Frames lose
//     arbitrary-precision storage; existing values fit comfortably in f64.
//   * `bigint` is NOT used by Drizzle here — all `integer`/`serial` fit in
//     Number.MAX_SAFE_INTEGER. No 2^53 risk.
//   * Cascades: Convex has no FK cascade. Every `onDelete: 'cascade'` in
//     Drizzle becomes manual cleanup at the mutation site or in dedicated
//     `internalMutation` helpers (see convex/internal/cascade.ts).
//   * Uniqueness: Convex has no native UNIQUE. Every Drizzle `.unique()` /
//     `uniqueIndex(...)` becomes app-level guards in mutations: read by the
//     compound index, assert empty (or matches the row being upserted), then
//     write. Documented per-table.
//   * Partial indexes (e.g. `branches_default_per_project_ux WHERE is_default`)
//     are not supported by Convex. Enforced in app code: a mutation that flips
//     `isDefault = true` must first flip the existing default row to false
//     within the same transaction.
//   * Composite primary keys (user_canvases, project_offline_pins,
//     project_custom_domains) become regular Convex tables with their own
//     `_id`. Uniqueness on the original PK columns is enforced in mutations.
//   * Drizzle `array(text)` becomes `v.array(v.string())`.
//   * Drizzle `jsonb` becomes `v.any()` when shape is heterogeneous (parts,
//     context, values, payload, runtime_metadata, credentials, suggestions);
//     we keep DB-level shape opaque, same as Drizzle did.
//   * RLS: dropped entirely. Convex queries/mutations are gated by
//     `lib/permissions.ts::requireCap` — same matrix as `packages/auth`.
//
// DROPPED TABLES (do NOT port):
//   * `auth.users` (supabase/) — Clerk-managed, identity carried by
//     `users.clerkUserId`.
//   * `user_projects` — legacy alias for project_members from the workspaces
//     migration; everything reads `projectMembers` now.
// =============================================================================

// -----------------------------------------------------------------------------
// Layout guide validator (shared between `frames.layoutGuides` and
// `layoutGuideStyles.config`). Mirrors the `LayoutGuideConfig` interface in
// `packages/models/src/project/frame.ts` — keep them in sync.
//
// `width` is `v.union(v.number(), v.null())` because Figma encodes "Auto"
// as a literal null (not undefined) and we round-trip it through the form.
// -----------------------------------------------------------------------------
const layoutGuideValidator = v.object({
    id: v.string(),
    type: v.union(v.literal('grid'), v.literal('columns'), v.literal('rows')),
    visible: v.boolean(),
    color: v.string(),
    size: v.optional(v.number()),
    count: v.optional(v.number()),
    alignment: v.optional(
        v.union(
            v.literal('stretch'),
            v.literal('left'),
            v.literal('center'),
            v.literal('right'),
            v.literal('top'),
            v.literal('bottom'),
        ),
    ),
    width: v.optional(v.union(v.number(), v.null())),
    margin: v.optional(v.number()),
    gutter: v.optional(v.number()),
    styleId: v.optional(v.union(v.id('layoutGuideStyles'), v.null())),
});

export default defineSchema({
    // -------------------------------------------------------------------------
    // Users + settings + auth-derived data
    // -------------------------------------------------------------------------
    users: defineTable({
        clerkUserId: v.string(),
        email: v.optional(v.string()),
        firstName: v.optional(v.string()),
        lastName: v.optional(v.string()),
        displayName: v.optional(v.string()),
        avatarUrl: v.optional(v.string()),
        stripeCustomerId: v.optional(v.string()),
        githubInstallationId: v.optional(v.string()),
        // True once the user has seen (and dismissed/completed) the first-run
        // editor tour. Per-user + durable so existing users never re-see it
        // after clearing browser storage or switching device/browser — the
        // old localforage-only flag was per-browser and re-triggered the tour.
        hasSeenEditorOnboarding: v.optional(v.boolean()),
        updatedAt: v.number(),
    })
        .index('by_clerk_user_id', ['clerkUserId'])
        .index('by_email', ['email'])
        .index('by_stripe_customer_id', ['stripeCustomerId'])
        .index('by_github_installation_id', ['githubInstallationId']),

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

    // Drizzle `user_canvases` keyed (user_id, canvas_id) as composite PK.
    // Convex: regular `_id`, uniqueness enforced in upsert mutation.
    // canvasId references the canvases table _id (FK strict).
    userCanvases: defineTable({
        userId: v.id('users'),
        canvasId: v.id('canvases'),
        scale: v.number(),
        x: v.number(),
        y: v.number(),
        // Per-user canvas UI toggles, persisted alongside scale/pan.
        // Optional so legacy rows (which predate these columns) keep
        // loading — readers fall back to `false` / `true` respectively.
        showRulers: v.optional(v.boolean()),
        showLayoutGuides: v.optional(v.boolean()),
    })
        .index('by_user_canvas', ['userId', 'canvasId'])
        // Lets cascade deletes target a canvas's rows directly instead of
        // scanning the whole table (deleteCanvasInternal).
        .index('by_canvas', ['canvasId']),

    // -------------------------------------------------------------------------
    // Workspaces
    // -------------------------------------------------------------------------
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

    // -------------------------------------------------------------------------
    // Projects + branches + settings + invitations + offline + create requests
    // -------------------------------------------------------------------------
    projects: defineTable({
        name: v.string(),
        description: v.optional(v.string()),
        tags: v.array(v.string()),
        updatedAt: v.number(),

        // preview image
        previewImgUrl: v.optional(v.string()),
        previewImgPath: v.optional(v.string()),
        previewImgBucket: v.optional(v.string()),
        previewImgStorageId: v.optional(v.id('_storage')),
        updatedPreviewImgAt: v.optional(v.number()),

        // runtime mode
        storageMode: vProjectStorageMode,
        runtimeMetadata: v.any(),

        // workspace + access
        workspaceId: v.id('workspaces'),
        createdByUserId: v.id('users'),
        accessMode: vProjectAccessMode,

        // User-chosen preview subdomain label (e.g. "my-site" → my-site.weblab.app).
        // When unset, the preview domain falls back to a slug derived from the
        // project id. Set via domains.setPreviewSlug; consumed by _previewCreate.
        previewSlug: v.optional(v.string()),

        // deprecated sandbox columns — kept opaque for back-compat
        sandboxId: v.optional(v.string()),
        sandboxUrl: v.optional(v.string()),
    })
        .index('by_workspace', ['workspaceId'])
        .index('by_created_by_user', ['createdByUserId'])
        .index('by_workspace_updated', ['workspaceId', 'updatedAt'])
        .index('by_preview_slug', ['previewSlug']),

    branches: defineTable({
        projectId: v.id('projects'),
        name: v.string(),
        description: v.optional(v.string()),
        isDefault: v.boolean(),
        updatedAt: v.number(),

        // git
        gitBranch: v.optional(v.string()),
        gitCommitSha: v.optional(v.string()),
        gitRepoUrl: v.optional(v.string()),

        // sandbox — optional during optimistic creation; filled in by _provisionSandbox
        sandboxId: v.optional(v.string()),

        // runtime
        runtimeType: vBranchRuntimeType,
        runtimeMetadata: v.any(),
    })
        .index('by_project', ['projectId'])
        // App-level guard on (projectId, name) uniqueness.
        .index('by_project_name', ['projectId', 'name'])
        // App-level partial unique on (projectId) WHERE isDefault=true.
        // Mutations must demote any existing default before promoting another.
        .index('by_project_default', ['projectId', 'isDefault']),

    projectSettings: defineTable({
        projectId: v.id('projects'),
        runCommand: v.string(),
        buildCommand: v.string(),
        installCommand: v.string(),
    })
        // Drizzle UNIQUE on projectId → app-level guard in upsert.
        .index('by_project', ['projectId']),

    projectInvitations: defineTable({
        projectId: v.id('projects'),
        inviterId: v.id('users'),
        inviteeEmail: v.string(),
        token: v.string(),
        // Legacy ProjectRole — dual-written in Drizzle, kept for backward
        // compatibility while reading old invitations. New writes should only
        // set `memberRole`.
        role: vProjectRoleLegacy,
        memberRole: v.optional(vProjectMemberRole),
        status: vInvitationStatus,
        expiresAt: v.number(),
        acceptedAt: v.optional(v.number()),
        revokedAt: v.optional(v.number()),
        updatedAt: v.number(),
    })
        .index('by_token', ['token'])
        .index('by_invitee_email_project', ['inviteeEmail', 'projectId'])
        .index('by_status', ['status'])
        .index('by_project', ['projectId'])
        .index('by_inviter', ['inviterId']),

    projectOfflinePins: defineTable({
        userId: v.id('users'),
        projectId: v.id('projects'),
        pinnedAt: v.number(),
    })
        .index('by_user_project', ['userId', 'projectId'])
        .index('by_user', ['userId'])
        .index('by_project', ['projectId']),

    pageAccess: defineTable({
        projectId: v.id('projects'),
        pagePath: v.string(),
        accessType: vPageAccessType,
        passwordHash: v.optional(v.string()),
        updatedAt: v.number(),
    })
        .index('by_project_path', ['projectId', 'pagePath'])
        .index('by_project', ['projectId']),

    projectCreateRequests: defineTable({
        projectId: v.id('projects'),
        context: v.any(), // CreateRequestContext[] — discriminated union
        status: vProjectCreateRequestStatus,
        updatedAt: v.number(),
    })
        .index('by_project', ['projectId'])
        .index('by_status', ['status']),

    // -------------------------------------------------------------------------
    // Canvas
    // -------------------------------------------------------------------------
    canvases: defineTable({
        projectId: v.id('projects'),
    }).index('by_project', ['projectId']),

    frames: defineTable({
        canvasId: v.id('canvases'),
        branchId: v.optional(v.id('branches')),
        url: v.string(),

        // display data — collapsed from Drizzle numeric() to f64
        x: v.number(),
        y: v.number(),
        width: v.number(),
        height: v.number(),

        // breakpoint group
        groupId: v.optional(v.string()),
        breakpointId: v.optional(v.string()),
        breakpointName: v.optional(v.string()),
        breakpointOrder: v.optional(v.number()),

        // Figma-style per-frame layout guides (Grid / Columns / Rows).
        // Optional — most frames have 0 or 1; the array shape lets a single
        // frame stack multiple guides (e.g. column grid + row baseline) like
        // Figma. See `layoutGuideValidator` above for the field-by-field
        // contract; mirrors `LayoutGuideConfig` in packages/models.
        layoutGuides: v.optional(v.array(layoutGuideValidator)),

        // deprecated — kept for back-compat
        type: v.optional(v.string()),
    })
        .index('by_canvas', ['canvasId'])
        .index('by_branch', ['branchId']),

    // Project-level saved layout guide styles — Figma's "Layout grid styles".
    // Users build a guide on one frame, save it as a named style, then apply
    // it to other frames. `config` reuses the same validator as the per-frame
    // guides; the `id` and `styleId` fields inside it are ignored when saving
    // as a style (style is the source of truth, not the linker).
    layoutGuideStyles: defineTable({
        projectId: v.id('projects'),
        name: v.string(),
        config: layoutGuideValidator,
        updatedAt: v.number(),
    }).index('by_project', ['projectId']),

    // -------------------------------------------------------------------------
    // Chat
    // -------------------------------------------------------------------------
    conversations: defineTable({
        projectId: v.id('projects'),
        agentType: v.optional(vAgentType),
        displayName: v.optional(v.string()),
        updatedAt: v.number(),
        suggestions: v.optional(v.any()), // ChatSuggestion[]
        // Background-generated rolling summary of older turns. Set when chat
        // history grows past 50% of the model's context window so subsequent
        // turns can ship a compact summary in place of the raw transcript and
        // keep the Anthropic prompt-cache prefix warm.
        summaryText: v.optional(v.string()),
        // Cursor: the id of the last message included in summaryText. When
        // the request-builder applies the summary, it drops messages up to
        // and including this id and replaces them with the summary.
        summarizedUpToMessageId: v.optional(v.string()),
        // Epoch ms when the summary was generated. Used by the client to
        // detect a stale summary (e.g. older than the last N user turns).
        summaryUpdatedAt: v.optional(v.number()),
    })
        .index('by_project', ['projectId'])
        .index('by_project_updated', ['projectId', 'updatedAt']),

    messages: defineTable({
        conversationId: v.id('conversations'),
        content: v.string(),
        role: vMessageRole,
        context: v.any(), // MessageContext[]
        parts: v.any(), // ChatMessage['parts']
        checkpoints: v.any(), // MessageCheckpoints[]
        usage: v.optional(v.any()), // LanguageModelUsage

        // deprecated columns
        applied: v.optional(v.boolean()),
        commitOid: v.optional(v.string()),
        snapshots: v.optional(v.any()),
    }).index('by_conversation', ['conversationId']),

    // -------------------------------------------------------------------------
    // CMS
    // -------------------------------------------------------------------------
    cmsSources: defineTable({
        projectId: v.id('projects'),
        name: v.string(),
        type: vCmsSourceType,
        credentials: v.any(), // adapter-specific shape, opaque at DB layer
        status: v.string(),
        updatedAt: v.number(),
    }).index('by_project', ['projectId']),

    cmsCollections: defineTable({
        projectId: v.id('projects'),
        sourceId: v.id('cmsSources'),
        name: v.string(),
        slug: v.string(),
        icon: v.optional(v.string()),
        description: v.optional(v.string()),
        updatedAt: v.number(),
    })
        .index('by_project', ['projectId'])
        .index('by_project_slug', ['projectId', 'slug'])
        .index('by_source', ['sourceId']),

    cmsFields: defineTable({
        collectionId: v.id('cmsCollections'),
        name: v.string(),
        key: v.string(),
        type: vCmsFieldType,
        config: v.any(),
        helpText: v.optional(v.string()),
        required: v.boolean(),
        order: v.number(),
        updatedAt: v.number(),
    })
        .index('by_collection', ['collectionId'])
        .index('by_collection_key', ['collectionId', 'key'])
        .index('by_collection_order', ['collectionId', 'order']),

    cmsItems: defineTable({
        collectionId: v.id('cmsCollections'),
        slug: v.optional(v.string()),
        status: vCmsItemStatus,
        remoteId: v.optional(v.string()),
        values: v.any(),
        publishedAt: v.optional(v.number()),
        updatedAt: v.number(),
    })
        .index('by_collection', ['collectionId'])
        .index('by_collection_slug', ['collectionId', 'slug'])
        .index('by_collection_remote', ['collectionId', 'remoteId'])
        .index('by_collection_status', ['collectionId', 'status']),

    cmsCollectionPages: defineTable({
        projectId: v.id('projects'),
        collectionId: v.id('cmsCollections'),
        pagePath: v.string(),
        matchFieldKey: v.string(),
        updatedAt: v.number(),
    })
        .index('by_project', ['projectId'])
        .index('by_project_path', ['projectId', 'pagePath'])
        .index('by_collection', ['collectionId']),

    cmsBindings: defineTable({
        projectId: v.id('projects'),
        oid: v.string(),
        binding: v.any(), // CmsBindingPayload discriminated union
        updatedAt: v.number(),
    })
        .index('by_project', ['projectId'])
        .index('by_project_oid', ['projectId', 'oid']),

    // -------------------------------------------------------------------------
    // Comments
    // -------------------------------------------------------------------------
    // authorId is NOT an FK in Drizzle (text uuid stored verbatim) — keep
    // string shape so legacy rows referencing dropped auth.users IDs survive.
    projectComments: defineTable({
        projectId: v.id('projects'),
        canvasX: v.number(),
        canvasY: v.number(),
        elementSelector: v.optional(v.string()),
        content: v.string(),
        authorId: v.string(),
        authorName: v.string(),
        updatedAt: v.number(),
        resolvedAt: v.optional(v.number()),
    })
        .index('by_project', ['projectId'])
        .index('by_project_resolved', ['projectId', 'resolvedAt']),

    commentReplies: defineTable({
        commentId: v.id('projectComments'),
        content: v.string(),
        authorId: v.string(),
        authorName: v.string(),
        updatedAt: v.number(),
    }).index('by_comment', ['commentId']),

    // -------------------------------------------------------------------------
    // Domains / hosting
    // -------------------------------------------------------------------------
    customDomains: defineTable({
        apexDomain: v.string(),
        verified: v.boolean(),
        updatedAt: v.number(),
    }).index('by_apex_domain', ['apexDomain']),

    projectCustomDomains: defineTable({
        customDomainId: v.id('customDomains'),
        projectId: v.id('projects'),
        fullDomain: v.string(),
        status: vProjectCustomDomainStatus,
        updatedAt: v.number(),
    })
        .index('by_domain_project', ['customDomainId', 'projectId'])
        .index('by_project', ['projectId'])
        .index('by_full_domain', ['fullDomain']),

    customDomainVerification: defineTable({
        customDomainId: v.id('customDomains'),
        projectId: v.id('projects'),
        fullDomain: v.string(),
        freestyleVerificationId: v.string(),
        txtRecord: v.any(), // TxtVerificationRecord
        aRecords: v.array(v.any()), // AVerificationRecord[]
        status: vVerificationRequestStatus,
        updatedAt: v.number(),
    })
        .index('by_custom_domain', ['customDomainId'])
        .index('by_project', ['projectId'])
        .index('by_full_domain', ['fullDomain']),

    previewDomains: defineTable({
        fullDomain: v.string(),
        projectId: v.optional(v.id('projects')),
        updatedAt: v.number(),
    })
        .index('by_full_domain', ['fullDomain'])
        .index('by_project', ['projectId']),

    deployments: defineTable({
        // Convex generates _id; if external correlation needed, store the
        // provider's deployment id alongside.
        providerDeploymentId: v.optional(v.string()),
        requestedBy: v.id('users'),
        projectId: v.id('projects'),
        sandboxId: v.optional(v.string()),
        urls: v.optional(v.array(v.string())),
        type: vDeploymentType,
        status: vDeploymentStatus,
        provider: vHostingProvider,

        message: v.optional(v.string()),
        buildLog: v.optional(v.string()),
        error: v.optional(v.string()),
        progress: v.optional(v.number()),

        buildScript: v.optional(v.string()),
        buildFlags: v.optional(v.string()),
        envVars: v.optional(v.record(v.string(), v.string())),

        updatedAt: v.number(),
    })
        .index('by_project', ['projectId'])
        .index('by_project_status', ['projectId', 'status'])
        .index('by_requested_by', ['requestedBy'])
        .index('by_provider_deployment', ['providerDeploymentId']),

    hostingProviderConnections: defineTable({
        userId: v.id('users'),
        provider: vHostingProvider,
        tokenEncrypted: v.string(),
        accountLabel: v.optional(v.string()),
        accountId: v.optional(v.string()),
        updatedAt: v.number(),
    })
        .index('by_user_provider', ['userId', 'provider'])
        .index('by_user', ['userId']),

    // -------------------------------------------------------------------------
    // Feedback (deprecated upstream — kept for completeness)
    // -------------------------------------------------------------------------
    feedbacks: defineTable({
        userId: v.optional(v.id('users')),
        email: v.optional(v.string()),
        message: v.string(),
        pageUrl: v.optional(v.string()),
        userAgent: v.optional(v.string()),
        attachments: v.array(
            v.object({
                name: v.string(),
                size: v.number(),
                type: v.string(),
                url: v.string(),
                uploadedAt: v.string(),
            }),
        ),
        metadata: v.any(),
    }).index('by_user', ['userId']),

    // -------------------------------------------------------------------------
    // Skills
    // -------------------------------------------------------------------------
    // Two partial UNIQUE indexes in Drizzle:
    //   (user_id, name) WHERE project_id IS NULL   — user-global names
    //   (user_id, project_id, name) WHERE NOT NULL — per-project names
    // Enforced in mutations via the `by_user_project_name` index + projectId
    // equality check.
    skills: defineTable({
        userId: v.id('users'),
        projectId: v.optional(v.id('projects')),
        name: v.string(),
        description: v.string(),
        content: v.string(),
        enabled: v.boolean(),
        updatedAt: v.number(),
    })
        .index('by_user', ['userId'])
        .index('by_user_project_name', ['userId', 'projectId', 'name'])
        .index('by_project', ['projectId']),

    // -------------------------------------------------------------------------
    // Subscription / billing
    // -------------------------------------------------------------------------
    products: defineTable({
        name: v.string(),
        type: vProductType,
        stripeProductId: v.string(),
    }).index('by_stripe_product_id', ['stripeProductId']),

    prices: defineTable({
        productId: v.id('products'),
        key: vPriceKey,
        monthlyMessageLimit: v.number(),
        stripePriceId: v.string(),
    })
        .index('by_product', ['productId'])
        .index('by_stripe_price_id', ['stripePriceId'])
        .index('by_key', ['key']),

    subscriptions: defineTable({
        userId: v.id('users'),
        productId: v.id('products'),
        priceId: v.id('prices'),

        startedAt: v.number(),
        updatedAt: v.number(),
        endedAt: v.optional(v.number()),
        status: vSubscriptionStatus,

        stripeCustomerId: v.string(),
        stripeSubscriptionId: v.string(),
        stripeSubscriptionItemId: v.string(),
        stripeSubscriptionScheduleId: v.optional(v.string()),
        stripeCurrentPeriodStart: v.number(),
        stripeCurrentPeriodEnd: v.number(),

        scheduledAction: v.optional(vScheduledSubscriptionAction),
        scheduledPriceId: v.optional(v.id('prices')),
        scheduledChangeAt: v.optional(v.number()),
    })
        .index('by_user', ['userId'])
        .index('by_user_status', ['userId', 'status'])
        .index('by_stripe_subscription_id', ['stripeSubscriptionId'])
        .index('by_stripe_subscription_item_id', ['stripeSubscriptionItemId']),

    rateLimits: defineTable({
        userId: v.id('users'),
        subscriptionId: v.id('subscriptions'),

        updatedAt: v.number(),
        startedAt: v.number(),
        endedAt: v.number(),

        max: v.number(),
        left: v.number(),

        // carryOverKey was `uuid` in Drizzle (string-shaped key, not FK).
        carryOverKey: v.string(),
        carryOverTotal: v.number(),

        stripeSubscriptionItemId: v.string(),
    })
        .index('by_user_time', ['userId', 'startedAt', 'endedAt'])
        .index('by_subscription', ['subscriptionId']),

    usageRecords: defineTable({
        userId: v.id('users'),
        type: vUsageType,
        timestamp: v.number(),
        traceId: v.optional(v.string()),
        // Credits this record consumed. Undefined on legacy/single-credit rows
        // (treated as 1). Set to the credit multiplier for costlier operations
        // such as image generation (IMAGE_CREDIT_COST). `revertIncrement`
        // refunds exactly this many credits to the linked bucket.
        amount: v.optional(v.number()),
        // Real model spend (USD) this request cost, written by `reconcileUsage`
        // after the stream finishes. Audit only — explains why `amount` (the
        // credit cost) came out the way it did. Undefined until reconciled, and
        // on free/legacy rows that never reconcile.
        costUsd: v.optional(v.number()),
        // The rateLimit bucket the original `increment` mutation decremented
        // from (Pro users only — undefined for free-tier records). Required
        // so `revertIncrement` can refund the SAME bucket and ignore the
        // client-supplied `rateLimitId`. Without this link, any signed-in
        // caller could call `revertIncrement` repeatedly with any of their
        // own rateLimitIds and receive unlimited free credits.
        linkedRateLimitId: v.optional(v.id('rateLimits')),
    })
        .index('by_user_time', ['userId', 'timestamp'])
        .index('by_user_trace', ['userId', 'traceId'])
        .index('by_user_type_time', ['userId', 'type', 'timestamp']),

    // Drizzle PK was `email`; in Convex we keep the row's own `_id` and
    // index by email for lookup. Recommend deletion once promo window closes.
    legacySubscriptions: defineTable({
        email: v.string(),
        stripeCouponId: v.string(),
        stripePromotionCodeId: v.string(),
        stripePromotionCode: v.string(),
        redeemAt: v.optional(v.number()),
        redeemBy: v.optional(v.number()),
    }).index('by_email', ['email']),

    // Stripe webhook idempotency log. The /webhooks/stripe httpAction can
    // receive the same `evt.id` more than once — Stripe retries on 5xx for up
    // to 3 days and may double-deliver even on 2xx. Each subscription handler
    // records the event id here inside its own transaction and early-returns
    // if the id is already present, so credit-granting branches run exactly
    // once per Stripe event. Convex OCC makes the check+insert race-safe: a
    // concurrent duplicate conflicts on the by_event_id read set and retries
    // into the "already processed" path.
    stripeEventLog: defineTable({
        eventId: v.string(),
        eventType: v.string(),
        processedAt: v.number(),
    })
        .index('by_event_id', ['eventId'])
        // Range index for the purge cron — drop rows older than Stripe's retry
        // window so the table stays bounded.
        .index('by_processed_at', ['processedAt']),

    // -------------------------------------------------------------------------
    // Presence (live cursors)
    // -------------------------------------------------------------------------
    // Replaces Supabase Realtime channels. Each row is one user's cursor in
    // one project. `lastSeen` is bumped on heartbeat; the query filters by
    // (now - lastSeen) < 5000ms to compute the active set. Stale rows linger
    // but don't surface; cleanup runs on the next mutation or via scheduled
    // internal mutation (optional).
    cursors: defineTable({
        projectId: v.id('projects'),
        userId: v.id('users'),
        cursorX: v.optional(v.number()),
        cursorY: v.optional(v.number()),
        displayName: v.string(),
        avatarUrl: v.optional(v.string()),
        lastSeen: v.number(),
    })
        .index('by_project_user', ['projectId', 'userId'])
        .index('by_project_lastSeen', ['projectId', 'lastSeen'])
        // Lets `deleteUserCascade` target a user's cursor rows directly
        // instead of scanning the whole cursors table.
        .index('by_user', ['userId'])
        // Global lastSeen range index for `purgeStaleCursors` — without it the
        // purge does an unindexed table scan (`.take(n)` bounds rows returned,
        // not rows scanned).
        .index('by_lastSeen', ['lastSeen']),

    // -------------------------------------------------------------------------
    // AI usage events — per-request token/cost/cache/latency telemetry
    // -------------------------------------------------------------------------
    // Inserted fire-and-forget from the chat API's onFinish callback. Powers
    // the admin /admin/usage dashboard and lets us answer "what is each user
    // costing us" and "what is our cache hit rate" without hitting LangFuse.
    // No prompt/output content is stored here — counts only.
    aiUsageEvents: defineTable({
        userId: v.id('users'),
        conversationId: v.optional(v.id('conversations')),
        projectId: v.optional(v.id('projects')),
        // SDK-generated message UUID (NOT a Convex Id). The chat route uses
        // uuidv4 for the in-stream message id; the persisted Convex _id is
        // assigned later by replaceConversationMessages. We store the SDK id
        // so analytics can correlate a usage event with a UI message without
        // racing the Convex insert.
        messageId: v.optional(v.string()),
        provider: v.string(), // 'anthropic-direct' | 'openrouter' | 'ollama'
        model: v.string(),
        chatType: v.string(),
        resolvedFromAuto: v.boolean(),
        inputTokens: v.number(),
        outputTokens: v.number(),
        cacheCreationTokens: v.number(),
        cacheReadTokens: v.number(),
        estimatedCostUsd: v.number(),
        ttfMs: v.optional(v.number()),
        totalMs: v.optional(v.number()),
        toolCallCount: v.optional(v.number()),
        errorType: v.optional(v.string()),
        // Epoch ms — Convex auto-stores _creationTime, but we keep an explicit
        // createdAt so range queries on a manual index are predictable.
        createdAt: v.number(),
    })
        .index('by_user_createdAt', ['userId', 'createdAt'])
        .index('by_conversation', ['conversationId'])
        .index('by_model_createdAt', ['model', 'createdAt'])
        .index('by_createdAt', ['createdAt']),

    // =========================================================================
    // AI Wireframes (Relume-style: brief → sitemap → wireframe → style guide →
    // design). The sitemap is the source of truth; wireframe sections link back
    // to sitemap sections and cascade on delete (Convex has no FK cascade — the
    // bidirectional cleanup lives in convex/wireframes.ts mutations).
    // =========================================================================
    wireframeDocs: defineTable({
        projectId: v.id('projects'),
        // Bounded brief captured from the workspace form (never an unbounded list).
        brief: v.object({
            companyName: v.string(),
            industry: v.optional(v.string()),
            audience: v.optional(v.string()),
            offer: v.optional(v.string()),
            tone: v.optional(v.string()),
            references: v.optional(v.string()),
            pageCount: v.optional(v.number()),
        }),
        status: v.union(
            v.literal('brief'),
            v.literal('sitemap'),
            v.literal('wireframe'),
            v.literal('styleGuide'),
            v.literal('design'),
        ),
        activeStyleGuideId: v.optional(v.id('styleGuides')),
        updatedAt: v.number(),
    }).index('by_project', ['projectId']),

    sitemapPages: defineTable({
        docId: v.id('wireframeDocs'),
        title: v.string(),
        slug: v.string(),
        description: v.optional(v.string()),
        order: v.number(),
        parentPageId: v.optional(v.id('sitemapPages')),
    })
        .index('by_doc', ['docId'])
        .index('by_doc_order', ['docId', 'order'])
        .index('by_doc_slug', ['docId', 'slug']),

    sitemapSections: defineTable({
        docId: v.id('wireframeDocs'),
        pageId: v.id('sitemapPages'),
        title: v.string(),
        description: v.string(),
        intent: v.string(),
        suggestedBlockType: v.string(),
        order: v.number(),
        linkedWireframeSectionId: v.optional(v.id('wireframeSections')),
    })
        .index('by_doc', ['docId'])
        .index('by_page', ['pageId'])
        .index('by_page_order', ['pageId', 'order']),

    wireframePages: defineTable({
        docId: v.id('wireframeDocs'),
        sitemapPageId: v.id('sitemapPages'),
        title: v.string(),
        slug: v.string(),
        order: v.number(),
    })
        .index('by_doc', ['docId'])
        .index('by_sitemap_page', ['sitemapPageId']),

    wireframeSections: defineTable({
        docId: v.id('wireframeDocs'),
        wireframePageId: v.id('wireframePages'),
        sitemapSectionId: v.optional(v.id('sitemapSections')),
        blockId: v.string(),
        blockCategory: v.string(),
        blockVariantId: v.optional(v.string()),
        // Per-block editable copy; shape varies by block, so stored as `v.any()`
        // and validated against the block's Zod schema at the mutation boundary
        // (mirrors the existing `projects.runtimeMetadata: v.any()` pattern).
        content: v.any(),
        order: v.number(),
    })
        .index('by_doc', ['docId'])
        .index('by_page', ['wireframePageId'])
        .index('by_page_order', ['wireframePageId', 'order'])
        .index('by_sitemap_section', ['sitemapSectionId']),

    styleGuides: defineTable({
        docId: v.id('wireframeDocs'),
        conceptName: v.string(),
        // Token overrides on the shadcn CSS-var contract; bounded object,
        // validated at the mutation boundary.
        tokens: v.any(),
        isActive: v.boolean(),
        updatedAt: v.number(),
    }).index('by_doc', ['docId']),
});
