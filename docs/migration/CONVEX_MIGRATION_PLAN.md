# CONVEX_MIGRATION_PLAN.md

**Output of:** Database Agent (Phase 2)
**Status:** Plan draft. No `convex/` directory exists yet.
**Companion:** `MIGRATION_DISCOVERY.md` §4 (Drizzle schema inventory), `MIGRATION_TASK.md` Phase 4.

This document maps every Postgres table to a Convex schema, defines indexes and validators, lays out the per-batch migration order, and provides export/import scripts for the eventual data cutover.

---

## 1. Convex Project Layout

```
apps/web/client/
├── convex/
│   ├── _generated/              # auto, .gitignore: false
│   ├── schema.ts                # all 41 tables defined
│   ├── auth.config.ts           # Clerk issuer config
│   ├── http.ts                  # HTTP actions (Stripe + Clerk webhooks)
│   ├── crons.ts                 # cron tasks (cleanup, daily aggregates)
│   ├── lib/
│   │   ├── permissions.ts       # port of @weblab/auth's can() + requireCap
│   │   ├── audit.ts             # port of permissions/audit.ts
│   │   ├── identity.ts          # ctx.auth.getUserIdentity() → users row
│   │   └── encryption.ts        # provider token encrypt/decrypt
│   ├── users.ts                 # query/mutation per domain
│   ├── userSettings.ts
│   ├── workspaces.ts
│   ├── projects.ts
│   ├── canvases.ts
│   ├── frames.ts
│   ├── branches.ts
│   ├── conversations.ts
│   ├── messages.ts
│   ├── cms.ts
│   ├── comments.ts
│   ├── domains.ts
│   ├── deployments.ts
│   ├── subscriptions.ts
│   ├── usage.ts
│   ├── skills.ts
│   ├── presence.ts              # or via @convex-dev/presence
│   ├── files.ts                 # File Storage helpers (preview images)
│   ├── stripeWebhooks.ts        # called from http.ts
│   ├── clerkWebhooks.ts         # called from http.ts
│   └── migrations/              # @convex-dev/migrations definitions
│       ├── _index.ts
│       └── … (one file per data backfill)
```

Convex deployment (updated 2026-05-20):

| Env | Deployment name | URL var |
|---|---|---|
| Single shared | `weblab-dev` (existing) | `NEXT_PUBLIC_CONVEX_URL` |
| (Future) prod | `weblab-prod` | created at real-user launch time |

---

## 2. Schema Mapping — Postgres → Convex

Convex docs are identifier-by-`Id<"table">` first. Where Postgres uses an external UUID (Stripe, freestyle, etc.), we keep the raw string in a regular field. Composite PKs become an index + transactional uniqueness check.

### Tables → Convex tables

