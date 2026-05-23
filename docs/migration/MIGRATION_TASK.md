# MIGRATION_TASK.md

**Status:** Living tracker. Update as phases progress.
**Last updated:** 2026-05-19

Companion docs: `MIGRATION_DISCOVERY.md`, `MIGRATION_PLANNING.md`, `CONVEX_MIGRATION_PLAN.md`, `CLERK_MIGRATION_PLAN.md`, `DEPLOYMENT_MIGRATION_RUNBOOK.md`.

Status legend: ☐ pending | ◐ in progress | ✅ done | 🚫 cancelled

---

## Phase 0 — Pre-flight cleanup (BEFORE Convex/Clerk work)

| # | Task | Status | Notes |
|---|---|---|---|
| 0.1 | Apply migration `0037_workspaces_drop_legacy.sql` to staging + prod | ☐ | Drops legacy `user_projects.role` and `project_role` enum. Deferred to Phase 7 — see `PHASE_0_AUDIT.md` §3. |
| 0.2 | Audit every tRPC mutation for `requireCap` coverage | ✅ | 12 gaps catalogued in `PHASE_0_AUDIT.md` §1. HIGH gap in `chat/suggestion.ts` fixed this session. Mediums fix as Phase 4 batches port the respective routers. |
| 0.3 | Confirm orphaned realtime broadcast triggers are dead | ✅ | Confirmed dead in `PHASE_0_AUDIT.md` §2. Drop with the rest of Supabase in Phase 7. |
| 0.4 | Decide fate of unmounted `image` router (`routers/index.ts`) | ☐ | Decision deferred to Phase 4.x. |
| 0.5 | Decide fate of `file_transfer` storage bucket | ☐ | Decision: drop in Phase 7. |
| 0.6 | Update stale agent docs | ✅ | `packages-reference.md` 25→28, `trpc-routers-reference.md` 21→27 updated this session. `data-api-architecture.md` Edge Functions claim still stale — small note. |
| 0.7 | Decide retention policy for `audit_log`, `usage_records`, `deployments` | ☐ | Decision deferred to Phase 4.9 (Stripe/usage port). |

---

## Phase 1 — Discovery ✅

| # | Task | Status |
|---|---|---|
| 1.1 | Map Supabase usage (imports, auth calls, storage, realtime, edge functions) | ✅ |
| 1.2 | Map auth + middleware + identity flow | ✅ |
| 1.3 | Map DB schema + data-access layer | ✅ |
| 1.4 | Map framework + tRPC + deployment | ✅ |
| 1.5 | Synthesize into `MIGRATION_DISCOVERY.md` | ✅ |

---

## Phase 2 — Planning ◐

| # | Task | Status |
|---|---|---|
| 2.1 | Write `MIGRATION_PLANNING.md` | ✅ |
| 2.2 | Write `MIGRATION_TASK.md` (this file) | ✅ |
| 2.3 | Write `CONVEX_MIGRATION_PLAN.md` | ◐ |
| 2.4 | Write `CLERK_MIGRATION_PLAN.md` | ◐ |
| 2.5 | Write `DEPLOYMENT_MIGRATION_RUNBOOK.md` | ◐ |
| 2.6 | Owner review of all planning docs | ☐ |

---

## Phase 3 — Foundation

| # | Task | Owner role | Status |
|---|---|---|---|
| 3.1 | `bun add convex` in `apps/web/client` | DevOps Agent | ☐ |
| 3.2 | `bun add @clerk/nextjs` in `apps/web/client` | DevOps Agent | ☐ |
| 3.3 | Create Convex projects: `weblab-dev`, `weblab-staging`, `weblab-prod` | DevOps Agent | ☐ |
| 3.4 | Create Clerk apps: dev / staging / prod | DevOps Agent | ☐ |
| 3.5 | Configure Clerk JWT template `convex` (audience = Convex deployment URL) | Auth Agent | ☐ |
| 3.6 | Create `convex/auth.config.ts` with Clerk issuer | Auth Agent | ☐ |
| 3.7 | Add Convex + Clerk env vars to `apps/web/client/src/env.ts` | Backend Agent | ☐ |
| 3.8 | Update `.env.example` files (root, web client, backend) | DevOps Agent | ☐ |
| 3.9 | Add `<ClerkProvider>` + `<ConvexProviderWithClerk>` to root layout BEHIND a flag | Frontend Agent | ☐ |
| 3.10 | Bootstrap `convex/` directory with empty schema | Backend Agent | ☐ |
| 3.11 | Add one example query + one example mutation | Backend Agent | ☐ |
| 3.12 | Create `/dev/convex-smoke` route to validate end-to-end | Frontend Agent | ☐ |
| 3.13 | Configure Clerk OAuth providers (GitHub, Google) with all redirect URLs | Auth Agent | ☐ |
| 3.14 | Run `bun typecheck`, `bun lint`, `bun test`, `bun build` | QA Agent | ☐ |

