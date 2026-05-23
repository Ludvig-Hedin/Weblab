# DEPLOYMENT_MIGRATION_RUNBOOK.md

**Output of:** DevOps Agent (Phase 2)
**Status:** Plan draft.
**Companion:** `MIGRATION_PLANNING.md` §8 (env strategy), `MIGRATION_TASK.md`.

This runbook specifies env vars, deploy order, rollback, and zero-downtime strategy for the Supabase → Convex + Clerk migration. Production app deploys on Railway (per CLAUDE.md). Docs site is unaffected.

---

## 1. Environment Inventory

**Updated 2026-05-20:** single environment for now. Single Convex deployment (`weblab-dev`) and single Clerk app (`Weblab`) used by local dev + Railway prod. Owner is the only real user — three-env split adds setup hassle without isolation benefit. Add a second prod-only Convex+Clerk pair at real-user launch time.

| Env | Where | Convex | Clerk |
|---|---|---|---|
| Local dev | `bun dev` | `weblab-dev` | `Weblab` |
| Production (Railway) | weblab.build | `weblab-dev` (same) | `Weblab` (same) |
| (Future) prod isolation | weblab.build | `weblab-prod` (TBD) | `Weblab Production` (TBD) |

Domains:
- Production: `weblab.build`
- Desktop: `weblab://` (Electron preload)

---

## 2. Env Var Matrix

### 2.1. Vars to ADD (Convex + Clerk) — single env

| Var | Scope | Value |
|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | client | same as `CONVEX_URL` from `bunx convex dev` output |
| `CONVEX_DEPLOYMENT` | server (CLI) | written by `bunx convex dev` |
| `CONVEX_DEPLOY_KEY` | CI only | from Convex dashboard → Settings → Deploy keys |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | client | same as `CLERK_PUBLISHABLE_KEY` (mirror) |
| `CLERK_SECRET_KEY` | server | from `clerk env pull` |
| `CLERK_WEBHOOK_SECRET` | server | from Clerk dashboard → Webhooks (add when deploying webhook endpoint) |
| `CLERK_JWT_ISSUER_DOMAIN` | server (also passed to Convex via `convex env set`) | from Clerk dashboard → JWT Templates → `convex` template, "Issuer" field |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | client | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | client | `/sign-up` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | client | `/projects` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | client | `/profile-setup` |
| `SEED_USER_CLERK_ID` | server (dev only) | `user_…` (the seed account in Clerk) |

### 2.2. Vars to KEEP through transition (Supabase still in use until Phase 7)

| Var | Purpose | Removal phase |
|---|---|---|
| `SUPABASE_URL` | admin client + seed | Phase 7 |
| `SUPABASE_DATABASE_URL` | Drizzle direct connection | Phase 7 |
| `SUPABASE_SERVICE_ROLE_KEY` | admin client | Phase 7 |
| `NEXT_PUBLIC_SUPABASE_URL` | server/browser SSR client | Phase 7 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | server/browser SSR client | Phase 7 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | optional fallback | Phase 7 |

### 2.3. Vars to KEEP indefinitely (unrelated to migration)

`CSB_API_KEY`, `WEBLAB_CLOUD_PROVIDER`, `VERCEL_TEAM_ID`/`VERCEL_PROJECT_ID`/`VERCEL_TOKEN` (Vercel Sandbox runtime), `RESEND_API_KEY`, `FREESTYLE_API_KEY`, `STRIPE_*`, `MORPH_API_KEY`/`RELACE_API_KEY`, AWS Bedrock, Google Vertex AI, `OPENROUTER_API_KEY` + provider fallbacks, n8n, `EMAIL_DRY_RUN`, `FIRECRAWL_API_KEY`/`EXA_API_KEY`/`MEM0_API_KEY`, Langfuse, GitHub App, Figma, `DESIGN_SYSTEM_PASSWORD`, `PROVIDER_TOKEN_ENCRYPTION_KEY`, `CMS_SOURCE_ENCRYPTION_KEY`, CLI-provider OAuth client IDs/secrets, every `NEXT_PUBLIC_*` feature flag.

### 2.4. Vars to DROP in Phase 7