| Postgres table | Convex table | Notes |
|---|---|---|
| `auth.users` | (none — Clerk owns identity) | Replaced by `ctx.auth.getUserIdentity()` |
| `users` | `users` | Add `clerkUserId: v.string()` with index `by_clerk_user_id` |
| `user_settings` | `userSettings` | 1:1 with users via `userId` index |
| `user_provider_connections` | `providerConnections` | Re-encrypt tokens during import |
| `user_projects` (legacy) | (drop in Phase 0 via migration 0037) | — |
| `user_canvases` | `userCanvases` | Composite (userId, canvasId) via index |
| `workspaces` | `workspaces` | — |
| `workspace_members` | `workspaceMembers` | UNIQUE (workspaceId, userId) via mutation check |
| `workspace_invitations` | `workspaceInvitations` | Partial unique pending invite via mutation check |
| `project_members` | `projectMembers` | UNIQUE (projectId, userId) via mutation check |
| `audit_log` | `auditLog` | High-volume append; index by (workspaceId, createdAt) and (projectId, createdAt) |
| `projects` | `projects` | Drop `sandbox_id` and `sandbox_url` deprecated columns |
| `project_settings` | `projectSettings` | 1:1 with projects |
| `project_invitations` | `projectInvitations` | Partial unique pending invite via mutation check |
| `project_create_requests` | `projectCreateRequests` | 1:1 with projects |
| `project_offline_pins` | `projectOfflinePins` | Composite (userId, projectId) via index |
| `page_access` | `pageAccess` | UNIQUE (projectId, pagePath) |
| `canvas` | `canvases` | Renamed plural |
| `frames` | `frames` | Index on `groupId`, `canvasId`, `branchId` |
| `branches` | `branches` | Partial unique "one default per project" via mutation check |
| `conversations` | `conversations` | Index by projectId |
| `messages` | `messages` | Index by conversationId |
| `cms_source` | `cmsSources` | — |
| `cms_collection` | `cmsCollections` | UNIQUE (projectId, slug) |
| `cms_field` | `cmsFields` | UNIQUE (collectionId, key) |
| `cms_item` | `cmsItems` | UNIQUE (collectionId, slug), (collectionId, remoteId) |
| `cms_binding` | `cmsBindings` | indexed by (projectId, oid) |
| `cms_collection_page` | `cmsCollectionPages` | UNIQUE (projectId, pagePath) |
| `project_comments` | `projectComments` | author SET NULL → `v.optional(v.id("users"))` |
| `comment_replies` | `commentReplies` | same |
| `custom_domains` | `customDomains` | UNIQUE on `apexDomain` |
| `custom_domain_verification` | `customDomainVerifications` | — |
| `project_custom_domains` | `projectCustomDomains` | Composite (customDomainId, projectId) via index |
| `preview_domains` | `previewDomains` | UNIQUE `fullDomain` |
| `deployments` | `deployments` | append-only; index by (projectId, _creationTime) |
| `hosting_provider_connections` | `hostingProviderConnections` | UNIQUE (userId, provider); re-encrypt tokens |
| `products` | `stripeProducts` | UNIQUE `stripeProductId` |
| `prices` | `stripePrices` | UNIQUE `stripePriceId` |
| `subscriptions` | `subscriptions` | UNIQUE `stripeSubscriptionId`, `stripeSubscriptionItemId` |
| `legacy_subscriptions` | `legacySubscriptions` | PK by email — Convex doesn't allow string PKs, use index `by_email` |
| `rate_limits` | `rateLimits` | index `by_user_started_ended` |
| `usage_records` | `usageRecords` | UNIQUE (userId, traceId) via mutation check; index (userId, timestamp) |
| `skills` | `skills` | Two partial unique indexes via mutation check |
| `feedbacks` (deprecated) | (skip or `feedbacks`) | Decision in Phase 0 |

### Enums → `v.union(v.literal(...))`

All 22 Postgres enums centralized in `convex/lib/enums.ts`:

```ts
import { v } from "convex/values";

export const vWorkspaceKind = v.union(v.literal("personal"), v.literal("team"));
export const vWorkspaceRole = v.union(
  v.literal("owner"), v.literal("admin"), v.literal("member"), v.literal("viewer")
);
export const vProjectMemberRole = v.union(
  v.literal("manager"), v.literal("editor"), v.literal("reviewer"), v.literal("viewer")
);
export const vProjectAccessMode = v.union(v.literal("workspace"), v.literal("restricted"));
export const vInvitationStatus = v.union(
  v.literal("pending"), v.literal("accepted"), v.literal("revoked"), v.literal("expired")
);
export const vMessageRole = v.union(
  v.literal("user"), v.literal("assistant"), v.literal("system")
);
export const vAgentType = v.union(v.literal("root"), v.literal("user"));
export const vDeploymentStatus = v.union(
  v.literal("pending"), v.literal("in_progress"), v.literal("completed"),
  v.literal("failed"), v.literal("cancelled")
);
export const vDeploymentType = v.union(
  v.literal("preview"), v.literal("custom"),
  v.literal("unpublish_preview"), v.literal("unpublish_custom")
);
export const vHostingProvider = v.union(
  v.literal("freestyle"), v.literal("vercel"), v.literal("netlify"),
  v.literal("cloudflare"), v.literal("railway"), v.literal("render")
);
export const vPageAccessType = v.union(v.literal("public"), v.literal("password"));
export const vProjectCreateStatus = v.union(
  v.literal("pending"), v.literal("completed"), v.literal("failed")
);
export const vProjectCustomDomainStatus = v.union(
  v.literal("active"), v.literal("cancelled")
);
export const vVerificationRequestStatus = v.union(
  v.literal("pending"), v.literal("verified"), v.literal("cancelled")
);
export const vUsageType = v.union(v.literal("message"), v.literal("deployment"));
export const vSubscriptionStatus = v.union(v.literal("active"), v.literal("canceled"));
export const vScheduledSubscriptionAction = v.union(
  v.literal("price_change"), v.literal("cancellation")
);
export const vProductType = v.union(v.literal("free"), v.literal("pro"));
export const vPriceKey = v.union(
  v.literal("PRO_MONTHLY_TIER_1"), v.literal("PRO_MONTHLY_TIER_2"),
  // ... through TIER_11
);
export const vAuditEventKind = v.union(
  v.literal("workspace.created"), v.literal("workspace.updated"),
  v.literal("workspace.deleted"), v.literal("workspace.member_added"),
  v.literal("workspace.member_removed"), v.literal("workspace.member_role_changed"),
  v.literal("workspace.transferred"), v.literal("workspace.invitation_sent"),
  v.literal("workspace.invitation_accepted"), v.literal("workspace.invitation_revoked"),
  v.literal("project.created"), v.literal("project.deleted"),
  v.literal("project.access_mode_changed"), v.literal("project.member_added")
);
```

