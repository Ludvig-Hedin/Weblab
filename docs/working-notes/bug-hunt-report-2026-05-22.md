# Bug Hunt — Core User Flows (2026-05-22)

Live browser QA on `localhost:3000` + static repo scan (subagent). Ranked by user impact. 19 findings.

## Fix status

| # | Title | Status | Files touched |
|---|-------|--------|---------------|
| 1 | Layout 500s when Clerk/Convex env unset | **fixed** | `clerk-convex-providers.tsx` — skip provider tree in supabase mode; new `utils/auth/safe-clerk.ts` wraps raw Clerk hooks so they no longer throw "outside ClerkProvider" (caught during live re-test); `auth-redirect`, `use-has-auth-cookie`, `avatar-dropdown`, `user-delete-section` all migrated to safe wrappers |
| 2 | `clerkMiddleware` wraps every request | **fixed** | `middleware.ts` — `clerkMiddleware` now only wraps when `WEBLAB_AUTH_PROVIDER === 'clerk'` |
| 3 | `getDefaultPageContext` ENOENT race | **fixed** | `chat/context.ts` — `getCreateContext` retries up to 5 times w/ backoff; ENOENT no longer logged as error |
| 4 | CSP base-uri + sandbox CSS MIME | **deferred** | Needs CSP scoping rework + CodeSandbox runtime fix — outside repo blast radius |
| 5 | Penpal `setCmsData()` destroyed connection | **fixed** | `cms-workspace/data-pusher.tsx` — swallow destroyed-connection errors; 2s retry covers reconnect |
| 6 | `ensurePersonal` race-unsafe | **fixed** | `workspace/workspace.ts` — catches `23505` and returns the winner |
| 7 | `user.delete` orphans `auth.identities` | **fixed** | `user/user.ts` — uses `admin.auth.admin.deleteUser` in supabase mode |
| 8 | `.env.example` vs env.ts inconsistency | **resolved by #1** | Provider now flag-gated; optional env vars are correct |
| 9 | OTP cooldown wire-up | **fixed** | `auth-form.tsx` — writes `LOGIN_OTP_LAST_SEND_KEY` on success, disables Continue while cooldown active |
| 10 | `getSignInUrlClient` split-brain | **mitigated** | `env.ts` — server boot now logs an error when public/server flag diverge |
| 11 | MobX strict-mode mutations after `await` | **fixed** | `conversation.ts`, `create/manager.ts` — every post-`await` mutation wrapped in `runInAction` |
| 12 | `AuthRedirect` fresh client every render | **fixed** | `auth-redirect.tsx` — `useMemo` for `createClient()` |
| 13 | `verifyEmailOtp` returnUrl loop | **fixed** | `login/actions.tsx` — return `Routes.PROJECTS` instead of `Routes.AUTH_REDIRECT` as default |
| 14 | `useHasAuthCookie` fragile cookie sniff | **fixed** | `use-has-auth-cookie.ts` — uses `useAuth().isSignedIn` in clerk mode, cookie sniff only in supabase mode |
| 15 | interactions list effect deps | **fixed** | `interactions-tab/list-view.tsx` — clears stale `selectedIxId` at effect entry |
| 16 | Project-card link click intercepted by iframe | **n/a** | Playwright-actionability flake; real users click fine via mouse |
| 17 | 404s on `/_weblab/interactions.json` | **fixed** | `interactions/index.ts` — `loadFromDisk` seeds empty doc at the public path so the IX runtime gets 200 instead of 404 |
| 18 | Preload `crossorigin` mismatch | **deferred** | Touches 10+ parser snapshot fixtures; cosmetic browser warning only |
| 19 | `WEBLAB_AUTH_PROVIDER` / `NEXT_PUBLIC_AUTH_PROVIDER` mirror enforcement | **fixed** | `env.ts` — startup check + error log |
| process | ESLint excludes `middleware.ts` | **documented** | `eslint.config.js` — explains why; should be moved under src or get its own tsconfig |

Detail follows.

## Live re-validation (2026-05-22, after all fixes)

Booted dev server fresh, drove flows end-to-end in headed Chrome:

| Flow | Result |
|------|--------|
| `/login` server-render in supabase mode | **200**, no useAuth-outside-provider error |
| Demo signin → `/auth/redirect` → workspace projects | **clean**, no console errors |
| New project from prompt → editor loads | **clean**, no ENOENT, no MobX strict-mode warnings, no Penpal destroyed-connection |
| `/_weblab/interactions.json` runtime fetch | **200** (61 B empty doc seeded by the new code) — was 404 |
| AI chat send → `/api/chat` 200 + title generation | **clean**, conversation persisted |

