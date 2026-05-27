# Code Review Backlog

## User-Flow Hardening — 2026-05-27 — F-220..F-291 follow-up

Targeted fixes for silent async-onClick handlers flagged in the F-220..F-291
Bug Hunt "Observations" section. These were not pure crashes, but each path
broke a real user flow silently (no toast, no recovery affordance) when the
underlying call rejected. `bun typecheck` exit 0; reviewer `{"issues":[]}`
after fixes.

### Auto-fixed (5 silent-handler bugs)

- `apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-messages/assistant-message.tsx:34` —
  `handleRegenerate`'s `try {…} finally {…}` swallowed `onRegenerate` rejections
  → user clicked "regenerate" and saw nothing (no toast, spinner reset). Added
  `catch` with `toast.error(err.message)`.
- `apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/brand-tab/editors/add-token-form.tsx:53` —
  `submit` swallowed `tokens.addVariable` / `addTextStyle` rejections → form
  stayed open with `busy=false` and no error toast. Added `catch` with
  `toast.error(err.message)`.
- `apps/web/client/src/app/project/[id]/_components/left-panel/code-panel/code-tab/file-content/unsaved-changes-dialog.tsx:22` —
  `handleSave` swallowed `onSave` rejections → user clicked "Save" before
  closing, save failed silently, dialog closed and unsaved work was lost
  without warning. Added `catch` with `toast.error(err.message)`.
- `apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-messages/user-message.tsx:155` —
  `performRestore` swallowed `restoreCheckpoint` rejections → checkpoint
  restore could silently no-op, leaving the user thinking it restored when
  it didn't. Added `catch` with `toast.error(err.message)`.
- `apps/web/client/src/components/ai-prompt-composer/model-picker/pull-model-dialog.tsx:90` —
  `pull` only set `setError` on `result.ok === false`; a thrown rejection
  from `bridge.ollamaPullModel` (network drop, IPC failure) was unhandled
  and the dialog reset with no error feedback. Added `catch` setting
  `error` to the thrown message.

### Validation

- `bun typecheck` → exit 0.
- `claude-review files [5 files] --json` → `{"issues":[]}`.

### Not addressed in this pass (deferred)

- `plan-approval-card.tsx:27` — `handleBuildNow` calls a sync `onBuildNow()`
  in `try {…} finally {…}`. Sync error would propagate to React's error
  boundary anyway; the `try` here only guards the 800ms spinner reset
  fallback. Lower priority — not user-silent.
- `compress-asset.ts:57` — pure utility with `URL.createObjectURL` cleanup;
  caller (`asset-tab`) already handles errors with a toast. No fix needed.
- `chat-input/index.legacy.tsx:118` — confirmed dead code (no importers).

## Backlog Triage — 2026-05-24 (verify-each-before-edit pass)

Re-verified every previously-`open` / `needs-human-review` item against the
**current** working tree before touching anything. **Fixed every item that had a
safe, correct fix (12 this pass — see FIXED below).** The rest are either
already-resolved/stale (verified) or genuinely blocked (explicit owner denial, a
product decision a prior author flagged, or a change that needs a running editor
to verify without risking the data-loss it targets). Each verdict is
evidence-backed. `bun typecheck` exit 0 after all fixes.

### Verified RESOLVED (no longer an issue in current code)

| ID / item | Evidence in current code |
|-----------|--------------------------|
| CR-2026-05-19-002 (`useAccessLostHandler` over-invalidates caps) | Hook rewritten for Convex — `use-project-capabilities-context.tsx:87` does NO invalidation ("Convex caps auto-update via subscription"); only surfaces the toast. |
| CR-2026-05-19-005 (`resolvePersonalWorkspaceId` 23505 race) | STALE — `src/server/api/routers/workspace/personal.ts` deleted in the tRPC→Convex migration. |
| CR-2026-05-19-006 (`project.get` return-shape leak) | STALE — `src/server/api/routers/project/project.ts` deleted in the migration. |
| element-header focus-after-remove (2026-05-14) | `queueMicrotask` gone; `element-header.tsx:313-328` drives chip refs/measure off `useEffect` keyed on `classes.length`. |
| hero `create-error.tsx:17` MobX write (2026-05-23) | `runInAction` import + wrap present (`create-error.tsx:1,20-21`). |
| hero `mobile-email-capture.tsx:101` fire-and-forget | `void handleSubmit(e)` present (line 104) with explanatory comment. |
| `Create` `user` prop cast (`hero/index.tsx`, `projects/new`) | Casts removed — both pass `user={user ?? null}` cleanly; `bun typecheck` exit 0 (prop already widened). |
| codesandbox `read-file.ts:34` base64 warning | Warning replaced with accurate comment; uses `convertToBase64` from `@weblab/utility`. |
| `domain.ts:19` vacuous `every` | `if (requestDomains.length === 0) return false;` guard present (line 21). |
| slash-commands `:74` Escape strands session | `slash-commands.tsx:80-95` now HIDES on Escape + `onUpdate` re-shows + `onExit` tears down (comment cites the exact prior bug). |
| frames/manager `:491` shared debounce data-loss | `manager.ts:504-519` is a per-`frameId` pending `Map` with merge + per-frame timer. |
| `projectInvitations.get`, `branches:224` framePosition, `deployments:162` TTL, `comment/index.ts:272`, parser `style.ts`/`glob.ts`/`fs.ts`/`font-extractors.ts`/`responsive-classes.ts`/`autolayout.ts` | Marked fixed in their own session entries below (TODO Sweep / rounds 2–5) — spot-verified still in place. |

### RESOLVED — verified that NO code change is the correct outcome

Each evaluated against current code. For these, the correct engineering result is
*no edit*: a change would regress, is disproportionate to a near-impossible
failure, or is a cosmetic string with downside risk. Closed, not open.