### JSONB columns — concrete validators

| Column | Convex validator | Rationale |
|---|---|---|
| `user_settings.custom_shortcuts` | `v.record(v.string(), v.string())` | action → key |
| `projects.runtime_metadata` | `v.object({ framework: v.optional(v.string()), cloud: v.optional(...), local: v.optional(...), sync: v.optional(...) })` | Existing TS type |
| `branches.runtime_metadata` | same shape minus `framework` | — |
| `conversations.suggestions` | `v.array(v.object({ title: v.string(), prompt: v.string() }))` | — |
| `messages.context` | 6-variant `v.union(v.object({type: v.literal("FILE"), ...}), ...)` | discriminated by `type` |
| `messages.parts` | `v.any()` | Vercel AI SDK shape drifts; validate at write boundary with Zod |
| `messages.checkpoints` | `v.array(v.object({ type: v.literal("git"), createdAt: v.number(), oid: v.string(), branchId: v.optional(v.id("branches")) }))` | — |
| `messages.usage` | `v.optional(v.object({ inputTokens: v.optional(v.number()), outputTokens: v.optional(v.number()), totalTokens: v.optional(v.number()) }))` | — |
| `cms_binding.binding` | 5-variant `v.union(...)` per `CmsBindingPayload` | — |
| `cms_field.config` | `v.any()` | shape varies by sibling `type`, app-side Zod |
| `cms_item.values` | `v.any()` | shape derived from collection's fields |
| `cms_source.credentials` | `v.any()` | adapter-specific |
| `project_create_requests.context` | 4-variant `v.union(...)` per `CreateRequestContext` | — |
| `custom_domain_verification.txt_record` | `v.object({type:v.literal("TXT"),name:v.string(),value:v.string(),verified:v.boolean()})` | — |
| `custom_domain_verification.a_records` | `v.array(v.object({type:v.literal("A"),name:v.string(),value:v.string(),verified:v.boolean()}))` | — |
| `deployments.env_vars` | `v.optional(v.record(v.string(), v.string()))` | — |
| `feedbacks.attachments` | `v.array(v.object({name:v.string(),size:v.number(),type:v.string(),url:v.string(),uploadedAt:v.number()}))` | — |
| `feedbacks.metadata` | `v.any()` | — |
| `audit_log.payload` | `v.any()` | shape varies by event kind |

---

## 3. Concrete Schema (excerpt — full file generated when Phase 4 starts)