Acceptance: smoke route works for owner; Supabase still owns prod.

---

## Phase 4 — Database Migration (batched)

Each batch = one PR. Per batch: schema → queries/mutations → router swap → tests → manual verify.

### Batch 4.1 — Identity + user prefs

| # | Task | Status |
|---|---|---|
| 4.1.1 | Convex schema: `users`, `user_settings`, `user_provider_connections`, `user_canvases` | ☐ |
| 4.1.2 | Convex queries + mutations for the four tables | ☐ |
| 4.1.3 | Swap `routers/user/{user,user-settings,user-canvas}.ts` to Convex | ☐ |
| 4.1.4 | Swap `routers/provider.ts` to Convex | ☐ |
| 4.1.5 | Tests + verify in dev | ☐ |

### Batch 4.2 — Workspaces

| # | Task | Status |
|---|---|---|
| 4.2.1 | Convex schema: `workspaces`, `workspace_members`, `workspace_invitations`, `project_members`, `audit_log` | ☐ |
| 4.2.2 | Convex queries/mutations | ☐ |
| 4.2.3 | Swap `routers/workspace/*` to Convex | ☐ |
| 4.2.4 | Migrate `requireCap` to read from Convex | ☐ |
| 4.2.5 | Migrate `audit()` helper to Convex | ☐ |
| 4.2.6 | Tests | ☐ |

### Batch 4.3 — Projects core

| # | Task | Status |
|---|---|---|
| 4.3.1 | Convex schema: `projects`, `project_settings`, `project_create_requests`, `project_offline_pins`, `page_access`, `project_invitations` | ☐ |
| 4.3.2 | Convex queries/mutations | ☐ |
| 4.3.3 | Swap `routers/project/{project,settings,createRequest,offline,invitation,member}.ts` | ☐ |
| 4.3.4 | Swap `routers/page-access/*` | ☐ |
| 4.3.5 | Port `getEditorBootstrap` complex nested fetch | ☐ |
| 4.3.6 | Tests | ☐ |

### Batch 4.4 — Canvas + branches

| # | Task | Status |
|---|---|---|
| 4.4.1 | Convex schema: `canvas`, `frames`, `branches` | ☐ |
| 4.4.2 | Convex queries/mutations (incl. partial-unique-default-branch enforcement) | ☐ |
| 4.4.3 | Swap `routers/project/{branch,frame,sandbox}.ts` | ☐ |
| 4.4.4 | Tests | ☐ |

### Batch 4.5 — Chat

| # | Task | Status |
|---|---|---|
| 4.5.1 | Convex schema: `conversations`, `messages` | ☐ |
| 4.5.2 | Convex queries/mutations | ☐ |
| 4.5.3 | Swap `routers/chat/{conversation,message,suggestion}.ts` | ☐ |
| 4.5.4 | Confirm orphaned broadcast triggers can be dropped (Convex reactivity covers it) | ☐ |
| 4.5.5 | Tests | ☐ |

### Batch 4.6 — CMS

| # | Task | Status |
|---|---|---|
| 4.6.1 | Convex schema: 6 CMS tables | ☐ |
| 4.6.2 | Convex queries/mutations (incl. Zod-based dynamic value validation) | ☐ |
| 4.6.3 | Swap `routers/cms/*` | ☐ |
| 4.6.4 | Tests | ☐ |

### Batch 4.7 — Comments

| # | Task | Status |
|---|---|---|
| 4.7.1 | Convex schema: `project_comments`, `comment_replies` (author SET NULL semantics) | ☐ |
| 4.7.2 | Swap `routers/comment/*` | ☐ |
| 4.7.3 | Tests | ☐ |

### Batch 4.8 — Domain + hosting

| # | Task | Status |
|---|---|---|
| 4.8.1 | Convex schema: 6 domain/hosting tables | ☐ |
| 4.8.2 | Swap `routers/domain/*`, `routers/hosting-connection/*`, `routers/publish/*` | ☐ |
| 4.8.3 | Tests | ☐ |

### Batch 4.9 — Subscriptions + usage + Stripe webhooks

| # | Task | Status |
|---|---|---|
| 4.9.1 | Convex schema: `products`, `prices`, `subscriptions`, `legacy_subscriptions`, `rate_limits`, `usage_records` | ☐ |
| 4.9.2 | Port Stripe webhook handlers (`create.ts`, `update.ts`, `pause.ts`, `delete.ts`) to Convex HTTP actions | ☐ |
| 4.9.3 | Swap `routers/{subscription,usage}/*` | ☐ |
| 4.9.4 | Port idempotency: `usage_records (user_id, trace_id)` UNIQUE → Convex check | ☐ |
| 4.9.5 | Tests (Stripe webhook idempotency + rate-limit math) | ☐ |

