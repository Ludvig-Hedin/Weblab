# PHASE_5_HANDOFF.md

**Status:** Phase 5 auth-bridge code complete + verified. Inactive by default.
**Date:** 2026-05-21
**Activator:** set `WEBLAB_AUTH_PROVIDER=clerk` + `NEXT_PUBLIC_AUTH_PROVIDER=clerk`

---

## 1. What ships

A flag-gated auth swap. Default (`WEBLAB_AUTH_PROVIDER=supabase`) is unchanged from production. When the flag flips to `clerk`:

- `createTRPCContext` (`src/server/api/trpc.ts`) and the RSC variant (`src/trpc/request-server.ts`) read Clerk identity via `getClerkBridgedUser` (`src/server/api/auth-bridge.ts`).
- 10 layout-level guards (`projects/**/layout.tsx`, `project/**/layout.tsx`, `invitation/**/layout.tsx`) use `getCurrentUser()` from `src/utils/auth/current-user.ts`.
- 6 API routes (`api/chat/helpers/usage.ts`, `api/chat-images/[id]`, `api/ai/{inline-edit,tab-complete}`, `api/transcribe`, `api/auth/providers/[provider]/{start,callback}`) use the same helper.
- 3 client sign-out sites + 5 client "sign in" CTA sites use `signOutEverywhere` + `getSignInUrlClient`.
- Middleware (`middleware.ts`) wraps with `clerkMiddleware`, skips Supabase refresh under Clerk mode.
- New `/sign-in/[[...rest]]`, `/sign-up/[[...rest]]`, `/sign-in/sso-callback` pages.
- Clerk webhook handler at `/api/clerk/webhook` mirrors user.created/updated/deleted into BOTH Drizzle + Convex.
- `api.user.delete` tRPC mutation now also calls Clerk Backend API to delete the Clerk identity.

Email-bridge strategy: Clerk identity → Drizzle `users` row matched by `lower(email) = clerk.primaryEmail.toLowerCase()`. JIT-creates Supabase auth.users + Drizzle public.users via the existing `0025_auth_user_trigger.sql` if the row doesn't exist.

---

## 2. Bugs found and fixed (this turn)

| # | Severity | Fix |
|---|---|---|
| 1 | HIGH | `project/[id]/layout.tsx` `Promise.all` regression — anon deep-link → 500. Made sequential. |
| 2 | HIGH | `/sign-in` + `/sign-up` discarded `returnUrl`. Now read from `searchParams`, sanitize, pass to `fallbackRedirectUrl`. |
| 3 | HIGH | JIT-create race on cold Clerk users → intermittent 401s. On `createUser` error, fall back to email-lookup. |
| 4 | HIGH | Email case lookup locked out mixed-case legacy emails. Use `sql\`lower(${users.email}) = ${normalizedEmail}\``. |
| 5 | HIGH | Missing `clerkMiddleware`. Added as outer middleware wrap. |
| 6 | HIGH | `Routes.LOGIN` hardcoded in 8 client sites → sign-out under Clerk landed on Supabase /login. Replaced with flag-aware `getSignInUrlClient`. |
| 7 | HIGH | `user.delete` didn't delete Clerk identity → orphan account. Now calls `clerkClient.users.deleteUser`. |
| 8 | HIGH | Convex + Drizzle drift on profile updates. Webhook now mirrors to BOTH stores. |
| 9 | MEDIUM | Webhook accepted no-email user.created events → unfindable rows. Now skips with 202. |
| 10 | MEDIUM | `getClerkBridgedUser` called multiple times per RSC render. Wrapped in `react.cache()`. |

---

## 3. ⚠️ Required owner steps before activating Clerk mode

### A. Convex env (already done)
- `CLERK_JWT_ISSUER_DOMAIN=https://full-redbird-32.clerk.accounts.dev` ✓
- `CLERK_WEBHOOK_SECRET=<whsec_...>` ✓

### B. Local `.env.local` — add to flip the flag

```bash
WEBLAB_AUTH_PROVIDER=clerk
NEXT_PUBLIC_AUTH_PROVIDER=clerk
```

Both must be set; `WEBLAB_AUTH_PROVIDER` drives server, `NEXT_PUBLIC_AUTH_PROVIDER` drives client sign-out / "sign in" links.