```ts
// apps/web/client/convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  vWorkspaceKind, vWorkspaceRole, vProjectMemberRole, vProjectAccessMode,
  vInvitationStatus, vMessageRole, vAgentType, vDeploymentStatus, vDeploymentType,
  vHostingProvider, vPageAccessType, vProjectCreateStatus, vProjectCustomDomainStatus,
  vVerificationRequestStatus, vUsageType, vSubscriptionStatus,
  vScheduledSubscriptionAction, vProductType, vPriceKey, vAuditEventKind,
} from "./lib/enums";

export default defineSchema({
  users: defineTable({
    clerkUserId: v.string(),
    email: v.optional(v.string()),
    firstName: v.optional(v.string()),
    lastName: v.optional(v.string()),
    displayName: v.optional(v.string()),
    avatarUrl: v.optional(v.string()),
    stripeCustomerId: v.optional(v.string()),
    githubInstallationId: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_clerk_user_id", ["clerkUserId"])
    .index("by_email", ["email"])
    .index("by_stripe_customer_id", ["stripeCustomerId"]),

  userSettings: defineTable({
    userId: v.id("users"),
    autoApplyCode: v.boolean(),
    expandCodeBlocks: v.boolean(),
    showSuggestions: v.boolean(),
    showMiniChat: v.boolean(),
    shouldWarnDelete: v.boolean(),
    enableBunReplace: v.boolean(),
    autoCommit: v.boolean(),
    autoPush: v.boolean(),
    defaultModel: v.optional(v.string()),
    ollamaBaseUrl: v.optional(v.string()),
    buildFlags: v.optional(v.string()),
    theme: v.optional(v.string()),
    accentColor: v.optional(v.string()),
    fontFamily: v.optional(v.string()),
    fontSize: v.optional(v.string()),
    uiDensity: v.optional(v.string()),
    locale: v.optional(v.string()),
    commitMessageFormat: v.optional(v.string()),
    defaultBranchPattern: v.optional(v.string()),
    maxImages: v.number(),
    customShortcuts: v.record(v.string(), v.string()),
  }).index("by_user", ["userId"]),

  providerConnections: defineTable({
    userId: v.id("users"),
    provider: v.string(),
    accessTokenEncrypted: v.string(),
    refreshTokenEncrypted: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    scopes: v.optional(v.string()),
    accountEmail: v.optional(v.string()),
  })
    .index("by_user_provider", ["userId", "provider"])
    .index("by_user", ["userId"]),

  workspaces: defineTable({
    name: v.string(),
    slug: v.string(),
    kind: vWorkspaceKind,
    avatarUrl: v.optional(v.string()),
    createdByUserId: v.id("users"),
  })
    .index("by_slug", ["slug"])
    .index("by_created_by_user", ["createdByUserId"]),

  workspaceMembers: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    role: vWorkspaceRole,
  })
    .index("by_workspace_user", ["workspaceId", "userId"])
    .index("by_user", ["userId"]),

  workspaceInvitations: defineTable({
    workspaceId: v.id("workspaces"),
    email: v.string(),
    role: vWorkspaceRole,
    token: v.string(),
    status: vInvitationStatus,
    invitedByUserId: v.id("users"),
    expiresAt: v.number(),
    acceptedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_token", ["token"])
    .index("by_workspace_email_status", ["workspaceId", "email", "status"])
    .index("by_email_status", ["email", "status"]),

  projects: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    tags: v.array(v.string()),
    workspaceId: v.id("workspaces"),
    createdByUserId: v.id("users"),
    accessMode: vProjectAccessMode,
    storageMode: v.union(v.literal("cloud"), v.literal("local"), v.literal("hybrid")),
    runtimeMetadata: v.object({
      framework: v.optional(v.string()),
      cloud: v.optional(v.any()),
      local: v.optional(v.any()),
      sync: v.optional(v.any()),
    }),
    previewImg: v.optional(v.object({
      storageId: v.id("_storage"),
      url: v.string(),
      updatedAt: v.number(),
    })),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_created_by_user", ["createdByUserId"]),

  projectMembers: defineTable({
    projectId: v.id("projects"),
    userId: v.id("users"),
    role: vProjectMemberRole,
  })
    .index("by_project_user", ["projectId", "userId"])
    .index("by_user", ["userId"]),

  auditLog: defineTable({
    workspaceId: v.optional(v.id("workspaces")),
    projectId: v.optional(v.id("projects")),
    actorUserId: v.optional(v.id("users")),
    event: vAuditEventKind,
    payload: v.any(),
  })
    .index("by_workspace_time", ["workspaceId"])
    .index("by_project_time", ["projectId"]),

  conversations: defineTable({
    projectId: v.id("projects"),
    agentType: vAgentType,
    displayName: v.optional(v.string()),
    suggestions: v.array(v.object({ title: v.string(), prompt: v.string() })),
    updatedAt: v.number(),
  }).index("by_project", ["projectId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    content: v.string(),
    role: vMessageRole,
    context: v.any(),
    parts: v.any(),
    checkpoints: v.array(v.object({
      type: v.literal("git"),
      createdAt: v.number(),
      oid: v.string(),
      branchId: v.optional(v.id("branches")),
    })),
    usage: v.optional(v.any()),
  }).index("by_conversation", ["conversationId"]),

  // ... rest of the 41 tables (each defined in the same style)
});
```

