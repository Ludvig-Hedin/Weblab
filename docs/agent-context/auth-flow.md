# Auth Flow — Clerk + Convex (post-Supabase)

Canonical map of how a user becomes authenticated and how that identity reaches
Convex + the DB. Stack: Next.js App Router (Clerk) → Convex (DB) → Railway (host).
Written 2026-05-28 during an end-to-end auth audit.

## TL;DR invariant

> The browser mints a Clerk JWT from the JWT template named **`convex`**
> (`getToken({ template: 'convex' })`). Convex accepts it only if the token's
> **issuer** matches `CLERK_JWT_ISSUER_DOMAIN` on that Convex deployment AND the
> token's **`aud`** (`"convex"`) matches `applicationID: 'convex'` in
> [convex/auth.config.ts](../../apps/web/client/convex/auth.config.ts).
> Every auth bug so far has been a violation of this invariant in a specific
> environment — most often the **deployment** the frontend points at was never
> deployed to, or points at the wrong tier.

## The flow

```
                          ┌─────────────────────────── Clerk instance ────────────┐
  user ──sign in/up──▶ Clerk Hosted UI / useSignIn / OAuth   (mints session + JWTs)│
                          └────────────────────────────────────────────────────────┘
                                            │  Clerk session cookie (__session) + getToken({template:'convex'})
                                            ▼
   ┌──────────────────────────── Next.js app (apps/web/client) ───────────────────────────┐
   │                                                                                        │
   │  middleware.ts (root)  clerkMiddleware — enables auth() context, NO protect();         │
   │                        skips static + /api/{trpc,chat,ai,chat-images,health}.          │
   │                        Protection is delegated to pages/layouts.                        │
   │                                                                                        │
   │  THREE client→Convex paths:                                                            │
   │   1. React hooks   ConvexProviderWithClerk (clerk-convex-providers.tsx) auto-attaches  │
   │                    the 'convex' JWT to every useQuery/useMutation/useAction.           │
   │                    expectAuth:true pauses the WS until first setAuth (UnauthedConvex-   │
   │                    Resume issues setAuth(()=>null) when signed-out so the WS unpauses). │
   │   2. MobX singleton ConvexHttpClient (convex-http-client.ts) — class stores. Token     │
   │                    fetcher registered by ConvexAuthBridge; re-registered every 50s.    │
   │                    setAuth(staticToken); token lifetime is 3600s (NOT 60s — the code   │
   │                    comments saying "~60s TTL" are inaccurate but harmless).            │
   │   3. Server / RSC  clerk-bridge.ts (getCurrentUser) + /api routes (getSupabaseUser +   │
   │                    getConvexToken) — server mints the JWT via `await auth()` →          │
   │                    getToken({template:'convex'}) and passes `{ token }` to             │
   │                    fetchQuery/fetchMutation (convex/nextjs).                            │
   └────────────────────────────────────────────────────────────────────────────────────┘
                                            │  JWT (iss + aud=convex)
                                            ▼
   ┌──────────────────────────── Convex deployment ───────────────────────────────────────┐
   │  auth.config.ts registers provider {domain: $CLERK_JWT_ISSUER_DOMAIN, applicationID:   │
   │  'convex'}. Validates JWT. getUserIdentity() → identity.subject = Clerk userId.        │
   │  lib/permissions.ts: getOptionalUser (null if unauthed) / requireUser (throws          │
   │  UNAUTHORIZED) / requireUserJIT (creates users row on first login, dedupes the         │
   │  webhook race) / requireCap (workspace/project authz).                                 │
   │  users row keyed by clerkUserId (index by_clerk_user_id, read via getUserByClerkIdSafe │
   │  — .collect()+pick-earliest, never .unique(), to survive the JIT/webhook dup race).    │
   └────────────────────────────────────────────────────────────────────────────────────┘
```

First-login user creation: RSC bridge calls `users.getByClerkId`; if null →
`users.ensureCurrent` (→ `requireUserJIT`) creates the row, then re-reads. A
Clerk `user.created` webhook (convex/http.ts) also upserts — the two race, which
is why every reader uses `getUserByClerkIdSafe` instead of `.unique()`.