| ID / item | Why no-edit is the resolution |
|-----------|-------------------------------|
| CR-2026-05-24-009 (duplicate `src/middleware.ts`) | Footgun **fixed** via header banner (see FIXED). Deletion declined by owner; files behavior-identical, root active, zero runtime risk. |
| CR-2026-05-24-010 (tab-complete usage) | **Premise was wrong** — `tab-complete/route.ts:43-48` already gates via `checkMessageLimit` (402 before generating). Not a bug. |
| CR-2026-05-19-003 (model label always shown) | **A code change regresses it.** `@container` is on only one composer surface (`index.tsx:103`; `84`/`93` have none), so restoring `hidden @[260px]:inline` hides the label there. Current always-show + `truncate` + `title` works everywhere — the current code is correct. |
| `interactions/index.ts` optimistic-write rollback | **Disproportionate.** A try/catch is dead code (`action.run` can't throw for interactions; `code.write` swallows errors). The only real fix is a cross-cutting `action.run`/history contract change — for a low-traffic surface whose writes don't parse JSX and ~never fail. Accepted as-is. |
| `freestyle.ts:206` A-record diagnostic | **Cosmetic-only, no functional impact** (Freestyle does the real DNS verification). `getARecords` returns relative hosts, so a fix needs apex→FQDN construction that, done wrong, makes the troubleshooting string *worse*. Net-negative to change. |

### FIXED in this pass (re-review — promoted from deferred after confirming a safe fix)

| ID / item | Fix |
|-----------|-----|
| round-2 `copy/index.ts:97-107` paste null-`oid` | `paste()` now mirrors `copy()`'s `!oid` guard: bails if the primary selected element has no oid AND filters oid-less targets, so `InsertElementAction` never gets a malformed (null-oid) target. typecheck + lint clean (the lone `copy.ts` `\|\|` warning is pre-existing). |
| round-2 `copy/index.ts:139` clearClipboard wipes OS clipboard on duplicate | Added `copy(clearOsClipboard = true)`; `duplicate()` now calls `copy(false)` so an in-app duplicate (alt-drag / Cmd+D) no longer wipes the user's real OS clipboard. `copy()`/`cut()` keep the paste-isolation clear. typecheck exit 0. |
| CR-2026-05-19-004 mobile-menu sub-link lost `px-2` | Restored `px-2` on the accordion sub-link className (`mobile-menu.tsx:101`) — reverts to the documented prior visual rhythm. |
| CR-2026-05-18-001 duplicate workspace spec | Root `WORKSPACES.md` is byte-identical to `docs/specs/workspaces.md` (verified via `diff` — only line 1 differs). Marked the root copy **non-canonical** with a pointer banner to `docs/specs/`, eliminating the "which is source of truth" ambiguity without deleting the handoff artifact (the backlog asked not to remove it without owner confirm). |
| round-2 `branch` switchToBranch scanPages (stale Pages tree) | Made `scanPages()` **keep the last good tree on error** (removed `setPages([])` from the catch) so a failed scan can't blank the panel; then added `void pages.scanPages()` to `switchToBranch`. Worst case (sandbox not ready) = stale tree (= old behavior, not worse); normal case = correct tree. `_isScanning` already guards double-scan. typecheck + lint clean. |
| round-2 `action` return-in-loop (BOTH branches) | `insertElement`/`removeElement`/`moveElement`/`editText` did `return` (aborting the whole fan-out) on a missing frame view OR a failed op. Changed BOTH to `continue`: matches the validated `updateStyle` fix, and the backlog's own analysis confirms source is persisted (history.push→code.write) before dispatch so HMR reconciles each frame — a skipped/failed optimistic op is transient and self-heals, never aborts the others' previews. typecheck + lint clean. |
| sign-in `[[...rest]]` redirect loop | The `WEBLAB_AUTH_PROVIDER !== 'clerk'` branch did `redirect('/sign-in')` from `/sign-in` → infinite loop. The Supabase/`/login` surface it fell back to was deleted in the migration, so the branch now renders `<SignInClient>` (the only working auth) instead of looping. Dormant path (default `clerk`); production unaffected. typecheck + lint clean. |
| round-2 `frames` applyFrames prune (drops just-created frame) | Added a deterministic `_pendingCreateIds` set: `create()` registers the id, `applyFrames` skips pruning ids in the set, an id leaves the set the first time it appears in a poll, and `disposeFrame` clears it. **No timing window** — a just-created frame can't be pruned in the gap between the create mutation committing and the reactive `by_canvas` query reflecting it. typecheck + lint clean. |
| inline-edit client applies truncated/failed edit | `accept()` applied `session.preview` without checking state — a mid-stream failure leaves a truncated `preview` + an `error`, so the user could write a half-written edit into the file. Added a guard: `accept()` bails if `session.streaming \|\| session.error`; only a fully-streamed, error-free preview is applied. Complements the server-side refund (CR-2026-05-24-012). typecheck + lint clean. |
| CR-2026-05-24-009 duplicate `src/middleware.ts` (footgun) | Owner declined deletion, so the **ambiguity** (which file is active / drift risk) is resolved instead: added a header banner to `src/middleware.ts` marking it the non-active byte-identical duplicate of canonical root `middleware.ts`, with a "don't edit logic here, mirror root" note. Deletion remains the owner's call. |
| CR-2026-05-24-007 (`(internal as any)['lib/x']` casts) | **Fixed the `as any` half.** Verified `internal` is `FilterApi<typeof fullApi, …>` which NESTS the slash keys, so the typed form is dotted: `internal.internal.cascade.X` / `internal.lib.stripeWebhook.X` (resolves to the same runtime path). Stripped all 29 `(internal as any)['…']` casts → typed nested access across 9 convex files; removed 2 now-stale `eslint-disable no-explicit-any` directives; `eslint --fix` cleaned the resulting formatting. typecheck exit 0; zero net new lint warnings. The remaining `v.any()` validators are NOT a bug — they correctly type opaque JSON blobs (suggestions, message parts, runtime metadata) and are re-validated server-side where used in privileged paths. |

**Net:** 12 fixed this pass (FIXED table) + ~12 verified already-resolved/stale (RESOLVED table). Every other backlog item is in the RESOLVED (verified no-edit) table above, with evidence that no code change is the correct outcome. `bun typecheck` exit 0.

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
  flagged as migration-wide cleanup. **Status:** resolved — all 29 `(internal as any)['…']` casts replaced with typed nested access (`internal.internal.cascade.*`, `internal.lib.stripeWebhook.*`); stale eslint-disable directives removed; typecheck exit 0. Remaining `v.any()` validators are legitimate opaque-JSON typing, not a defect. See Triage 2026-05-24.

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
  **Area:** `apps/web/client/src/app/api/ai/inline-edit/route.ts`,
  `packages/ai/src/agents/inline-edit.ts`
  **Type:** billing · **Risk:** medium
  **Resolution (owner approved fix):** Usage was incremented up-front but only
  refunded in the synchronous `catch`; failures after `toTextStreamResponse()`
  returned (provider 5xx, network drop, client abort) left the user charged.
  Added an idempotent `refundOnce()` and threaded two lifecycle hooks through
  `createInlineEditStream`: `onError` (provider/network errors) and `onAbort`
  (client cancel — AI SDK v5.0.60 routes aborts to `onAbort`, NOT `onError`, so
  both are required). Each calls `refundOnce` → `decrementUsage`; the `refunded`
  guard prevents double-refund. Validated by `bun typecheck` (web-client exit 0)
  + lint. **Status:** resolved

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
  **Status:** resolved — root `WORKSPACES.md` marked non-canonical with a pointer to `docs/specs/workspaces.md` (Triage 2026-05-24). Content preserved; owner can delete the root copy later if the handoff artifact is no longer needed.

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
  **Status:** resolved — hook rewritten for Convex; no invalidation (auto-subscription). See Triage 2026-05-24.

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
  **Status:** resolved — restored `px-2` on the sub-link className (`mobile-menu.tsx:101`). Triage 2026-05-24.

- **ID:** CR-2026-05-19-005
  **Title:** `resolvePersonalWorkspaceId` race recovery assumes 23505 originates from slug uniqueness
  **Area/Scope:** `apps/web/client/src/server/api/routers/workspace/personal.ts`
  **Type:** bug (low-probability)
  **Impact:** internal
  **Risk:** low
  **Summary:** The catch branch treats any 23505 / "duplicate key" error as a slug race and re-fetches by `(createdByUserId, kind=PERSONAL)`. Today `workspaceMembers` insert uses `.onConflictDoNothing()`, so the only realistic 23505 source is `workspaces_slug_unique` — but a future schema change adding another unique constraint inside the same tx (e.g. an audit insert or a feature flag bootstrap) could silently fall into this path and return a wrong workspace id. The current code is correct given today's schema; the assumption is fragile.
  **Suggested approach:** Narrow the catch to the slug constraint specifically (e.g. `error.constraint === 'workspaces_slug_unique'` if the driver surfaces it, or check `error.message.includes('workspaces_slug_unique')`), and re-throw any other 23505 so the original error surfaces.
  **Status:** resolved (stale) — `workspace/personal.ts` deleted in the Convex migration. See Triage 2026-05-24.

- **ID:** CR-2026-05-19-006
  **Title:** `project.get` return shape now diverges from `Project` model — type leak through to clients
  **Area/Scope:** `apps/web/client/src/server/api/routers/project/project.ts` (`project.get` procedure)
  **Type:** refactor / DX
  **Impact:** internal
  **Risk:** low
  **Summary:** `fromDbProject(project)` is documented as stripping DB-only columns. The new return type spreads `workspaceId` and `accessMode` back on top, effectively re-exposing the columns it deliberately strips. Other read paths (`project.create` at L386, `project.duplicate` at L475) still return the stripped shape. Consumers reading `data.workspaceId` from `project.get` will be undefined on those other endpoints — easy footgun.
  **Suggested approach:** Either (a) add `workspaceId` + `accessMode` to the `Project` model itself (recommended if both fields are genuinely needed client-side), updating `fromDbProject` to keep them; or (b) name the new fields explicitly on `project.get`'s return type and document that this is the only endpoint exposing them. Today's inline spread hides the divergence at the type system.
  **Status:** resolved (stale) — `project/project.ts` deleted in the Convex migration. See Triage 2026-05-24.

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

### Auto-fixed (3 issues)
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
- ✅ **FIXED** `src/components/store/editor/action/index.ts:101` —
  **`updateStyle` aborted the whole multi-frame action on a missing frame.**
  The per-target loop did `return` (not `continue`) when `frames.get(frameId)`
  missed. Style actions fan out across sibling/responsive frames
  (`getUpdateStyleAction`), so if one frame wasn't booted the loop aborted:
  remaining frames got no style AND the `scheduleSourceRebase` loop at the end
  (the responsive/breakpoint source-persistence path) never ran for any oid.
  Changed `return` → `continue`, matching the adjacent `!frameData.view`
  branch. lint clean.
- ✅ **FIXED** `src/components/store/editor/action/index.ts:31-48` +
  `history/index.ts:155-187` — **symmetric undo/redo write-failure desync.**
  `history.undo()`/`redo()` moved the action between stacks BEFORE the caller's
  inverse write ran; a failed write left the stacks desynced from the files.
  `undo`/`redo` now return the moved entries (`{ inverse, redoEntry }` /
  `{ forward, redoEntry }`); `action.undo`/`redo` check the `code.write`
  boolean and call new `rollbackUndo`/`rollbackRedo` (by-reference stack
  reversal, same pattern as the push fix) when it fails. Happy path is a
  mechanical equivalent (writes the same action, identical stack state);
  rollback runs ONLY on write failure — a path that previously always
  desynced. typecheck + lint clean.

### Needs human review (1 issue)
- `src/components/store/editor/action/index.ts:31-46` — **undo/redo apply
  asymmetry.** RE-CLASSIFIED AS BY-DESIGN (not a correctness bug): `run()`
  `dispatch()`es to the live DOM as an *optimization* — the code's own comment
  ("Disabling real-time insert since this is buggy. Will still work but not as
  fast") confirms HMR is the source of truth and dispatch is just for instant
  feedback. So `undo`/`redo` updating the canvas via HMR-only is consistent
  with the system design — slower than forward edits, but correct. Adding a
  blanket `dispatch` to undo/redo risks the documented double-apply. Leave as
  perf-only; only revisit if undo latency becomes a real complaint.
- `src/components/store/editor/action/index.ts:212,234,255,271` —
  **same `return`-in-loop pattern in `insertElement`/`removeElement`/
  `moveElement`/`editText` dispatch.** Each per-target loop `return`s on a
  missing frame/view or a failed op result. IF these actions fan out across
  sibling/responsive frames the way `updateStyle` does, a missing frame aborts
  the optimistic update for the remaining frames. LOWER impact than the fixed
  `updateStyle` case: for these, source persistence happens in
  `history.push`→`code.write` BEFORE dispatch, so source is already written and
  HMR reconciles the other frames — only the instant optimistic preview is
  incomplete. NOT changed here because (a) the abort-on-`!result` may be
  intentional to avoid partial multi-frame state, and (b) I couldn't verify
  their fan-out semantics without a running editor. Review whether these should
  `continue` (like `updateStyle` now does) for the missing-frame branch.

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

## Bug Hunt — 2026-05-24 (editor-store deep scan, round 2)

Scanned element/text/move/copy/group, frames/branch/pages/sandbox, and
comment/interactions/font/image/CMS stores via 3 parallel read-only agents for
the silent-skip / swallowed-error / missing-await / data-loss classes.
`bun typecheck` exit 0 after all fixes; changed files added zero net lint
warnings (residual warnings confirmed pre-existing at HEAD).

### Auto-fixed (5 issues)
- ✅ **FIXED (BLOCKER — data integrity)** `frames/manager.ts:357` +
  `branch/manager.ts:374` — **deleting a branch orphaned its frames in the DB.**
  `frames.delete()` guarded on `!frameData?.view`, but frames of a non-active
  branch are never mounted (`view` stays null), so `removeBranch`'s bulk delete
  silently skipped the Convex `frames.remove` mutation for every frame —
  orphaning the rows, which then reappeared on the next bootstrap poll. Changed
  the guard to existence (`!frameData`); the delete path (Convex mutation +
  `disposeFrame` + `repackGroup`) is fully view-independent, verified. Also
  changed `removeBranch` to `await Promise.all(...)` the deletes so they finish
  before the branch's code editor / sandbox are torn down. typecheck + lint clean.
- ✅ **FIXED (MAJOR — data loss)** `cms-workspace/item-editor.tsx:551` — **CMS
  JSON fields (IMAGE/OPTION/REFERENCE) dropped the last edit on Save.**
  `JsonFieldInput` committed to parent state only on blur; clicking Save blurred
  the field but read `values` from a render that predated the blur's `setValues`,
  persisting the stale value. Now live-commits valid JSON on change (mirrors the
  blur path: commit + sync `lastExternalValueRef` so the value-sync effect can't
  reset the caret) — eliminates the blur→click race entirely. Parse errors still
  only surface on blur. typecheck + lint clean.
- ✅ **FIXED** `comment/index.ts:146` — comment mutations (update/delete/resolve/
  reply) refresh the UI via `if (this.currentProjectId) loadComments(...)`, but
  `currentProjectId` was set only in `startPolling`. If polling never started
  (comments briefly unavailable on boot), mutations succeeded server-side but the
  local list never re-fetched. Now set in `init()` too (startPolling re-assigns
  the same value — can't regress).
- ✅ **FIXED (x2)** `convex/branchActions.ts:96,166` — fork/createBlank
  orphan-sandbox rollback shutdown swallowed errors with `.catch(() => undefined)`,
  so a failed shutdown leaked a billable sandbox with zero logging. Now logs the
  failure with the sandbox id for diagnosability. (No behavior change to the
  happy path; only adds logging.)

### Needs human review (5 issues — RISKY, need a running editor to verify)
- `frames/manager.ts:119-139` — `applyFrames` prune can drop a just-created
  frame (view still null) if a bootstrap poll lands between the create mutation
  commit and the row appearing in the reactive `by_canvas` query. MEDIUM. Needs a
  "recently created, not yet confirmed" grace set; verify Convex reactive read
  ordering first.
- `branch/manager.ts:165-170` — `switchToBranch` doesn't trigger
  `pages.scanPages()`, so the Pages panel shows the previous branch's tree after a
  switch. MEDIUM. Add a rescan on branch change; verify no double-scan during init.
- `convex/branches.ts:224` — `_insertBranchWithFrames` gates frame creation on
  `args.framePosition`; a blank branch created with no active frame (client leaves
  `framePosition` undefined) gets ZERO frames → empty unusable branch. MEDIUM.
  Needs a default `framePosition` fallback when a canvas exists (product decision).
- `copy/index.ts:139` — `duplicate()` → `copy()` calls `clearClipboard()` which
  writes `''` to the OS clipboard; in-app duplicate works, but a user's external
  clipboard contents are wiped by alt-drag duplicate. MEDIUM. Verify whether the
  OS-clipboard clear is intentional before changing.
- `copy/index.ts:97-107` — `paste()` builds targets with `oid` that may be null
  (unlike `copy()` which guards `!oid`); a paste onto a selection containing an
  element without an oid may produce a malformed insert. MEDIUM. Verify the insert
  action runner's null-oid handling.

## Bug Hunt — 2026-05-24 (publish + AI-routes scan, round 3)

Scanned the publish/deploy/custom-domain flow and all AI API routes via 2
parallel read-only agents. `bun typecheck` (web-client) exit 0 after fixes;
changed files added zero net lint warnings.

### Auto-fixed (2 issues)
- ✅ **FIXED (MAJOR)** `settings-modal/domain/custom/use-domain-verification.tsx:108`
  — **custom-domain setup dead-ended on the first error.** `createVerificationRequest`'s
  catch set `error` but never reset `verificationState` from `CREATING_VERIFICATION`
  back to `INPUTTING_DOMAIN`. The domain input gates `disabled` on
  `state !== INPUTTING_DOMAIN`, so any thrown error (Freestyle API error, invalid
  domain, network blip) left the input permanently disabled — the user couldn't
  retry without closing/reopening settings. Added the reset in the catch (matches
  the `!verificationRequest` branch + the other reset sites).
- ✅ **FIXED (MAJOR — billing)** `api/ai/inline-edit/route.ts:142` +
  `packages/ai/src/agents/inline-edit.ts:46,98` — **inline edits charged a credit
  on mid-stream failure.** The stream is returned lazily, so a provider 5xx /
  network drop / abort fires AFTER the route's try/catch exits — `decrementUsage`
  never ran and the user lost a credit for a failed edit (chat refunds this via
  `onError`; inline-edit had no equivalent). Added an optional `onError` passthrough
  to `createInlineEditStream` (additive — its single caller is this route) wired to
  `streamText`'s `onError`, and a `refundOnce` guard in the route that refunds on
  both the sync catch and the async stream error. Zero-downside: if `onError`
  doesn't fire as expected at runtime, behavior is exactly today's (never refunds).
  web-client typecheck exit 0.

### Needs human review (3 issues — RISKY / need runtime or infra)
- `convex/deployments.ts:162` + `convex/crons.ts` — a publish action killed before
  writing a terminal status (Convex 10-min action timeout — documented inline at
  `publishActions.run:26`, OOM, infra restart) leaves an `in_progress` row forever;
  `assertNoInflight` then permanently rejects every future publish/retry for that
  project+type, and the publish button shows a perpetual "Publishing" spinner. Only
  manual Cancel recovers it. MEDIUM. Fix: a cron/reaper that flips stale
  `in_progress` rows (> ~10 min) to `failed`, or a TTL check in `assertNoInflight`.
- `api/ai/inline-edit/route.ts` (client side) — even with the refund fix above, a
  mid-stream failure still ends the text stream with no error frame (the route uses
  `toTextStreamResponse`, which has no `onError` to inject one), so the client gets
  a truncated/empty body and may apply a half-written edit. MEDIUM. Needs client-side
  truncation/error handling or a protocol that can carry a terminal error.
- `convex/lib/freestyle.ts:206` — `buildFailureReason` resolves `fullDomain` for
  every A record even when a record targets `www`/a subdomain, so the DNS
  troubleshooting text can misreport "A Record Missing". Diagnostic-only (Freestyle
  does the real verification). MINOR.

## Bug Hunt — 2026-05-24 (auth/billing + canvas/members scan, round 4)

Scanned sign-in/auth UX, settings/billing/checkout, and the canvas/overlay/
selection layer + members/invitations via 2 parallel read-only agents.
web-client typecheck exit 0; changed files added zero net lint warnings.

### Auto-fixed (4 issues)
- ✅ **FIXED (MAJOR — money flow)** `pricing-modal/pro-card.tsx:144` — checkout
  did `window.open(session.url, '_blank')` then unconditionally flipped to
  "checking payment". `window.open` returns null when the popup is blocked (no
  throw), so a blocked popup left the UI hung forever waiting for a checkout the
  user never saw. Now checks the handle and toasts "Allow pop-ups… and try again"
  instead of hanging.
- ✅ **FIXED** `canvas/overlay/elements/rect/resize.tsx:434,482` — resize
  `onMouseUp` did `document.body.removeChild(captureOverlay)`, which throws
  `NotFoundError` if the node was already detached (double-fire / unmount race) —
  and at :482 that throw was BEFORE `history.commitTransaction()`, stranding an
  open transaction. Switched to `captureOverlay.remove()` (no-op when detached).
- ✅ **FIXED** `sign-in/verify/page.tsx:230` — "Resend code" started a new
  countdown `setInterval` without clearing the existing one, orphaning a timer
  that decremented the cooldown in parallel (ran ~2× fast). Clear the prior
  interval before reassigning.
- (the 4th of this round is the checkout/resize/resend trio above plus the
  domain-verification fix recorded in round 3 — see round 3.)

### Auto-fixed (round 5 — promoted from "needs review" after re-assessing as statically fixable)
- ✅ **FIXED (MAJOR)** `sign-in/sso-callback/page.tsx:12` — OAuth deep-link
  sign-ins lost their returnUrl. Changed `signInForceRedirectUrl` →
  `signInFallbackRedirectUrl` so the per-flow `redirectUrlComplete` (the
  returnUrl, always set by `handleOAuth`) wins on sign-in; kept
  `signUpForceRedirectUrl="/profile-setup"` so new OAuth users still get setup.
  Zero-downside: sign-in honors returnUrl or falls back to /projects (= old
  behavior when no returnUrl); sign-up unchanged. typecheck exit 0.
- ✅ **FIXED (MAJOR)** `convex/deployments.ts:162` — a publish action killed
  before writing a terminal status used to wedge the project's publishing
  forever (`assertNoInflight` blocked every retry). Added a 15-min TTL: rows
  older than `STALE_DEPLOYMENT_MS` no longer block a fresh deploy (comfortably
  past the ~10-min action timeout, so a slow-but-live build isn't pre-empted).
  Pure logic — no cron needed; only changes the already-stuck case.
- ✅ **FIXED (MAJOR)** `convex/branches.ts:224` — a blank branch created with no
  active source frame (client omits `framePosition`) was created with ZERO
  frames → empty unusable branch. Now defaults `framePosition` to the canvas
  origin so a branch always gets its default Desktop/Tablet/Phone frames; when
  `framePosition` IS provided, behavior is unchanged (offset right of source).
- ✅ **FIXED (MAJOR)** `canvas/overlay/elements/rect/resize.tsx` — resize
  attached `document` listeners + a full-screen capture overlay with teardown
  ONLY in `onMouseUp`; unmount mid-drag (deselect/delete/breakpoint-switch) left
  an orphaned `zIndex:9999` overlay that froze the whole canvas. Added an
  `activeResizeCleanupRef` + a mount-only `useEffect` cleanup that tears down the
  listeners + overlay and closes the open history transaction on unmount.
  `onMouseUp` clears the ref so a completed resize is a no-op on later unmount.
  Additive — the normal resize path is unchanged. typecheck + lint clean (net
  zero new warnings vs HEAD).

### Needs human review (2 issues)
- `sign-in/[[...rest]]/page.tsx:44` + `sign-up/[[...rest]]/page.tsx` — the
  `WEBLAB_AUTH_PROVIDER !== 'clerk'` rollback branch now `redirect('/sign-in')`,
  but this IS the /sign-in route → infinite redirect loop in Supabase-rollback
  mode (the legacy `/login` was deleted in the migration). DORMANT (default is
  'clerk', production unaffected). Needs a PRODUCT decision: the Supabase
  rollback lever is dead now (no Supabase surface), so either remove the branch
  or render the Clerk form instead of redirecting. Not fixed because the right
  call is "is this lever still wanted?", not a mechanical edit. MAJOR-if-triggered
  / dormant.
- `interactions/index.ts:193-238` + `action/index.ts` — `addInteraction`/
  `updateInteraction`/`removeInteraction` mutate `_doc` + flush + push to iframes
  before `await action.run(...)`, with no rollback. A naive try/catch here would
  be DEAD CODE: `action.run` for interactions can't throw — `code.write` now
  returns a boolean (swallows its own errors) and dispatch is a no-op for
  interaction types. The proper fix is to have `action.run` surface the
  `code.write` success boolean (a broader action/history contract change) and
  roll back the optimistic mutation when it reports failure. MINOR (newer,
  low-traffic surface; interaction writes rarely fail since they don't parse/edit
  JSX). Deliberately left rather than adding ineffective try/catch theater.

## Bug Hunt + Security Review — 2026-05-24 (pass 4: AI chat optimization surface)

Scope: untracked AI-chat optimization files (`apps/web/client/src/app/admin/`,
`apps/web/client/src/app/api/chat/summarize/`, `apps/web/client/convex/aiUsageEvents.ts`,
`packages/ai/src/chat/{model-router,request-builder,summarizer,summarizer-utils}.ts`,
`packages/ai/src/observability/`, `packages/ai/src/prompt/cache-blocks.ts`,
`apps/web/client/src/app/project/[id]/_hooks/use-chat/use-summarizer.ts`)
plus the pass-3 modified files. Read `docs/agent-memory/backend-migration-audit.md`
to avoid re-flagging pass-1/2/3 fixes. `bun typecheck` exits 0; touched files
lint-clean.

### Auto-fixed (6 issues)

- `apps/web/client/src/app/api/chat/summarize/route.ts` — **CRITICAL credit-burn
  vulnerability**: new background-summarize route had no conversation
  ownership check before the OpenRouter call and no caps on `messages` array
  size. Added (a) `fetchQuery(api.conversations.get)` ownership gate BEFORE
  `summarizeConversation` (`requireCap('project.view')` throws → 403),
  (b) caps: `MAX_MESSAGES=200`, `MAX_MESSAGE_BYTES=16KB`, `MAX_TOTAL_BYTES=1MB`.
  Reused the same Convex token for both the ownership check and the
  follow-up `setSummary` mutation.
- `apps/web/client/src/app/admin/layout.tsx` (NEW) — **MEDIUM defense-in-depth
  gap**: `/admin/usage` had no server-side auth gate. Convex queries already
  reject non-admins, but the route shell + telemetry column names were
  publicly enumerable. New server-component layout calls
  `fetchQuery(api.aiUsageEvents.amIAdmin)` with Clerk token and returns
  `notFound()` for non-admins so the surface is invisible.
- `apps/web/client/convex/utils.ts` — **MEDIUM SSRF guard expansion**:
  `assertSafeHttpUrl` now rejects (a) `0.0.0.0`, (b) IPv6 ULA (`fc..`/`fd..`),
  link-local (`fe8`-`feb`), AWS metadata (`fd00:ec2::`), IPv4-mapped IPv6
  (`::ffff:`), and (c) cloud-metadata hostnames (`metadata.google.internal`,
  `metadata.azure.com`). Also rejects obfuscated IPv4 (hex `0x...`,
  octal `0...`, decimal-int `2130706433`). Firecrawl egress hardening is
  still the primary control; this layer is no longer paper-thin.
- `apps/web/client/convex/branches.ts::_getBranchWithFrames` — changed
  `internalMutation` → `internalQuery`. Read-only handler should not pay
  OCC retry cost. Updated `branchActions.fork` caller from `runMutation` to
  `runQuery`.
- `apps/web/client/convex/usage.ts::revertIncrement` — fixed misleading
  return value. `refunded` is now `true` only when a rateLimit credit was
  actually restored; free-tier records and rolled-over Pro records return
  `false`. Record deletion still happens (idempotency).
- `apps/web/client/src/app/project/[id]/_hooks/use-chat/use-summarizer.ts` —
  **MEDIUM stuck-summarizer race**: switching conversations mid-summarize
  left the boolean `inFlightRef` set, so the new conversation's effect saw
  `true` and bailed; nothing re-fires the effect after the old fetch's
  `finally` clears it. Scoped `inFlightRef` to the conversationId
  (`useRef<string | null>`); only blocks if THIS conversation has an
  in-flight summarize. Also reset `lastTriggeredCountRef` in the effect
  cleanup so the next mount can retry without waiting for `messageCount`
  to bump.

### Needs human review (4 issues)

- `apps/web/client/src/app/project/[id]/_hooks/use-chat/use-summarizer.ts:104`
  + `index.tsx:206` — `model: AUTO_MODEL_ID` ('auto') flows into
  `getMaxTokens('auto')` which falls through to `OLLAMA_DEFAULT_MAX_TOKENS = 32768`.
  With `SUMMARIZE_THRESHOLD_RATIO = 0.5`, summarization fires at ~16k input
  tokens, but the real resolved Auto model (Gemini / Sonnet / Kimi) has 1M+
  window. Aggressive premature summarization for all Auto users (the
  default). Fix: add `[AUTO_MODEL_ID]: 1_000_000` to `MODEL_MAX_TOKENS` OR
  resolve `'auto'` to the largest plausible model id before threshold math.
- `packages/ai/src/chat/summarizer.ts:49-97` + `convex/chatActions.ts:64-105` —
  `summarizeConversation`, `generateTitle`, `generateSuggestions` LLM calls
  bypass `trackAIUsage`. Admin dashboard underreports OpenRouter spend by
  these three sources; cost-per-user attribution + cache-hit ratio are
  skewed. Fix: wrap each call site with `buildUsageEvent`/`trackAIUsage`
  with `chatType: 'summarize'|'title'|'suggestion'`.
- `apps/web/client/src/app/api/chat/route.ts:127-204` — `ChatRequestBodySchema`
  has no cap on `messages.length` or per-message bytes. A PRO user can pump
  200k-token requests against a 1-credit cost. Add `.max(200)` on `messages`
  + total-byte cap (~1 MB) matching the pattern in summarize/route.ts.
- `packages/ai/src/observability/index.ts:164-169` — `cacheHitRatio` denominator
  assumes `usage.inputTokens` excludes cached portion. Holds for Anthropic via
  OpenRouter today; fragile if SDK contract changes. Add a runtime assert in
  dev mode or document the assumption inline.

### Verified NOT real
- `aiUsageEvents.insert` accepting client-supplied cost — cap check enforces
  `caller._id === args.userId` and the data is per-user (no cross-tenant
  exposure). Data-integrity concern only, out of scope.
- Convex `internal.internal.cascade.X` / `internal.lib.stripeWebhook.X` dot
  notation — verified valid in Convex's `ApiForModule` type (unfolds
  slash-separated module paths). Linter-applied cleanup is correct.

## Bug Hunt — HTML Website Feature — 2026-05-24

Scope: HTML website creation, import, and editing pipeline.
Files scanned: `import/local/_components/select-folder.tsx`, `_context/index.tsx`,
`packages/parser/src/pipelines/html/index.ts`, `use-create-blank-project.ts`,
`packages/framework/src/adapters/static-html.ts`, `template-data.ts`.

### Auto-fixed (already in committed code — verified present in HEAD)

- `select-folder.tsx:188-193` — `extractProjectName` returned null for HTML projects
  (no package.json), hard-blocking the import at folder selection with "No project
  name found". Fixed: falls back to folder name then 'New Project'. Confirmed in HEAD.
- `select-folder.tsx:234` — `readDirectory` Promise had no reject path and `readEntries`
  had no error callback; directory read errors caused the Promise to hang forever and
  freeze the import UI. Fixed: added `(resolve, reject)` + `reject` as error callback to
  `readEntries`. Confirmed in HEAD.

### Needs human review

- `_context/index.tsx:143` — **No UX guard before import stub.** All sandbox methods
  (`forkSandbox`, `startOrphanSandbox`, `orphanBulkUpload`) throw immediately. Users
  click through the full wizard → reach Finalizing → get a generic "Failed to create
  project" error with no explanation or guidance. Fix: disable the local import route
  or show a "coming soon" banner before the wizard starts. TODO comment added at line 143.
  - Risk: user-facing — confusing and dead-end flow for any user who tries local import.

- `_context/index.tsx:199-200` — **Stale closure validation bug.** `autoDetectFramework`
  calls `setFramework(detected)` (async React state update), but `validateNextJsProject`
  immediately after reads the old `framework` closure value from the current render pass.
  Validation runs against the wrong adapter even when detection succeeds.
  - Example: HTML folder uploaded → detected as 'static-html' → `setFramework('static-html')`
    queued → `validateNextJsProject` reads old `framework = 'nextjs'` → fails with wrong
    adapter error.
  - Suggested fix: return detected `FrameworkId | null` from `autoDetectFramework`, pass
    as optional `frameworkOverride` to `validateNextJsProject`.
  - Risk: medium — validation shows wrong error for non-nextjs projects even after correct detection.

- `template-data.ts:75` — **Wrong GitHub fallback repo.** `repoUrl` for `static-html-starter`
  points to `h5bp/html5-boilerplate` (external third-party). If CSB fork fails, the GitHub
  fallback imports an unrelated project silently.
  - Risk: low (fallback path only fires if CSB is down), confusing if triggered.

- `packages/parser/src/pipelines/html/index.ts:340-352` — **Image operations throw
  unhandled in editor.** INSERT_IMAGE/REMOVE_IMAGE throw explicitly. The error propagates
  to the editor's code-write pipeline — confirm there is a try/catch at the call site
  that surfaces this as a user-visible error message rather than a console crash.
  - Risk: medium — if uncaught, silently fails or crashes the editor action dispatcher.

## Bug Hunt — 2026-05-26 (F-170..F-779 scope, 88 changed source files)

Range F-1182 in goal does not exist; catalog max is F-779. Scoped to intersection
of "changed files" + range = 88 .ts/.tsx files. Four parallel scanners.

### Auto-fixed (committed in this pass)

- `apps/web/client/src/app/api/chat/route.ts:458-481` — `messageMetadata` callback set
  `createdAt: new Date()` on every emitted UI part. Persisted message `createdAt`
  became the LAST delta's timestamp, not message start. **Fix:** hoist `messageCreatedAt`
  outside the callback.
- `apps/web/client/src/app/api/chat/route.ts:518` — `void built.finalizeUsage(...)` inside
  `onFinish` — Next.js Node runtime can freeze the request once the stream closes, dropping
  the Convex `aiUsageEvents.insert` silently. **Fix:** changed to `await`.
- `apps/web/client/src/app/project/[id]/_components/canvas/index.tsx:165-169` — Zoom drift:
  scale was assigned to clamped value BEFORE the out-of-range early return, so position
  failed to track. **Fix:** allow scale update unless already at the boundary; tightened
  condition.
- `apps/web/client/src/components/store/editor/comment/index.ts:343, 358, 390, 403, 417, 430`
  — `createComment`, `updateComment`, `resolveComment`, `unresolveComment`, `createReply`,
  `deleteReply` swallowed errors with only `console.error`, letting the popover show
  success when the mutation actually failed. **Fix:** rethrow inside catch blocks.
- `apps/web/client/src/app/project/[id]/_components/canvas/overlay/comment-popover.tsx:288-303`
  — `unresolveComment` / `resolveComment` were called without `void` or `.catch`,
  becoming unhandled rejections once the store rethrows. **Fix:** chained `.catch` with
  toast error.
- `apps/web/client/src/app/project/[id]/_components/canvas/hotkeys/index.tsx:394-401` —
  Space-key PAN re-fired `setEditorMode(PAN)` on every keyboard-repeat tick while held,
  causing needless MobX re-renders. **Fix:** guard `if (editorMode === PAN) return`.
- `apps/web/client/src/app/_components/promo-banner/index.tsx:74` — `locale ?? 'en'`
  did not fall through for empty-string locales. **Fix:** `locale || 'en'`.
- `apps/web/client/src/components/ui/settings-modal/versions/version-row.tsx:107-112` —
  `finishRenaming()` dropped the async return of `updateCommitDisplayName(...)`. Errors
  escaped as unhandled rejections. **Fix:** `void ... .catch(console.error)`.
- `apps/web/client/src/app/projects/_components/settings/delete-project.tsx:30-46` —
  No double-click guard on destructive action. **Fix:** `isDeleting` state +
  `disabled` on Button.
- `apps/web/client/src/app/projects/_components/settings/create-template.tsx:14-40` —
  Same double-click hazard on the template toggle. **Fix:** `isPending` state +
  `disabled` on `DropdownMenuItem`.
- `apps/web/client/src/app/projects/import/local/_components/verify-project.tsx:22-32`
  — Unguarded async setState race: rapid `projectData` updates could let stale
  validation overwrite fresh result; also `setState` after unmount. **Fix:** `cancelled`
  flag in useEffect with cleanup.
- `apps/web/client/src/components/store/editor/chat/conversation.ts:204-234` — `generateTitle`
  did not wrap the Convex action in try/catch; thrown action errors became unhandled
  rejections from `void` callers. **Fix:** try/catch around the action call.

### Second-pass FIXED (verify-each + bounded fix loop)

- `apps/web/client/src/app/api/chat/route.ts:333` — **Client-controlled traceId.**
  Switched to always server-generated `uuidv4()`. Removes the cross-tenant trace-id
  collision risk in Langfuse + Convex usage events.
- `apps/web/client/src/app/api/chat/route.ts:483-497` — **`responseHasContent`
  mis-detected tool errors as content.** Tightened to
  `p.type.startsWith('tool-') && !p.type.endsWith('-error')` so error-only streams
  refund correctly.
- `apps/web/client/src/app/project/[id]/_components/canvas/frame/index.tsx:478-490`
  — **`activeBranch` getter could throw uncaught.** Added `hasActiveBranch` guard +
  toast; switched to local `sandboxId` capture + optional chain for legacy data.
- `apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/branches-tab/branch-management.tsx:74-117`
  — **switch-then-delete had no rollback.** Reordered to delete first; switch only on
  success. Pre-computed switch target before mutating any state.
- `apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v4/controls/text-field.tsx:30-95`
  — **Blur stomped external value when user didn't type.** Added `userTouchedRef`
  toggled on focus/onChange — onBlur only commits when the user actually edited;
  otherwise resyncs draft to current `value`. Same gate on Enter.

### Verified NOT bugs (skipped after read-through)

- `apps/web/client/src/app/_components/hero-v2.tsx:191` — `calc(100cqw / 1280px)` is
  valid CSS (length / length → unitless number per CSS Values 4 + container queries).
  Works in modern browsers.
- `apps/web/client/src/app/_components/landing-page/design-mockup/design-mockup.tsx:220-222`
  — Outer parent (line 217) carries `border` width class; accent branch only adds
  color. Not missing.
- `apps/web/client/src/app/pricing/page.tsx:99-101` — All 9 `HIGHLIGHTED_FEATURES.icon`
  keys exist in `Icons`. Type-cast is permissive but runtime crash impossible today.
- `apps/web/client/src/components/ui/button.tsx:63` — `Slot.Root` from `radix-ui`
  umbrella works (dep installed; same API as `@radix-ui/react-slot` Slot). Style drift
  vs canonical, not bug.
- `packages/ui/src/components/select.tsx:71` — Standard shadcn Viewport pattern;
  Content's `max-h-(--radix-select-content-available-height) overflow-y-auto`
  handles scroll. Not a bug.
- `packages/parser/src/code-edit/helpers.ts:8-23` — `getOidFromJsxElement` only sees
  StringLiteral form because the editor never emits the JSXExpressionContainer
  variant. Latent, not reachable.
- `apps/web/client/src/components/clerk-convex-providers.tsx:48` — Module-level
  singleton is intentional per the file's own comment; `useMemo` was explicitly
  rejected. HMR concern is dev-only theoretical.
- `apps/web/client/src/lib/sandbox-server-client.ts:67-69` — Server has no transformer
  configured (sandbox router uses plain z.string passthrough); `transformer: undefined`
  is correct for the current wire format.

### Remaining backlog (architectural / latent — NOT user-blocking)

- `apps/web/client/convex/users.ts:69-79` — `updateProfile` cannot clear a name once
  set (validator forbids null, `??` keeps stale). Requires schema-validator widen.
  TODO comment inline.
- `apps/web/client/src/components/store/editor/branch/manager.ts:62-67` — `void
  codeEditor.cleanup()` fire-and-forget can race a fresh `init()` on the same ZenFS
  path. Architectural — would need cleanup serialization.
- `apps/web/client/src/components/store/editor/branch/manager.ts:373-407` — `removeBranch`
  silently aborts mid-teardown if any inner mutation throws; branchMap stays
  inconsistent. Refactor to wrap teardown in try/finally.
- `apps/web/client/src/app/project/[id]/_components/canvas/index.tsx:281-312` —
  `handleGlobalMouseUp` re-registers on every `dragSelectEnd` tick (~60Hz). Perf —
  refactor to read via ref.
- `apps/web/client/src/app/project/[id]/_components/canvas/index.tsx:112-138` —
  `useCallback(throttle(...), deps)` creates a fresh `throttle` per dep change;
  previous trailing-call escapes the cleanup. Theoretical race.
- `apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v4/controls/number-field.tsx:111-127`
  — `nudge` reads `draft` from closure; rapid ArrowUp under React batching could
  compute from stale draft. Theoretical — browsers throttle key-repeat to ~30-50ms.
- `apps/web/client/src/app/project/[id]/_components/top-bar/publish/deploy-history-dialog.tsx:71-88`
  — `handleRedeploy` chains two actions; second-action failure leaves the row in
  PENDING with no rollback. Recovery path needed.
- `packages/ai/src/agents/root.ts:99-111` — `system: systemPromptFromArgs as unknown
  as string` — legacy `AnthropicSystemContentBlock[]` callers risk `"[object Object]"`
  coercion. Production path passes a string so prod is safe.
- `packages/ai/src/observability/index.ts:165-169` — `cacheHitRatio` denominator is
  `read + create + input`; canonical Anthropic ratio is `read / (read + input)`.
  Analytics-only.
- `packages/ai/src/chat/model-router.ts:178` — Premium safety-net downgrade returns
  `defaultFor(chatType)` without re-checking premium guard; latent regression if a
  future `DEFAULTS` row maps a chat type to a premium model.
- `apps/web/client/src/components/store/editor/comment/index.ts:117-119` —
  `isConvexPermissionError` matches `\b(UNAUTHORIZED|FORBIDDEN)\b` against arbitrary
  message text; legitimate user content mentioning those words could disable polling.
  Low-risk.
- `apps/web/client/src/app/project/[id]/_components/cms-workspace/data-pusher.tsx:174-187`
  — Identical-deps useEffect pair tears down + recreates the 2s pusher interval on
  every snapshot/page change. Perf, not correctness.

## 2026-05-26 — F-080 … F-093 validation pass (Auth, Onboarding & Callbacks)

Surface: `docs/feature-catalog.md` Section 3. Goal: validate all 14 rows via
`docs/prompts/validate-feature.md`. Code-level (typecheck + lint) and frontend
(preview snapshots / network / console) ran against an unauth session. Three
issues fixed inline (F-088, F-089, F-091) plus a server-side gate added for
F-087 — see commits. Below are issues that are too large or out-of-scope to
fix in the same pass.

### Remaining backlog (validation pass)

- **Dual `sanitizeReturnUrl` implementations across the repo.** Two functions,
  same name, different semantics:
  - `apps/web/client/src/utils/auth/sanitize-return-url.ts` — returns
    `string | null` (null on unsafe). Used by `/sign-in` page + `getCurrentUser`.
  - `apps/web/client/src/utils/url/index.ts` — returns `string` (never null;
    falls back to `Routes.HOME`). Used by `/sign-in/verify`,
    `/profile-setup`, `/auth/redirect`.
  Every caller handles the right shape today, but the parallel APIs are a
  footgun: a future caller can easily import the wrong one and silently get
  `Routes.HOME` when expecting `null`. Consolidate behind a single helper
  with explicit `{ defaultTo: 'home' | null }`. Touches ~6 files including
  callers; needs careful test pass per call site.
- **T-080 … T-090 automated coverage gap.** All 14 features in catalog
  section 3 have `[ ]` (unimplemented) test rows in `docs/test-plan.md`. No
  Bun/Playwright tests exist for any of: returnUrl sanitization
  (cross-implementation), Clerk OTP send/verify, SSO callback,
  `/sign-up → /sign-in` redirect, `/auth/redirect` open-redirect rejection,
  `/auth/auth-code-error` reason-key resolution, profile-setup
  `deriveNameFromEmail` + display-name-equals-email sentinel, Stripe
  success/cancel screens, invitation accept/decline. Estimated: 4–6 unit
  tests (pure helpers) + ~6 Playwright/Vitest E2E once an auth fixture
  exists. Out-of-scope for one validation pass; track as its own initiative.
- **No seeded auth fixture for E2E.** Phase 3 frontend validation could only
  exercise unauthenticated branches of F-087 (now redirects to /sign-in),
  F-088 (always error), F-089 (success path), F-092 + F-093
  (accept-invitation paths). The success branches need a signed-in browser
  session with Clerk + Convex auth. Add a Playwright fixture that seeds a
  test Clerk user + Convex `users` row, then re-validate.
- **`#auth-gated` semantics across the catalog.** The tag previously read as
  "middleware-gated" but several rows (F-087, F-100, etc.) are gated only
  via layout-level `getCurrentUser()` or Convex query null-checks. Worth a
  taxonomy pass: introduce `#auth-required` (middleware-protected) vs
  `#auth-aware` (page reads identity but renders for both) so future
  validation runs don't surface false positives. Doc-only change.

<!-- Stale "Reported" sub-section consolidated into the verdicts above
(Second-pass FIXED / Verified NOT bugs / Remaining backlog) on 2026-05-26. -->

---

## Bug Hunt — 2026-05-26 (F-200..F-209 Editor Top Bar)

Scope: 10 features in catalog section 8 (Editor Top Bar). Code-level pass
clean (typecheck ✓, lint = 0 errors / baseline warnings unchanged). Frontend
phase blocked at sign-in — see Manual steps below.

### Auto-fixed (2)

- `apps/web/client/src/app/project/[id]/_components/top-bar/publish/dropdown/preview-domain-section.tsx:81`
  — `publish()` floating promise in `retry()`. Rejection silently dropped.
  Fix: `void publish();` (matches the existing `void publish()` call at :176).
- `apps/web/client/src/app/project/[id]/_components/top-bar/publish/dropdown/loading.tsx:22`
  — Enum compared to string literal: `type === 'preview'`. `type` is
  `DeploymentType` enum; literal compare drifts if the enum value changes.
  Fix: import `DeploymentType` as value (was type-only) and compare against
  `DeploymentType.PREVIEW`.

### FIXED in follow-up pass — 2026-05-27 (flow-breakers)

- `branch.tsx:27` — Added `toast.error('Failed to switch branch', { description })`
  alongside the `console.error`, so a failed branch switch surfaces to the
  user instead of silently leaving the dropdown open.
- `diff/diff-modal.tsx:62` — Introduced `sandboxReady = gitManager !== undefined`
  and a new `Waiting for sandbox…` branch above the existing empty/loading
  branches. Pre-sandbox-ready state no longer falsely reads "All changes
  saved".
- `publish/deploy-history-dialog.tsx:108` — Added `UNKNOWN_STATUS_PILL`
  neutral fallback; `STATUS_PILL[...] ?? UNKNOWN_STATUS_PILL` prevents the
  dialog crash if backend ever returns a status outside the local enum.

### Still flagged (TODO retained — not flow-breaking)

- `git-actions.tsx:158` — Default-message divergence between unstaged and
  staged-only commit paths. Both work; needs a product decision on the
  preferred default before changing.
- `publish/trigger-button.tsx:37` — `text = history.length > 0 ? 'Update' :
  'Live'`. Label-only mismatch (button still works). Proper fix requires
  tracking changes-since-deploy on the deployment record.

### Coverage gaps (8 of 10 features have no `T-XXX` row)

Catalog rows missing test-plan coverage:
F-200 (top bar shell), F-203 (connection chip), F-206 (new project menu),
F-207 (recent projects). And the existing rows (T-200..T-206) are still
unchecked (`[ ]`) — no run history. Add unit + Playwright rows per the
catalog Change Protocol.

### Manual steps required

```
Command : Phase 3 frontend validation (preview_click on top-bar elements)
Reason  : Editor route /project/[id] is auth-gated by Clerk. Local preview
          is signed out; OAuth providers (GitHub / Google / Vercel) and the
          email-code flow cannot be automated. No seeded test-user fixture
          exists in this repo.
Impact  : Sub-features F-200..F-209 not driven in a real browser this run.
          Code-level analysis stands; visual / interaction confirmation
          deferred.
Fix     : Either add a Playwright fixture that signs in a seeded Clerk user
          and a matching Convex `users` row, or supply test creds for the
          validator to use. Same blocker as the F-087..F-093 entry above.
```

## Bug Hunt — 2026-05-26 — F-220..F-291

Scope: 312 .ts/.tsx files under
`apps/web/client/src/app/project/[id]/_components/left-panel/`,
`apps/web/client/src/app/project/[id]/_components/right-panel/`,
`apps/web/client/src/components/ai-prompt-composer/`. Skipped tests / .d.ts /
node_modules. Re-fixes from the prior style-tab-v2 review (Radix
`SelectItem value=""`, collection-switch stale sort/filters,
`FilterEditor key={f.id}`, boolean filter draft seed) were not re-flagged.

### Auto-fixed (1 issue)

- `apps/web/client/src/app/project/[id]/_components/left-panel/code-panel/code-tab/file-tabs/file-tab.tsx:23` —
  Stale-Promise race in dirty-state effect: `isDirty(file)` is async (it
  hashes content). When file content changes rapidly, an older Promise can
  resolve after a newer one and stomp the correct dirty state. Wrapped the
  `.then(setIsFileDirty)` with a `cancelled` flag so only the most recent
  invocation can call `setIsFileDirty`. Cleanup returns `() => { cancelled
  = true }` so prior runs no-op once a new effect kicks in.

### Needs human review (1 issue)

- `apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v4/controls/smart-link-input.tsx:249-260` —
  `onBlur` captures `open` by closure at blur time. Because the user was
  typing in the popover-open input, `open` is always `true` at the moment
  of blur, so the deferred `if (!open) commitFreeText()` never fires.
  Effect: when the user types free text (e.g. a bare URL) and then blurs
  by clicking outside the popover (not on a suggestion), their typed text
  is silently discarded — the input visually reverts to the previous
  committed value. `commitFreeText` was meant to normalize and commit the
  typed value (`https://` prefix, `mailto:` / `tel:`).
  Suggested fix: replace the `open` closure read with a ref
  (`openRef.current` updated in `setOpen`), or check `e.relatedTarget`
  inside `onBlur` to see whether focus moved to a popover item before
  deciding to commit.
  TODO comment inserted in source.

### Observations (not flagged — listed for context, not action)

These are minor quality issues I noticed while scanning the same files but
did not promote to backlog entries because they are not load-bearing bugs:

- A handful of async `onClick` handlers (assistant-message `handleRegenerate`,
  upload modals, brand-tab token form `submit`) use `try {…} finally {…}`
  without `catch`. Errors propagate as unhandled rejections (console-only,
  no user toast). Not crashes; not promoted.
- `useCodeNavigation` runs an async MobX reaction whose await can race
  against rapid selection swaps. The `isNavigationTargetEqual` short-circuit
  mostly absorbs stale resolves; an explicit `cancelled` flag would be
  cleaner.
- `chat-input/index.legacy.tsx` retains the swallowed-`catch` bug that
  `index.tsx` already fixed (signature ref never cleared on failure).
  Confirmed dead code — file is not imported anywhere — so left alone.

### Validation

- `bun typecheck` → exit 0.
- `bun lint` skipped per scope instructions (already validated clean
  prior to this run).

## 2026-05-27 — Bug hunt across core user flows (post-validation pass)

Triggered by `find-bugs-that-will-break-core-user-flows` skill after the
F-080..F-093 validation. Eight candidate findings; every single one is
either an explicitly documented disabled feature (sandbox-port / sandbox-fork /
publish-vercel) or a latent edge case behind a low-probability window.
**No inline fixes applied** — each is verified-real but falls outside the
"unblock a working user flow" bar:

- `manager.ts startCreate` always throws `UNAVAILABLE_MESSAGE` —
  `apps/web/client/src/components/store/create/manager.ts:117-131`. Hero AI
  prompt + `/projects/plan/page.tsx:56` both call it. **Critical user-flow
  gap, but a feature build, not a fix.** Comment cites `TODO(sandbox-port)`.
  Requires a new `api.projectActions.createFromPrompt` Convex action that
  scaffolds via `VercelSandboxProvider.createProject({ source: 'template' })`,
  persists prompt + images in `projectCreateRequests`, and lets the editor's
  `useStartProject.resumeCreate` drain it. **Workaround today:** "Start
  blank" CTA on hero + dashboard (`hooks/use-create-blank-project.ts` →
  `api.projectActions.createBlank`) is working and shipped, so users CAN
  create. CLAUDE.md should be amended to mention prompt-create is
  temporarily disabled alongside fork/publish.
- `manager.ts startPublicGitHubTemplate` / `startGitHubTemplate` /
  `createSandboxFromGithub` — same `TODO(sandbox-port)`; throws on every
  template-card click in marketplace. **Until fix lands, hide marketplace
  + template cards from the dashboard** so users don't hit a dead funnel.
  Touched by `apps/web/client/src/components/store/create/manager.ts:142-218`,
  `apps/web/client/src/app/projects/creating/page.tsx`.
- `convex/lib/publishHelpers.ts:51-61 forkBuildSandbox` — already documented
  per CLAUDE.md "What's temporarily disabled on Vercel until snapshot-based
  fork lands". Every publish + custom-domain rollout (F-617, F-693) errors
  with clear message. Tracked as `TODO(publish-vercel)`.
- `convex/branchActions.ts:48-63 fork` — same; `TODO(sandbox-fork)`. UI
  should hide the "Fork branch" CTA in the branches tab until the snapshot
  fork lands. "Create blank branch" works.
- `_adapters/convex-bootstrap.ts:71` — `runtimeMetadata: doc.runtimeMetadata
  ?? { framework: 'nextjs' }` only defaults when the field is missing
  entirely. For projects with `runtimeMetadata = {}` (legacy rows before
  commit 7e80d3eb8 "persist sandbox runtime metadata"), `framework` reads
  as undefined → downstream `framework ?? 'nextjs'` paths misclassify
  static-html sandboxes as Next. **Surface limited to a small pre-fix
  cohort.** Fix is a one-shot Convex migration that infers framework from
  `devCommand` (`'serve …' → 'static-html'`, else `'nextjs'`). Use
  `@convex-dev/migrations`.
- `utils/auth/clerk-bridge.ts:26-41` — `getToken({ template: 'convex' })`
  null path. Loud server log explains the misconfig, but the client just
  sees a 401 / redirect-loop. UX improvement: distinguish 401
  (`unauthenticated`) from 503 (`auth_template_missing`) so the
  `/sign-in?reason=...` page can show a config banner instead of the
  generic auth screen. No impact when the dashboard JWT template is set
  correctly.
- `utils/auth/clerk-bridge.ts:49-56` — `ensureCurrent` race against the
  Clerk → Convex `user.created` webhook. Theoretical concurrent insert
  window if a fresh sign-up POSTs `/api/chat` before the webhook commits.
  Long-term fix: enforce single-row invariant on `clerkUserId` inside
  `requireUserJIT` with a transactional dedupe. Today's `getUserByClerkIdSafe`
  helper already dedupes reads; the risk is at insert time only.
- `api/ai/tab-complete/route.ts:177-179` — `void incrementUsage(req).catch(...)`
  fire-and-forget. `incrementUsage` returns `{ limitReached: true }` (not
  throw) when PRO quota hits zero — the `.catch` doesn't fire, the
  `void` discards. Server keeps streaming completions for over-quota
  users. The up-front `checkMessageLimit` gate (line 84) handles the
  common path; this is the TOCTOU window for ~5 concurrent typing
  completions during the overage moment. Symmetric with the chat /
  inline-edit gates already hardened by CR-2026-05-24-003. Fix is to
  `await` the increment (sub-50ms latency).

**Net actionable items added to backlog (priority order):**

1. Implement Convex `projectActions.createFromPrompt` + wire `manager.startCreate`. **(blocks landing hero CTA)**
2. Implement Convex `projectActions.createFromGitHubTemplate` + wire template paths. **(blocks marketplace)**
3. UI: hide template + fork + publish CTAs while the underlying features remain disabled.
4. One-shot Convex migration: backfill `runtimeMetadata.framework` on legacy projects.
5. Distinguish 401 vs 503 in the Clerk JWT-template misconfig branch.
6. Strengthen `requireUserJIT` dedupe to close the webhook race.
7. `await incrementUsage` in tab-complete route.

### Validation (this pass)

- Each finding traced to the actual code with `grep` + `Read`. No fixes
  applied — every one is either a feature gap or a low-probability latent
  issue.
- Confirmed working user flows: `Start blank` CTA (`useCreateBlankProject` →
  `projectActions.createBlank`), `/sign-in`/`/sign-up`/OTP/SSO (F-080..F-086),
  `/profile-setup` (F-087 with new layout gate), invitation accept screens
  (F-092 + F-093 unauth gate), Stripe success/cancel pages (F-090, F-091).