### Batch 4.10 — Skills + feedback

| # | Task | Status |
|---|---|---|
| 4.10.1 | Convex schema: `skills`, optionally `feedbacks` | ☐ |
| 4.10.2 | Swap `routers/skill/*` | ☐ |
| 4.10.3 | Decide drop or keep `feedbacks` table | ☐ |
| 4.10.4 | Tests | ☐ |

### Batch 4.11 — Storage (preview_images bucket)

| # | Task | Status |
|---|---|---|
| 4.11.1 | Move `apps/web/client/src/server/api/routers/project/project.ts:231` upload to Convex File Storage | ☐ |
| 4.11.2 | Replace `getFileUrlFromStorage` helpers with Convex storage URL builders | ☐ |
| 4.11.3 | Update 4 client components that read preview URLs | ☐ |
| 4.11.4 | Migration script: re-upload existing screenshots from `preview_images` bucket to Convex | ☐ |
| 4.11.5 | Drop `getFileInfoFromStorage`, `uploadBlobToStorage` helpers | ☐ |

### Batch 4.12 — Presence

| # | Task | Status |
|---|---|---|
| 4.12.1 | Install `@convex-dev/presence` OR build TTL `presence` table | ☐ |
| 4.12.2 | Rewrite `apps/web/client/src/components/store/editor/presence/index.ts` | ☐ |
| 4.12.3 | Multi-tab presence test | ☐ |

---

## Phase 5 — Auth Migration (Clerk replaces Supabase Auth)