The six Supabase vars in §2.2 plus:
- `GITHUB_CLIENT_ID` / `GITHUB_SECRET` (in `apps/backend/.env.example` — those were for Supabase Auth's provider config; Clerk takes its own)
- `GOOGLE_CLIENT_ID` / `GOOGLE_SECRET` (same)

---

## 3. Deploy Order (Phase by Phase)

### Phase 3 — Foundation deploy

1. Add NEW Convex + Clerk vars to Railway staging + prod (values from dashboards).
2. Update `apps/web/client/src/env.ts` to declare new vars (still `optional` until Phase 5).
3. Update `.env.example` (root, `apps/web/client`, `apps/backend`, `packages/db`).
4. Deploy to **staging** first.
5. Smoke test `/dev/convex-smoke` route on staging.
6. Deploy to **production** (with the feature flag OFF — Convex+Clerk wired but inactive).

### Phase 4 — DB migration batches

Each batch:

1. Merge to `main`.
2. Railway auto-deploys via Docker build.
3. Smoke test the affected feature on staging.
4. Promote to production (Railway "promote staging build to production" if configured; else re-deploy).

Convex deployments happen out-of-band via:

```bash
bunx convex deploy --prod    # production
bunx convex deploy --preview # staging
```

These run from CI (new GitHub Action — `convex-deploy.yml`) on every push to `main`.

### Phase 5 — Auth cutover

**Behind a flag for 48 hours minimum.**

1. Add `NEXT_PUBLIC_AUTH_PROVIDER=clerk` env var to staging.
2. Verify staging end-to-end.
3. Add to production.
4. After 48h with no regressions: remove the flag (Clerk-only).

If issues: revert env var (`=supabase`) — `createTRPCContext` falls back to the Supabase path.

### Phase 6 — Data migration

1. Snapshot Supabase prod DB via `pg_dump`.
2. Run `bun run migrate:export` (writes JSONL to `.migration-export/`).
3. Run `bun run migrate:import` against staging Convex first.
4. Validate parity with `bun run migrate:validate`.
5. Owner reviews staging deployment with imported data.
6. Run import against production Convex.
7. Validate prod.

### Phase 7 — Supabase removal

1. Tag `pre-supabase-removal` commit.
2. Delete `apps/backend/`, `apps/web/client/src/utils/supabase/`, `packages/db/`.
3. Drop `SUPABASE_*` env vars from Railway, GitHub Secrets, `.env.example` files.
4. Drop `.github/workflows/supabase-{keepalive,push-staging}.yml`.
5. Verify `bun build` succeeds.
6. Deploy.
7. **Wait 1 week before deleting the Supabase project itself** (final rollback window).

---

## 4. Rollback Procedures

### 4.1. Convex deploy gone bad

```bash
bunx convex deploy --history     # find prior version
bunx convex deploy --version <id>
```

Convex keeps deploy history; revert is a single command.

### 4.2. Clerk misconfigured

Each Clerk dashboard change is reversible in the dashboard. Code rollback: revert the commit; Railway redeploys.

### 4.3. Mid-batch Phase 4 break

Each batch is one PR. `git revert <sha>` on `main`; Railway redeploys. Drizzle path still exists until Phase 7.

### 4.4. Phase 5 auth cutover break

Flip `NEXT_PUBLIC_AUTH_PROVIDER` env back to `supabase`. `createTRPCContext` reads the flag and falls back.

### 4.5. Phase 7 Supabase deletion regret

Within 1 week:
1. Reset Railway env vars to the `SUPABASE_*` set (snapshot saved in `.migration-snapshots/`).
2. `git revert` the deletion commit.
3. Redeploy.

After 1 week the Supabase project itself is deleted — rollback requires restoring from `pg_dump`.

---

## 5. Zero-Downtime Strategy

Designed assuming the owner is currently the only real user but built to scale once real users exist.

| Concern | Strategy |
|---|---|
| Auth | Flag-gated cutover (§3 Phase 5). 48h dual-path window. |
| DB writes | Each Phase 4 batch is router-scoped. Drizzle still works until Phase 7. |
| Data parity | Phase 6 imports happen with the app NOT writing to Supabase (we have already moved write path to Convex in Phase 4). |
| Storage | Phase 4.11 migrates preview images. URL helpers return the new Convex URL after the migration script completes. Old Supabase URLs continue to work until the bucket is deleted. |
| Realtime | Presence cutover is a single PR. Multi-tab test in staging. |
| Stripe webhooks | Phase 4.9 ports to Convex. Until that PR ships, webhooks still use Drizzle. |
| Cron + keepalive | `supabase-keepalive.yml` runs until Phase 7. |

---

## 6. CI / GitHub Actions

### 6.1. New workflows

**`.github/workflows/convex-deploy.yml`**

```yaml
name: Convex deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: 1.3.1
      - run: bun install --frozen-lockfile
      - name: Deploy Convex (staging)
        env:
          CONVEX_DEPLOY_KEY: ${{ secrets.CONVEX_STAGING_DEPLOY_KEY }}
        working-directory: apps/web/client
        run: bunx convex deploy
```

Production Convex deploy is gated on a separate workflow that requires manual approval (GitHub environments).

### 6.2. Workflows to DROP in Phase 7

- `.github/workflows/supabase-keepalive.yml`
- `.github/workflows/supabase-push-staging.yml`

### 6.3. Workflows to UPDATE

- `.github/workflows/ci.yml` — already runs `bun typecheck` + `bun test`. Add `bunx convex codegen` step to ensure `_generated/` matches schema before typecheck.

---

## 7. Railway Configuration

### 7.1. Service env vars

Set via Railway dashboard or `railway variables set` CLI. **Do this BEFORE deploying** so the build picks them up.

Per-service:
- Staging service: stage values from §2.1 + keep `SUPABASE_*` until Phase 7.
- Production service: prod values + keep `SUPABASE_*`.

### 7.2. Healthcheck

Existing `/api/health` endpoint returns `{ ok: true }`. No change. Add a Convex-aware check in Phase 8:

```ts
// apps/web/client/src/app/api/health/route.ts
export async function GET() {
  // Optional: ping Convex
  // const ok = await convex.query(api.health.ping).catch(() => false);
  return Response.json({ ok: true });
}
```

### 7.3. Dockerfile

Root `Dockerfile` already runs `bun install --frozen-lockfile && cd apps/web/client && bun run build`. No change unless `convex` requires `bunx convex codegen` at build time — verify in Phase 3.

If codegen is needed:

```dockerfile
RUN cd apps/web/client && bunx convex codegen
RUN cd apps/web/client && bun run build
```

---

## 8. DNS / Webhook URLs

| Endpoint | Target |
|---|---|
| Clerk webhook | `https://weblab.build/api/clerk/webhook` (prod), `https://weblab-staging.up.railway.app/api/clerk/webhook` (staging) |
| Stripe webhook | unchanged from today — same Next.js route handler, body now calls Convex |
| GitHub App webhook | unchanged |

---

## 9. Owner Manual Steps

⚠️ **MANUAL STEP REQUIRED** items for the owner, sequenced:

### Before Phase 3

1. Create three Convex deployments via `bunx convex login` then `bunx convex dev` once for each env name.
2. Create three Clerk applications in clerk.com dashboard.
3. Configure JWT template `convex` per app (audience = matching Convex URL).
4. Configure OAuth providers (GitHub, Google) per Clerk app with the redirect URLs in `CLERK_MIGRATION_PLAN.md` §3.3.
5. Configure webhook endpoint per Clerk app, copy `CLERK_WEBHOOK_SECRET`.

### Before Phase 5

6. In dev Clerk app, create seed user `support@weblab.build`. Copy its Clerk userId → set `SEED_USER_CLERK_ID` dev env.

### Before Phase 6 (cutover)

7. In prod Clerk app, create the owner's user (matching the email used for GitHub OAuth in Supabase).
8. Tell Claude the resulting `clerkUserId` so the import script can backfill `users.clerkUserId` for the existing owner row.

### After Phase 7

9. Pause then (after 1 week) delete the Supabase project.

---

## 10. Smoke Test Checklist (each deploy)

- `https://<env>/api/health` returns 200 `{ ok: true }`.
- `https://<env>/sign-in` renders.
- Sign in via GitHub completes; lands on `/projects`.
- `/projects` lists at least one project after sign-in.
- AI chat round-trip succeeds.
- `bunx convex run users:getByClerkId '{"clerkUserId":"…"}'` returns the user doc.

---

## 11. Observability During Migration

- Watch Railway logs during each batch deploy. Failures: 500s on tRPC, Convex auth errors, Stripe webhook signature mismatches.
- Convex dashboard → Functions tab shows error rates per function.
- Clerk dashboard → Logs shows sign-in attempts + failures.
- Langfuse (already configured) traces AI calls — confirm `ctx.user.id` still flows after auth swap.

---

## 12. Definition of Done

- All Phase 7 env-var removals complete on Railway + GitHub Secrets.
- No GitHub Action references `supabase`.
- No code references `@supabase/*`.
- Convex deployment auto-deploys on push to `main`.
- Clerk webhook receives a `user.created` event end-to-end.
- One full sign-in → project create → AI chat → publish loop on production.

End of DEPLOYMENT_MIGRATION_RUNBOOK.md.