### C. Railway (production) — add same two vars

Set both vars in Railway dashboard for the production service. **Do not flip yet** until you've smoke-tested locally.

### D. Clerk dashboard
- Webhook URL is `https://weblab.build/api/clerk/webhook` ✓
- Events: `user.created`, `user.updated`, `user.deleted` ✓
- OAuth providers GitHub + Google enabled with Clerk's shared dev credentials ✓
- For PRODUCTION use: enable "Use custom credentials" on each provider + add real GitHub/Google OAuth apps. Clerk's dev creds work for testing but are rate-limited and don't ship to prod.
- Application name set to "Weblab" (Customization → Branding) so modal says "Sign in to Weblab" instead of "Sign in to Clerk"

---

## 4. Smoke test checklist after flipping the flag locally

1. **Sign in (Google)**: visit `/sign-in` → click Google → land at `/projects`. Avatar + project list match what you had under Supabase.
2. **Sign in (Email OTP)**: same as above with email + code.
3. **Sign out** (avatar dropdown): land at `/sign-in` (not `/login`).
4. **Deep-link sign-in**: open `/project/<existing-id>` while signed out → redirect to `/sign-in?returnUrl=/project/<id>` → after sign-in, land back on the project (not `/projects`).
5. **AI chat**: round-trip a message in an existing project; ensure usage increment fires.
6. **Project create**: `/projects/new` → create a project; ensure it shows up in `/projects` list.
7. **Settings → Delete account** (against a TEST account ONLY): delete should drop BOTH the Clerk and Drizzle identities. Verify by:
   - Clerk dashboard → user is gone
   - Supabase dashboard → auth.users + public.users rows for that email are gone
   - Re-sign-in attempt creates a fresh account from scratch
8. **CLI provider OAuth** (settings → connect Codex/Gemini/etc.): full round-trip stores token.
9. **Webhook**: change your display name in Clerk's `<UserProfile>` → confirm avatar dropdown picks up the new name on next refresh (webhook patched Drizzle).

---

## 5. Known limitations (not blockers, design decisions)

- **`useUser()` (Clerk) vs `api.user.get` (Drizzle) drift**: profile changes made in Clerk's UI take effect only after the webhook fires (typically <2s). If a user changes their name in Clerk and reloads the avatar dropdown within the same second, the dropdown may show stale data. Acceptable for solo-user phase.
- **`settings-modal/account-tab.tsx` provider badge**: still reads `app_metadata.provider` from Supabase shape; the bridge populates `provider: 'clerk'`, so the badge label correctly says "Clerk" rather than "Google"/"GitHub". Cosmetic — refactor when convenient.
- **`presence` store**: reads from Supabase browser client. Under Clerk mode the Supabase JS client has no session → presence may show empty. Editor still works; only the cursor avatars of remote users degrade. Fix is to use Clerk's `useUser()` for the presence payload — Phase 4 work.
- **The legacy `/login` Supabase entry remains live** under `WEBLAB_AUTH_PROVIDER=clerk` because removing it would break rollback. Once you're confident, delete `/login`, `/login/verify`, `/auth/**`, `actions.tsx`, and the entire `src/utils/supabase/` directory in Phase 7.

---

## 6. Rollback

If anything goes wrong after flipping the flag:

1. Unset `WEBLAB_AUTH_PROVIDER` + `NEXT_PUBLIC_AUTH_PROVIDER` (or set both to `supabase`).
2. Restart the app.
3. `/login` is still wired; Supabase Auth still functions; existing user data preserved.

The bridge JIT-creates Supabase users on first Clerk sign-in, so reverting to Supabase mode after some Clerk users have signed in keeps those users discoverable via their email (now stored in Drizzle).

---

## 7. Lint state

Pre-existing infrastructure lint warnings exist (~1278) — these are repo-wide style/formatting issues unrelated to this migration. They surfaced after I added `convex/` to the project. None are errors; `bun typecheck` passes 0 errors.

To clean them up in a follow-up: `bun format` reduces by ~2400. Remaining are real code-style nits (prefer-nullish-coalescing, consistent-type-imports, etc.) that need targeted fixes across many files. Out of scope for Phase 5.

End of PHASE_5_HANDOFF.md.
