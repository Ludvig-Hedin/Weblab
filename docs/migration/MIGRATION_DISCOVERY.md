# MIGRATION_DISCOVERY.md

**Status:** Phase 1 — Discovery complete (read-only, no code changed)
**Date:** 2026-05-19
**Source:** Synthesis of 4 parallel read-only Explore reports (framework, Supabase usage, auth/middleware, DB schema)

This document is the ground truth for the Supabase → Convex (DB) + Clerk (auth) migration. It is intentionally exhaustive. Detailed sub-plans live in:

- `CONVEX_MIGRATION_PLAN.md` — schema mapping + data migration
- `CLERK_MIGRATION_PLAN.md` — auth swap
- `DEPLOYMENT_MIGRATION_RUNBOOK.md` — env vars + deploy order
- `MIGRATION_PLANNING.md` — overall strategy
- `MIGRATION_TASK.md` — granular task list

---

## 1. Stack at a Glance

| Layer | What is in use |
|---|---|
| Monorepo | Bun workspaces (`bun@1.3.1`), `packages/*`, `apps/*`, `tooling/*` |
| Primary web app | `apps/web/client` — Next.js 16.0.7, App Router, React 19.2, Server-Components-first |
| Styling | TailwindCSS 4.x, Radix UI via `@weblab/ui` |
| API | tRPC v11 + React Query + SuperJSON. **27 routers** mounted in `apps/web/client/src/server/api/root.ts` |
| DB | **Drizzle ORM 0.44** over `postgres-js` driver to Supabase Postgres. **Not PostgREST.** |
| Schema | `packages/db/src/schema/**` — 41 public tables + 1 reflected `auth.users` |
| Migrations | 43 SQL files in `apps/backend/supabase/migrations/` (Drizzle-generated + hand-written Supabase pieces) |
| Auth | Supabase Auth via `@supabase/ssr` + service-role admin client. **Email OTP + GitHub/Google OAuth + dev magic link.** No password auth, no password reset. |
| Realtime | Supabase Realtime — **1 live subscriber** (cursor presence). Broadcast triggers exist for chat but no client subscribes (dead infra). |
| Storage | 2 Supabase buckets: `preview_images` (public), `file_transfer` (per-owner — appears unused in app code) |
| Edge Functions | **None.** `[functions.stripe-webhook]` config exists but no Deno function. All webhooks are Next.js route handlers. |
| Deployment | **Railway** (root `Dockerfile` + `railway.toml`). Not Vercel/Fly/Render. GitHub remote: `github.com/Ludvig-Hedin/Weblab.git` |
| Package manager | Bun (`bun.lock`). Never `npm`/`yarn`/`pnpm`. |
| Tests | `bun test` (~110 hand-written `*.test.ts` files). Storybook + Vitest browser tests in `apps/web/client/vitest.config.ts`. |
| CI | GitHub Actions: `ci.yml` (typecheck + bun test), Chromatic, desktop release, Supabase keepalive. |

---

## 2. Critical Architectural Observations

### 2.1. DB access goes through Drizzle, not PostgREST

The codebase **never calls `supabase.from('table').select()`**. Every DB operation goes through Drizzle's `ctx.db.query.*` API (tRPC) or `db.*` (webhooks). Migration replaces `@weblab/db` and every `ctx.db.*` call; it does NOT chase `supabase.from(...)` calls (there are none).

### 2.2. Auth surface is small and well-isolated

A **single chokepoint** governs server-side identity: `createTRPCContext` in `apps/web/client/src/server/api/trpc.ts:33-58` calls `supabase.auth.getUser()` once and sets `ctx.user: User`. All 27 routers and ~282 call sites consume only `ctx.user.id` / `ctx.user.email` / `ctx.user.user_metadata`. Swap this one factory and every router continues to work.

Outside tRPC, ~10 page layouts (`apps/web/client/src/app/**/layout.tsx`) call `supabase.auth.getUser()` directly. Each is a `redirect('/login?...')` gate. Mechanical swap.

### 2.3. Workspaces + capability matrix are already provider-agnostic

`packages/auth` (`can(capability, resource)` + 18 capabilities + role matrices) and `apps/web/client/src/server/api/permissions/requireCap.ts` operate on `userId: string`. They have **zero coupling to Supabase**. No change needed during the auth migration.