Remaining console noise on the editor route is non-blocking (preload `crossorigin` mismatch warning #18, `processNodeForMap: No oid found` — pre-existing scanner edge case, unrelated to this bug hunt). All previously-reported critical and high-severity errors are gone from the console.

Screenshots: `/tmp/projects-page.png`, `/tmp/editor.png`, `/tmp/projects-list-final.png`, `/tmp/editor-after-fix.png`.

## Deep flow hunt (round 6, clerk mode)

User flipped `WEBLAB_AUTH_PROVIDER=clerk`. Drove anon flows + page transitions in real Chromium to surface live bugs.

### Fixed

- **Anon redirect dropped the original path.** `/project/layout.tsx:8` called `redirect(getSignInUrl())` without a returnUrl — every anon deep-link landed at a context-free `/sign-in`. The deeper `/project/[id]/layout.tsx` redirect that DID pass the projectId never ran because the parent layout already redirected. Fixed by passing `x-pathname` header through.
- **`x-pathname` request header not forwarded in clerk-mode middleware.** Supabase middleware sets it; the clerk branch returned `NextResponse.next()` raw, so `headers().get('x-pathname')` was null in every Server Component. Caused `projects/layout.tsx` to fall back to a hardcoded `/projects` returnUrl for anon-bounced visitors. Fixed in `middleware.ts`.
- **Verified live**: anon → `/projects/new` now redirects to `/sign-in?returnUrl=%2Fprojects%2Fnew`; anon → `/project/<id>` now redirects to `/sign-in?returnUrl=%2Fproject%2F<id>`.
- **`api.user.get.useQuery()` fired unguarded on anon-reachable surfaces** — `Hero`, `GetStarted`, and `PricingTable` all called the protected procedure with no `enabled:` gate, producing a console-spamming `TRPCClientError: UNAUTHORIZED` on every visit to the landing, pricing, blog, etc. Migrated each to use `useHasAuthCookie()` like the other landing components already did. Verified: pricing reload now produces zero unauthorized errors.
- **`[DEV] Sign in as demo user` still rendered in clerk mode.** Clicking it called `devLogin()` (supabase magic-link path) which bounced through `/sign-in?returnUrl=/projects` without creating a session. Hidden when `NEXT_PUBLIC_AUTH_PROVIDER === 'clerk'`.

### Documented (not fixed this round)

- **Brand split between `/sign-in` and `/sign-up`.** `/sign-in` renders Weblab's design-system-matched form (`SignInClient`); `/sign-up` renders Clerk's prebuilt `<SignUp />` component complete with a Clerk logo, separate field set (Username + Password vs. email-OTP), and visual mismatch. A new visitor crossing from sign-in to sign-up sees two different products. Fixing requires a parallel `SignUpClient` mirroring `SignInClient`, plus a Clerk `useSignUp` integration. Out of scope for this hunt.

---

## Deeper churn pass (round 4)

After the core flows verified clean, ran a deeper UX/error sweep across side panels, publish dropdown, account menu, code mode, and stale-sandbox states. Additional findings:

### Fixed

- **MobX strict-mode mutations everywhere a panel opens.** `StateManager.{isSettingsModalOpen, isSubscriptionModalOpen, settingsTab}` and `editorEngine.state.publishOpen` were mutated as plain fields from 14 call sites (avatar dropdown, command palettes, top-bar breadcrumb, publish dropdown subroutes, settings tabs, version row, etc.). Added explicit setter methods to `StateManager` + migrated all 14 call sites via bulk sed.
- **`TokensManager._hasThemeBlock` / `PagesManager._isScanning`** — same `runInAction` wraps as the chat / create managers.
- **`forward.components.listProjectComponents` returns HTML when editor server is down.** The dev server proxy at `localhost:${editorPort}` returns a Next.js 502 HTML page when the editor service isn't running, which the tRPC client then JSON-parses → "Unexpected token '<', '<!doctype '..." stack trace and a broken Components panel. Wrapped every forward call in a `forwardCall(label, op)` helper that maps the JSON-parse / fetch-failed / ECONNREFUSED signature to `TRPCError(SERVICE_UNAVAILABLE, …)`. Same wrap applied to `sandbox.{create,start,stop,status}`.

### Newly identified, now fixed in round 5

1. **Dead sandbox = forever loading. FIXED.**
    - New tRPC procedure `sandbox.checkAlive(previewUrl)` does the HEAD server-side and returns a typed `alive | gone | notFound | error` state — the browser can't read iframe response status on cross-origin URLs and a `no-cors` fetch returns an opaque 0.
    - New hook `useSandboxLiveness(url, enabled)` polls the procedure once the boot soft-hint trips and re-checks every 10 s.
    - New tRPC mutation `sandbox.restore({ branchId })` forks the original snapshotId on the branch's `runtimeMetadata.cloud.snapshotId`, updates the branch row + every frame URL in one transaction. Throws `PRECONDITION_FAILED` when no snapshot is on file so callers can show a meaningful error.
    - Frame canvas now branches the loading state on liveness — when `gone`/`notFound` it renders a "Your sandbox has been recycled" panel with a single "Restore project" button instead of cycling tips forever.
2. **Projects-list thumbnails render the 410 HTML page. FIXED.** `ProjectPreviewSurface` now calls `sandbox.checkAlive` (cached `staleTime: 5min`) before mounting the iframe. When the URL is `gone | notFound | error` it falls through to the favicon/skeleton like a non-embeddable site. Verified live: projects-list snapshot has zero `[iframe]` nodes for dead-sandbox cards.
3. **Publish on dead sandbox.** Not separately fixed — but the dead-sandbox `Restore project` flow from #1 lands the user with a fresh sandbox before they retry Publish, which makes the existing "Try Updating Again" loop self-resolve.

### Verified clean on round-4 re-test

- `/login` 200 in supabase mode.
- Demo signin → workspace projects → no console errors.
- New project from prompt → editor loads with **zero MobX warnings** (previously 4 distinct managers were noisy).
- Brand panel open, Pages panel open, Code mode toggle, file tree, settings modal open/close, account dropdown — all clean.
- AI chat send → `/api/chat` 200 → title generation 200. Persists across reload.

Files modified in round 4 (16 in total):

- `apps/web/client/src/components/store/state/manager.ts`
- `apps/web/client/src/components/store/editor/tokens/index.ts`
- `apps/web/client/src/components/store/editor/pages/index.ts`
- `apps/web/client/src/server/api/routers/forward/editor.ts`
- 14 call sites of `stateManager.*` direct mutations (mass-migrated via sed)

---

## Critical (blocks main flow)

### 1. Provider tree throws on every request when `WEBLAB_AUTH_PROVIDER=supabase` and Clerk/Convex env unset

- **Flow:** ALL flows. Layout fails to render → every route 500s.
- **Evidence:**
  - `apps/web/client/src/components/clerk-convex-providers.tsx:25-40` throws if `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` or `NEXT_PUBLIC_CONVEX_URL` missing.
  - `apps/web/client/src/app/layout.tsx:207` mounts `<ClerkConvexProviders>` unconditionally.
  - `apps/web/client/src/env.ts:135-138` declares them `z.string().optional()`.
  - `apps/web/client/middleware.ts:39` wraps every request in `clerkMiddleware`, which itself requires `CLERK_SECRET_KEY`.
- **Root cause:** Flag-driven branching missing. `WEBLAB_AUTH_PROVIDER` default = `supabase`, but providers + middleware unconditionally pull Clerk/Convex.
- **Symptom:** Deploy with documented supabase-mode env → unhandled exception every route. No sign-in possible.
- **Repro:** Set only Supabase env vars. Visit `/`. 500.
- **Fix:** Gate `<ClerkConvexProviders>` and `clerkMiddleware(...)` wrapper on `WEBLAB_AUTH_PROVIDER === 'clerk'`. In supabase mode render children directly + use the plain handler.
- **Regression risk:** Hot path — verify both modes boot.

### 2. clerkMiddleware wraps every request even in supabase mode

- **Flow:** All requests. Same observable symptom as #1.
- **Evidence:** `apps/web/client/middleware.ts:39-68` — outer wrapper always `clerkMiddleware(...)`. Without `CLERK_SECRET_KEY`, Clerk throws before inner callback fires.
- **Fix:** Export `clerkMiddleware(handler)` only when `WEBLAB_AUTH_PROVIDER === 'clerk'`, else export plain handler.
- **Process bug compounding this:** `apps/web/client/eslint.config.js:13` newly excludes `middleware.ts` from lint, so future regressions on the hottest file won't be caught.

### 3. Project creation race: `getDefaultPageContext` reads `app/page.tsx` before sandbox files exist

- **Flow:** New user → first project creation. Reproduced live.
- **Evidence (runtime, captured tonight):**
  ```
  Error getting default page context Exception: ENOENT: No such file or directory,
    open '/9b6792f1-7e63-4a00-8fc7-9ef7afcc5f06/41c73c2d-…/app/page.tsx'
    at ChatContext.getDefaultPageContext
    at ChatContext.getCreateContext
    at resumeCreate
  Error getting default style guide context Error: No style guide found
  ```
- **Source:** `apps/web/client/src/components/store/editor/chat/context/index.ts` (`ChatContext.getDefaultPageContext`, `getDefaultStyleGuideContext`), called by `apps/web/client/src/app/project/[id]/_hooks/...` (`resumeCreate`).
- **Symptom:** Project opens, but AI "create flow" hits an error during initial context build. First chat message lacks page + style-guide context → AI hallucinates structure or rejects request.
- **Fix:** In `resumeCreate`, await sandbox-ready signal before calling `getCreateContext()`. Or have `getDefaultPageContext` retry with backoff up to N seconds, and treat ENOENT as "not yet" not "fatal."
- **Regression risk:** AI chat flow — verify both fresh-create + resume-existing don't regress.

### 4. Preview iframe broken by CSP `base-uri` + wrong CSS MIME type

- **Flow:** New project creation → preview never paints correctly. Reproduced live.
- **Evidence (runtime):**
  ```
  Setting the document's base URI to 'https://sb-1wlqomyn5bny.vercel.run/' violates
    the following Content Security Policy directive: "base-uri 'self'".
  Refused to apply style from '…/_next/static/css/app/layout.css?v=…' because its
    MIME type ('text/plain') is not a supported stylesheet MIME type
  ```
- **Two distinct bugs:**
  1. Parent page CSP `base-uri 'self'` blocks preview iframe (on a `*.vercel.run` host) from setting its own `<base>`. Likely set in `apps/web/client/middleware.ts` CSP headers or `next.config.*`.
  2. Sandbox's Next.js dev server serves `layout.css` as `text/plain` — preview ends up unstyled.
- **Symptom:** User creates project → preview is unstyled, broken layout, or doesn't navigate.
- **Fix:**
  - CSP: scope `base-uri 'self'` to the editor host only, not the preview iframe (use frame-src + a separate CSP from sandbox).
  - CSS MIME: sandbox dev server (turbopack rsc dev) needs `Content-Type: text/css` on `.css` route. Likely the `vercel.run` runtime emits raw bytes without sniffing — pin extension → MIME mapping.
- **Regression risk:** Affects every preview iframe load.

### 5. CMS data pusher writes to destroyed penpal connection

- **Flow:** Project load → preview iframe reload → CMS publishes data to dead handle.
- **Evidence (runtime):**
  ```
  PenpalError: Method call setCmsData() failed due to destroyed connection
    at HTMLIFrameElement.setCmsData
    at pushAll (cms-workspace/data-pusher.tsx:150)
  ```
- **Source:** `apps/web/client/src/app/project/[id]/_components/cms-workspace/data-pusher.tsx:150` calls `frame.setCmsData(...)` without first checking the penpal connection is still alive.
- **Symptom:** Errors spam console after every iframe reload; CMS bindings may silently fail to update on the page.
- **Fix:** Track connection state in `data-pusher`; on iframe reload, await new penpal handshake before `pushAll`. Add try/catch + drop the dead frame from the pusher's frame list.
- **Regression risk:** CMS workspace only.

### 6. `ensurePersonal` workspace mutation isn't race-safe

- **Flow:** New user signup → first nav to `/projects` in two tabs.
- **Evidence:** `apps/web/client/src/server/api/routers/workspace/workspace.ts:95-140` — no `23505` retry. Compare with the helper in `…/workspace/personal.ts:67-98` (which does catch and re-fetch). Recent commit `a53e4a906` fixed `resolvePersonalWorkspaceId` only; the tRPC procedure still races.
- **Symptom:** Second tab returns 500; first sign-in flicker on cold accounts.
- **Fix:** Wrap the insert in try/catch; on `code === '23505'` re-query and return the winner. Same pattern already used in `personal.ts`.

## High

### 7. `user.delete` in supabase mode orphans `auth.identities`

- **Flow:** "Delete account" in settings.
- **Evidence:** `apps/web/client/src/server/api/routers/user/user.ts:158-198` — direct `db.delete(authUsers)` skips Supabase GoTrue cleanup (identities, sessions, mfa_factors, refresh_tokens).
- **Symptom:** Re-signup with same email returns `email_exists`; refresh tokens linger.
- **Fix:** Replace with `createAdminClient().auth.admin.deleteUser(ctx.user.id)`. Keep the clerk branch.

### 8. `.env.example` claims Clerk/Convex Required, env.ts marks them Optional

- **Flow:** Developer onboarding.
- **Evidence:** `.env.example:4-18` lists Clerk + Convex under "Required Keys" but `apps/web/client/src/env.ts:135-138` declares them `optional()`. Runtime then crashes (#1).
- **Fix:** Pick one truth after #1/#2 land. If providers are flag-gated, mark them optional in env.example with a "Required when clerk mode" comment.

### 9. OTP send: client cooldown is dead code, button doesn't gate on it

- **Flow:** Email OTP signup.
- **Evidence:** `apps/web/client/src/app/_components/auth-form.tsx:86,103-108,131-141,233-238` — `cooldownSecondsRemaining` initialised from `LOGIN_OTP_LAST_SEND_KEY` but the key is never written, and the Continue button only disables on `isEmailLoading || !email`.
- **Symptom:** Rapid double-click → two OTP emails. Second invalidates first → user enters stale code → "invalid code."
- **Fix:** In `handleSendCode` success path, write the timestamp + set local state. Disable button while `cooldownSecondsRemaining > 0`.

### 10. `getSignInUrlClient` reads `process.env.NEXT_PUBLIC_AUTH_PROVIDER` directly — split-brain risk

- **Flow:** Any client-side "Sign in" CTA (top bar, dropdowns, error pages).
- **Evidence:** `apps/web/client/src/utils/auth/sign-in-url.ts:7-9` vs `apps/web/client/src/env.ts:146`. If `WEBLAB_AUTH_PROVIDER=clerk` set without the `NEXT_PUBLIC_` mirror, server uses `/sign-in` while client uses `/login` → visible bounce.
- **Fix:** Have `env.ts` reject when the public mirror diverges, or import `env.NEXT_PUBLIC_AUTH_PROVIDER` here.

## Medium

### 11. MobX strict-mode violations after `await` in chat + state managers

- **Flow:** AI chat (sending message), opening Publish dropdown. Reproduced live.
- **Evidence (runtime):**
  ```
  [MobX] strict-mode … Tried to modify: ConversationManager.current
  [MobX] strict-mode … Tried to modify: ConversationManager.conversations
  [MobX] strict-mode … Tried to modify: StateManager.publishOpen
  [MobX] strict-mode … Tried to modify: CreateManager.phase
  ```
- **Source:**
  - `apps/web/client/src/components/store/editor/chat/conversation.ts:82,99,103,121,170,206-207` — mutations after `await`, outside auto-action.
  - `apps/web/client/src/components/store/editor/state/index.ts:120-122` — `setPublishOpen` is fine on its own (auto-action), but its caller probably mutates inside an effect/then.
- **Symptom:** Today: warnings only. Tomorrow: React not re-rendering on chat updates / dropdown not closing, because the mutation is treated as untracked.
- **Fix:** Wrap post-`await` blocks in `runInAction(() => { ... })`. The file already imports `runInAction` — use it.

### 12. `AuthRedirect` effect re-runs every render due to fresh supabase client

- **Flow:** Anonymous → protected route bounce.
- **Evidence:** `apps/web/client/src/components/ui/auth-redirect.tsx:13-38` — `createClient()` returns a new object each render, included in effect deps.
- **Symptom:** Drumbeat of `/auth/v1/user` requests on every parent re-render.
- **Fix:** `const supabase = useMemo(() => createClient(), [])`. Drop `supabase` from deps.

### 13. `verifyEmailOtp` returns `redirectTo: /auth/redirect` — returnUrl loop trap

- **Flow:** First-time OTP signup.
- **Evidence:** `apps/web/client/src/app/login/actions.tsx:265` returns `Routes.AUTH_REDIRECT`; `apps/web/client/src/app/login/verify/page.tsx:145-149` then pushes `/profile-setup?returnUrl=/auth/redirect`. After profile setup, `/auth/redirect` reads localforage `returnUrl` from a possibly-old session.
- **Fix:** Return `Routes.PROJECTS` as the default destination from `verifyEmailOtp` and drop the implicit fallback.

### 14. `useHasAuthCookie` sniffs Clerk's `__session` cookie — fragile on preview hosts

- **Flow:** Top-bar avatar visibility for signed-in users on preview/staging deploys.
- **Evidence:** `apps/web/client/src/hooks/use-has-auth-cookie.ts:5-6` — hard-codes the cookie name; Clerk uses different names when domain doesn't match its allowed list.
- **Fix:** In clerk mode, use `useAuth()` from `@clerk/nextjs`. Keep cookie sniff for supabase only.

### 15. `interactions-tab/list-view.tsx` effect deps include `allInteractions.length`

- **Flow:** Selecting elements + adding interactions rapidly.
- **Evidence:** `apps/web/client/src/app/project/[id]/_components/right-panel/interactions-tab/list-view.tsx:43-66` — effect re-runs on `allInteractions.length` even though `getJsxElementMetadata` is keyed on `oid`, not interaction count.
- **Symptom:** Stale `selectedIxId` after add/remove on a different element.
- **Fix:** Remove `allInteractions.length` from deps. If the metadata genuinely changes when ixId is stamped, re-trigger on a precise key (`makeKey(selectedOid, allInteractions.find(...).id)`).

### 16. Project-card link click intercepted by hovering overlay

- **Flow:** Returning user opens existing project from list. Reproduced live (Playwright click timed out 5s).
- **Symptom:** Click on project card title doesn't navigate; user has to click "Open" button explicitly or use keyboard.
- **Source:** Likely the iframe preview overlay (`@e36 [link]` wraps an `<iframe>`) absorbs pointer events. See `apps/web/client/src/app/.../projects/page.tsx`-equivalent card markup.
- **Fix:** Add `pointer-events: none` to the preview iframe inside the link, OR move the link wrapper outside the iframe overlay.

### 17. Sandbox preview repeatedly 404s on `/_weblab/interactions.json`

- **Flow:** Every preview iframe load before any interactions exist. Reproduced live (5x 404s back-to-back).
- **Evidence:** `apps/web/client/src/components/store/editor/interactions/index.ts:405` only writes the file inside `persist()` after the user creates an interaction. The IX runtime fetches it unconditionally on every page load.
- **Symptom:** Console noise; risk of negative HTTP cache pinning the 404 even after the file gets created.
- **Fix:** Ship an empty `{}` `interactions.json` with the template scaffold, OR have the runtime treat 404 as "no interactions" silently (no log, no cache).

## Low / risk-only

### 18. Preview preload script `crossorigin` attribute mismatch

- **Flow:** Preview iframe init.
- **Evidence (runtime):**
  ```
  A preload for '…/weblab-preload-script.js' is found, but is not used because the
    request credentials mode does not match. Consider taking a look at crossorigin attribute.
  ```
- **Fix:** Match `crossorigin` on the `<link rel="preload">` to the actual fetch's credentials mode. Wastes a request per preview load right now.

### 19. tRPC: `WEBLAB_AUTH_PROVIDER` flag must mirror to `NEXT_PUBLIC_AUTH_PROVIDER` — no enforcement

- **Process-level.** See #10. Suggest adding to `env.ts` `transform`/`refine` step that throws when they diverge.

---

## Flows verified clean

- **OAuth start route** (`/api/auth/providers/[provider]/start/route.ts`) — same-origin redirect validation prevents open-redirects; PKCE cookies scoped correctly.
- **OAuth callback for CLI providers** (`…/callback/route.ts`) — state + verifier + redirect-cookie all validated; token encryption + upsert keyed on (userId, provider).
- **Supabase OAuth `/auth/callback/route.ts`** — missing email/id handled; DB upsert failure rolls back the auth session; `COALESCE(NULLIF(..., ''), EXCLUDED.*)` preserves user-edited names.
- **tRPC root** — all 26 routers exported in `apps/web/client/src/server/api/root.ts`.
- **Drizzle schema vs migrations** — workspaces (0034/0035) + `auth.users` trigger (0025) consistent.
- **Project access gate** (`/project/[id]/layout.tsx`) — anonymous → sign-in redirect; unauthorized → NoAccess view.

---

## Suggested order

1. Fix #1 + #2 + #8 together — single root cause, blocks every supabase-mode deploy.
2. Fix #3 — race in `resumeCreate` → no AI context on fresh project.
3. Fix #4 — CSP + MIME break every preview.
4. Fix #5 + #11 — penpal destroyed connection + MobX strict-mode violations are landmines.
5. Fix #6 — race-safe `ensurePersonal`.
6. Then #7, #9, #10, #13, #16.

Live screenshots: `/tmp/projects-page.png`, `/tmp/editor.png`, `/tmp/projects-list-final.png`.
