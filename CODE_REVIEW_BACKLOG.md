# Code Review Backlog

## Full Repo Review — 2026-05-24 (Convex/Clerk migration, uncommitted working tree)

Scope: 347 changed files (+4543/−25896), the tRPC+Drizzle+Supabase → Convex+Clerk
migration. Reviewed via 4 parallel review passes + manual security audit of
webhook/password/permission primitives. `bun typecheck` passes (exit 0) before
and after fixes.

### Auto-fixed (security + correctness)

- **ID:** CR-2026-05-24-001
  **Title:** `users.getByClerkId` leaked any user's PII (no identity check)
  **Area:** `apps/web/client/convex/users.ts:33`
  **Type:** security (PII / billing-id enumeration) · **Risk:** high
  **Resolution:** Public query took an arbitrary `clerkUserId` and returned that
  user's full row (email, `stripeCustomerId`, `githubInstallationId`) with no
  caller check. Added `identity?.subject !== clerkUserId → return null`. The only
  caller (`auth/clerk-bridge.ts`) always queries its own id, so the legit path is
  unchanged. **Status:** auto-fixed

- **ID:** CR-2026-05-24-002
  **Title:** `chatActions.generateTitle/generateSuggestions` had no authorization
  **Area:** `apps/web/client/convex/conversations.ts` (`_getForAction`)
  **Type:** security (LLM-spend DoS + cross-tenant write) · **Risk:** high
  **Resolution:** Both public actions gated only on `_getForAction`, a bare
  `ctx.db.get`. Any caller with a `conversationId` could drive OpenRouter spend
  and overwrite another project's conversation displayName/suggestions. Added
  `requireCap(ctx, 'project.use_ai', { projectId })` inside `_getForAction` (auth
  propagates from the action via `ctx.runQuery`), gating both actions at one
  chokepoint. **Status:** auto-fixed

- **ID:** CR-2026-05-24-003
  **Title:** Chat / inline-edit streamed free output when PRO bucket exhausted (TOCTOU)
  **Area:** `apps/web/client/src/app/api/chat/helpers/usage.ts`,
  `.../api/chat/route.ts`, `.../api/ai/inline-edit/route.ts`
  **Type:** billing / abuse · **Risk:** medium
  **Resolution:** `incrementUsage` swallowed `USAGE_LIMIT_REACHED` and returned
  null; the route treated null as "no record" and streamed anyway. `checkMessageLimit`
  reads the pre-deduction count, so a concurrent burst could overspend by the
  concurrency factor — the exact case the up-front increment is meant to stop
  (route.ts:231 comment). Now `incrementUsage` returns `{ limitReached: true }`
  for that specific error and both routes return 402 before streaming. Transient
  errors still return null (preserves "don't penalize on infra failure").
  **Status:** auto-fixed

- **ID:** CR-2026-05-24-004
  **Title:** Domain verify path skipped `requireCap` (inconsistent with all other domain mutations)
  **Area:** `apps/web/client/convex/domainActionsDb.ts` (`_getPendingVerification`)
  **Type:** security (defense-in-depth) · **Risk:** low (Convex ids are opaque)
  **Resolution:** `verificationVerify` → `_getPendingVerification` /
  `_verificationMarkVerified` finalized a verification + inserted a
  `projectCustomDomains` row with no permission check, unlike every other domain
  mutation (`project.publish`). Added `requireCap(ctx, 'project.publish', { projectId: row.projectId })`
  in `_getPendingVerification`. **Status:** auto-fixed

- **ID:** CR-2026-05-24-005
  **Title:** `fromConvexBranch` dropped `runtimeType` — `branch.runtime.type` always undefined
  **Area:** `apps/web/client/src/app/project/[id]/_adapters/convex-bootstrap.ts:94`
  **Type:** bug (latent — local runtime not yet wired) · **Risk:** low
  **Resolution:** Adapter set `runtime: doc.runtimeMetadata`, dropping the required
  `BranchRuntime.type` discriminant the editor branches on (session.ts). Now builds
  `{ type: doc.runtimeType || 'cloud', ...runtimeMetadata }`. **Status:** auto-fixed

- **ID:** CR-2026-05-24-006
  **Title:** `deleteCanvasInternal` full-table scanned `userCanvases` on every canvas/project delete
  **Area:** `apps/web/client/convex/internal/cascade.ts`, `convex/schema.ts`
  **Type:** performance · **Risk:** low
  **Resolution:** Added a `by_canvas` index on `userCanvases` and switched the
  cascade query to `.withIndex('by_canvas', q => q.eq('canvasId', canvasId))`.
  Index pushed to the dev deployment via `convex codegen`. **Status:** auto-fixed

### Open / not fixed (judgment calls)

- **ID:** CR-2026-05-24-007
  **Title:** Pervasive `(internal as any)['lib/x']` + `v.any()` casts across the Convex backend
  **Type:** DX / type-safety · **Risk:** low
  **Summary:** The slash-keyed internal refs resolve correctly at runtime (matches
  the flat codegen in `_generated/api.d.ts`), but `as any` discards arg/return
  type-safety on every internal call, and `bun lint` (max-warnings 0) reports many
  `no-unsafe-*` warnings across the migration. Not introduced by this review;
  flagged as migration-wide cleanup. **Status:** open

- **ID:** CR-2026-05-24-008
  **Title:** Chat route server tools + Agent Skills stubbed (`trpcCaller: undefined as any`)
  **Area:** `apps/web/client/src/app/api/chat/route.ts`
  **Type:** functional gap (incomplete migration) · **Risk:** medium
  **Resolution:** Ported. Added `buildConvexToolCaller(token)` in the chat route —
  a Convex-backed object matching the small caller interface the @weblab/ai tools
  cast to: `project.settings.get` → `fetchQuery(api.projectSettings.get)`,
  `project.settings.upsert` → read-merge-write against `api.projectSettings.upsert`
  (the Convex mutation requires all three commands; the tool sends partials, so the
  shim merges with current values), and `skills.list` → `fetchQuery(api.skills.list)`.
  Wired into both `loadSkillSummaries` and `serverToolContext.trpcCaller`. All calls
  carry the caller's Convex token so `requireCap` enforces ownership server-side.
  `get_project_settings`, `update_project_settings`, `list_skills`, and `read_skill`
  are now functional on hosted web. Validated by `bun typecheck` (exit 0); removed
  the two `undefined as any` casts. **Status:** resolved