| # | Task | Status |
|---|---|---|
| 5.1 | Add Clerk webhook handler at `apps/web/client/src/app/api/clerk/webhook/route.ts` → Convex action | ☐ |
| 5.2 | Handle `user.created`, `user.updated`, `user.deleted` events | ☐ |
| 5.3 | Implement explicit cascade-delete fan-out Convex action for `user.deleted` | ☐ |
| 5.4 | Swap `createTRPCContext` in `apps/web/client/src/server/api/trpc.ts` to Clerk JWT | ☐ |
| 5.5 | Swap `protectedProcedure` and `adminProcedure` | ☐ |
| 5.6 | Swap each of the 10 layout-level guards (`projects/layout.tsx`, etc.) | ☐ |
| 5.7 | Swap browser-side `signOut` calls (`avatar-dropdown`, `settings-modal`, `invitation/[id]/main`) | ☐ |
| 5.8 | Replace `/login` + `/login/verify` with Clerk-driven custom UI | ☐ |
| 5.9 | Replace `/auth/callback` + `/auth/auth-code-error` + `/auth/redirect` | ☐ |
| 5.10 | Update `/profile-setup` (Clerk emits `firstName`/`lastName` natively — confirm field map) | ☐ |
| 5.11 | Swap middleware to `clerkMiddleware()` — preserve cookie fast-path, `x-pathname`, WeblabDesktop UA redirect | ☐ |
| 5.12 | Keep CLI provider OAuth — swap only the `getUser()` gate to `auth()` | ☐ |
| 5.13 | Update `account-tab.tsx` provider badge logic (Clerk's `externalAccounts`) | ☐ |
| 5.14 | Update `comment-popover.tsx` self-vs-other gating | ☐ |
| 5.15 | Update presence store user-identity read | ☐ |
| 5.16 | Update `auth-redirect.tsx` to Clerk's `<SignedOut>` | ☐ |
| 5.17 | Configure GitHub + Google OAuth in Clerk dashboard | ☐ |
| 5.18 | Configure email OTP in Clerk | ☐ |
| 5.19 | Configure desktop redirect URL `weblab://auth/callback` in Clerk | ☐ |
| 5.20 | Update `apps/web/client/src/app/_components/auth-{form,modal}.tsx` | ☐ |
| 5.21 | Delete `apps/web/client/src/utils/supabase/` directory | ☐ (defer to Phase 7) |
| 5.22 | Manual smoke: sign up, sign in (OAuth + OTP), sign out, account delete | ☐ |

---

## Phase 6 — Data Migration

| # | Task | Status |
|---|---|---|
| 6.1 | Write `scripts/migration/export-supabase.ts` (JSONL per table) | ☐ |
| 6.2 | Write `scripts/migration/import-convex.ts` (using Convex internal mutation) | ☐ |
| 6.3 | Write `scripts/migration/validate-parity.ts` (row counts + spot checks) | ☐ |
| 6.4 | Map Supabase user UUID → Clerk userId for owner | ☐ |
| 6.5 | Re-encrypt provider tokens during import (same encryption key) | ☐ |
| 6.6 | Drill 1: export staging Supabase, import staging Convex | ☐ |
| 6.7 | Drill 2: simulate corrupted import, verify rollback path | ☐ |
| 6.8 | Drill 3: production data | ☐ |
| 6.9 | Document manual steps required by owner (Clerk identity creation) | ☐ |

---

## Phase 7 — Remove Supabase

| # | Task | Status |
|---|---|---|
| 7.1 | Tag commit `pre-supabase-removal` | ☐ |
| 7.2 | Delete `apps/backend/` directory | ☐ |
| 7.3 | Delete `apps/web/client/src/utils/supabase/` | ☐ |
| 7.4 | Delete `packages/db/` (or shrink to types-only — decide) | ☐ |
| 7.5 | Remove `@supabase/ssr` from `apps/web/client/package.json` | ☐ |
| 7.6 | Remove all `SUPABASE_*` and `NEXT_PUBLIC_SUPABASE_*` from `src/env.ts` | ☐ |
| 7.7 | Remove from `.env.example` (root, web client, backend, db) | ☐ |
| 7.8 | Remove from Railway dashboard | ☐ |
| 7.9 | Remove from GitHub Actions secrets | ☐ |
| 7.10 | Drop `.github/workflows/supabase-keepalive.yml` | ☐ |
| 7.11 | Drop `.github/workflows/supabase-push-staging.yml` | ☐ |
| 7.12 | Drop `[functions.stripe-webhook]` (already gone with apps/backend) | ☐ |
| 7.13 | Verify `rg -n '@supabase' apps/ packages/ tooling/` returns 0 hits | ☐ |
| 7.14 | Update `docs/agent-context/data-api-architecture.md` | ☐ |
| 7.15 | Update `docs/agent-memory/feature-log.md` | ☐ |
| 7.16 | Update `docs/agent-context/packages-reference.md` (remove `@weblab/db` if dropped) | ☐ |
| 7.17 | Update `docs/agent-context/trpc-routers-reference.md` if router shape changed | ☐ |
| 7.18 | Update `CLAUDE.md` (env var list, db commands, deploy section) | ☐ |
| 7.19 | Update root `README.md` if it mentions Supabase | ☐ |
| 7.20 | Drop `apps/web/client/.storybook/mocks/supabase-client.ts` | ☐ |
| 7.21 | Drop `apps/web/client/.storybook/main.ts` alias | ☐ |

---

## Phase 8 — Verification

| # | Task | Status |
|---|---|---|
| 8.1 | `bun typecheck` green | ☐ |
| 8.2 | `bun lint` green | ☐ |
| 8.3 | `bun test` green | ☐ |
| 8.4 | `bun build` green | ☐ |
| 8.5 | Chromatic visual diff green | ☐ |
| 8.6 | Sign up flow on prod | ☐ |
| 8.7 | Sign in GitHub on prod | ☐ |
| 8.8 | Sign in Google on prod | ☐ |
| 8.9 | Sign in email OTP on prod | ☐ |
| 8.10 | Sign out on prod | ☐ |
| 8.11 | Create project on prod | ☐ |
| 8.12 | AI chat round-trip on prod | ☐ |
| 8.13 | Publish project on prod | ☐ |
| 8.14 | Workspace invite + accept on prod | ☐ |
| 8.15 | Custom domain attach on prod | ☐ |
| 8.16 | Account deletion on prod (with test user) | ☐ |
| 8.17 | Stripe upgrade + downgrade on prod | ☐ |
| 8.18 | Comment + reply on prod | ☐ |
| 8.19 | Multi-tab presence on prod | ☐ |
| 8.20 | Settings update on prod | ☐ |
| 8.21 | Profile setup on prod | ☐ |
| 8.22 | Write `MIGRATION_QA_REPORT.md` with screenshots + repro steps | ☐ |
| 8.23 | Append "Migration to Convex + Clerk" entry in `docs/agent-memory/feature-log.md` | ☐ |

---

## Notes

- All work happens on a single branch (`main`) per CLAUDE.md git rules — no feature branches unless owner explicitly requests one.
- Per CLAUDE.md, no `git stash`, `git reset`, `git rebase`, force-push, or worktrees.
- Each batch in Phase 4 ships as one focused commit. Run `/caveman-review` on every diff before merging.
- For batches in Phase 4 with 3+ files touched, also run `cr review` (CodeRabbit) per CLAUDE.md.
- Manual steps owner may need to run are flagged with ⚠️ MANUAL STEP REQUIRED in the relevant batch.

End of MIGRATION_TASK.md.
