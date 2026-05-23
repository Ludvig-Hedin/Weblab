# MIGRATION_PLANNING.md

**Status:** Phase 2 — Planning (no code touched)
**Date:** 2026-05-19
**Authoritative inputs:** `MIGRATION_DISCOVERY.md`, `CONVEX_MIGRATION_PLAN.md`, `CLERK_MIGRATION_PLAN.md`, `DEPLOYMENT_MIGRATION_RUNBOOK.md`
**Tracker:** `MIGRATION_TASK.md`

---

## 1. Goal

Migrate Weblab from **Supabase (Postgres + Auth + Storage + Realtime) → Convex (DB + Realtime + File Storage) + Clerk (Auth)** while:

- Keeping the app functional after every phase.
- Designing for zero downtime + rollback even though only the owner is currently a real user.
- Removing Supabase only after every replacement is verified.
- Running lint / typecheck / tests / build after each major phase.

---

## 2. Target Architecture

```
                ┌──────────────────────────────────────────────┐
                │      apps/web/client (Next.js 16 + tRPC)     │
                │                                              │
                │  ┌────────────┐   ┌────────────────────────┐ │
                │  │ Clerk SDK  │   │ Convex React Provider  │ │
                │  │ (auth UI)  │   │ (useQuery/useMutation) │ │
                │  └─────┬──────┘   └───────────┬────────────┘ │
                │        │                      │              │
                │        │ Clerk JWT            │ Convex auth  │
                │        ▼                      ▼              │
                │  ┌──────────────────────────────────────┐    │
                │  │   tRPC layer (transitional facade)   │    │
                │  │   - createTRPCContext reads Clerk JWT│    │
                │  │   - calls Convex via @convex/server  │    │
                │  └──────────────────────────────────────┘    │
                └──────────────────────────────────────────────┘
                                    │
                                    ▼
                  ┌────────────────────────────────────────┐
                  │             Convex Cloud               │
                  │  - schema (mirrors 41 tables)          │
                  │  - queries/mutations/actions           │
                  │  - HTTP actions (Stripe, Clerk webhooks)│
                  │  - File Storage (preview_images)       │
                  │  - Reactive subscriptions              │
                  └────────────────────────────────────────┘
                                    │
                                    ▼
                  ┌────────────────────────────────────────┐
                  │   Clerk (auth provider)                │
                  │  - GitHub + Google + email OTP         │
                  │  - JWT template "convex"               │
                  │  - Webhooks → Convex HTTP actions      │
                  └────────────────────────────────────────┘
```

Key integration choices:

- **Clerk JWT template "convex"** (Clerk's first-party Convex integration) lets Convex verify identity directly from the same JWT used by the client. No bespoke session layer.
- **tRPC stays during transition** — same Convex client called from inside tRPC procedures keeps the 27 router URLs stable while we migrate router-by-router. After all routers are Convex-backed, we evaluate collapsing tRPC into direct Convex hooks for client code (decision point in Phase 7).
- **Convex File Storage** replaces `preview_images` bucket. URLs change shape; the storage-helper functions absorb the change.
- **Convex reactive queries** replace the orphaned realtime broadcast triggers automatically.
- **Cursor presence** moves to `@convex-dev/presence` component (or a custom TTL table) — decision in `CONVEX_MIGRATION_PLAN.md`.

---

## 3. Why Not Alternatives

| Alternative | Why we passed |
|---|---|
| Stay on Supabase, just swap Auth → Clerk | Loses the Convex DX win (live queries, no migrations, no RLS gymnastics). Owner's goal is the full move. |
| Keep Postgres, swap Auth → Clerk + write Clerk JWT for RLS | Possible but doubles maintenance: 30+ RLS policies need rewriting AND Convex still beckons. |
| Move auth to NextAuth/Better-Auth | Owner explicitly chose Clerk. Clerk's Convex integration is also first-party. |
| Move DB to PlanetScale / Neon (Postgres) | Keeps Drizzle but loses Convex's reactivity. Owner's goal is Convex. |

---

## 4. Phased Plan (matches `MIGRATION_TASK.md`)

### Phase 0 — Pre-flight cleanup (BEFORE Convex/Clerk work)

Why: avoid migrating dead infra or fragile gaps.

- Apply migration 0037 (drop legacy `user_projects.role` + `project_role` enum).
- Audit `requireCap` coverage. Fix gaps that today rely on RLS.
- Confirm and drop orphaned realtime broadcast triggers (or document why they stay).
- Decide fate of unmounted `image` router and `file_transfer` bucket.
- Update stale agent docs (`packages-reference.md`, `trpc-routers-reference.md`, `data-api-architecture.md`).

### Phase 1 — Discovery ✅ DONE

See `MIGRATION_DISCOVERY.md`.

### Phase 2 — Planning (this doc + companion plans)

Outputs: this file, `CONVEX_MIGRATION_PLAN.md`, `CLERK_MIGRATION_PLAN.md`, `DEPLOYMENT_MIGRATION_RUNBOOK.md`, `MIGRATION_TASK.md`.

### Phase 3 — Foundation (Convex + Clerk installed alongside Supabase)

Goal: Convex + Clerk run in dev; Supabase still serves the app.

1. Install Convex (`bun add convex`), run `npx convex dev`, point at a new Convex deployment (`weblab-dev`).
2. Install Clerk (`bun add @clerk/nextjs`), create a dev Clerk app.
3. Add new env vars (CLERK_*, NEXT_PUBLIC_CLERK_*, CONVEX_*) to `apps/web/client/src/env.ts` AND to `.env.example` files.
4. Set up Clerk JWT template "convex" + Convex auth config (`convex/auth.config.ts`).
5. Add `<ClerkProvider>` and `<ConvexProvider>` wrappers to `apps/web/client/src/app/layout.tsx` BEHIND a feature flag (default off).
6. Bootstrap `convex/` directory with empty schema, one example query, one example mutation.
7. Validate end-to-end: a tiny test page reads from Convex while logged in via Clerk; Supabase still owns production traffic.

Acceptance: `bun typecheck` + `bun lint` + `bun test` pass. App still works with Supabase. New "Convex test" page works with Clerk JWT.

### Phase 4 — Database Migration (module by module)

Goal: every router/webhook reads/writes Convex instead of Drizzle.

Order (each batch ≈ one PR):

1. **Reference data + identity:** users, user_settings, user_provider_connections, user_canvases.
2. **Workspaces:** workspaces, workspace_members, workspace_invitations, project_members, audit_log.
3. **Projects core:** projects, project_settings, project_create_requests, project_offline_pins, page_access.
4. **Canvas + branches:** canvas, frames, branches.
5. **Chat:** conversations, messages (drop orphaned broadcast triggers; rely on Convex reactivity).
6. **CMS:** cms_source, cms_collection, cms_field, cms_item, cms_binding, cms_collection_page.
7. **Comments:** project_comments, comment_replies.
8. **Domain/hosting:** custom_domains, custom_domain_verification, project_custom_domains, preview_domains, deployments, hosting_provider_connections.
9. **Subscriptions + usage:** products, prices, subscriptions, legacy_subscriptions, rate_limits, usage_records (Stripe webhooks ported).
10. **Skills, feedbacks.**

Per batch:

- Define Convex schema + indexes (matching Postgres indexes).
- Write Convex queries/mutations.
- Replace the corresponding Drizzle calls in routers (still wrapped in tRPC).
- Add tests (`bun test` + Convex's `convex-test` harness where applicable).
- Validate by exercising the feature in dev.

Acceptance after each batch: typecheck + lint + tests green. Feature works in browser.

### Phase 5 — Auth Migration (Clerk replaces Supabase Auth)

Goal: every `supabase.auth.*` call gone; `ctx.user` populated from Clerk JWT.

1. Implement Clerk webhook handler at `apps/web/client/src/app/api/clerk/webhook/route.ts` → Convex action that upserts `users` row on `user.created` / `user.updated`, and fans out delete on `user.deleted`.
2. Swap `createTRPCContext` to read Clerk JWT (`auth().userId` from `@clerk/nextjs/server`) instead of `supabase.auth.getUser()`.
3. Swap all 10 layout-level guards to Clerk's `auth()` + `redirectToSignIn()`.
4. Swap browser-side calls (avatar dropdown signOut, settings modal, comment popover, presence store) to Clerk's `useClerk()`, `useUser()`.
5. Replace `/login`, `/login/verify`, `/auth/callback`, `/auth/auth-code-error`, `/profile-setup` with Clerk-driven equivalents (custom UI matching Weblab design system per `clerk-custom-ui`).
6. Swap middleware to `clerkMiddleware()` — preserve the cookie fast-path, `x-pathname` injection, and the WeblabDesktop UA redirect.
7. Keep the CLI provider OAuth flow intact — only swap its `getUser()` gate.
8. Verify GitHub + Google OAuth providers are configured in Clerk dashboard with correct redirect URLs (incl. `weblab://auth/callback` for desktop).

Acceptance: sign up, sign in, sign out, OAuth, OTP, account deletion all work. Stripe customer ID persistence still works. Capability matrix unchanged.

### Phase 6 — Data Migration

Since there are no real users today, this is mostly a drill:

1. Script `scripts/migration/export-supabase.ts` — exports every table from staging Supabase as JSONL.
2. Script `scripts/migration/import-convex.ts` — uses Convex's `ctx.db.insert` from a one-shot mutation/action, preserving IDs where possible.
3. Validation script — checksum table counts, spot-check FK integrity.
4. Run the drill twice on dummy data; once on the owner's real data.
5. Document the owner's pre-cutover steps (Clerk account creation, mapping owner's Supabase UUID → Clerk userId).

### Phase 7 — Remove Supabase

After all production traffic is on Convex + Clerk for ≥1 week with no regressions:

1. Delete `apps/backend/` workspace entirely.
2. Delete `apps/web/client/src/utils/supabase/`.
3. Delete `packages/db/` (or shrink to a pure types package — TBD).
4. Remove `@supabase/ssr` from `apps/web/client/package.json`.
5. Remove `SUPABASE_*` env vars from `src/env.ts`, `.env.example` files, Railway, GitHub Actions secrets.
6. Drop the `supabase-keepalive.yml` workflow.
7. Drop the `supabase-push-staging.yml` workflow.
8. Drop the `[functions.stripe-webhook]` stub.
9. Audit grep: `rg -n '@supabase' .` — must return 0 hits (excluding archived docs).
10. Update agent docs.

### Phase 8 — Verification

1. Run full QA per `MIGRATION_QA_REPORT.md`.
2. Smoke test sign up / sign in / sign out, OAuth (GitHub + Google), OTP, account deletion, protected routes, every router's primary mutation, file upload, project creation/fork/delete, workspace invite, chat with AI, Stripe webhook handling.
3. Lint + typecheck + tests + build all green.
4. Production deploy via Railway; canary monitor.

---

## 5. Risks & Mitigations (consolidated)

| Risk | Severity | Mitigation |
|---|---|---|
| RLS gap exposed once we leave Postgres | 🔴 | Phase 0 audit. `requireCap` on every mutation. |
| Auth cutover breaks all tRPC procedures | 🔴 | Atomic swap of `createTRPCContext`. Feature flag to fall back to Supabase if needed during Phase 5. |
| Convex schema mismatch on jsonb shapes | 🟡 | `v.any()` for known-fluid columns; Zod validation at write boundary. |
| Stripe webhook lossiness | 🔴 | Re-use `usage_records (user_id, trace_id) UNIQUE` idempotency pattern in Convex. |
| Presence regresses | 🟡 | Component swap via `@convex-dev/presence`. Test multi-tab. |
| Middleware refresh corruption (Supabase had a known race; Clerk equiv?) | 🟡 | Use Clerk's `clerkMiddleware()` as-shipped. Don't custom-race. |
| Owner's Clerk identity must map to existing data | 🟡 | Pre-mapping script in Phase 6 inserts `clerk_user_id` for the existing owner UUID. |
| Railway env var rollout order | 🟡 | Per `DEPLOYMENT_MIGRATION_RUNBOOK.md` — add new vars BEFORE removing old. |
| Cascading delete fan-out for `users.delete` | 🟡 | Explicit Convex action; covered by integration test. |
| `apps/backend` removal breaks `bun db:*` scripts | 🟢 | Replace with `bun convex:*` aliases. |

---

## 6. Milestones

| Milestone | Definition of done | Estimated effort |
|---|---|---|
| M0: Pre-flight cleanup | Phase 0 items closed. CI green. | 1–2 days |
| M1: Foundation | Convex + Clerk wired behind flag. Smoke test route works. | 2–3 days |
| M2: Identity + workspaces migrated | Batches 1–2 done. Users + workspaces read/write from Convex. tRPC unchanged. | 3–5 days |
| M3: Projects + canvas + chat migrated | Batches 3–5 done. Editor works end-to-end on Convex. | 5–7 days |
| M4: CMS + comments + domains migrated | Batches 6–8 done. | 4–6 days |
| M5: Stripe + usage migrated | Batch 9 done. Webhooks ported. | 2–3 days |
| M6: Auth swap | Phase 5 done. All `supabase.auth.*` removed. | 3–4 days |
| M7: Production data migration | Phase 6 done. Owner's data lives on Convex + Clerk. | 1 day (drill done) |
| M8: Supabase removal | Phase 7 done. `apps/backend` gone. | 1 day |
| M9: Full verification + deploy | Phase 8 done. Prod canary clean. | 1–2 days |

**Total estimate:** 4–6 weeks of focused work.

---

## 7. Rollback Strategy

### During each migration batch (Phase 4)

- Each batch is a single PR with full test coverage.
- Convex schema is additive — we keep the Drizzle schema in `packages/db` until Phase 7.
- If a batch breaks: revert the PR, the Drizzle path still works (we have NOT removed it).

### During auth swap (Phase 5)

- Behind a `NEXT_PUBLIC_AUTH_PROVIDER=clerk|supabase` feature flag for the first 48 hours.
- `createTRPCContext` reads the flag; if `clerk` fails it falls back to Supabase. Drop the flag once stable.

### During data migration (Phase 6)

- Snapshot Supabase DB before import.
- Keep Supabase project active for 1 week minimum after Convex cutover (rollback window).
- Restore script (`scripts/migration/restore-supabase.ts`) reverses the export.

### During Supabase removal (Phase 7)

- Tag the commit BEFORE deletion as `pre-supabase-removal`.
- If something breaks post-removal, `git revert` brings it all back.

---

## 8. Environment Strategy

**Updated 2026-05-20:** single environment. Single Convex deployment (`weblab-dev`) and single Clerk app (`Weblab`) for now. The owner is the only real user, so a staging/prod split adds setup hassle without buying real isolation. If/when real users exist, we add a second Convex + Clerk pair for prod at cutover time (cheap to do later).

| Env | Convex deployment | Clerk app | Status |
|---|---|---|---|
| current | `weblab-dev` | `Weblab` | Single shared project until cutover |
| (future) prod | `weblab-prod` | `Weblab Production` | Created at launch time, not before |

Env vars in `apps/web/client/src/env.ts` flat-list both old (Supabase) and new (Convex, Clerk) vars during transition. Each removed in Phase 7.

Full env var matrix in `DEPLOYMENT_MIGRATION_RUNBOOK.md`.

---

## 9. Definition of Done

- `rg -n '@supabase|@supabase/ssr|@supabase/supabase-js' apps/ packages/ tooling/` returns 0 hits.
- `apps/backend/` directory does not exist.
- `bun typecheck` + `bun lint` + `bun test` all green.
- `bun build` produces a working app.
- Manual smoke test on production: sign up + sign in + sign out + project create + AI chat + publish + Stripe checkout all work.
- `docs/agent-context/data-api-architecture.md` updated.
- `docs/agent-memory/feature-log.md` has a "Migration to Convex + Clerk" entry.

---

## 10. Documentation Output Plan

Per CLAUDE.md doc discipline:

- `docs/migration/MIGRATION_DISCOVERY.md` — ground truth (this Phase 1)
- `docs/migration/MIGRATION_PLANNING.md` — this file
- `docs/migration/MIGRATION_TASK.md` — granular task list
- `docs/migration/CONVEX_MIGRATION_PLAN.md` — DB schema + data plan
- `docs/migration/CLERK_MIGRATION_PLAN.md` — auth plan
- `docs/migration/DEPLOYMENT_MIGRATION_RUNBOOK.md` — env + deploy plan
- `docs/migration/MIGRATION_QA_REPORT.md` — created in Phase 8

After Phase 7: archive `docs/migration/*` into `docs/archive/migration-supabase-to-convex-clerk/`. Update `docs/agent-context/data-api-architecture.md` to describe the new Convex+Clerk world.

---

## 11. Execution Begins After

This planning document and its three companion plans are reviewed by the project owner (Ludvig). No code is touched in `apps/`, `packages/`, or `tooling/` until that review is complete and Phase 3 starts.

End of MIGRATION_PLANNING.md.