### 2.4. RLS is real but secondary

7 migrations define RLS policies using `auth.uid()`. Tables affected:

- `0006_rls.sql` — projects, canvas, user_projects, user_canvases, frames, users, user_settings, project_invitations + helper functions
- `0012_file-transfer-bucket.sql` — `file_transfer` bucket
- `0020_comment_tables.sql` — comments, replies
- `0030_realtime_topic_membership.sql` — realtime.messages
- `0031_preview_images_policy.sql` — preview_images bucket + `is_preview_image_owner()` helper
- `0032_project_offline_pins.sql` — offline pins
- `0033_skills.sql` — skills

The **application uses a service-role connection** (`packages/db/src/client.ts` → `postgres(SUPABASE_DATABASE_URL, { prepare: false })`) that bypasses RLS. RLS is the defense-in-depth for Supabase Realtime, Storage, and any hypothetical direct PostgREST access. Migrating to Convex **eliminates RLS entirely** — all checks happen in TS via `requireCap`. We must audit that every router-level call site already calls `requireCap`; gaps that today rely on RLS must be filled.

### 2.5. `auth.users` ↔ `public.users` is the single hard coupling

- `public.users.id REFERENCES auth.users(id) ON DELETE CASCADE` (`packages/db/src/schema/user/user.ts:19`)
- Trigger `on_auth_user_created` in `0025_auth_user_trigger.sql` mirrors `auth.users` → `public.users` on insert
- Account deletion in `apps/web/client/src/server/api/routers/user/user.ts:155-157` calls `ctx.db.delete(authUsers).where(...)` and relies on cascade

