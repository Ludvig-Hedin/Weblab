# CLERK_MIGRATION_PLAN.md

**Output of:** Auth Agent (Phase 2)
**Status:** Plan draft. No Clerk code exists yet.
**Companion:** `MIGRATION_DISCOVERY.md` §2.2/§2.5/§3, `CONVEX_MIGRATION_PLAN.md` §9, `MIGRATION_TASK.md` Phase 5.

Replace **Supabase Auth** with **Clerk** as the sole identity provider for Weblab. Preserve every auth surface (OTP, OAuth, sign-out, account deletion, capability gating). Integrate with Convex via the **Clerk + Convex JWT template** so Convex functions can call `ctx.auth.getUserIdentity()`.

---

## 1. Scope & Constraints

In scope:
- Sign in / sign up via GitHub OAuth, Google OAuth, email OTP, and dev seed-user magic link.
- Server identity resolution in tRPC, RSC layouts, API routes, middleware.
- Client identity reads in 6+ UI components.
- Account deletion + cascade fan-out.
- Sign-up provisioning of `public.users` (now Convex `users`) + lazy personal workspace.

Out of scope (keep untouched):
- CLI provider OAuth flow (Codex/Cursor/Gemini/OpenCode) at `apps/web/client/src/app/api/auth/providers/[provider]/{start,callback}/route.ts`. Only swap its `getUser()` gate.
- Capability matrix (`packages/auth`) — already provider-agnostic.
- Workspaces / project-members / audit log logic.

