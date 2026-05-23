# PHASE_0_AUDIT.md

**Status:** Phase 0 — pre-flight cleanup audit results.
**Date:** 2026-05-20
**Inputs:** two read-only subagent audits + manual scan.

---

## 1. `requireCap` Coverage

`requireCap` audit (full report in agent transcript):

- 22 router files audited
- ~95 mutations reviewed
- **12 gaps** found — must fix before Convex cutover (RLS goes away with Postgres)

### High severity (1)

| File:Line | Procedure | Problem | Fix |
|---|---|---|---|
| `apps/web/client/src/server/api/routers/chat/suggestion.ts:14` | `chat.suggestion.generate` | Accepts `conversationId` from client and UPDATEs `conversations.suggestions` with no ownership check. Today RLS blocks via `auth.uid()` ≠ conversation's project membership. Post-Convex: any authed user can overwrite any project's suggestions. | Resolve `projectId` from `conversationId`, then `requireCap('project.use_ai', { projectId })` |

**Action: fix this in this turn** (see `docs/migration/MIGRATION_TASK.md` Phase 0 task 0.2).

### Medium severity (4)

| File:Line | Procedure | Problem | Fix |
|---|---|---|---|
| `project/project.ts:1118` | `project.addTag` | Uses `verifyProjectAccess` (`project.view`); UPDATEs `projects.tags`. Viewers can mutate. | Upgrade gate to `'project.update'` |
| `project/project.ts:1150` | `project.removeTag` | Same | Same |
| `forward/editor.ts:32-44` | `forward.sandbox.create/start/stop/status` | Forwards to editor service without ownership check; any authed user can target any sandboxId | Add `verifySandboxAccess` before each forward |
| `project/sandbox.ts:232,610` | `sandbox.create`, `sandbox.createFromGitHub` | No quota gate — burns paid sandbox quota | Rate-limit per user OR gate on `workspace.create_project` cap |
| `user/user.ts:155` | `user.delete` | Self-scoped + destructive; CSRF leak → permanent account loss | Add confirmation token input + audit log entry |

### Low severity / informational (7)

All self-scope via `eq(table.user_id, ctx.user.id)`:
- `user/user-settings.ts:20` (upsert)
- `user/user.ts:65,131,148` (upsert, updateProfile, disconnectGitHub)
- `usage/index.ts:37,110` (increment, revertIncrement)
- `subscription/subscription.ts` (all)
- `hosting-connection/index.ts` (all)
- `provider.ts:31` (connectionsDelete)
- `project/fork.ts:179` (`project.view` → should be explicit `project.fork` or documented)

Convex ports preserve user-scoping via `requireUser` + indexed query on `userId`. No action needed.

### Stripe webhooks (1 latent issue)

`apps/web/client/src/app/webhook/stripe/subscription/{create,update,pause,delete}.ts` — handlers verify HMAC but trust the resolved `users.stripeCustomerId` ↔ `users.id` mapping without a defensive check. If data corruption ever causes a duplicate `stripeCustomerId` row, webhook silently picks one. Fix: assert exactly one row + log mismatches. Port carries forward in Phase 4.9.

---

## 2. Orphan Realtime Triggers

Verdict: **DEAD INFRA — CONFIRMED**.

`realtime.broadcast_changes('topic:' || project_id, ...)` triggers in `0007_realtime_rls.sql` (and RLS tightening in `0030_realtime_topic_membership.sql`) have **NO client subscriber anywhere**.

Evidence:
- Only 1 `supabase.channel()` call exists: `apps/web/client/src/components/store/editor/presence/index.ts:98` — uses `presence:${projectId}` prefix (NOT `topic:`)
- No `topic:<uuid>` references outside the two migrations themselves
- No `realtime.broadcast_changes` usage outside the producer
- No `useEvent` / `useChannel` / `useRealtime` consumer code
- No AI streaming dependency on the broadcasts

**Action:** drop in Phase 7 with the rest of Supabase removal. Specifically:
- DROP TRIGGER `handle_conversations_changes`, `handle_messages_changes`
- DROP FUNCTION `project_changes()` (or whatever the trigger function is named)
- DROP POLICY on `realtime.messages` added by `0030_realtime_topic_membership.sql`
- Keep `presence:${projectId}` channel + supporting realtime config — it's live

---

## 3. Other Phase 0 Items

| # | Item | Status | Notes |
|---|---|---|---|
| 0.1 | Apply migration 0037 | DEFERRED to Phase 7 | Irreversible drop; flagged "DO NOT APPLY until soak". Apply right before Supabase removal. |
| 0.4 | Decide fate of unmounted `image` router | DEFERRED | Decide in Phase 4.x when porting `image` (or delete) |
| 0.5 | Decide fate of `file_transfer` storage bucket | DROP | No code uses it. Drop in Phase 7 with bucket cleanup. |
| 0.6 | Update stale agent docs | DOING NOW | `packages-reference.md`, `trpc-routers-reference.md`, `data-api-architecture.md` |
| 0.7 | Retention policy for `audit_log`, `usage_records`, `deployments` | TBD | High-volume append-only. Decide before Phase 4.9 (Stripe/usage port). Suggest: 12-month rolling for audit_log, all-time for usage_records (billing), 12-month for deployments. |

---

## 4. Pre-Cutover Punch List

These must be fixed **before** Phase 5 (auth swap) flips the switch:

1. ✅ HIGH gap: `chat.suggestion.generate` requires `requireCap('project.use_ai', { projectId })`
2. ⚠️ Medium: `project.addTag` / `project.removeTag` upgrade to `'project.update'`
3. ⚠️ Medium: `forward.sandbox.*` add `verifySandboxAccess`
4. ⚠️ Medium: `sandbox.create` / `createFromGitHub` rate-limit
5. ⚠️ Medium: `user.delete` confirmation token
6. ⚠️ Low/Medium: Stripe webhook user-binding defensive check

Items 2–6 fixed during the corresponding Phase 4 batch port (the same router move). Item 1 fixed in this turn since it's HIGH and the fix is small.

End of PHASE_0_AUDIT.md.