> Full schema lives in `apps/web/client/convex/schema.ts` once Phase 4.1 starts.

---

## 4. Index Migration

For every Postgres index, define the equivalent Convex index in `defineTable(...).index(name, [field])`. Key cases:

| Postgres index | Convex equivalent |
|---|---|
| `users_pkey` | implicit `_id` |
| `users (stripe_customer_id)` | `.index("by_stripe_customer_id", ["stripeCustomerId"])` |
| `workspaces_slug_unique` | `.index("by_slug", ["slug"])` + uniqueness check in mutation |
| `workspace_members UNIQUE (workspace_id, user_id)` | `.index("by_workspace_user", ["workspaceId", "userId"])` + uniqueness check |
| Partial UNIQUE `(workspace_id, email) WHERE status='pending'` | index `by_workspace_email_status`, uniqueness check in `invite()` mutation |
| `branches_default_per_project_ux (project_id) WHERE is_default=true` | mutation `setDefaultBranch()` toggles `isDefault: false` on all others |
| `skills_user_global_name_unique` + `skills_user_project_name_unique` | mutation `createSkill()` checks both indexes |
| Composite PK `user_canvases (user_id, canvas_id)` | `.index("by_user_canvas", ["userId", "canvasId"])` + uniqueness check |
| `messages_conversation_id_idx` | `.index("by_conversation", ["conversationId"])` |
| `usage_records UNIQUE (user_id, trace_id)` | `.index("by_user_trace", ["userId", "traceId"])` + idempotent insert |
| `rate_limits (user_id, started_at, ended_at)` | `.index("by_user_started_ended", ["userId", "startedAt", "endedAt"])` |
| `deployments (project_id, _creationTime)` | Convex `_creationTime` is automatic; `.index("by_project", ["projectId"])` |

---

## 5. RLS Replacement

Per `MIGRATION_DISCOVERY.md` §2.4, the app already uses a service-role connection. RLS is defense-in-depth for realtime + storage. Convex has neither concept of RLS nor service-role.

**Replacement model:** every Convex query/mutation/action calls `requireCap(ctx, capability, { projectId | workspaceId })` (or `requireOwn(ctx, resourceUserId)`) before touching data. This is exactly what `apps/web/client/src/server/api/permissions/requireCap.ts` already does — port it.

Port plan:

```ts
// apps/web/client/convex/lib/permissions.ts
import { v } from "convex/values";
import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { can, type Capability, type PermissionResource } from "./auth"; // ported from @weblab/auth

export async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("UNAUTHORIZED");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
  if (!user) throw new Error("UNAUTHORIZED: no user row (webhook not delivered yet?)");
  return user;
}

export async function requireCap(
  ctx: QueryCtx | MutationCtx,
  capability: Capability,
  scope: { projectId?: Id<"projects">; workspaceId?: Id<"workspaces"> },
): Promise<{ user: Doc<"users">; project?: Doc<"projects">; workspace?: Doc<"workspaces"> }> {
  const user = await requireUser(ctx);
  // ... full port of requireCap logic — resolves workspace + roles + access_mode,
  // calls can(), throws FORBIDDEN.
  return { user, project, workspace };
}
```

Every router that today calls `requireCap(ctx.db, ctx.user.id, ...)` is rewritten to call `requireCap(ctx, ...)` against Convex. Same capability matrix, same role semantics — just a different data layer.

---

## 6. Storage Migration (`preview_images` bucket)

### 6.1. Convex File Storage primer

Convex provides `_storage` system table. Storage IDs are `Id<"_storage">`. Upload via `ctx.storage.generateUploadUrl()` → client POST → server stores the returned id. URLs via `ctx.storage.getUrl(storageId)`.

### 6.2. Schema change

```ts
projects: defineTable({
  // ... other fields ...
  previewImg: v.optional(v.object({
    storageId: v.id("_storage"),
    updatedAt: v.number(),
  })),
}),
```

Replace the three Drizzle columns (`preview_img_url`, `preview_img_path`, `preview_img_bucket`, `updated_preview_img_at`) with one optional nested object.

### 6.3. Upload mutation (replaces `project.captureScreenshot`)