## Token / cookie passing

| Path | Where token comes from | How attached | File |
|------|------------------------|--------------|------|
| React hooks | `useAuth().getToken({template:'convex'})` (via ConvexProviderWithClerk) | WebSocket `Authenticate` msg | [clerk-convex-providers.tsx](../../apps/web/client/src/components/clerk-convex-providers.tsx) |
| MobX stores | `getToken({template:'convex'})` re-registered every 50s | `client.setAuth(token)` (HTTP) | [convex-auth-bridge.tsx](../../apps/web/client/src/components/convex-auth-bridge.tsx) + [convex-http-client.ts](../../apps/web/client/src/components/store/lib/convex-http-client.ts) |
| Server/RSC | `await auth()` → `getToken({template:'convex'})` | `fetchQuery/Mutation(..., { token })` | [clerk-bridge.ts](../../apps/web/client/src/utils/auth/clerk-bridge.ts), [api/chat/helpers/usage.ts](../../apps/web/client/src/app/api/chat/helpers/usage.ts) |
| Sandbox WS | client passes Clerk token in connectionParams | Fastify verifies via JWKS | apps/web/server |
| Clerk webhook | svix signature (not a user token) | verified in convex/http.ts | convex/http.ts |

Clerk session cookie `__session` is same-origin; the `convex` template token is
what Convex actually validates (cookie alone is not enough for Convex).

## Environment matrix

| | Clerk instance | `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk issuer (`convex` template) | Convex deployment | `CLERK_JWT_ISSUER_DOMAIN` on that deployment |
|--|--|--|--|--|--|
| **local / dev** | development | `pk_test_…` | `https://full-redbird-32.clerk.accounts.dev` | `avid-gnat-539` (dev) | `https://full-redbird-32.clerk.accounts.dev` ✅ |
| **prod** | production | `pk_live_…` (on Railway) | `https://clerk.weblab.build` | `rapid-crab-113` (prod) | `https://clerk.weblab.build` ✅ |

Verified 2026-05-28: dev Clerk has the `convex` template (`aud:"convex"`,
lifetime 3600s); both Convex deployments have the correct issuer env. Prod Convex
was deployed (it had been empty — see [feature-log](../agent-memory/feature-log.md)).

## Where a mismatch breaks auth (failure → symptom)

1. **Frontend points at the wrong Convex deployment** (`NEXT_PUBLIC_CONVEX_URL`).
   Prod browser (pk_live, iss=clerk.weblab.build) hitting the dev deployment
   (issuer full-redbird) → token rejected → `No auth provider found matching the
   given token`. **Verify Railway's `NEXT_PUBLIC_CONVEX_URL` = rapid-crab-113.**
2. **Convex deployment never deployed to** (empty) → no provider registered AND
   functions missing → `No auth provider...` + `[CONVEX Q(users:me)] Server
   Error`. Fixed; CI now deploys (`.github/workflows/convex-deploy-production.yml`).
3. **Clerk `convex` JWT template missing/renamed** in an instance → `getToken`
   returns null → RSC bridge logs loudly + treats as signed-out (redirect loop
   risk). Verify the template exists in **prod** Clerk (needs sk_live).
4. **`CLERK_JWT_ISSUER_DOMAIN` ≠ Clerk issuer** (trailing slash, wrong tier) →
   token rejected. Must be exact.
5. **`aud` ≠ applicationID** → rejected. Template `aud` must be `convex`.

## Pitfalls / gotchas

- `convex dev --once` deploys **dev only**. Prod needs `convex deploy`. The
  `convex:deploy` npm script was wrong until 2026-05-28.
- Two middleware files exist: `apps/web/client/middleware.ts` (ACTIVE, root) and
  `src/middleware.ts` (duplicate). Keep in sync — see CODE_REVIEW_BACKLOG CR-2026-05-24-009.
- Convex deployment hosts (esp. `rapid-crab-113`) are not in the Bash sandbox
  allowlist — `convex` CLI needs `dangerouslyDisableSandbox`.
