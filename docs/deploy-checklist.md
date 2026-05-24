# Weblab Deploy Checklist — Post Supabase → Convex + Clerk Migration

Run through this once after pulling the migration commit. All items are manual — Convex CLI / dashboard / Railway dashboard work.

---

## 1. Convex deployment env vars

Set on the **dev** Convex deployment (`avid-gnat-539`) — and again on prod when promoting:

```bash
cd apps/web/client

# Existing — verify present
bunx convex env set OPENROUTER_API_KEY <key>
bunx convex env set CSB_API_KEY <key>
bunx convex env set VERCEL_TOKEN <token>
bunx convex env set FREESTYLE_API_KEY <key>
bunx convex env set FIRECRAWL_API_KEY <key>
bunx convex env set EXA_API_KEY <key>
bunx convex env set MORPH_API_KEY <key>      # OR RELACE_API_KEY
bunx convex env set GITHUB_APP_ID <id>
bunx convex env set GITHUB_APP_PRIVATE_KEY "$(cat private-key.pem)"
bunx convex env set GITHUB_APP_SLUG <slug>
bunx convex env set RESEND_API_KEY <key>
bunx convex env set STRIPE_SECRET_KEY <sk_...>
bunx convex env set CLERK_JWT_ISSUER_DOMAIN <https://full-redbird-32.clerk.accounts.dev>
bunx convex env set CLERK_SECRET_KEY <sk_test_... or sk_live_...>
bunx convex env set CLERK_WEBHOOK_SECRET <whsec_... — get from Clerk dashboard Webhooks endpoint>
bunx convex env set NEXT_PUBLIC_SITE_URL <https://weblab.build>

# NEW (created during migration — generate fresh secrets)
bunx convex env set GITHUB_INSTALL_STATE_SECRET $(openssl rand -hex 32)
bunx convex env set PROVIDER_TOKEN_ENCRYPTION_KEY $(openssl rand -base64 32)
bunx convex env set CMS_SOURCE_ENCRYPTION_KEY $(openssl rand -base64 32)
bunx convex env set STRIPE_WEBHOOK_SECRET <whsec_... — get from Stripe dashboard Webhooks endpoint>
```

Verify with `bunx convex env list`.

---

## 2. Railway env vars (production app deploy)

Open Railway → `weblab-web-client` service → Variables.

**Add (if missing):**
- `NEXT_PUBLIC_CONVEX_URL=https://avid-gnat-539.convex.cloud` (or prod equivalent)
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...`
- `CLERK_SECRET_KEY=sk_live_...`
- `CLERK_WEBHOOK_SECRET=whsec_...`
- `CLERK_JWT_ISSUER_DOMAIN=https://...`

**Verify present** (existing — required by Drizzle stub fallback, can be dummy in prod since Drizzle is removed):
- `SUPABASE_DATABASE_URL` — kept as optional fallback; safe to remove if no consumer references it
- `STRIPE_SECRET_KEY` — used by `utils/subscription.ts` server-side reads
- `OPENROUTER_API_KEY`, `CSB_API_KEY`, etc.

**Optional flag:**
- `WEBLAB_AUTH_PROVIDER=clerk` (default already `clerk` post-migration; only set to override)
- `NEXT_PUBLIC_AUTH_PROVIDER=clerk` (same)

**Remove (no longer needed):**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SHOW_DEV_LOGIN`

Click **Deploy** → wait for build → verify Railway logs show no `SUPABASE_*` warnings.

---

## 3. Webhook endpoints (Clerk + Stripe dashboards)

### Clerk dashboard
1. Open https://dashboard.clerk.com → Webhooks → `+ Add Endpoint`
2. Endpoint URL: `https://avid-gnat-539.convex.site/clerk-webhook` (or prod Convex site URL)
3. Subscribe to events: `user.created`, `user.updated`, `user.deleted`
4. Copy the signing secret → paste into Convex env as `CLERK_WEBHOOK_SECRET` (already done above)
5. Hit **Send test event: user.created** → check Convex dashboard → `users` table should have a new row

### Stripe dashboard
1. Open https://dashboard.stripe.com/webhooks → `+ Add endpoint`
2. Endpoint URL: `https://avid-gnat-539.convex.site/webhooks/stripe`
3. Subscribe to events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.paused`
   - `customer.subscription.resumed`
4. Reveal signing secret (`whsec_...`) → paste into Convex env as `STRIPE_WEBHOOK_SECRET`
5. Hit **Send test event: customer.subscription.created** → check Convex `subscriptions` table

**Old endpoints to delete after one successful event each:**
- Clerk: `https://weblab.build/api/clerk/webhook`
- Stripe: `https://weblab.build/webhook/stripe`

---

## 4. OAuth provider callback URIs

Each provider needs the new Clerk redirect URI added. Add first, deploy, then remove the old `/auth/callback` after one successful sign-in.

### GitHub OAuth App
1. https://github.com/settings/developers → click your OAuth App
2. **Authorization callback URL** — add: `https://weblab.build/sign-in/sso-callback`
3. Old URL to remove: `https://weblab.build/auth/callback`

### Google OAuth Client
1. https://console.cloud.google.com → APIs & Services → Credentials → click your OAuth Client
2. **Authorized redirect URIs** — add: `https://weblab.build/sign-in/sso-callback`
3. Old URL to remove: `https://weblab.build/auth/callback`

### Vercel OAuth App
1. https://vercel.com/account/integrations → your OAuth integration
2. **Redirect URLs** — add: `https://weblab.build/sign-in/sso-callback`
3. Old URL to remove: `https://weblab.build/auth/callback`

---

## 5. Smoke test (post-deploy)

After the next prod deploy:

1. **Sign up via email OTP** — fresh email at `/sign-in` → OTP → land on `/projects`
   - Verify Clerk dashboard webhook delivery shows `2xx`
   - Verify Convex `users` table has the new row
2. **Sign in via GitHub OAuth** → land on `/projects`
3. **Sign out** → land on `/sign-in`
4. **Protected query** — `/projects` shows project list. Sign out → redirects to `/sign-in?returnUrl=%2Fprojects`
5. **Project screenshot upload** — open a project → trigger preview capture → verify Convex `projects` row gets `previewImgStorageId` field set
6. **Account deletion** — settings → delete account → verify Clerk + Convex `users` + `userSettings` + memberships all gone
7. **Grep audit** in browser DevTools network tab: no requests to `*.supabase.co` should appear

---

## 6. Pause + delete Supabase project

After 24h of clean production:
1. Supabase dashboard → project settings → **Pause project**
2. Wait 7 days for confidence; nothing should regress
3. Delete the project

---

## Rollback (emergency)

If anything breaks in prod and you need to revert auth:

```bash
# Railway env override
WEBLAB_AUTH_PROVIDER=supabase
NEXT_PUBLIC_AUTH_PROVIDER=supabase
```

Then re-deploy — but this won't fully roll back because:
- `src/utils/supabase/{server,middleware,admin}.ts` are deleted
- `src/server/api/` is deleted
- Login subtree is deleted

True rollback = `git revert` the migration commit + redeploy. Mind the lockfile.

---

## What does NOT need manual action

- Convex schema deployed automatically by `bunx convex codegen` during build (and live in `avid-gnat-539` already)
- Convex functions deployed automatically
- No data migration — single-user fresh-start per migration plan