```ts
// apps/web/client/convex/files.ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireCap } from "./lib/permissions";

export const generatePreviewUploadUrl = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    await requireCap(ctx, "project.update", { projectId });
    return await ctx.storage.generateUploadUrl();
  },
});

export const setProjectPreview = mutation({
  args: { projectId: v.id("projects"), storageId: v.id("_storage") },
  handler: async (ctx, { projectId, storageId }) => {
    await requireCap(ctx, "project.update", { projectId });
    const existing = await ctx.db.get(projectId);
    if (existing?.previewImg) await ctx.storage.delete(existing.previewImg.storageId);
    await ctx.db.patch(projectId, {
      previewImg: { storageId, updatedAt: Date.now() },
    });
  },
});
```

### 6.4. Read path

`getFileUrlFromStorage` becomes `useQuery(api.files.getPreviewUrl, { projectId })` → Convex query returns `ctx.storage.getUrl(...)`. Convex URLs are signed and time-bound; cache lives on Convex CDN.

### 6.5. Backfill script

```ts
// scripts/migration/migrate-storage.ts
// 1. For every project with preview_img_path !== null:
// 2.   GET the Supabase public URL
// 3.   POST blob to Convex generateUploadUrl
// 4.   PATCH project { previewImg: { storageId, updatedAt } } via internalMutation
```

---

## 7. Realtime + Presence

### 7.1. Reactive queries (free replacement for chat broadcast)

Today `conversations`/`messages` have Postgres triggers calling `realtime.broadcast_changes()`. No client subscribes (per discovery). When we move to Convex, `useQuery(api.messages.byConversation, { conversationId })` automatically re-fires when the table changes. The triggers and `0007_realtime_rls.sql` + `0030_realtime_topic_membership.sql` migrations are dead and removed in Phase 7.

### 7.2. Presence

Two options. **Recommended: `@convex-dev/presence` component.**

```bash
bun add @convex-dev/presence
```

```ts
// apps/web/client/convex/convex.config.ts
import { defineApp } from "convex/server";
import presence from "@convex-dev/presence/convex.config";

const app = defineApp();
app.use(presence);
export default app;
```

```ts
// apps/web/client/convex/presence.ts
import { presenceMember } from "@convex-dev/presence/server";
import { components } from "./_generated/api";
import { requireUser } from "./lib/permissions";

export const heartbeat = presenceMember(components.presence, {
  roomKey: (args: { projectId: Id<"projects"> }) => args.projectId,
  identify: async (ctx) => {
    const user = await requireUser(ctx);
    return {
      id: user._id,
      data: { displayName: user.displayName ?? user.email, avatarUrl: user.avatarUrl },
    };
  },
});
```

Frontend swap in `apps/web/client/src/components/store/editor/presence/index.ts`:

```ts
// Before: supabase.channel(`presence:${projectId}`).on('presence', ...).subscribe(...)
// After:
const presence = useQuery(api.presence.listInRoom, { projectId });
const heartbeat = useMutation(api.presence.heartbeat);
useInterval(() => heartbeat({ projectId }), 5000);
```

### 7.3. Cleanup

Drop `0007_realtime_rls.sql` and `0030_realtime_topic_membership.sql` references in Phase 7 with the rest of the Supabase removal.

---

## 8. Stripe Webhook Port

Today: `apps/web/client/src/app/webhook/stripe/subscription/{create,update,pause,delete}.ts` — Next.js route handlers that import `db` from `@weblab/db` and run multi-table transactions.

Tomorrow: Next.js route stays (Stripe needs a publicly reachable URL) but its body calls into Convex.

```ts
// apps/web/client/src/app/webhook/stripe/route.ts
import { Stripe } from "stripe";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/../convex/_generated/api";
import { env } from "@/env";

const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
const stripe = new Stripe(env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature")!;
  const body = await req.text();
  const event = stripe.webhooks.constructEvent(body, sig, env.STRIPE_WEBHOOK_SECRET!);

  switch (event.type) {
    case "customer.subscription.created":
      await convex.action(api.stripeWebhooks.subscriptionCreated, { event });
      break;
    case "customer.subscription.updated":
      await convex.action(api.stripeWebhooks.subscriptionUpdated, { event });
      break;
    // ... pause + delete
  }
  return new Response("ok");
}
```