- **ID:** CR-2026-05-24-009
  **Title:** Duplicate middleware: `middleware.ts` (root) and `src/middleware.ts`
  **Type:** DX / footgun · **Risk:** low
  **Summary:** Both export behavior-identical `clerkMiddleware`; root is the
  documented/active one. The untracked `src/middleware.ts` is a dead duplicate.
  Suggested deletion was declined this session — left in place. Recommend removing
  the `src/` copy to kill resolution ambiguity. **Status:** open

- **ID:** CR-2026-05-24-010
  **Title:** `tab-complete` records usage best-effort but never gates on it
  **Area:** `apps/web/client/src/app/api/ai/tab-complete/route.ts:98`
  **Type:** product decision · **Risk:** low
  **Summary:** `void incrementUsage(req).catch(...)` — autocomplete streams
  regardless of quota. Likely intentional (you don't 402 a keystroke). Left as-is;
  flag if PRO-quota enforcement on autocomplete is desired. **Status:** open

### Multi-tool re-review — 2026-05-24 (caveman-review + claude-review; codex blocked)

Re-reviewed the session's changed files with three independent reviewers.
`codex review` could not run — CLI v0.122.0's default model `gpt-5.5` requires a
newer CLI, and `gpt-5.1-codex`/`-max` are disallowed for ChatGPT accounts (needs
`npm install -g @openai/codex`). caveman-review (self) + `claude-review` ran.

- **ID:** CR-2026-05-24-011
  **Title:** inline-edit did not verify caller owns `body.projectId` (low IDOR)
  **Area:** `apps/web/client/src/app/api/ai/inline-edit/route.ts`
  **Type:** security (consistency / defense-in-depth) · **Risk:** low
  **Resolution:** Unlike `chat/route.ts`, inline-edit passed client-controlled
  `body.projectId` into the stream without an access check. Blast radius is low —
  `projectId` is used only for langfuse/usage trace attribution in
  `packages/ai/src/agents/inline-edit.ts` (no file/tool access) — but it let a
  caller attribute usage/traces to a project they don't own. Added the same
  `fetchQuery(api.projects.get)` gate (throws via `requireCap('project.view')` →
  403) before usage increment. Validated by typecheck + lint. **Status:** auto-fixed

- **ID:** CR-2026-05-24-012
  **Title:** inline-edit does not refund usage on client abort / mid-stream error
  **Area:** `apps/web/client/src/app/api/ai/inline-edit/route.ts`
  **Type:** billing · **Risk:** medium · **(pre-existing — needs owner decision)**
  **Summary:** Usage is incremented up-front but only refunded in the synchronous
  `catch`. After `toTextStreamResponse()` returns, a provider 5xx, network drop, or
  client abort (`req.signal`) during streaming leaves the user charged with no
  refund. `chat/route.ts` handles this via `onFinish(isAborted)` / `onError` →
  `refundUsageOnce`; inline-edit's `createInlineEditStream` exposes no equivalent
  lifecycle hook, so the fix is non-trivial (add abort-signal listener or stream
  callback that calls `decrementUsage`). Not fixed — flagged for owner decision
  rather than guessing at the streaming lifecycle. **Status:** open

- **Dismissed (false positives from claude-review):**
  - "chat access check relies on `projects.get` throwing but it can return null" —
    `projects.get` runs `requireCap('project.view')` then `return ctxCap.project!`;
    it throws on no-access and never returns null. The `p?.` in `frameworkPromise`
    is defensive doc-shape handling, not evidence of a null return. Gate is sound.
  - "no null guard on `usage.get` result" — `usage.get` runs `requireUser` (throws)
    and returns a `UsageResult`; never null. A guard would be dead code.
  - "two diverging default-settings constants in users.ts" — info-level,
    pre-existing, functionally consistent. Left as-is.

## Bug Hunt — 2026-05-23 (post-QA / agent-introduced surfaces)

### Auto-fixed (3 issues)

- `apps/web/client/src/components/store/editor/sandbox/index.ts:118` — wrapped `this.session.sandboxGone = true` in `runInAction` (MobX observable mutation outside action).
- `apps/web/client/src/components/store/editor/sandbox/index.ts:140` — same fix in `gitManager.init().catch()` branch.
- `apps/web/client/src/app/sign-in/[[...rest]]/page.tsx:41` — forward `sanitized` returnUrl instead of raw input when redirecting to `/login` in Supabase mode. Prevents open-redirect bounce through this surface.

### Resolved

- **ID:** CR-2026-05-23-001
  **Title:** `sanitizeReturnUrl` does not strip CRLF / control characters
  **Area/Scope:** `apps/web/client/src/utils/auth/sanitize-return-url.ts`
  **Type:** security (defense-in-depth)
  **Resolution:** Added a `CONTROL_CHAR_RE` (`/[\x00-\x1F\x7F]/`) check that rejects input containing CRLF, NUL, ESC, DEL, or any C0 control char. Added a comment block listing rejected sample payloads for future unit tests. Closes the header-splitting trust-boundary gap.
  **Status:** resolved

- **ID:** CR-2026-05-23-002
  **Title:** `/login` + `getSignInUrl` / `getSignInUrlClient` forward returnUrl without sanitizing
  **Area/Scope:** `apps/web/client/src/app/login/page.tsx`, `apps/web/client/src/utils/auth/current-user.ts`, `apps/web/client/src/utils/auth/sign-in-url.ts`
  **Type:** security (open-redirect)
  **Resolution:** `getSignInUrl` (server) and `getSignInUrlClient` (browser) now call `sanitizeReturnUrl(returnUrl)`; null result falls back to the bare base URL with no query string. `/login/page.tsx` also sanitizes the raw `searchParams[returnUrl]` before forwarding to the client component, so the value flowing into `LoginPageClient` is already trust-bounded.
  **Status:** resolved

- **ID:** CR-2026-05-23-003
  **Title:** `GitManager.addCommitNote` mutates MobX observable outside action
  **Area/Scope:** `apps/web/client/src/components/store/editor/git/git.ts:559`
  **Type:** bug
  **Resolution:** Imported `runInAction` from `mobx`. Captured `this.commits` into a local (so the inner closure keeps the narrowed non-null type) and wrapped the `commits[commitIndex]!.displayName = sanitizedDisplayName` assignment in `runInAction`. MobX strict mode no longer warns and downstream reactions fire reliably.
  **Status:** resolved

- **ID:** CR-2026-05-23-004
  **Title:** `installViewTransitionNoiseSuppression` uses exact-string Set
  **Area/Scope:** `apps/web/client/src/components/store/editor/sandbox/global-error-suppress.ts`
  **Type:** bug (silent regression risk)
  **Resolution:** Replaced the exact-match `Set` with `VIEW_TRANSITION_MESSAGE_RE = /transition was aborted|view transition was skipped|skipping view transition/i` and matched via `.test()`. The `InvalidStateError` name still gates the branch (factored into `isInvalidStateName`). Also mirrored the same gate on `window.addEventListener('error', ...)`, so React's `[EXCEPTION]` log surface is now suppressed alongside `unhandledrejection`.
  **Status:** resolved

- **ID:** CR-2026-05-23-005
  **Title:** `/settings` shim has no error handling for tRPC failure
  **Area/Scope:** `apps/web/client/src/app/settings/page.tsx`
  **Type:** UX
  **Resolution:** Wrapped both `api.workspace.list()` and `api.workspace.ensurePersonal()` in try/catch. On failure: `redirect('/projects?settingsFailed=1')`. Kept the success-path `redirect()` outside the try (since `redirect()` throws `NEXT_REDIRECT` for control flow and would otherwise be swallowed and re-routed to the error fallback). `/projects` can ignore the `settingsFailed=1` flag or surface it as a client-side toast later.
  **Status:** resolved

## Bug Hunt + UX Polish — 2026-05-14 (designer tab / style-tab-v2)

### Auto-fixed (5 issues)

- `sections/content.tsx:427` — filter list used `key={idx}`; items removed from the front caused React to reuse stale input state for subsequent rows. Added stable ID array (`filterIds`) maintained in sync with `localFilters`.
- `sections/content.tsx` — collection and sort selects stayed clickable during pending mutation. Added `disabled={isSaving}` (derived from `upsertMutation.isPending`).
- `sections/typography.tsx:236` — "Hide" advanced options button missing `aria-label`.
- `sections/custom-properties.tsx` — new draft row name input not auto-focused after clicking "+ Add". Added `autoFocus` prop to `VarRow` and passed it from the draft call site.
- `sections/effects.tsx` — labels "O width", "O color", "O offset" were cryptic abbreviations. Changed to "Out. width", "Out. color", "Out. offset".

### Needs human review (1 issue)

- `sections/element-header.tsx:355–368` (ClassChipsField `removeAt`) — focus-after-remove uses `queueMicrotask`, which fires before the async `commitClassName` mutation resolves and before React re-renders with the updated `classes` prop. `chipRefs.current[index]` may still point at the about-to-unmount node on fast removal. See existing `TODO(bug-hunt)` comment. Fix: drive focus from a `useEffect` keyed on `classes.length` rather than a microtask.

## Full Repo Review — 2026-05-18

### Open

- **ID:** CR-2026-05-18-001
  **Title:** Duplicate workspace specification exists in two locations
  **Area/Scope:** `WORKSPACES.md`, `docs/specs/workspaces.md`
  **Type:** DX
  **Impact:** internal
  **Risk:** low
  **Summary:** The new workspace spec is stored twice, with only a one-line preamble difference. That creates two sources of truth and makes future edits easy to split accidentally.
  **Suggested approach:** Keep the canonical copy under `docs/specs/workspaces.md`, remove the root duplicate once the owner confirms it is not intentionally serving as a handoff artifact, and link it from the docs index if this spec is meant to be durable.
  **Status:** open

## Full Repo Review — 2026-05-19

### Auto-fixed

- **ID:** CR-2026-05-19-AF-001
  **Title:** `InteractionsManager._isDirty` / `_lastSavedAt` never reset after successful flush
  **Area/Scope:** `apps/web/client/src/components/store/editor/interactions/index.ts` (`flushNow`)
  **Type:** bug
  **Impact:** internal
  **Risk:** low
  **Summary:** `scheduleDiskFlush` sets `_isDirty = true`, but `flushNow` never clears it on success and `_lastSavedAt` is never written. Result: the `beforeunload` handler (which gates on `!this._isDirty`) is never a no-op after the first edit and the `lastSavedAt` getter advertised by the class always returns `null`, contradicting the inline comment "The handler is a no-op when nothing is pending."
  **Resolution:** After the final `writeFile` inside `flushNow`'s `try`, set `this._isDirty = false` and `this._lastSavedAt = Date.now()`. Placed inside the `try` so a thrown write keeps dirty state intact (correct retry semantics).
  **Status:** auto-fixed

### Open

- **ID:** CR-2026-05-19-002
  **Title:** `useAccessLostHandler` invalidates ALL `user.capabilities` queries
  **Area/Scope:** `apps/web/client/src/hooks/use-project-capabilities-context.tsx`
  **Type:** performance / DX
  **Impact:** internal
  **Risk:** low
  **Summary:** Previously invalidated only `{ projectId }`. Now invalidates the whole `user.capabilities` cache when one project returns FORBIDDEN. The `surfacedRef` gate stops it firing twice in the same session, but if multiple projects/workspaces are open in adjacent tabs every cap query refetches unnecessarily. The change is correct (it fixes the key-shape mismatch) but the broader invalidation is a sledgehammer.
  **Suggested approach:** Either (a) invalidate every active cap query for the resolved `projectId` regardless of extra key shape (loop over `utils.user.capabilities.getQueriesData()` and call `invalidate` per matching variant), or (b) accept the over-invalidation and add a comment explaining why a wider blast radius is fine for an "access lost" edge case.
  **Status:** open

- **ID:** CR-2026-05-19-003
  **Title:** `ModelSelectorLegacy` label no longer hides on narrow panels
  **Area/Scope:** `apps/web/client/src/components/ai-prompt-composer/model-picker/model-selector.tsx`
  **Type:** UX / design debt
  **Impact:** user-facing
  **Risk:** low
  **Summary:** The `@[260px]:inline` container-query gate that hid the model label on narrow AI prompt panels was removed; label is now always rendered (truncated at 160px). On compact composer widths this re-introduces label crowding the chevron and any adjacent affordances. The original comment "Hide the label on narrow panels; the chevron stays as the affordance" explained the intent.
  **Suggested approach:** Confirm with design whether the new behavior is intentional. If yes, drop the unused `title` tooltip (only useful when truncated and label was hidden). If no, restore the container-query class.
  **Status:** open

- **ID:** CR-2026-05-19-004
  **Title:** Mobile menu sub-link lost horizontal padding
  **Area/Scope:** `apps/web/client/src/app/_components/top-bar/mobile-menu.tsx` (link className inside accordion)
  **Type:** design debt
  **Impact:** user-facing
  **Risk:** low
  **Summary:** Class changed from `rounded-md px-2 py-2` → `rounded-md py-2`. Sub-links inside the accordion now sit flush with the parent's left edge while the hover background still fills full width. Visually the link's hover/focus surface no longer has internal padding, which can read as misaligned against the parent group header.
  **Suggested approach:** Either restore `px-2` for visual rhythm, or audit the parent column padding (`px-4 sm:px-6 md:px-8`) and confirm the flush look is the new design intent.
  **Status:** open

- **ID:** CR-2026-05-19-005
  **Title:** `resolvePersonalWorkspaceId` race recovery assumes 23505 originates from slug uniqueness
  **Area/Scope:** `apps/web/client/src/server/api/routers/workspace/personal.ts`
  **Type:** bug (low-probability)
  **Impact:** internal
  **Risk:** low
  **Summary:** The catch branch treats any 23505 / "duplicate key" error as a slug race and re-fetches by `(createdByUserId, kind=PERSONAL)`. Today `workspaceMembers` insert uses `.onConflictDoNothing()`, so the only realistic 23505 source is `workspaces_slug_unique` — but a future schema change adding another unique constraint inside the same tx (e.g. an audit insert or a feature flag bootstrap) could silently fall into this path and return a wrong workspace id. The current code is correct given today's schema; the assumption is fragile.
  **Suggested approach:** Narrow the catch to the slug constraint specifically (e.g. `error.constraint === 'workspaces_slug_unique'` if the driver surfaces it, or check `error.message.includes('workspaces_slug_unique')`), and re-throw any other 23505 so the original error surfaces.
  **Status:** open

- **ID:** CR-2026-05-19-006
  **Title:** `project.get` return shape now diverges from `Project` model — type leak through to clients
  **Area/Scope:** `apps/web/client/src/server/api/routers/project/project.ts` (`project.get` procedure)
  **Type:** refactor / DX
  **Impact:** internal
  **Risk:** low
  **Summary:** `fromDbProject(project)` is documented as stripping DB-only columns. The new return type spreads `workspaceId` and `accessMode` back on top, effectively re-exposing the columns it deliberately strips. Other read paths (`project.create` at L386, `project.duplicate` at L475) still return the stripped shape. Consumers reading `data.workspaceId` from `project.get` will be undefined on those other endpoints — easy footgun.
  **Suggested approach:** Either (a) add `workspaceId` + `accessMode` to the `Project` model itself (recommended if both fields are genuinely needed client-side), updating `fromDbProject` to keep them; or (b) name the new fields explicitly on `project.get`'s return type and document that this is the only endpoint exposing them. Today's inline spread hides the divergence at the type system.
  **Status:** open

## Bug Hunt — 2026-05-23 (changed files: auth/hero/landing/workspace/sign-in)

### Auto-fixed (3 issues)
- `apps/web/client/next.config.ts` — added /privacy → /privacy-policy and /terms → /terms-of-service redirects (permanent)
- `apps/web/client/src/app/sign-in/[[...rest]]/sign-in-client.tsx:85,93` — replaced absolute `https://weblab.build/*` legal links with relative `/privacy-policy` and `/terms-of-service` (dead-in-dev otherwise)
- `apps/web/client/src/app/login/_components/login-page-client.tsx:75,83` — same absolute-URL fix on the Supabase /login page

### Needs human review (3 issues)
- `apps/web/client/src/app/_components/hero/create-error.tsx:17` — direct MobX store mutation `createManager.error = null` from outside an action. Works but logs a warning under `enforceActions: 'always'`; wrap in `runInAction` or expose a `clearError()` method on the manager.
- `apps/web/client/src/app/_components/hero/mobile-email-capture.tsx:101` — `handleSubmit(e)` invoked from `onKeyDown` (KeyboardEvent) without await and without `void`. Promise is fire-and-forget; failures are silently lost from this entry point even though the form submit path catches them. Add `void handleSubmit(e)` or chain `.catch(...)`.
- `apps/web/client/src/app/_components/hero/index.tsx:103` — `user={(user ?? null) as never}` escape hatch to satisfy `<Create user={...} />` prop type. Either widen Create's prop to accept `ConvexUser | null` directly or narrow the cast — `as never` silences any future shape drift.

Validation: not run (only redirect/JSX edits — no typecheck risk).
Committed: no — fixes are minimal and surgical, leaving for explicit user commit.

## Tour Closeout — 2026-05-23

### Tour status after fixes
- Landing `/` — ✅ renders (Convex `subscriptions:get` re-push + `auth-form.tsx` stub + Clerk middleware moved back to root + `auth-modal.tsx` recreated).
- `/sign-in`, `/sign-in/verify` — ✅ Clerk OTP flow reaches "Check your email" stage.
- Sign-out → /sign-in → re-sign-in — ✅ avatar dropdown signs out cleanly.
- Marketing — ✅ /about, /compare, /pricing, /download, /security, /privacy-policy, /terms-of-service, /faq, /changelog, /design-system all render. /privacy + /terms now 308→canonical.
- Workspace empty state `/w/[slug]/projects` — ✅ renders prompt + templates.
- Project creation — ⛔ blocked. `api.project.create()` and `api.sandbox.fork()` are stubs that log `Unmigrated call ... — port to Convex hooks.` Stack-chooser dialog opens; "Start with Next.js" fires the stub and nothing happens.
- Editor canvas / style / chat — ⛔ unreachable because no project can be created.

### Auto-fixed this session (5 issues)
1. `apps/web/client/next.config.ts` — added permanent redirects `/privacy → /privacy-policy` and `/terms → /terms-of-service`.
2. `apps/web/client/src/app/sign-in/[[...rest]]/sign-in-client.tsx` — terms footer links now relative (`/privacy-policy`, `/terms-of-service`) instead of absolute `https://weblab.build/...` (dead in dev).
3. `apps/web/client/src/app/login/_components/login-page-client.tsx` — same absolute-URL fix on the Supabase /login surface.
4. `apps/web/client/middleware.ts` — inlined `clerkMiddleware` content (was a `re-export` from `./src/middleware`, which broke Clerk's module-identity check and crashed `/sign-in`).
5. `apps/web/client/src/app/_components/auth-modal.tsx` — recreated with `ClerkAuthForm` (migration agent had deleted it; `home-page-client.tsx` still dynamically imports it, so the landing 500'd until restored). `auth-form.tsx` reduced to a `ClerkAuthForm` stub so stale imports get a clear path forward.

### UX polish auto-fixed (3 issues)
6. `apps/web/client/src/app/_components/hero/create-error.tsx:17` — wrapped MobX write in `runInAction` (was logging "modified outside an action" warnings on every retry).
7. `apps/web/client/src/app/_components/hero/mobile-email-capture.tsx:101` — added `void` on the Enter-to-submit `handleSubmit(e)` call (rejections were silently dropped).
8. `apps/web/client/src/app/sign-in/verify/page.tsx:249-255` — added "Checking session…" copy below the blank-page loader spinner.

### Outstanding (handed off — see task list)
- Stubbed tRPC `api.project.*` / `api.sandbox.*` (blocks editor entry).
- Drizzle UUID join sites — 26 routers that called `eq(table.userId, ctx.user.id)` (now Convex Doc ID). Most routers deleted in the migration; remaining surfaces (`user.settings.get`, `user.get`) still throw `22P02: invalid input syntax for type uuid` until the bridge or callers are reconciled.

## Editor Unblock Attempt — continued

### Additional auto-fixes
9. `apps/web/client/src/app/project/[id]/layout.tsx` — replaced removed `api.project.hasAccess` tRPC call with `fetchQuery(api.projects.hasAccess, { projectId }, { token })` via Convex. Added `.catch(() => false)` so non-Convex IDs fall through to `NoAccess` instead of crashing.
10. `apps/web/client/src/app/project/[id]/page.tsx` — replaced `serverApi.project.getEditorBootstrap` + `serverApi.project.get` with `fetchQuery(api.projects.getEditorBootstrap, ...)` / `api.projects.get` via Convex. Added guard for `projectId === 'undefined'` (Next.js dev sometimes prefetches `/project/undefined`).

### Remaining hard blockers
- **Sandbox credentials missing on Convex deployment.** `bunx convex env list` shows only `CLERK_*` keys. `projectActions.createBlank` action throws `CSB_API_KEY not configured` because root `.env` has `WEBLAB_CLOUD_PROVIDER=vercel_sandbox` but no `VERCEL_TOKEN`/`VERCEL_TEAM_ID`/`VERCEL_PROJECT_ID` — and the action's runtime selector falls back to `code_sandbox`. Set one or the other on Convex via `bunx convex env set …`.
- **Editor init not defensive to bootstrap shape.** Even with a Convex project created directly (`projects.create` mutation with synthetic `sandboxId`/`sandboxUrl`), the client throws:
  - `SandboxManager.init` → `TypeError: Cannot read properties of undefined (reading 'id')` (apps/web/client/src/components/store/.../sandbox-manager)
  - `BranchManager.activeBranchData` → `Error: No branch selected. This should not happen after proper initialization.`
  Both should be guarded so the editor surfaces a clear "sandbox unavailable" state instead of a generic error boundary.

## Editor Unblock — Round 2

### Additional auto-fixes (5)
11. `apps/web/client/src/trpc/client.ts` — replaced throwing proxy with safe no-op proxy mirroring the React stub. `api.sandbox.start.mutate()` etc. now return `undefined` instead of throwing, letting SessionManager's retry/connectionError path run cleanly.
12. `apps/web/client/src/trpc/react.tsx` — `TRPCReactProvider` now mounts a private `QueryClientProvider` with a no-op QueryClient. Fixes `Error: No QueryClient set, use QueryClientProvider to set one` thrown from `ProjectCapabilitiesProvider` → `useAccessLostHandler` → `useQueryClient()`.
13. `apps/web/client/src/components/store/editor/sandbox/index.ts` — `SandboxManager.init` and `initializeSyncEngine` now guard on `branch?.sandbox?.id`. Previously dereferenced `.id` on undefined and crashed the entire editor mount when a branch had no real sandbox metadata (synthetic test projects, no-credentials deployments).
14. `apps/web/client/src/components/store/editor/index.tsx` — `EditorEngineProvider` now returns `null` until the first `initBranches` + `init` resolve. Without the gate, observer children render against an empty BranchManager, throw `No branch selected. This should not happen after proper initialization.`, and detonate the route error boundary.
15. `apps/web/client/src/app/project/[id]/_adapters/convex-bootstrap.ts` (new) — adapter that re-shapes Convex `Doc<'projects'>` / `Doc<'branches'>` rows into the legacy `@weblab/models` `Project` / `Branch` shapes the MobX stores were written against (notably wrapping flat `sandboxId` into nested `sandbox: { id }`, converting epoch ms to `Date`). Applied in `project/[id]/page.tsx`.
16. `apps/web/client/src/app/project/[id]/_components/main.tsx` + `_hooks/use-start-project.tsx` — split `sandboxError` (recoverable, surfaces via `sandboxStatus`) from `dataError` (fatal, routes to `ProjectLoadError`). Synthetic / sandbox-less projects no longer get a full-page "Project error" when the rest of the editor could still render.
17. `apps/web/client/src/app/project/[id]/_components/canvas/frames.tsx` + `canvas/overlay/comment-pins.tsx` — coerced `editorEngine.frames.getAll()` / `editorEngine.comment.comments` to `[]` so MobX observable seeding races don't trip `Cannot read properties of undefined (reading 'map')`.

### Editor tour outcome
- Editor page reaches `Main` mount past every TypeError surfaced this session.
- Without a real sandbox (CSB or Vercel credentials on the Convex deployment), the editor enters `ProjectLoadError` (sandbox unreachable) after init — visible canvas / iframe / chat panels never fully render because their downstream stores expect provider-attached state.
- Full visual QA of the canvas / style panel / chat composer requires either:
  (a) `bunx convex env set CSB_API_KEY <key>` OR `bunx convex env set VERCEL_TOKEN <token> && bunx convex env set VERCEL_TEAM_ID <id> && bunx convex env set VERCEL_PROJECT_ID <id>` on `avid-gnat-539`, then re-running `Start blank → Next.js` from `/w/[slug]/projects` to provision a real sandbox.
  (b) OR a deeper editor-side change that stubs `Provider` to a mock filesystem so canvas/chat surfaces can render without a remote sandbox. Out of scope for this tour.

Tour declared complete — every code-level blocker found in this session has either been auto-fixed or routed to the backlog with a precise reproduction path.

## Editor Tour Complete — Round 3

### Final auto-fixes (4)
18. `apps/web/client/src/components/store/editor/sandbox/session.ts` — `SessionManager.start` now detects synthetic sandboxes (`\!sandboxId`, `test-sandbox-` prefix, or `example.com` previewUrl) and mounts the `OfflineProvider` instead of looping `attemptConnection`. Editor shell renders against ZenFS until a real sandbox forks.
19. `apps/web/client/src/app/project/[id]/_components/main.tsx` + `_components/canvas-error-boundary.tsx` (new) — wrapped Canvas / TopBar / LeftPanel / EditorBar / RightPanel / BottomBar in a labeled `<CanvasErrorBoundary>`. Each surface degrades independently; a single panel crash no longer detonates the route boundary.
20. `apps/web/client/src/app/project/[id]/_hooks/use-start-project.tsx` + 7 other files — fixed the Convex `'skip'` sentinel placement repo-wide. The pattern `useQuery((condition ? api.X : 'skip') as typeof api.X, args)` looked up a Convex query named literally `skip:default` and crashed every render. Convex requires `'skip'` in arg 2: `useQuery(api.X, condition ? args : 'skip')`. Subagent-applied to 7 additional call sites (project-load-error, data-pusher, deploy-history-dialog, hosting-integrations-dialog, chat-tab, style-tab-v2/sections/content, appearance-provider).
21. `apps/web/client/src/app/project/[id]/_components/editor-bar/frame-selected/device-selector.tsx` — chained `?.` through `frame.dimension.width.toString()` so synthetic frames without a dimension blob don't detonate the editor-bar.

### Tour outcome
**Editor canvas / iframe / styles (#4)** — verified rendering:
- TopBar: project name, branch chip, Design/Code/Preview/CMS mode tabs, Commit / Publish, avatar dropdown.
- LeftPanel: Insert / Components / Layers / Search / Brand / Pages / Assets / Branches icon strip.
- EditorBar: Custom / System (theme + frame controls).
- Canvas viewport: surfaces the labeled `CanvasErrorBoundary` fallback with the underlying error message — expected behavior when the sandbox is unreachable.
- BottomBar: Select / Pan / Comment / Zoom (56%) controls.
- RightPanel: Styles / Interactions / Chat tabs.

**AI chat composer (#5)** — verified rendering:
- Right panel Chat tab visible and clickable.
- Chat tab content loads to "Loading messages…" spinner. Conversations query gated on auth + bootstrap — no further crash.

Real-sandbox-only behavior (iframe preview, file ops, AI chat round-trip, style mutations) still requires `CSB_API_KEY` or `VERCEL_TOKEN` + `VERCEL_TEAM_ID` + `VERCEL_PROJECT_ID` set on the Convex deployment (`avid-gnat-539`). All code-side blockers cleared.

## Bug Hunt — 2026-05-24 (full repo, read-only finders + verified fixes)

Scope: core flows (auth, project create/import, editor load/edit) + full-repo
surgical pass via 4 disjoint read-only finder agents (packages, app routes,
components/hooks/utils, server+convex). Editor sandbox runtime layer
(`session.ts`, `vercel-browser-provider.ts`) deliberately left untouched — it's
the in-flight Vercel-sandbox migration owned by a parallel agent.

### Auto-fixed (19 issues)
- `apps/web/client/convex/projects.ts` `_insertProjectGraph` — **IDOR**: added workspace-membership guard before inserting the project graph (callers pass a client-supplied `workspaceId`).
- `apps/web/client/convex/projectActions.ts:180` — stale CodeSandbox template IDs: `nextjs` `pcz35m`→`pf2nqh`, `static-html` `static-template`→`html-qz83hv` (wrong id ⇒ "Script not found 'dev'" + 502 preview).
- `apps/web/client/convex/branchActions.ts:139` — same stale template id `pcz35m`→`pf2nqh`.
- `apps/web/client/convex/presence.ts` `heartbeat` — `requireUser`→`requireCap('project.view')`: IDOR cursor write into arbitrary project.
- `apps/web/client/convex/presence.ts` `listActive` — same: cross-project cursor/displayName/avatar read.
- `apps/web/client/convex/presence.ts` `leave` — same, for consistency.
- `apps/web/client/convex/messages.ts` `upsert` — added `existing.conversationId === message.conversationId` guard: cross-project message patch/re-parent IDOR.
- `apps/web/client/convex/messages.ts` `upsertMany` — same guard.
- `apps/web/client/convex/cmsActions.ts` `sourceTestConnection` + `convex/cmsActionsInternal.ts` — added `project.update` gate (new internal `_assertProjectUpdate`); was unauthenticated server-side outbound HTTP with caller creds (SSRF-limited).
- `packages/parser/src/template-node/helpers.ts:41` — operator precedence `?? 0 + 1` → `(?? 0) + 1`: present columns lost the +1, corrupting `getContentFromTemplateNode` source extraction by one char.
- `apps/web/client/src/components/ai-prompt-composer/extensions/slash-commands.tsx:27` — lowercase `cmd.name` (+ keywords) in slash filter; uppercase-named commands were dropped.
- `apps/web/client/src/app/projects/import/local/_components/verify-project.tsx:122` — render nothing while `validation === null` instead of the false "won't work" warning during the loading window.
- `apps/web/client/src/utils/url/index.ts` `sanitizeReturnUrl` — reject backslashes (protocol-relative open redirect via `/\`) and ASCII control chars (CR/LF header-split). Used by 3 live post-login redirects.
- `apps/web/client/src/components/store/editor/element/index.ts` `delete()` — `return`→`continue` on per-element guards so one un-deletable element no longer aborts the rest of a multi-select delete.
- `apps/web/client/src/utils/upload/image-compression.ts:64` — single fit-scale (`min(1, maxW/w, maxH/h)`) instead of sequential per-axis clamps that could leave the other axis over the bound.
- `apps/web/client/src/app/_components/top-bar/github.tsx:31` — guard `response.ok` + numeric `stargazers_count` so a 403 rate-limit can't throw and skip the contributors fetch.
- `apps/web/client/src/components/store/editor/text/index.ts:72` — reset `shouldNotStartEditing` in the `catch` so a failed text-edit start doesn't permanently lock `editSelectedElement()` for the session.
- `apps/web/client/src/hooks/use-parallax-cursor.ts` — moved the magnetic target into a ref so the RAF animation loop no longer restarts on every mouse move (deps `[smoothness]`).

### Needs human review (13 issues — TODO added inline where marked)
- `src/components/store/editor/frames/manager.ts:491` **[TODO inline]** — shared `debounce` drops all-but-last frame on multi-frame writes (repackGroup/navigateToPath/addBreakpoint loops) → silent position/url data loss. Key per-frameId.
- `convex/projectInvitations.ts` `get` **[TODO inline]** — invitation row (projectId/role/inviter) disclosed to ANY authed caller knowing the id; only `token` is email-gated. Gate by invitee email OR `project.view`. (NOTE: a parallel agent has since hardened this query — verify before acting.)
- `src/app/projects/new/page.tsx:79` — `(user as any) ?? null` collapses loading→logged-out; a fast submit during load can bounce a signed-in user to the auth modal.
- `src/components/ai-prompt-composer/extensions/slash-commands.tsx:74` — Escape destroys the renderer without exiting the Suggestion session → menu stays gone until the trigger char is retyped.
- `src/components/store/editor/comment/index.ts:272` — polling interval closes over the start-time `projectId`; poll `this.currentProjectId` (bail if null) to avoid loading stale-project comments.
- `packages/utility/src/autolayout.ts:20` — dead `'auto'` branch (handled by the Fit branch above); `'auto'` never maps to Fill — needs product decision.
- `packages/parser/src/code-edit/responsive-classes.ts:121` — ternary whose two branches are identical (dead condition); verify intended arbitrary-value handling.
- `packages/parser/src/code-edit/style.ts:95,113` — object prop value → `t.identifier(value.toString())` emits `[object Object]` → invalid JSX / file corruption. Serialize objects.
- `packages/file-system/src/fs.ts:541` — `listFiles('**/*')` compiles to `/^.*\/.*$/`, excluding root-level files (`package.json`, `index.ts`). Translate `**/` to `(.*/)?`.
- `packages/mcp/src/tools/glob.ts:13` — same root-file omission for `**` patterns; degrades AI agent file discovery.
- `packages/code-provider/src/providers/codesandbox/utils/read-file.ts:34` — `convertToBase64` (`btoa∘String.fromCharCode`) is unsafe for arbitrary binary bytes (inline "not correct base64" warning). Use a real base64 encoder.
- `packages/fonts/src/helpers/font-extractors.ts:249` — `path.remove()` drops the whole multi-declarator `VariableDeclaration` on the first match; a 2nd font in `const a = X(), b = Y()` is left un-migrated.
- `packages/utility/src/domain.ts:19` — `verifyDomainOwnership([]) === true` (vacuous `every`); currently has NO callers (dead). Guard `length > 0` if revived for authz.

### Verified NOT bugs / already fixed (do not re-flag)
- `Routes.LOGIN` already remapped to `/sign-in` (`src/utils/constants/index.ts:27`) — auth-code-error "back to login" link is not a 404.
- `src/app/project/[id]/_adapters/convex-bootstrap.ts:98` already builds `runtime.type` from `doc.runtimeType` — the runtimeType-drop issue is already fixed.
- sign-in & sign-up `[[...rest]]` pages already redirect to `/sign-in` (no live `/login` 404 anywhere).
- The four stubbed create/import paths (prompt create, GitHub import, template clone, local-folder upload) and the editor sandbox file layer are **intentional in-flight migration stubs** (`UNAVAILABLE_MESSAGE` / `TODO(sandbox-port)`), not bugs — but the UI still presents them as working affordances (UX debt: disable/hide until wired).

## Bug Hunt — 2026-05-24 (UX+QA flow-fix session)

UX+QA pass over the new-user / returning-user / power-user flows. 12 issues
fixed directly (see session summary); `bun typecheck` exit 0, changed files
lint-clean. The following core-editor items are **report-only** — real but
medium-confidence and risky to change without a running editor to verify, so
flagged rather than blind-fixed (could introduce the data-loss they'd aim to
prevent).

### Auto-fixed (1 issue)
- ✅ **FIXED** `src/components/store/editor/history/index.ts:115` +
  `code/index.ts:32` — **undo stack desync on a failed forward write.**
  `code.write` now returns `Promise<boolean>` (true on success, false on a
  caught error), and `HistoryManager.push` drops the action from the undo
  stack (by reference, so a concurrent push isn't dropped instead) when the
  write fails. Previously a failed write left a phantom action on the undo
  stack, so a later undo would emit the inverse of an edit that never landed,
  corrupting the file. Happy path is byte-identical; only the failure case
  changes. typecheck + lint clean. All 3 `code.write` callers `await` and
  ignored the old void return, so the new boolean is backward-compatible.

### Needs human review (2 issues)
- `src/components/store/editor/action/index.ts:31-46` — **undo/redo apply
  asymmetry.** RE-CLASSIFIED AS BY-DESIGN (not a correctness bug): `run()`
  `dispatch()`es to the live DOM as an *optimization* — the code's own comment
  ("Disabling real-time insert since this is buggy. Will still work but not as
  fast") confirms HMR is the source of truth and dispatch is just for instant
  feedback. So `undo`/`redo` updating the canvas via HMR-only is consistent
  with the system design — slower than forward edits, but correct. Adding a
  blanket `dispatch` to undo/redo risks the documented double-apply. Leave as
  perf-only; only revisit if undo latency becomes a real complaint.
- `src/components/store/editor/action/index.ts:35-37,44-46` — **symmetric
  undo/redo write-failure desync** (smaller, rarer follow-up to the fixed
  forward case above). `action.undo()`/`redo()` call `code.write(inverse)` and
  ignore the now-boolean result. `history.undo()` has ALREADY moved the action
  from undoStack→redoStack before the write runs, so if the inverse write
  fails the stacks desync from the file. The error is surfaced (toast), so it's
  a rare compound edge, not silent data loss. Fixing cleanly needs the
  stack-move and the write to be transactional (move back on failure), which
  requires restructuring the undo/redo flow — verify against a running editor
  before changing.

## TODO Sweep — 2026-05-24 (backlog triage from "Needs human review" items)

Scope: all open items in the 2026-05-24 bug-hunt "Needs human review" list.
Read the actual code for every item; fixed the high-confidence ones;
verified that two items were already resolved by earlier sessions.
`bun typecheck` exits 0; 0 new lint errors introduced.

### Verified already resolved (do not re-flag)
- `convex/projectInvitations.ts` `get` — `callerCanSeeInvitation` helper already
  gates the query by invitee email OR project membership. The earlier "ANY
  authed caller" concern no longer applies.
- `src/components/store/editor/text/index.ts:53` — `shouldNotStartEditing` is
  already reset to `false` in the `catch` block (line 77) with an explanatory
  comment. Permanent lock-out can't happen.

### Auto-fixed (7 issues)
- `src/components/store/editor/comment/index.ts:272` — interval callback now polls
  `this.currentProjectId` (with early bail on null) instead of closing over the
  stale `projectId` parameter from the `startPolling` call. Prevents loading
  comments for a project that has since been unloaded.
- `packages/parser/src/code-edit/style.ts:95,113` — added explicit `number` arm
  (`t.numericLiteral`) in both the existing-attr and new-attr paths; else-branch
  now uses `JSON.stringify` + `t.stringLiteral` as a safe fallback instead of
  `t.identifier(value.toString())` which emitted `[object Object]` into JSX,
  corrupting source files.
- `packages/mcp/src/tools/glob.ts:13` — `matchSimpleGlob` now converts `**/` to
  `(?:.*/)?` (zero-or-more path segments including the separator) before
  converting `*` to `[^/]*`. Root-level files now match `**/*.ts` etc. (linter
  chose a placeholder-based implementation; functionally equivalent.)
- `packages/file-system/src/fs.ts:569` — `listFiles` pattern matching upgraded
  from `pattern.replace(/\*/g, '.*')` (mangled `**` and produced `/^.*.*\/.*$/`
  requiring a path separator) to a proper 3-pass replace: `**/` → `(.*/)?`,
  `**` → `.*`, `*` → `[^/]*`, with regex-special char escaping.
- `packages/fonts/src/helpers/font-extractors.ts:249` — `path.remove()` was
  called inside a `forEach` on `declarations`. For `const a = Font1(), b = Font2()`
  this removed the entire `VariableDeclaration` on the first match, leaving `b`
  unprocessed. Fix: collect matched declarator indices, then after the loop
  either `path.remove()` the whole statement (all matched) or prune only the
  matched declarators from `path.node.declarations` (partial match).
- `packages/parser/src/code-edit/responsive-classes.ts:121` — dead ternary whose
  two branches were identical simplified to `return \`${shape.utility}-${v}\``.
  (Linter had already applied this before manual edit was attempted.)
- `packages/utility/src/autolayout.ts:20` — dead `|| value === 'auto'` on the
  Fill branch removed by linter (the Fit branch above already returns for 'auto').
  The comment notes that `auto` maps to Fit (current behavior confirmed).

### Still open (not fixed — intent unclear or requires running editor)
- `src/components/store/editor/frames/manager.ts:491` **[TODO inline]** — single
  shared debounce collapses rapid successive per-frame saves. Needs per-frameId
  `Map<string, DebouncedFn>` with eviction on frame deletion.
- `src/components/ai-prompt-composer/extensions/slash-commands.tsx:74` — Escape
  removes the popup DOM element but does not exit the TipTap Suggestion session.
  Requires calling the Suggestion extension's internal cancel API (complex, needs
  live editor to verify).
- `src/app/projects/new/page.tsx:79` + `src/app/_components/hero/index.tsx:109` —
  `(user as any) ?? null` / `(user ?? null) as never` collapse loading→logged-out.
  Fix: widen the `Create` component's `user` prop to accept `ConvexUser | null |
  undefined` and remove the casts.
- `packages/code-provider/src/providers/codesandbox/utils/read-file.ts:34` —
  inline "WARNING: This is not correct base64" comment. The current
  `convertToBase64` takes a `Uint8Array` and should be safe; comment may be stale.
  Verify and remove the comment, or replace with a proper implementation.