Constraints:
- Preserve cookie-presence fast path and non-cancellable refresh in middleware (per long comment in current code; Clerk's `clerkMiddleware` already handles this internally).
- Preserve `x-pathname` header injection consumed by `projects/layout.tsx`.
- Preserve desktop `WeblabDesktop` UA redirect.
- Preserve `weblab://auth/callback` redirect URL for the Electron app.
- Owner is the only real user — no live-user migration burden.

---

## 2. Target Auth Topology

```
                                  ┌────────────────────────┐
                                  │      Clerk Hosted      │
                                  │  - GitHub + Google     │
                                  │  - Email OTP           │
                                  │  - JWT template "convex"│
                                  └─────────┬──────────────┘
                                            │
                                            │ Clerk JWT (cookie + Authorization)
                                            ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                                Browser (React)                               │
│  <ClerkProvider> → <ConvexProviderWithClerk client useAuth={useAuth}>        │
│  hooks:  useAuth(), useUser(), useClerk()                                     │
└─────────────────────────────────┬────────────────────────────────────────────┘
                                  │
                                  │   Clerk middleware (cookie + JWT)
                                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│            Next.js server (App Router + tRPC + API routes)                   │
│  - clerkMiddleware()                                                          │
│  - createTRPCContext reads { auth: await auth() }                            │
│  - protectedProcedure: throws if !auth.userId                                │
│  - ctx.convex.setAuth(await getToken({ template: 'convex' }))                │
└─────────────────────────────────┬────────────────────────────────────────────┘
                                  │
                                  │  Authenticated Convex calls
                                  ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                              Convex Cloud                                    │
│  ctx.auth.getUserIdentity() → { subject: clerkUserId, email, name, ... }     │
│  → ctx.db.query("users").withIndex("by_clerk_user_id", q => ...).unique()   │
└──────────────────────────────────────────────────────────────────────────────┘

                                  ▲
                                  │
                                  │  Clerk webhooks (svix-signed)
                                  │  user.created / user.updated / user.deleted
                                  │
                            ┌─────┴───────────────┐
                            │ Clerk dashboard      │
                            └──────────────────────┘
```

---

## 3. Clerk Setup

### 3.1. Single Clerk app (updated 2026-05-20)

| Env | Clerk app name | Domain |
|---|---|---|
| Single shared | `Weblab` | localhost:3000 + weblab.build |

Owner already created and linked. One publishable key, one secret key, one JWT template (`convex`). Add a separate prod Clerk app later at real-user launch.

### 3.2. JWT template `convex`

In each Clerk dashboard → **JWT templates** → New → name `convex`. Audience = the matching Convex deployment URL (`https://<id>.convex.cloud`). Default claims are sufficient (`sub` = Clerk userId; `email`, `name`, `given_name`, `family_name`, `picture` flow through).

### 3.3. OAuth providers

GitHub + Google enabled per app. Redirect URLs:

- `http://localhost:3000/sign-in/sso-callback` (dev)
- `https://weblab.build/sign-in/sso-callback`
- `https://weblab-staging.up.railway.app/sign-in/sso-callback`
- `weblab://sign-in/sso-callback` (Electron desktop)

Clerk handles the OAuth handshake itself — no Supabase-style `exchangeCodeForSession` route to maintain.

### 3.4. Email OTP

Enabled at Clerk dashboard → **User & Authentication → Email, Phone, Username → Email verification code**. No code changes vs Clerk's default OTP flow.

### 3.5. Webhook

Per Clerk app → **Webhooks** → endpoint `https://<env-host>/api/clerk/webhook`. Subscribe to: `user.created`, `user.updated`, `user.deleted`. Signing secret → `CLERK_WEBHOOK_SECRET` env var.

---

## 4. Convex + Clerk Integration

### 4.1. `convex/auth.config.ts`

```ts
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
```

Set `CLERK_JWT_ISSUER_DOMAIN` per env (it's the Frontend API URL from the Clerk dashboard, e.g. `https://known-llama-42.clerk.accounts.dev`).

### 4.2. Provider wiring (root layout)

```tsx
// apps/web/client/src/app/layout.tsx
import { ClerkProvider } from "@clerk/nextjs";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { useAuth } from "@clerk/nextjs";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClerkProvider>
          <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
            {/* existing providers (ThemeProvider, AuthProvider for app state, i18n, …) */}
            {children}
          </ConvexProviderWithClerk>
        </ClerkProvider>
      </body>
    </html>
  );
}
```

### 4.3. Convex `requireUser` helper

```ts
// apps/web/client/convex/lib/permissions.ts
import { QueryCtx, MutationCtx } from "../_generated/server";
import { Doc } from "../_generated/dataModel";

export async function requireUser(ctx: QueryCtx | MutationCtx): Promise<Doc<"users">> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("UNAUTHORIZED");
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
  if (!user) {
    // Webhook hasn't delivered yet — do a JIT upsert as a safety net
    // (matches today's defensive upsert in /auth/callback)
    throw new Error("USER_NOT_PROVISIONED");
  }
  return user;
}
```

---

## 5. Middleware Swap

Today: `apps/web/client/middleware.ts` + `src/proxy.ts` + `src/utils/supabase/middleware.ts`.

Tomorrow: single `clerkMiddleware()` with our skip list + UA redirect.

```ts
// apps/web/client/middleware.ts
import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const SKIP_PREFIXES = [
  "/api/trpc", "/api/chat", "/api/ai", "/api/chat-images", "/api/health",
  "/_next/static", "/_next/image",
];
const SKIP_EXACT = new Set([
  "/favicon.ico", "/sw.js", "/manifest.webmanifest", "/manifest.json",
  "/robots.txt", "/sitemap.xml", "/weblab-preload-script.js",
]);
const STATIC_EXT = /\.(svg|png|jpg|jpeg|gif|webp|ico|js|json|webmanifest|map|txt|woff|woff2|ttf)$/;

export default clerkMiddleware(async (auth, req) => {
  const { pathname } = req.nextUrl;

  // Desktop UA redirect
  const ua = req.headers.get("user-agent") ?? "";
  if (pathname === "/" && ua.includes("WeblabDesktop")) {
    return NextResponse.redirect(new URL("/sign-in?native=1", req.url));
  }

  // Inject x-pathname for RSC consumption (preserved from Supabase middleware)
  const headers = new Headers(req.headers);
  headers.set("x-pathname", pathname);
  const response = NextResponse.next({ request: { headers } });

  // Skip auth refresh for asset / API prefixes
  if (
    SKIP_PREFIXES.some((p) => pathname.startsWith(p)) ||
    SKIP_EXACT.has(pathname) ||
    STATIC_EXT.test(pathname)
  ) {
    return response;
  }

  return response;
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
```

**Notes:**
- Clerk's middleware internally handles cookie refresh; no manual `Promise.race` risk.
- We do NOT use `auth.protect()` at the middleware level — the existing 10 layout-level guards still own redirect-to-login. This keeps the per-route messaging (e.g. `?returnUrl=...`) intact.
- The `/api/auth/providers/[provider]/{start,callback}` routes are NOT in `SKIP_PREFIXES` because they need the Clerk auth context to identify the user.

### 5.1. Removed files
- `apps/web/client/src/proxy.ts` — Supabase-OAuth-rescue logic obsolete (Clerk doesn't land at `/?code=`).
- `apps/web/client/src/utils/supabase/middleware.ts` — gone.
- `apps/web/client/src/utils/supabase/{server,client/index,request-server,admin}.ts` — gone (Phase 7).

---

## 6. tRPC Context Swap

Single chokepoint. This is the **most important** change in Phase 5.

```ts
// apps/web/client/src/server/api/trpc.ts
import { auth as clerkAuth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/../convex/_generated/api";
import { TRPCError, initTRPC } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";

import { env } from "@/env";

interface Auth {
  userId: string | null;
  user: { id: string; email: string | null; firstName: string | null; lastName: string | null; imageUrl: string | null } | null;
}

export const createTRPCContext = async (opts: { headers: Headers }) => {
  const { userId, getToken } = await clerkAuth();
  const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);

  let user = null;
  if (userId) {
    const token = await getToken({ template: "convex" });
    if (token) convex.setAuth(token);
    user = await convex.query(api.users.getByClerkId, { clerkUserId: userId });
  }

  return {
    headers: opts.headers,
    auth: { userId, user },
    convex,
  };
};

// ...
export const protectedProcedure = t.procedure.use(timingMiddleware).use(({ ctx, next }) => {
  if (!ctx.auth.userId || !ctx.auth.user || !ctx.auth.user.email) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { ...ctx, auth: { ...ctx.auth, user: ctx.auth.user, userId: ctx.auth.userId } } });
});
```

Notes:
- `ctx.user` (Supabase shape) becomes `ctx.auth.user` (Convex doc shape).
- Every existing router accesses `ctx.user.id` / `ctx.user.email`. Mechanical rename to `ctx.auth.user._id` and `ctx.auth.user.email`. Convex `Id<"users">` is a string at runtime — the only call site that needs care is the legacy `ctx.db.delete(authUsers)` in `routers/user/user.ts` (deletion now flows through Clerk + Convex action, see §9).
- `adminProcedure` no longer needs a service-role swap — Convex has no analog of RLS, and our `requireCap` is application-level. Keep the procedure shape for API stability; the body becomes identical to `protectedProcedure` for now.

---

## 7. Layout Guards Swap (10 files)

Each of the 10 server layouts in `MIGRATION_DISCOVERY.md` §3.2 follows the same pattern:

```tsx
// before
import { createClient } from "@/utils/supabase/server";
export default async function Layout({ children }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/sign-in?returnUrl=${encodeURIComponent("/projects")}`);
  return <>{children}</>;
}

// after
import { auth } from "@clerk/nextjs/server";
export default async function Layout({ children }) {
  const { userId } = await auth();
  if (!userId) redirect(`/sign-in?returnUrl=${encodeURIComponent("/projects")}`);
  return <>{children}</>;
}
```

Touch list:
- `apps/web/client/src/app/projects/layout.tsx`
- `apps/web/client/src/app/projects/new/layout.tsx`
- `apps/web/client/src/app/projects/import/layout.tsx`
- `apps/web/client/src/app/projects/import/github/layout.tsx`
- `apps/web/client/src/app/projects/import/figma/layout.tsx`
- `apps/web/client/src/app/projects/import/local/layout.tsx`
- `apps/web/client/src/app/project/layout.tsx`
- `apps/web/client/src/app/project/[id]/layout.tsx`
- `apps/web/client/src/app/invitation/[id]/layout.tsx`
- `apps/web/client/src/app/invitation/workspace/[id]/layout.tsx`

The two `/invitation/*` layouts currently render `<HandleAuth>` (inline auth) rather than redirecting — preserve that behavior; the inner `HandleAuth` component renders Clerk's `<SignIn>` if unauthenticated.

---

## 8. Sign-in / Sign-up UI

Replace `/login`, `/login/verify`, `/auth/callback`, `/auth/auth-code-error`, `/auth/redirect` with Clerk-driven equivalents. Use Clerk's **custom UI hooks** (`useSignIn`, `useSignUp`, `useClerk`) so we keep the Weblab design system — not the default `<SignIn>` prebuilt component.

### 8.1. New routes

| Old route | New route | Notes |
|---|---|---|
| `/login` | `/sign-in` | Owner request: keep "sign in" wording |
| `/login/verify` | `/sign-in/verify-otp` | OTP entry — Clerk's `useSignIn` |
| `/auth/callback` | `/sign-in/sso-callback` | Clerk's OAuth callback page using `useClerk().handleRedirectCallback()` |
| `/auth/redirect` | (gone — Clerk handles `returnUrl` natively via `forceRedirectUrl`) | — |
| `/auth/auth-code-error` | `/sign-in/error` | Plain error page |
| `/profile-setup` | (kept) | Still useful for OTP-only users without `firstName` |

### 8.2. Sign-in page (custom UI matching Weblab design)

```tsx
// apps/web/client/src/app/sign-in/page.tsx
'use client';
import { useSignIn } from "@clerk/nextjs";
import { useState } from "react";
import { Button } from "@weblab/ui/button";

export default function SignInPage() {
  const { signIn, isLoaded, setActive } = useSignIn();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!isLoaded) return;
    setPending(true);
    await signIn.create({ identifier: email });
    const emailFactor = signIn.supportedFirstFactors?.find(
      (f) => f.strategy === "email_code"
    );
    if (emailFactor) {
      await signIn.prepareFirstFactor({ strategy: "email_code", emailAddressId: (emailFactor as any).emailAddressId });
      // store email + redirect to /sign-in/verify-otp
    }
    setPending(false);
  }

  async function signInWithProvider(strategy: "oauth_github" | "oauth_google") {
    if (!isLoaded) return;
    await signIn.authenticateWithRedirect({
      strategy,
      redirectUrl: "/sign-in/sso-callback",
      redirectUrlComplete: "/projects",
    });
  }

  return (
    <form onSubmit={sendOtp}>
      <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" />
      <Button type="submit" disabled={pending}>Continue with email</Button>
      <Button type="button" onClick={() => signInWithProvider("oauth_github")}>GitHub</Button>
      <Button type="button" onClick={() => signInWithProvider("oauth_google")}>Google</Button>
    </form>
  );
}
```

### 8.3. OTP verify page

```tsx
// apps/web/client/src/app/sign-in/verify-otp/page.tsx
'use client';
import { useSignIn } from "@clerk/nextjs";
import { useState } from "react";

export default function VerifyOtpPage() {
  const { signIn, setActive } = useSignIn();
  const [code, setCode] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const result = await signIn!.attemptFirstFactor({ strategy: "email_code", code });
    if (result.status === "complete") {
      await setActive!({ session: result.createdSessionId });
      window.location.assign("/projects");
    }
  }

  return (
    <form onSubmit={submit}>
      <input value={code} onChange={(e) => setCode(e.target.value)} />
      <button type="submit">Verify</button>
    </form>
  );
}
```

### 8.4. SSO callback

```tsx
// apps/web/client/src/app/sign-in/sso-callback/page.tsx
'use client';
import { AuthenticateWithRedirectCallback } from "@clerk/nextjs";

export default function SsoCallbackPage() {
  return <AuthenticateWithRedirectCallback redirectUrl="/projects" signInForceRedirectUrl="/projects" />;
}
```

### 8.5. Dev login

Clerk supports **sign-in tokens** (server-side magic links) via the Backend API: `clerkClient.signInTokens.create({ userId })`. The owner can keep a `DevLoginButton` that hits a server action that returns a Clerk-generated magic link.

```ts
// apps/web/client/src/app/sign-in/actions.tsx
"use server";
import { clerkClient } from "@clerk/nextjs/server";
import { env } from "@/env";

export async function devLogin() {
  if (env.NODE_ENV === "production") return { error: "dev login disabled in prod" };
  const client = await clerkClient();
  const SEED_CLERK_USER_ID = process.env.SEED_USER_CLERK_ID!;
  const token = await client.signInTokens.createSignInToken({
    userId: SEED_CLERK_USER_ID,
    expiresInSeconds: 60 * 10,
  });
  return { url: `/sign-in?__clerk_ticket=${token.token}` };
}
```

The seed Clerk user (`support@weblab.build`) must be pre-created in the dev Clerk app. Document in `MIGRATION_TASK.md` Phase 3.

---

## 9. Account Deletion + Cascade

Today: `userRouter.delete` calls `ctx.db.delete(authUsers).where(eq(authUsers.id, userId))` and relies on Postgres `ON DELETE CASCADE`.

Tomorrow:
1. UI calls `api.user.delete.useMutation()`.
2. tRPC procedure calls `clerkClient.users.deleteUser(ctx.auth.userId)`.
3. Clerk fires `user.deleted` webhook.
4. Webhook → Convex `clerkWebhooks.deleteUser` action.
5. Convex action fans out the delete across all referenced tables (see `CONVEX_MIGRATION_PLAN.md` §9).
6. Client-side: `useClerk().signOut()` then redirect to `/`.

```ts
// apps/web/client/src/server/api/routers/user/user.ts (excerpt)
import { clerkClient } from "@clerk/nextjs/server";

export const userRouter = createTRPCRouter({
  delete: protectedProcedure.mutation(async ({ ctx }) => {
    const client = await clerkClient();
    await client.users.deleteUser(ctx.auth.userId);
    // Convex cleanup happens via webhook; this returns immediately.
  }),
});
```

---

## 10. Browser-side Code Swaps

### 10.1. `signOut`

```ts
// before
const supabase = createClient();
await supabase.auth.signOut();

// after
import { useClerk } from "@clerk/nextjs";
const { signOut } = useClerk();
await signOut(() => window.location.assign("/"));
```

Files to update:
- `apps/web/client/src/components/ui/avatar-dropdown/index.tsx`
- `apps/web/client/src/components/ui/settings-modal/user-delete-section.tsx`
- `apps/web/client/src/app/invitation/[id]/_components/main.tsx`

### 10.2. Current-user read

```ts
// before
const supabase = createClient();
const { data: { user } } = await supabase.auth.getUser();

// after
import { useUser } from "@clerk/nextjs";
const { user } = useUser();
```

Files:
- `apps/web/client/src/components/ui/settings-modal/account-tab.tsx` — provider badge logic: today reads `app_metadata.provider`; Clerk equivalent is `user.externalAccounts[0]?.provider`.
- `apps/web/client/src/app/project/[id]/_components/canvas/overlay/comment-popover.tsx` — self-vs-other gate.
- `apps/web/client/src/components/store/editor/presence/index.ts` — read `user.id`, `user.fullName`, `user.imageUrl` for the presence payload.
- `apps/web/client/src/components/ui/auth-redirect.tsx` — swap to Clerk's `<SignedOut>` + `<RedirectToSignIn />`.

### 10.3. App-state AuthContext

`apps/web/client/src/app/auth/auth-context.tsx` currently wraps `handleLogin`, `handleDevLogin`, `isAuthModalOpen`, `lastSignInMethod`. Keep the **modal + last-method tracking** state; replace the `handleLogin` body with the new sign-in actions from §8.

---

## 11. API Routes & Server Actions

Every server-side `supabase.auth.getUser()` call becomes `auth()` from `@clerk/nextjs/server`.

| File | Before | After |
|---|---|---|
| `app/api/chat/helpers/usage.ts:46` | `getSupabaseUser` | `await auth(); return userId` |
| `app/api/chat-images/[id]/route.ts:25` | `supabase.auth.getUser()` | `await auth()` |
| `app/api/ai/inline-edit/route.ts:41` | same | same |
| `app/api/ai/tab-complete/route.ts:35` | same | same |
| `app/api/transcribe/route.ts:24` | same | same |
| `app/api/auth/providers/[provider]/start/route.ts:39` | same | same |
| `app/api/auth/providers/[provider]/callback/route.ts:56` | same + insert via Drizzle | `await auth()` + Convex mutation |

`request-server.ts` (RSC tRPC caller) — swap to read Clerk auth from `cookies()` via `auth()`.

---

## 12. Clerk Webhook Handler

```ts
// apps/web/client/src/app/api/clerk/webhook/route.ts
import { headers } from "next/headers";
import { Webhook } from "svix";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/../convex/_generated/api";
import { env } from "@/env";

export async function POST(req: Request) {
  const wh = new Webhook(env.CLERK_WEBHOOK_SECRET);
  const headerPayload = await headers();
  const svixHeaders = {
    "svix-id": headerPayload.get("svix-id")!,
    "svix-timestamp": headerPayload.get("svix-timestamp")!,
    "svix-signature": headerPayload.get("svix-signature")!,
  };
  let evt: WebhookEvent;
  try {
    evt = wh.verify(await req.text(), svixHeaders) as WebhookEvent;
  } catch {
    return new Response("invalid signature", { status: 400 });
  }

  const convex = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
  switch (evt.type) {
    case "user.created":
    case "user.updated":
      await convex.mutation(api.clerkWebhooks.upsertUser, {
        clerkUserId: evt.data.id,
        email: evt.data.email_addresses[0]?.email_address ?? null,
        firstName: evt.data.first_name ?? null,
        lastName: evt.data.last_name ?? null,
        imageUrl: evt.data.image_url ?? null,
      });
      break;
    case "user.deleted":
      await convex.action(api.clerkWebhooks.deleteUser, { clerkUserId: evt.data.id! });
      break;
  }
  return new Response("ok");
}
```

`api.clerkWebhooks.upsertUser` is the new equivalent of the `0025_auth_user_trigger.sql` trigger. It additionally invokes `resolvePersonalWorkspaceId` to keep the lazy personal-workspace guarantee.

---

## 13. Owner Migration Note

The owner's existing Supabase identity (UUID + GitHub/Google connection) must be mapped to a Clerk user before cutover.

Steps in Phase 6:
1. In Clerk prod dashboard, create user with `support@weblab.build` (the seed account) AND with the owner's real GitHub-linked email.
2. After creation, copy the resulting `clerkUserId`s.
3. During `import-convex.ts`, write `users.clerkUserId` for each row by looking up email → Clerk userId.
4. Owner signs in to Weblab via Clerk; Convex serves their existing data.

Manual step required during cutover — flagged in `MIGRATION_TASK.md` Phase 6.

---

## 14. CLI Provider OAuth — Keep, Don't Migrate

`apps/web/client/src/app/api/auth/providers/[provider]/{start,callback}/route.ts` implements PKCE OAuth flows for connecting Codex/Cursor/Gemini/OpenCode CLIs to a Weblab account. The auth check at line 39 (`start`) and 56 (`callback`) currently uses `supabase.auth.getUser()`. Swap only those gate calls.

The encrypted token storage (`user_provider_connections`) follows the regular Convex migration.

---

## 15. Open Decisions

1. **Route naming.** `/sign-in` (Clerk convention) vs `/login` (current). Recommend `/sign-in`; redirect `/login → /sign-in`.
2. **`<ClerkProvider>` appearance.** Default vs custom theme matching design system. We're using custom UI (hooks), so the prebuilt-component appearance API only matters for `<UserButton>` (currently not used — avatar-dropdown is custom).
3. **`UserButton` adoption.** Replace the custom `avatar-dropdown` with Clerk's `<UserButton appearance={{ ... }}>` or keep custom? Recommend **keep custom** — preserves design system.
4. **Magic links.** Beyond OTP, also enable Clerk magic-link sign-in? Owner choice. Recommend yes (no extra code, just enable in dashboard).
5. **2FA.** Enable now or defer? No real users → safe to enable later.
6. **Anonymous mode.** Clerk supports anonymous sessions (great for Weblab's "try without signing in" path if added). Defer.

---

## 16. Acceptance Criteria

- `await auth()` resolves to a valid `userId` for the owner in dev.
- `ctx.auth.user` populated in every tRPC procedure with matching Convex user doc.
- 10 layout guards redirect correctly when signed out.
- GitHub OAuth, Google OAuth, email OTP all complete successfully.
- Dev seed-user magic link works in dev.
- Account deletion completes Clerk delete + cascades Convex delete in <5s.
- Middleware preserves `x-pathname`, WeblabDesktop UA redirect.
- `weblab://` desktop OAuth redirect works for Electron.
- Clerk webhook signature verified; user.created/updated/deleted handled.
- `rg -n '@supabase/(ssr|supabase-js)' apps/` returns 0 hits (after Phase 7).

End of CLERK_MIGRATION_PLAN.md.