Each `stripeWebhooks.*` action runs inside Convex transactions. Idempotency on `usage_records` (`by_user_trace` index) is unchanged. `rate_limits` math identical — `tx.rollback()` becomes `throw new ConvexError("NO_CREDITS")` per the convex-migration-helper guidance.

---

## 9. Clerk Webhook → Convex (user provisioning)

Replaces the `0025_auth_user_trigger.sql` trigger.

```ts
// apps/web/client/src/app/api/clerk/webhook/route.ts
import { Webhook } from "svix";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/../convex/_generated/api";
import { env } from "@/env";

const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);

export async function POST(req: Request) {
  const wh = new Webhook(env.CLERK_WEBHOOK_SECRET);
  const evt = wh.verify(await req.text(), Object.fromEntries(req.headers));
  switch (evt.type) {
    case "user.created":
    case "user.updated":
      await convex.mutation(api.clerkWebhooks.upsertUser, { clerkUser: evt.data });
      break;
    case "user.deleted":
      await convex.action(api.clerkWebhooks.deleteUser, { clerkUserId: evt.data.id });
      break;
  }
  return new Response("ok");
}
```

The `deleteUser` action fans out the cascade explicitly (Postgres did this via `ON DELETE CASCADE`). Tables to clean:

```
users → workspaces (createdByUserId — RESTRICT today, can SET NULL or fail)
     → workspaceMembers (cascade)
     → projectMembers (cascade)
     → projects (createdByUserId, owned projects — policy decision)
     → userSettings, userCanvases, providerConnections, projectOfflinePins,
       hostingProviderConnections, skills, projectInvitations(inviter),
       workspaceInvitations(invitedBy), deployments(requestedBy),
       projectComments(author → set null), commentReplies(author → set null),
       feedbacks(SET NULL), subscriptions, rateLimits, usageRecords
```

Cascade test: integration test seeds a user, runs `deleteUser`, asserts no orphans.

---

## 10. Per-Batch Migration Recipe (Phase 4)

For each table batch:

1. Define schema in `convex/schema.ts` (additive — Drizzle still exists).
2. Write Convex queries + mutations matching the surface area of the corresponding tRPC router.
3. **Swap inside the tRPC procedure** (do not change client code yet):

   ```ts
   // before
   export const get = protectedProcedure
     .input(z.object({ id: z.string() }))
     .query(async ({ ctx, input }) => {
       return ctx.db.query.users.findFirst({ where: eq(users.id, input.id) });
     });

   // after
   export const get = protectedProcedure
     .input(z.object({ id: z.string() }))
     .query(async ({ ctx, input }) => {
       return ctx.convex.query(api.users.get, { id: input.id });
     });
   ```

   `ctx.convex` is a `ConvexHttpClient` initialized in `createTRPCContext` with the caller's Clerk JWT. tRPC clients on the frontend keep using `api.user.get.useQuery({...})` — they cannot tell the difference.

4. Run tests for the touched router.
5. Verify in dev.
6. PR + review (caveman-review + cr review for 3+ files).
7. Move to next batch.

Once all 12 batches are done, frontend code can incrementally migrate to direct `useQuery(api.x.y, ...)` calls and the tRPC facade can be removed router-by-router.

---

## 11. Data Migration Scripts

### 11.1. Export from Supabase

```ts
// scripts/migration/export-supabase.ts
import postgres from "postgres";
import { mkdirSync, writeFileSync } from "node:fs";

const sql = postgres(process.env.SUPABASE_DATABASE_URL!, { prepare: false });
const TABLES = [
  "auth.users", "users", "user_settings", "user_provider_connections",
  "user_canvases", "workspaces", "workspace_members", "workspace_invitations",
  "project_members", "audit_log", "projects", "project_settings",
  "project_invitations", "project_create_requests", "project_offline_pins",
  "page_access", "canvas", "frames", "branches", "conversations", "messages",
  "cms_source", "cms_collection", "cms_field", "cms_item", "cms_binding",
  "cms_collection_page", "project_comments", "comment_replies",
  "custom_domains", "custom_domain_verification", "project_custom_domains",
  "preview_domains", "deployments", "hosting_provider_connections",
  "products", "prices", "subscriptions", "legacy_subscriptions",
  "rate_limits", "usage_records", "skills",
];

mkdirSync("./.migration-export", { recursive: true });
for (const t of TABLES) {
  const rows = await sql.unsafe(`SELECT * FROM ${t}`);
  writeFileSync(
    `./.migration-export/${t.replace(".", "_")}.jsonl`,
    rows.map((r) => JSON.stringify(r)).join("\n"),
  );
  console.log(`exported ${t}: ${rows.length} rows`);
}
await sql.end();
```