Migration plan:
1. Add a `clerk_user_id text UNIQUE` column to `public.users`.
2. During cutover, backfill `clerk_user_id` (no real users today except owner; we can re-create the owner's Clerk identity).
3. Drop the FK from `users.id → auth.users.id` and the trigger.
4. Replace the cascade with an explicit Convex action fan-out (or, if we keep Postgres, a Clerk webhook that deletes the `users` row).

### 2.6. Two OAuth flows live in the codebase

- **App auth** (Supabase): GitHub + Google sign-in at `/login`. Migrates to Clerk.
- **CLI provider OAuth** (Codex, Cursor, Gemini, OpenCode): PKCE flow at `/api/auth/providers/[provider]/{start,callback}` that stores AES-256-GCM-encrypted tokens in `user_provider_connections`. **Unrelated to app auth — keep as-is.** Only its `supabase.auth.getUser()` gate needs swapping.

### 2.7. Workspaces feature is mid-transition

Migrations 0034–0037 introduce `workspaces`, `workspace_members`, `workspace_invitations`, `project_members`, `audit_log` and migrate `user_projects.role` → `project_members.role`. **Migration 0037 (drop legacy `role` column + `project_role` enum) has NOT been applied.** App code dual-writes both columns during transition.

Decision: **apply 0037 in Postgres BEFORE the Convex cutover** so we are not migrating two redundant role systems.

---

## 3. Supabase Surface Inventory

### 3.1. `@supabase/*` imports (11 files)

| File:Line | Import |
|---|---|
| `apps/web/client/src/utils/supabase/server.ts:2,4` | `createServerClient`, `SetAllCookies` |
| `apps/web/client/src/utils/supabase/middleware.ts:3,5` | `createServerClient`, `SetAllCookies` |
| `apps/web/client/src/utils/supabase/request-server.ts:2` | `createServerClient` |
| `apps/web/client/src/utils/supabase/client/index.ts:1` | `createBrowserClient` |
| `apps/web/client/src/utils/supabase/admin.ts:1` | `createClient` from `@supabase/supabase-js` |
| `apps/web/client/src/server/api/trpc.ts:17` | type `User` |
| `apps/web/client/src/server/api/routers/user/user.ts:20` | type `User as SupabaseUser` |
| `apps/web/client/src/components/store/editor/presence/index.ts:4` | type `RealtimeChannel` |
| `packages/db/src/seed/supabase.ts:1` | `createClient` (CLI seed only) |
| `apps/web/client/.storybook/main.ts:65-66` | Aliases mock (no real import) |

### 3.2. Auth call sites (39 distinct, 23 files)

Server actions / route handlers:
- `login/actions.tsx` — `signInWithOAuth`, `getUser`, `getSession`, `auth.admin.getUserById`, `auth.admin.createUser`, `auth.admin.generateLink`, `signInWithOtp`, `verifyOtp`, `signOut`
- `auth/callback/route.ts` — `exchangeCodeForSession`, `signOut` (4 defensive paths)
- `utils/supabase/middleware.ts:74` — `getUser` (session refresh)
- `server/api/trpc.ts:38` — `getUser` (tRPC context)
- `trpc/request-server.ts:20` — `getUser` (RSC context)
- `api/chat/helpers/usage.ts:46`, `api/chat-images/[id]/route.ts:25`, `api/ai/inline-edit/route.ts:41`, `api/ai/tab-complete/route.ts:35`, `api/transcribe/route.ts:24` — `getUser`
- `api/auth/providers/[provider]/{start,callback}/route.ts` — `getUser` (CLI provider gating)

Server Component layout guards (10 files): `projects/layout.tsx`, `projects/new/layout.tsx`, 4× `projects/import/*/layout.tsx`, `project/layout.tsx`, `project/[id]/layout.tsx`, `invitation/[id]/layout.tsx`, `invitation/workspace/[id]/layout.tsx`.

Client-side calls (6 files): avatar dropdown, settings modal (account tab, delete section), invitation main, comment popover, presence store, auth-redirect wrapper.

### 3.3. Storage call sites (8)

- `utils/supabase/client/index.ts` — `getPublicUrl`, `info`, `upload` helpers
- `server/api/routers/project/project.ts:231` — preview image upload (only server upload)
- `app/projects/_components/templates/index.tsx:86-88`, `select/index.tsx:1193,1198`, `select/project-card-utils.ts:43`, `select/square-project-card.tsx:40` — `getFileUrlFromStorage`

No `download()`, `createSignedUrl()`, `remove()`, `move()`, `list()` anywhere.

### 3.4. Realtime

- **Live:** 1 channel in `apps/web/client/src/components/store/editor/presence/index.ts:98` — `presence:${projectId}` for cursor positions.
- **Orphaned infra:** Postgres triggers in `0007_realtime_rls.sql` broadcast `conversations`/`messages` changes to `topic:${projectId}`. No client subscribes. Confirmed by grep across `apps/web/client/src/**`.

### 3.5. Env vars (5 distinct Supabase keys)

| Var | Scope | Used by |
|---|---|---|
| `SUPABASE_URL` | server | `createAdminClient`, seed |
| `SUPABASE_DATABASE_URL` | server | Drizzle direct Postgres connection |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Admin client, seed user creation |
| `NEXT_PUBLIC_SUPABASE_URL` | client | `createServerClient`, `createBrowserClient`, middleware |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client | same as above (with `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` fallback) |

Plus Supabase-config-internal `GITHUB_CLIENT_ID`, `GITHUB_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_SECRET` consumed by `apps/backend/supabase/config.toml`.

### 3.6. Middleware

`apps/web/client/middleware.ts` + `src/proxy.ts` + `src/utils/supabase/middleware.ts`:

1. Skip list (no auth refresh): `/api/trpc`, `/api/chat`, `/api/ai`, `/api/chat-images`, `/api/health`, `/_next/static`, `/_next/image`, root assets, static extensions.
2. Desktop UA redirect: `WeblabDesktop/<v>` hitting `/` → `/login?native=1`.
3. Session refresh fast-path: skip `getUser()` when no `sb-*-auth-token` cookie present.
4. Otherwise `await supabase.auth.getUser()` — **deliberately non-cancellable** (a prior `Promise.race` timeout caused refresh-token corruption; long comment in source).
5. Always injects `x-pathname` header for downstream RSC use.
6. OAuth-landed-at-root rescue in `src/proxy.ts`.

Replacement constraints:
- Preserve cookie-presence fast path.
- Preserve non-race refresh.
- Preserve `x-pathname` injection (consumed by `projects/layout.tsx`).

### 3.7. Edge Functions

**Zero.** `apps/backend/supabase/functions/` does not exist. The `[functions.stripe-webhook]` stub in `config.toml` is misleading. All webhooks are Next.js route handlers at `apps/web/client/src/app/webhook/**` and `apps/web/client/src/app/api/**`.

---

## 4. Drizzle Schema Inventory (41 public tables + auth.users)

Full table-by-table detail lives in `CONVEX_MIGRATION_PLAN.md`. Headline counts:

| Domain | Tables |
|---|---|
| User | `users`, `user_settings`, `user_provider_connections`, `user_projects` (legacy), `user_canvases` |
| Workspace | `workspaces`, `workspace_members`, `workspace_invitations`, `project_members`, `audit_log` |
| Project | `projects`, `project_settings`, `project_invitations`, `project_create_requests`, `project_offline_pins`, `page_access` |
| Canvas | `canvas`, `frames`, `branches` |
| Chat | `conversations`, `messages` |
| CMS | `cms_source`, `cms_collection`, `cms_field`, `cms_item`, `cms_binding`, `cms_collection_page` |
| Comments | `project_comments`, `comment_replies` |
| Domain/Hosting | `custom_domains`, `custom_domain_verification`, `deployments`, `preview_domains`, `hosting_provider_connections`, `project_custom_domains` |
| Subscriptions/Stripe | `subscriptions`, `legacy_subscriptions`, `prices`, `products`, `rate_limits`, `usage_records` |
| Skills | `skills` |
| Feedback (deprecated) | `feedbacks` |

**22 Postgres enums** centralised across schema files (see `CONVEX_MIGRATION_PLAN.md` §4).

### 4.1. JSONB columns with discriminated unions (15 columns)

These require special care — Convex `v.union(v.object({...}))` is verbose but strict; alternative is `v.any()` with app-side Zod.

Notable: `messages.parts` (Vercel AI SDK shape), `messages.context` (6-variant), `cms_binding.binding` (5-variant), `cms_field.config` (per-type), `project_create_requests.context` (4-variant), `custom_domain_verification.txt_record`/`a_records`, `projects.runtime_metadata`, `branches.runtime_metadata`, `audit_log.payload`.

### 4.2. Postgres features that do NOT translate

1. **RLS** (30+ policies)
2. **SECURITY DEFINER functions** (`user_has_project_access`, `user_has_canvas_access`, `handle_new_auth_user`, `is_preview_image_owner`)
3. **AFTER INSERT/UPDATE/DELETE triggers** (`on_auth_user_created`, `handle_conversations_changes`, `handle_messages_changes`)
4. **Realtime broadcast** (`realtime.broadcast_changes`)
5. **Partial unique indexes** (4 in use: branches default-per-project, skills name uniqueness, workspace/project pending invites)
6. **Composite primary keys** (`user_canvases`, `user_projects`, `project_custom_domains`, `project_offline_pins`)
7. **`ON DELETE CASCADE` / `RESTRICT` / `SET NULL`** chains
8. **`SELECT … FOR UPDATE`** (used once in `project.delete`)
9. **Raw SQL fragments** in usage/index.ts and skill/index.ts
10. **Aggregations** (`count(*)`, `sum(left)`, `sum(max)`) on `rate_limits` and `usage_records`
11. **`drizzle-orm` eager loading** (`with: { … }`)
12. **`db.transaction(...)` blocks** (14+ call sites)

### 4.3. Direct DB access outside tRPC (must port carefully)

- `apps/web/client/src/app/auth/callback/route.ts` — public.users upsert after OAuth
- `apps/web/client/src/app/api/auth/providers/[provider]/callback/route.ts:165` — `user_provider_connections` insert
- `apps/web/client/src/app/webhook/stripe/subscription/{create,update,pause,delete}.ts` — Stripe webhook handlers (multi-table tx)
- `apps/web/client/src/utils/subscription.ts` — RSC reads `subscriptions` + `legacy_subscriptions`

---

## 5. tRPC Router Surface (27 routers)

Full table in framework agent report. Summary:

- **All 27** use `ctx.user` (Supabase identity) via `protectedProcedure`.
- **2** call `ctx.supabase.*` directly: `project` (storage upload at line 231), `user` (admin delete via `adminProcedure`).
- **0** use `supabase.from()`. All DB I/O is Drizzle.

The recently added `image` router is **not registered** in `root.ts` (documented pitfall).

---

## 6. Migration Risk Register

Severity scale: 🔴 high (could break prod), 🟡 medium (likely needs care), 🟢 low (mechanical).

| Risk | Severity | Mitigation |
|---|---|---|
| RLS no longer enforced — gaps in `requireCap` coverage | 🔴 | Pre-migration audit: every router mutation must have `requireCap`. Add missing checks before Convex cutover. |
| `auth.users` → `public.users` cascade replacement | 🔴 | Build explicit Convex action that fans out delete across ~15 tables. Test with seed user. |
| Stripe webhook transactional logic | 🔴 | Port each handler (create/update/pause/delete) to Convex HTTP action calling Convex mutation. Keep idempotency via `usage_records` UNIQUE constraint analog. |
| `messages.parts` (Vercel AI SDK shape) drift | 🟡 | Store as `v.any()` initially; add Zod validator at write boundary. |
| Realtime presence — no direct Convex equivalent | 🟡 | Use `@convex-dev/presence` component OR build TTL-backed `presence` table. |
| Orphaned broadcast triggers | 🟢 | Confirm dead, drop in Phase 7. |
| Workspaces 0037 not applied | 🟡 | Apply 0037 BEFORE Convex cutover so we migrate one canonical role system. |
| Partial unique indexes (4 in use) | 🟡 | Transactional check in Convex mutation; document race window. |
| Storage migration (preview_images) | 🟡 | Move blobs to Convex File Storage; rewrite `getFileUrlFromStorage` helpers; verify path convention still embeds projectId. |
| Middleware refresh semantics (non-cancellable, fast-path) | 🟡 | Clerk `authMiddleware` has equivalent — verify with prod-shaped load. |
| Aggregations on usage tables | 🟡 | Use `@convex-dev/aggregate` OR pre-computed counters. |
| `drizzle.with: {}` eager loading replaced by N queries | 🟡 | Either denormalize on read side or compose via Convex `runQuery` inside a query. |
| Encrypted token columns (provider tokens, hosting tokens) | 🟡 | Re-encrypt with the same `PROVIDER_TOKEN_ENCRYPTION_KEY` during data migration. |
| Workspaces dual-write transition partly complete | 🟡 | Stop dual-writing in Convex; emit only `member_role`. |
| Stale agent docs (`docs/agent-context/*.md`) say 21 routers / 25 packages | 🟢 | Update during Phase 7. |
| `apps/backend` workspace becomes empty | 🟢 | Drop in Phase 7. |
| Storybook mock alias | 🟢 | Repoint to Convex mock. |

---

## 7. Owner / Real User Reality

- **Zero real users currently** — only owner (Ludvig) and the `support@weblab.build` seed user.
- No paying customers, no real chat history, no real projects with shared collaborators.
- This shrinks "data migration" from a hard live migration to an export-import drill we can practice on a staging dump.
- We still design for zero downtime + rollback because the goal demands it AND because re-running the drill on production data later (post-launch) requires the same plumbing.

---

## 8. Out of Scope for This Migration

- `apps/web/server` (Fastify + tRPC WS server) — does NOT use Supabase or DB. No changes.
- `apps/desktop` — Electron shell. Bundles renderer + uses `weblab://` callback. Re-points to Clerk redirect URLs.
- CLI provider OAuth flow (Codex/Cursor/Gemini/OpenCode) — independent of Supabase Auth. Only its `getUser()` gate changes.
- `apps/docs` (Fumadocs site) — no DB or auth.
- AI streaming routes (`/api/chat`, `/api/ai/*`) — stay in Next.js (streaming responses); identity gate swaps.

---

## 9. File Index (every Supabase-touching path — comprehensive)

### Auth infrastructure
- `apps/web/client/middleware.ts`
- `apps/web/client/src/proxy.ts`
- `apps/web/client/src/env.ts`
- `apps/web/client/src/utils/supabase/{server,client/index,middleware,request-server,admin}.ts`
- `apps/web/client/src/hooks/use-has-auth-cookie.ts`

### Auth flows
- `apps/web/client/src/app/login/{page.tsx,actions.tsx,error.tsx}`
- `apps/web/client/src/app/login/verify/page.tsx`
- `apps/web/client/src/app/auth/{auth-context.tsx,callback/route.ts,redirect/page.tsx,auth-code-error/page.tsx}`
- `apps/web/client/src/app/profile-setup/page.tsx`
- `apps/web/client/src/app/_components/{auth-form,auth-modal,login-button}.tsx`
- `apps/web/client/src/app/api/auth/providers/[provider]/{start,callback}/route.ts` (CLI provider OAuth — keep, swap gate only)

### Server auth guards (layouts)
- 10 files listed in §3.2

### tRPC + API
- `apps/web/client/src/server/api/trpc.ts` (createTRPCContext + procedures)
- `apps/web/client/src/server/api/root.ts`
- `apps/web/client/src/server/api/routers/**` (27 routers)
- `apps/web/client/src/server/api/permissions/{requireCap,audit}.ts`
- `apps/web/client/src/trpc/{react,server,request-server}.ts`
- `apps/web/client/src/app/api/trpc/[trpc]/route.ts`

### Client components touching auth/storage
- `components/ui/{avatar-dropdown,auth-redirect}/index.tsx`
- `components/ui/settings-modal/{account-tab,user-delete-section}.tsx`
- `components/store/editor/presence/index.ts`
- `app/invitation/[id]/_components/{main,auth}.tsx`
- `app/project/[id]/_components/canvas/overlay/comment-popover.tsx`

### Storage helpers
- `apps/web/client/src/utils/supabase/client/index.ts:12-50` (`getFileUrlFromStorage`, `getFileInfoFromStorage`, `uploadBlobToStorage`)
- `apps/web/client/src/app/projects/_components/{templates/index,select/{index,project-card-utils,square-project-card}}.tsx`

### DB layer
- `packages/db/src/client.ts`
- `packages/db/src/schema/**` (12 schema groups)
- `packages/db/src/seed/{seed,supabase,constants}.ts` + `seed/stripe/*`
- `packages/db/drizzle.config.ts`
- `packages/db/apply-pending.ts`
- `packages/db/sync-migration-tracking.ts`
- `packages/db/migration-scripts/*`

### Webhook handlers (direct DB)
- `apps/web/client/src/app/webhook/stripe/subscription/{create,update,pause,delete}.ts`
- `apps/web/client/src/utils/subscription.ts`

### Supabase migrations (43 SQL files)
- `apps/backend/supabase/migrations/0000_*.sql` … `0037_*.sql`
- Hand-written (non-Drizzle): 0006_rls, 0007_realtime_rls, 0008_preview-img-storage, 0012_file-transfer-bucket, 0020_comment_tables, 0025_auth_user_trigger, 0030_realtime_topic_membership, 0031_preview_images_policy

### Backend workspace
- `apps/backend/{README.md,package.json,.env.example,tsconfig.json}`
- `apps/backend/supabase/{config.toml,migrations/,.branches/,.temp/}`

### Storybook + tests
- `apps/web/client/.storybook/main.ts` (alias to mock)
- `apps/web/client/.storybook/mocks/supabase-client.ts`
- `apps/web/client/test/**` (Bun test fixtures referencing user identity)

### Models
- `packages/models/src/auth/index.ts` — `SignInMethod` enum
- `packages/models/src/supabase/db.ts` — generated TS types (stale; not used)
- `packages/constants/src/storage.ts` — bucket names

---

## 10. Pre-Migration Cleanup Items (to do BEFORE cutover)

These are repo-quality fixes that make the migration safer. Tracked in `MIGRATION_TASK.md` Phase 0.

1. Apply migration 0037 (drop legacy `project_role` enum + `user_projects.role`).
2. Audit every tRPC mutation for `requireCap` coverage. Fix gaps that today rely on RLS.
3. Confirm or remove the orphaned `0007_realtime_rls.sql` broadcast triggers.
4. Register the unmounted `image` router in `root.ts` if it should ship; otherwise delete.
5. Decide fate of `file_transfer` bucket (appears unused).
6. Update stale agent docs (`packages-reference.md` 25 → 28, `trpc-routers-reference.md` 21 → 27, `data-api-architecture.md` Edge Functions claim).
7. Decide retention policy for `audit_log`, `usage_records`, `deployments` before migrating (these are high-volume append-only).

---

## 11. Migration Topology — One-Sentence Summary

> Replace `@supabase/ssr` + service-role admin client with `@clerk/nextjs` (single chokepoint: `createTRPCContext`); replace `@weblab/db` Drizzle layer with a Convex schema + queries + mutations + actions; port 4 Stripe webhook handlers + 1 storage upload + 1 realtime presence channel; drop the entire `apps/backend` workspace; keep tRPC as a thin facade during transition and decide collapse-vs-keep after data is migrated.

End of MIGRATION_DISCOVERY.md.