### 11.2. Import into Convex

Uses Convex's `internalMutation` so we can run unauthenticated bulk inserts via a deploy-time function:

```ts
// apps/web/client/convex/migrations/_seed.ts
import { internalMutation } from "../_generated/server";
import { v } from "convex/values";

export const seedUsers = internalMutation({
  args: { rows: v.array(v.any()) },
  handler: async (ctx, { rows }) => {
    const idMap: Record<string, string> = {}; // old UUID → new Id<"users">
    for (const r of rows) {
      const newId = await ctx.db.insert("users", {
        clerkUserId: "", // backfilled by post-import Clerk creation
        email: r.email,
        firstName: r.first_name,
        lastName: r.last_name,
        displayName: r.display_name,
        avatarUrl: r.avatar_url,
        stripeCustomerId: r.stripe_customer_id,
        githubInstallationId: r.github_installation_id,
        updatedAt: new Date(r.updated_at).getTime(),
      });
      idMap[r.id] = newId;
    }
    return idMap;
  },
});
```

The driver script reads the `idMap` returned from each batch, threads it through to the next table to translate FKs (`user_id` Postgres UUID → `Id<"users">` Convex). For tables that reference `auth.users.id` directly (only `users`), the Clerk user must exist first — handled in the driver.

Driver pseudocode:

```ts
// scripts/migration/import-convex.ts
const idMaps = { users: {}, workspaces: {}, projects: {}, /* ... */ };

// 1. Users
const users = readJsonl("users.jsonl");
idMaps.users = await convex.mutation(internal.migrations._seed.seedUsers, { rows: users });

// 2. Workspaces (FK userId)
const workspaces = readJsonl("workspaces.jsonl").map((r) => ({
  ...r,
  created_by_user_id: idMaps.users[r.created_by_user_id],
}));
idMaps.workspaces = await convex.mutation(internal.migrations._seed.seedWorkspaces, { rows: workspaces });

// ... rest of tables in FK dependency order
```

### 11.3. Validation

```ts
// scripts/migration/validate-parity.ts
for (const t of TABLES) {
  const pgCount = (await sql`SELECT count(*) FROM ${sql(t)}`)[0].count;
  const cvCount = await convex.query(internal.migrations._validate.countTable, { table: t });
  console.log(`${t}: pg=${pgCount} cv=${cvCount} ${pgCount === cvCount ? "✓" : "✗"}`);
}
```

Plus spot checks: re-pick 20 random rows per table, deep-equal compare.

---

## 12. Open Decisions

These need owner input before Phase 4 starts:

1. **tRPC facade lifetime.** Keep tRPC indefinitely (wraps Convex) or migrate frontend to direct Convex hooks after backend migration? Recommendation: **keep tRPC until all batches are stable, then collapse**. Lower blast radius.
2. **`feedbacks` table.** Drop or migrate? Currently no router writes to it.
3. **`file_transfer` bucket.** Drop or migrate? Currently no code uses it.
4. **`audit_log` retention.** All-time retention or 90-day rolling? Convex storage is cheap but mutation-history is queryable.
5. **`@convex-dev/presence` vs custom presence table.** Default: component.
6. **Aggregation strategy on `rate_limits` and `usage_records`.** Use `@convex-dev/aggregate` from day one or pre-compute counters? Recommendation: **use aggregate component** for `usage_records.byUserAndMonth` queries.
7. **Convex deployment naming.** `weblab-dev`, `weblab-staging`, `weblab-prod` proposed.

---

## 13. Acceptance Criteria

- `convex/schema.ts` covers all 41 tables (less any dropped per §12).
- Every Postgres index has a Convex equivalent or a documented mutation-side enforcement.
- Every tRPC mutation that today relies on RLS has an explicit `requireCap` call.
- Stripe webhook handler ports run green tests for create/update/pause/delete with idempotency.
- Preview image upload + read works end-to-end on Convex File Storage.
- Presence works across two tabs.
- Data migration script imports a 1000-row dummy dataset with parity validation passing.

End of CONVEX_MIGRATION_PLAN.md.
