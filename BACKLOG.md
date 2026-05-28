# BACKLOG

Living list of known bugs, follow-ups, and deferred TODOs that did not block the
work that surfaced them. Every entry is something an agent or human can pick up
later without re-discovering the context.

## Protocol — read this before editing

- **Both [CLAUDE.md](CLAUDE.md) and [AGENTS.md](AGENTS.md) point here.** Any
  agent (Claude Code, Codex, Gemini, etc.) starting work in this repo should
  skim this file once and decide whether anything listed below intersects the
  task at hand. If it does, fix it as part of the work instead of duplicating
  the entry.
- **Always log it here when you defer a bug or TODO.** If you discover a real
  defect, latent issue, or follow-up that you cannot fix in the current
  change, append an entry below (or update an existing one) — do not leave it
  buried in a chat transcript, code comment, or PR description.
- Entries are organized newest first under **Open**. Move closed items to
  **Resolved** with the resolution date and PR/commit if known.
- Each entry should be self-contained: location (file:line), what's wrong,
  why it matters, a concrete next step.

### Entry template

```markdown
### <short-noun-phrase title>

- **Discovered:** YYYY-MM-DD (session/source if relevant)
- **Where:** path:line (or feature ID like F-131)
- **Symptom:** what the user / dev / test sees
- **Root cause:** if known
- **Next step:** what to do — usually a one-line fix sketch
- **Risk if ignored:** what stays broken
- **Tags:** `#bug` / `#test-gap` / `#tech-debt` / `#docs` / `#flake` / `#infra`
```

---

## Open

### F-437 — Uploaded favicon / OG image path uses raw `file.name`

- **Discovered:** 2026-05-28 (validate-feature F-420..F-439 deeper pass)
- **Where:** [apps/web/client/src/components/ui/settings-modal/site/index.tsx:88,101](apps/web/client/src/components/ui/settings-modal/site/index.tsx#L88-L101)
- **Symptom:** `faviconPath = \`/${uploadedFavicon.name}\`` and the OG path are built from the raw `File.name`. If the user picks a file with spaces, unicode, parens, or path-separator characters in the name, the metadata URL ends up un-encoded and may fail to resolve in production (or, with crafted names like `../foo.png`, produce odd URLs).
- **Next step:** sanitize the filename before constructing the URL — e.g. `encodeURIComponent(stripDirectorySegments(file.name))` — or read the canonical path returned by `editorEngine.image.upload(...)` instead of reconstructing it on the client.
- **Risk if ignored:** broken favicon / OG image after upload for any user whose filename isn't `[a-z0-9.-]`.
- **Tags:** `#bug` `#editor` `#cms`

### F-360 — `projectInvitations.accept` does not trim whitespace before email lookup

- **Discovered:** 2026-05-28 (validate-feature F-360 deeper pass)
- **Where:** [apps/web/client/convex/projectInvitations.ts:421](apps/web/client/convex/projectInvitations.ts#L421)
- **Symptom:** `args.inviteeEmail.toLowerCase()` is used as the key to look up the `users` row by email. If the upstream caller (sign-in flow, accept page) passes the email with leading/trailing whitespace — easy to do when a user pastes from another app — the lookup misses and the invitation can never be accepted by that account.
- **Next step:** `const lcEmail = args.inviteeEmail.trim().toLowerCase();` (and apply the same trim everywhere `inviteeEmail` is read/written). Match the canonical form Clerk's `clerkWebhooks.ts` writes when it normalizes user emails.
- **Risk if ignored:** silent invite-accept failures with no obvious user-facing diagnostic.
- **Tags:** `#bug` `#convex` `#auth`

### Vercel Sandbox returns 402 (Payment Required) — dev team on hobby plan

- **Discovered:** 2026-05-28 (validate-feature F-300..F-361 + F-400..F-402 run)
- **Where:** [apps/web/client/convex/projectActions.ts:239](apps/web/client/convex/projectActions.ts#L239) `VercelSandboxProvider.createProject` call → `@vercel/sandbox` SDK `inferScope` → `POST /v11/projects` returns 402
- **Symptom:** Console floods with `[CONVEX A(projectActions:createBlank)] Server Error … Status code 402 is not ok at async handler (../convex/projectActions.ts:239:16)` after the user clicks **Start blank → Next.js** or **Start blank → Static HTML**. Project never created, dashboard stays in "Start your first project" state.
- **Root cause:** Vercel team `team_06tI3EaV5vk3s9b5gwGlnMJA` (`ludvighedin15-gmailcoms-projects`) is on the **`hobby`** billing plan (`/v2/teams?limit=20` → `"billing":{"plan":"hobby","planIteration":"plus"}`). Vercel Sandbox is a paid feature. The SDK's `inferScope` (in `node_modules/@vercel/sandbox/dist/auth/project.cjs`) auto-creates a default project via `POST /v11/projects` inside `tryTeam`; the hobby plan rejects that with 402. The SDK's `isSkippableTeamError` treats 402 as "skip team", but with one explicit team it has nothing to skip to.
- **Side observation:** Direct `POST /v1/sandboxes?teamId=…` with the same token returned HTTP 200 (sandbox actually provisioned). The 402 is specifically on the project auto-create step inside `inferScope`. The SDK ignores `VERCEL_PROJECT_ID` from `getCredentials()` — it always builds its own "vercel-sandbox-default-project".
- **Adjacent fix already applied during this run:** the three `VERCEL_*` env vars in `.env.local` are double-quoted (e.g. `VERCEL_TOKEN="vcp_…"`). Previous `bunx convex env set` stored the quotes inside the value, so the SDK saw an invalid token and returned 403. Stripping quotes + re-setting via `… | tr -d '"'` cleared the 403 layer — the 402 underneath is the real blocker.
- **Next step:** (a) upgrade the team to Pro, OR (b) point `VERCEL_TEAM_ID` / `VERCEL_PROJECT_ID` at a different team that has Sandbox enabled, OR (c) bake a snapshot via `scripts/create-vercel-template.mjs` and set `VERCEL_BLANK_SNAPSHOT_ID` so `VercelSandboxProvider.createProject` takes the snapshot-resume fast path (`packages/code-provider/src/providers/vercel-sandbox/index.ts:496`) which bypasses `inferScope`.
- **Risk if ignored:** every project-create path on dev (F-121, F-122, F-135) is broken; no one can validate any `#editor` feature against dev Convex. Editor entry F-131 unreachable through normal flow.
- **Tags:** `#bug` `#infra` `#blocker` `#convex` `#vercel` `#billing`

### Convex dev deployment was stale before validate-feature run (now pushed)

- **Discovered:** 2026-05-28 (validate-feature F-300..F-361 + F-400..F-402 run)
- **Where:** dev Convex deployment `avid-gnat-539`
- **Symptom:** `projectActions:createBlank` threw `CSB_API_KEY not configured at ../convex/projectActions.ts:198:24` even though source line 198 is a comment and `CSB_API_KEY` is not referenced in `apps/web/client/convex/**`.
- **Root cause:** source contains the CodeSandbox→Vercel migration (commits `5e8dca441` + `de3dc9269`, 2026-05-24) but the dev Convex deployment had never been pushed since. Resolved this run via `bunx convex dev --once` from `apps/web/client`.
- **Next step:** Add a "post-rebase / post-merge" step to `docs/agent-context/development-setup.md` documenting that backend changes under `apps/web/client/convex/**` are not picked up by Next.js HMR — they require `bunx convex dev` to be running OR a one-shot `--once` push. Consider a `predev` hook in `apps/web/client/package.json` that runs `bunx convex dev --once`.
- **Risk if ignored:** every agent / contributor will lose hours to "I edited the Convex function but the error still references the old code" until they find this trap.
- **Tags:** `#docs` `#dx` `#convex` `#infra`

### Convex dev deployment missing VERCEL_* env vars (now set)

- **Discovered:** 2026-05-28 (validate-feature F-300..F-361 + F-400..F-402 run)
- **Where:** dev Convex deployment `avid-gnat-539`
- **Symptom:** After the Convex deploy fix above, `createBlank` then threw `VERCEL_TOKEN not configured. Vercel Sandbox is the only runtime; set VERCEL_TEAM_ID, VERCEL_PROJECT_ID, and VERCEL_TOKEN` at `convex/projectActions.ts:227`.
- **Root cause:** `bunx convex env list` showed only `CLERK_JWT_ISSUER_DOMAIN` + `CLERK_WEBHOOK_SECRET`. The Vercel-migration commits added Convex-side reads of three new env vars but the deployment env was never updated. Set this run via `bunx convex env set VERCEL_TOKEN/VERCEL_TEAM_ID/VERCEL_PROJECT_ID` (values pulled from `apps/web/client/.env.local`).
- **Next step:** Add the three Vercel env vars to the canonical Convex env list in `docs/agent-context/development-setup.md` (currently undocumented). Consider a tiny `bunx convex env set` script that reads from `.env.local` for shared dev vars.
- **Risk if ignored:** any future spin-up of a fresh Convex deployment, or any rotation of the dev env, has to re-discover this manually.
- **Tags:** `#docs` `#dx` `#convex` `#infra`

### Test-plan coverage gap — F-300..F-361 + F-400..F-402 have 0 unit tests

- **Discovered:** 2026-05-28 (validate-feature F-300..F-361 + F-400..F-402 run)
- **Where:** `docs/test-plan.md` rows T-300 / T-301 / T-310..T-313 / T-330..T-334 / T-340..T-344 / T-360 / T-361 / T-400..T-402
- **Symptom:** Every test row in scope is type `E` (end-to-end via preview) or `M` (manual). Zero `U` (unit) or `I` (integration) coverage for 32 features.
- **Next step:** Add `U` tests for pure utilities in `editor-bar/utils/` (F-319) and pure helpers in `editor-bar/hooks/` (F-318) — these are testable without a live editor. Add RTL + Convex test-client `I` tests for F-301 (`projectComments` / `commentReplies`) and F-360 (`projectInvitations` / `projectMembers`) which exercise Convex mutations directly without the editor.
- **Risk if ignored:** every validation pass on these 32 features blocks on Phase 3 — when Phase 3 infra breaks (as it did this run), validation has no fallback signal.
- **Tags:** `#test-gap`

### F-471 — Non-EDIT chat types skip the atomic usage increment

- **Discovered:** 2026-05-28 (validate-feature F-470..F-479 run)
- **Where:** [apps/web/client/src/app/api/chat/route.ts:338-350](apps/web/client/src/app/api/chat/route.ts#L338)
- **Symptom:** `incrementUsage` only fires when `chatType === ChatType.EDIT && !isLocalModel`. Every other chat type (`ASK`, `CREATE`, `PLAN`, …) is gated only by the upstream `checkMessageLimit` read.
- **Root cause:** original design assumed only EDIT incurs paid spend; ASK/CREATE/PLAN now also burn OpenRouter tokens.
- **Next step:** decide policy with product. Either (a) increment on every non-local chat type, or (b) keep current rule and document explicitly. If (a), mirror inline-edit's refund-on-failure path.
- **Risk if ignored:** concurrent attackers can fan out ASK/PLAN requests under the daily limit and burn OpenRouter spend with only a read-then-act precheck protecting the budget.
- **Tags:** `#bug` `#billing` `#concurrency`

### F-471 / F-472 — TOCTOU between `checkMessageLimit` and `incrementUsage`

- **Discovered:** 2026-05-28 (validate-feature F-470..F-479 run)
- **Where:** [apps/web/client/src/app/api/chat/route.ts:187](apps/web/client/src/app/api/chat/route.ts#L187), [apps/web/client/src/app/api/chat/summarize/route.ts:53](apps/web/client/src/app/api/chat/summarize/route.ts#L53), [apps/web/client/src/app/api/chat/helpers/usage.ts:18](apps/web/client/src/app/api/chat/helpers/usage.ts#L18)
- **Symptom:** A user at `limit - 1` can race N concurrent requests; all pass the precheck, only one increment lands, the rest stream free.
- **Root cause:** `checkMessageLimit` is a read-then-act gate; the only atomic gate is the increment mutation itself.
- **Next step:** drop the precheck (rely solely on `incrementUsage`'s `USAGE_LIMIT_REACHED`) OR precheck + atomic increment on every paid path.
- **Risk if ignored:** quota bypass under load — small but consistent revenue leak.
- **Tags:** `#bug` `#billing` `#concurrency`

### F-472 — Background summarizer charges credit every time client fires

- **Discovered:** 2026-05-28 (validate-feature F-470..F-479 run)
- **Where:** [apps/web/client/src/app/api/chat/summarize/route.ts:146-156](apps/web/client/src/app/api/chat/summarize/route.ts#L146)
- **Symptom:** `useConversationSummarizer` fires this route during typing / mid-stream. No server-side debounce — a buggy or malicious client can drain its own quota plus burn LLM spend.
- **Next step:** server-side rate-limit per `conversationId` (e.g. one summary per N user messages since last summary), OR remove metering for summarization and cap absolute spend via Convex.
- **Risk if ignored:** quota & cost amplification proportional to client misbehavior; one client bug page = N× OpenRouter bill.
- **Tags:** `#bug` `#billing`

### F-475 — Tab-complete metering is fire-and-forget AFTER generation

- **Discovered:** 2026-05-28 (validate-feature F-470..F-479 run)
- **Where:** [apps/web/client/src/app/api/ai/tab-complete/route.ts:177](apps/web/client/src/app/api/ai/tab-complete/route.ts#L177)
- **Symptom:** Increment is `void` and runs after `generateTabCompletion` resolves. A fast keystroke spammer never sees the limit because dozens of in-flight requests resolve before any increment lands.
- **Next step:** either gate up-front (precheck + atomic increment), or add a per-user in-flight cap so concurrent completions can't exceed a small constant N.
- **Risk if ignored:** cheap concurrent abuse with no daily-cap pressure.
- **Tags:** `#bug` `#billing` `#concurrency`

### F-476 — In-memory rate limit on transcription is per-process, not per-user

- **Discovered:** 2026-05-28 (validate-feature F-470..F-479 run)
- **Where:** [apps/web/client/src/app/api/transcribe/helpers/rate-limit.ts:12](apps/web/client/src/app/api/transcribe/helpers/rate-limit.ts#L12)
- **Symptom:** Counter lives in `Map` on each Node replica. On Railway with N replicas a user gets `N × 10`/min instead of 10/min. Compounded by the fact that transcription has no daily quota — only this anti-spam limiter — so cost cap is effectively `N × 10 × MAX_AUDIO_BYTES`/minute per attacker.
- **Next step:** move to Convex (`api.rateLimits.*` already used by chat) so the limit is global. While there, add a daily Whisper-spend counter so the cost ceiling does not scale with replicas.
- **Risk if ignored:** unbounded Whisper / OpenRouter spend under abuse; documented in code as "not a replacement for distributed rate limiting" but ops cap is the only safety net today.
- **Tags:** `#bug` `#billing` `#infra`

### F-471 — Chat path: `aiUsageEvents.insert` + `replaceConversationMessages` awaited inside `onFinish` with no timeout

- **Discovered:** 2026-05-28 (validate-feature F-470..F-479 run)
- **Where:** [apps/web/client/src/app/api/chat/route.ts:434-458](apps/web/client/src/app/api/chat/route.ts#L434), 512-519
- **Symptom:** If Convex stalls, the chat response close hangs because the SDK awaits these from `onFinish`.
- **Next step:** wrap each in `Promise.race` with a 5–10s timeout; on timeout, log + best-effort fire-and-forget. The user-visible stream is already complete.
- **Risk if ignored:** sporadic stuck connections; visible as "AI never finishes" in UI.
- **Tags:** `#bug` `#reliability`

### F-471 — Chat: client-supplied `messages` array has no schema on shape

- **Discovered:** 2026-05-28 (validate-feature F-470..F-479 run)
- **Where:** [apps/web/client/src/app/api/chat/route.ts:133-142](apps/web/client/src/app/api/chat/route.ts#L133); also `summarize/route.ts:33`
- **Symptom:** `messages: z.array(z.any())` — only byte-bounds enforced. If anything downstream trusts `role: 'system'` from the user-supplied array, a caller can inject system prompts.
- **Next step:** narrow schema to `{ role: 'user' | 'assistant'; parts: ... }`. Confirm `buildChatRequest` / `toDbMessage` re-validate or strip roles.
- **Risk if ignored:** prompt injection vector if any builder ever forwards role verbatim.
- **Tags:** `#security` `#chat`

### F-477 — `/api/email-capture` is unauthenticated with no rate-limit or captcha

- **Discovered:** 2026-05-28 (validate-feature F-470..F-479 run)
- **Where:** [apps/web/client/src/app/api/email-capture/route.ts](apps/web/client/src/app/api/email-capture/route.ts)
- **Symptom:** Anyone can POST any volume of junk emails into n8n. Validation only catches bad shapes; not bots.
- **Next step:** Cloudflare Turnstile or hCaptcha on the marketing form + per-IP rate-limit at the edge. Soft-fail to "captured locally only" on captcha failure.
- **Risk if ignored:** n8n list pollution and outbound `fetch` amplification from Weblab IP.
- **Tags:** `#abuse` `#marketing`

### F-470..F-479 — Most REST routes have no automated test coverage

- **Discovered:** 2026-05-28 (validate-feature F-470..F-479 run)
- **Where:** [docs/test-plan.md](docs/test-plan.md) section 22 — T-471, T-472, T-473, T-474, T-475, T-476, T-477, T-478, T-479 all marked `[ ]`.
- **Symptom:** 8 of 10 REST features rely on Clerk/Convex/Supabase context and have no Bun-level tests.
- **Next step:** add a thin integration harness that mocks Clerk's `auth()`, Convex's `fetchQuery`/`fetchMutation`, and Supabase to exercise the POST/GET surface with synthetic bodies. Pattern lives in [apps/web/client/test/setup.ts](apps/web/client/test/setup.ts) for tRPC; extend for Convex/Clerk.
- **Risk if ignored:** regressions in chat / inline-edit / tab-complete / transcribe / promo-resume land silently until users feel them.
- **Tags:** `#test-gap`

### F-330..F-335 — Bottom-bar unguarded null/undefined access risks runtime crash

- **Discovered:** 2026-05-28 (validate-feature F-300..F-361 + F-420..F-439 run)
- **Where:**
  - [apps/web/client/src/app/project/[id]/_components/bottom-bar/terminal-area.tsx:55](apps/web/client/src/app/project/[id]/_components/bottom-bar/terminal-area.tsx#L55) — `branches.activeBranch.id` accessed inside try/catch (caught) but only by accident.
  - [apps/web/client/src/app/project/[id]/_components/bottom-bar/terminal-area.tsx:83](apps/web/client/src/app/project/[id]/_components/bottom-bar/terminal-area.tsx#L83) — `sandbox.session.activeTerminalSessionId =` assigns into possibly-undefined `.session`; only `sandbox` itself is null-checked.
  - [apps/web/client/src/app/project/[id]/_components/bottom-bar/restart-sandbox-button.tsx:178](apps/web/client/src/app/project/[id]/_components/bottom-bar/restart-sandbox-button.tsx#L178) — `activeBranch.sandbox.id` dereferences a sub-field that may be undefined depending on Branch shape.
- **Symptom:** if a branch is mid-init (no session yet) or has no `sandbox` sub-record, the terminal-switch / restart paths throw `Cannot read properties of undefined`.
- **Root cause:** missing optional-chain / explicit guards on intermediate fields.
- **Next step:** add `if (!sandbox?.session) return;` guards before writes, and `?.` on `activeBranch.sandbox?.id`. Verify Branch.sandbox type in [@weblab/models](packages/models) before deciding which is nullable.
- **Risk if ignored:** terminal cycle hotkey and Restart Sandbox button can crash the editor during sandbox cold-boot.
- **Tags:** `#bug` `#editor`

### F-422 — Account-tab accepts unvalidated first/last name input

- **Discovered:** 2026-05-28 (validate-feature F-420..F-439 run)
- **Where:** [apps/web/client/src/components/ui/settings-modal/account-tab.tsx:48-57](apps/web/client/src/components/ui/settings-modal/account-tab.tsx#L48-L57)
- **Symptom:** any length / character sequence accepted; no trim, no max length, no script-tag stripping before save.
- **Next step:** zod-validate `firstName`/`lastName` (1..64 chars, trimmed) on submit; toast on invalid; mirror Convex `users.update` validator.
- **Tags:** `#flag` `#validation`

### F-424 — Appearance-tab still leaves DOM out of sync on save failure

- **Discovered:** 2026-05-28 (validate-feature F-420..F-439 run)
- **Where:** [apps/web/client/src/components/ui/settings-modal/appearance-tab.tsx:85-103](apps/web/client/src/components/ui/settings-modal/appearance-tab.tsx#L85-L103)
- **Symptom:** optimistic `data-accent` / `data-density` / `data-font-size` mutations are not reverted on `updateSettingsMutation` failure. User now sees a toast (fix applied), but visually the change "stuck" until reload.
- **Next step:** snapshot prior attr values before mutation, restore in `catch`.
- **Tags:** `#flag` `#ux`

### F-427 — GitHub-tab silently clears repo list on fetch failure (no toast / retry)

- **Discovered:** 2026-05-28 (validate-feature F-420..F-439 run)
- **Where:** [apps/web/client/src/components/ui/settings-modal/github-tab.tsx:83-87](apps/web/client/src/components/ui/settings-modal/github-tab.tsx#L83-L87)
- **Symptom:** on `getOrgs` / `getReposWithApp` rejection, `orgs` and `repos` are set to `[]` with no user feedback — looks identical to "GitHub App has no repos".
- **Next step:** preserve error, show inline retry surface (similar to installation-check retry at line 168-180).
- **Tags:** `#flag` `#integration` `#ux`

### F-431 — Subscription-tab uses unsafe `(response as { url?: string })` cast

- **Discovered:** 2026-05-28 (validate-feature F-420..F-439 run)
- **Where:** [apps/web/client/src/components/ui/settings-modal/subscription-tab.tsx:40](apps/web/client/src/components/ui/settings-modal/subscription-tab.tsx#L40)
- **Symptom:** Convex action result is cast without runtime check; if shape ever changes, redirect will navigate to `undefined`.
- **Next step:** validate shape with `if (!result?.url) throw new Error(...)` before redirect.
- **Tags:** `#flag` `#billing`

### F-435 — Account deletion UI calls a not-yet-implemented Convex mutation (always toasts "unavailable")

- **Discovered:** 2026-05-28 (validate-feature F-420..F-439 run)
- **Where:** [apps/web/client/src/components/ui/settings-modal/user-delete-section.tsx:45-56](apps/web/client/src/components/ui/settings-modal/user-delete-section.tsx#L45-L56)
- **Symptom:** the destructive flow ends with `toast.error('Account deletion is temporarily unavailable...')`. UI implies deletion succeeded after the second-confirm step, but nothing happens.
- **Next step:** either gate the Delete button behind a "coming soon" disabled state OR ship the `users.delete` Convex mutation (server-side cleanup of projects, conversations, storage, subscriptions). The `// TODO(convex):` comment already flags this in code.
- **Risk if ignored:** users will repeatedly try, file support tickets, and assume their data is being deleted when it isn't.
- **Tags:** `#bug` `#user-trust`

### F-427 — `disconnectGitHub` button shows confirm dialog then no-ops

- **Discovered:** 2026-05-28 (validate-feature F-420..F-439 run)
- **Where:** [apps/web/client/src/components/ui/settings-modal/github-tab.tsx:123-133](apps/web/client/src/components/ui/settings-modal/github-tab.tsx#L123-L133)
- **Symptom:** Disconnect → Confirm → toast "Disconnect is temporarily unavailable". User cannot actually revoke connection from the app.
- **Next step:** implement `users.disconnectGitHub` Convex mutation that revokes the GitHub App installation and clears `providerConnections` row; until then disable the button instead of pretending it works.
- **Tags:** `#bug` `#integration`

### F-491 — `checkout` allows multiple active subscriptions per user; downstream `.unique()` queries crash billing portal

- **Discovered:** 2026-05-28 (validate-feature F-490..F-501 deep pass)
- **Where:** [apps/web/client/convex/subscriptionActions.ts:52-91](apps/web/client/convex/subscriptionActions.ts#L52-L91) (`checkout` action) +
  [apps/web/client/convex/lib/stripeWebhook.ts:630-647](apps/web/client/convex/lib/stripeWebhook.ts#L630-L647) (`_findActiveSubscriptionForCaller`) +
  [stripeWebhook.ts:587-598](apps/web/client/convex/lib/stripeWebhook.ts#L587-L598) (`_findActiveProSubscriptionForPromo`)
- **Symptom (chain):**
  1. User double-clicks **Subscribe** on the pricing modal, or two browser tabs race. `checkout` action does not check for an existing active subscription, so both calls create Stripe Checkout Sessions and both complete.
  2. Stripe fires two `customer.subscription.created` events. `_handleSubCreated` is idempotent only on `stripeSubscriptionItemId` (different items per sub) → two rows inserted in `subscriptions` with `status='active'`.
  3. User opens **Settings → Subscription → Manage** → `manageSubscription` action calls `_findActiveSubscriptionForCaller` which does `.query('subscriptions').withIndex('by_user_status', q => q.eq('userId', userId).eq('status', 'active')).unique()`. With 2 rows the `.unique()` throws `Unique constraint failed`. Billing portal never opens. User cannot cancel or change the duplicate.
  4. Same throw blocks `startPromoCheckout` for affected users (`_findActiveProSubscriptionForPromo` also `.unique()`s on `by_user_status`).
- **Root cause:** missing idempotency guard at the `checkout` entry point; helper queries assume the invariant "≤1 active sub per user" that the entry point doesn't enforce.
- **Next step:**
  - In `checkout` (subscriptionActions.ts:54) call `_findActiveSubscriptionForCaller` (or an equivalent internal query) first; if a row exists, throw `ALREADY_SUBSCRIBED` and surface a friendly message in [pro-card.tsx:52](apps/web/client/src/components/ui/pricing-modal/pro-card.tsx#L52).
  - Defense-in-depth: change the two `.unique()` calls on `by_user_status` to `.first()` + log when more than one is found, so a future repeat doesn't lock the user out of the portal.
- **Risk if ignored:** support tickets from double-billed users who also can't open the billing portal to fix it themselves. Revenue impact + churn.
- **Tags:** `#bug` `#billing` `#critical`

### F-491 — `update` action does not catch already-released schedule from Stripe; upgrade/downgrade aborts

- **Discovered:** 2026-05-28 (validate-feature F-490..F-501 deep pass)
- **Where:** [apps/web/client/convex/subscriptionActions.ts:156-158](apps/web/client/convex/subscriptionActions.ts#L156-L158)
- **Symptom:** User changes plan via the pricing modal while a previously scheduled downgrade is in-flight. `update` action sees `owned.stripeSubscriptionScheduleId` and calls `stripe.subscriptionSchedules.release(scheduleId)` without try/catch. If Stripe reports the schedule is already in `'released'` state (e.g. the scheduled phase fired and Stripe auto-released it just before this request, or the user released it manually from the portal), Stripe throws `StripeInvalidRequestError`. The action aborts; user sees a generic toast. Our DB still references the now-dead `stripeSubscriptionScheduleId`, so the next attempt repeats the failure.
- **Root cause:** inconsistent error handling — `releaseSubscriptionSchedule` ([line 314-323](apps/web/client/convex/subscriptionActions.ts#L314-L323)) already handles this exact case by swallowing `invalid_request_error`; the `update` action does not.
- **Next step:** wrap the `release` call in the same try/catch used by `releaseSubscriptionSchedule`; on swallowed error, fall through to the normal upgrade/downgrade path. Add a clearing patch (`_clearScheduleChange`) so our DB drops the stale schedule id.
- **Risk if ignored:** users with pending schedules get permanently stuck — every plan change attempt aborts before reaching Stripe.
- **Tags:** `#bug` `#billing`

### F-491 — `startPromoCheckout` returns `not_authenticated` for users that are signed in but missing email

- **Discovered:** 2026-05-28 (validate-feature F-490..F-501 deep pass)
- **Where:** [apps/web/client/convex/subscriptionActions.ts:228-231](apps/web/client/convex/subscriptionActions.ts#L228-L231)
- **Symptom:** `_resolveCallerUserId` returns `null` only when there is no authenticated identity; an authenticated user without `email` returns a user object whose `email` is `undefined`. The check `if (!caller?.email)` then returns `errorCode: 'not_authenticated'`. Frontend renders a misleading "Please sign in" message even though the user is signed in.
- **Root cause:** error code conflates two states (no identity vs identity-without-email).
- **Next step:** split the check —
  ```ts
  if (!caller) return { errorCode: 'not_authenticated' };
  if (!caller.email) return { errorCode: 'missing_email' };
  ```
  Add the new code to the promo banner's typed error handler.
- **Risk if ignored:** support burden + confused users on the promo flow.
- **Tags:** `#bug` `#billing` `#ux`

### F-501 — `NAMED_FUNCTION_RE` / `DEFAULT_FUNCTION_RE` miss `export async function` (Next.js server components dropped)

- **Discovered:** 2026-05-28 (validate-feature F-490..F-501 deep pass)
- **Where:** [apps/web/server/src/router/routes/components.ts:25,42](apps/web/server/src/router/routes/components.ts#L25)
- **Symptom:** Every Next.js App Router server component (`export default async function Page()`, `export async function generateMetadata()` is correctly skipped because lowercase, but `export async function HeroSection()` would be dropped). Regex anchors `function` immediately after `export\s+(default\s+)?`, so the `async` keyword between `export` and `function` is never matched.
- **Root cause:** regex written before App Router conventions were considered.
- **Next step:** allow optional `async\s+` between `export` and `function`:
  ```ts
  const NAMED_FUNCTION_RE = /export\s+(?:async\s+)?function\s+([A-Z][A-Za-z0-9_]*)\s*[(<]/gm;
  const DEFAULT_FUNCTION_RE = /export\s+default\s+(?:async\s+)?function\s+([A-Z][A-Za-z0-9_]*)\s*[(<]/gm;
  ```
  Add unit tests for both async forms to [`__tests__/components.test.ts`](apps/web/server/src/router/routes/__tests__/components.test.ts).
- **Risk if ignored:** users importing a Next.js App-Router project see an incomplete component list in the editor's component picker (F-501 → editor → component browser).
- **Tags:** `#bug` `#editor` `#test-gap`

### F-501 — `scanDirectory` has no symlink-cycle guard; malicious project dir can OOM the Fastify server

- **Discovered:** 2026-05-28 (validate-feature F-490..F-501 deep pass)
- **Where:** [apps/web/server/src/router/routes/components.ts:132-159](apps/web/server/src/router/routes/components.ts#L132-L159)
- **Symptom:** `walk()` recurses on every `entry.isDirectory()` without tracking visited inodes or skipping symlinks. A project containing a symlink that points at an ancestor (`src/loop -> ../..`) causes infinite recursion → V8 stack overflow → process restart, or runaway memory before that.
- **Root cause:** missing `entry.isSymbolicLink()` skip + missing visited-set.
- **Next step:** filter symlinks before recursing:
  ```ts
  if (entry.isSymbolicLink()) continue;
  if (entry.isDirectory() && !SKIP_DIRS.has(entry.name)) await walk(join(current, entry.name));
  ```
  Optional: track visited real paths via `fs.realpath` + Set as defense-in-depth.
- **Risk if ignored:** SANDBOX_BASE_DIR is operator-controlled today, so exposure is low — but the moment user-uploaded projects are scanned with this code path (or an attacker controls a file the scanner traverses), one symlink takes the Fastify server down. Latent denial-of-service.
- **Tags:** `#bug` `#security` `#sandbox`

### F-491 — Stripe webhook accepts only one `v1=` signature; rotation will reject valid requests

- **Discovered:** 2026-05-28 (validate-feature F-490..F-501 run)
- **Where:** [apps/web/client/convex/http.ts:112-117](apps/web/client/convex/http.ts#L112-L117) — `verifyStripeSignature`
- **Symptom:** during a Stripe webhook signing-secret rotation Stripe sends
  `Stripe-Signature: t=…,v1=oldSig,v1=newSig`. The current parser builds
  `Object.fromEntries(...)` so only the LAST `v1` survives. If our held
  secret signs the FIRST entry, verification fails and Stripe retries until
  rotation finishes.
- **Root cause:** `Object.fromEntries` collapses duplicate keys.
- **Next step:** split header → keep an array of `v1` values; HMAC the
  payload once → return true if any candidate matches via constant-time
  compare. Add a test that feeds two `v1=` entries.
- **Risk if ignored:** ~5-minute window of dropped events on every rotation,
  silent until alerted by Stripe dashboard.
- **Tags:** `#bug` `#billing` `#webhook`

### F-491 — Stripe webhook lacks `evt.id` idempotency; replays grant duplicate credits

- **Discovered:** 2026-05-28 (validate-feature F-490..F-501 run)
- **Where:** [apps/web/client/convex/http.ts:235-270](apps/web/client/convex/http.ts#L235-L270) +
  [apps/web/client/convex/lib/stripeWebhook.ts:220-401](apps/web/client/convex/lib/stripeWebhook.ts#L220-L401)
- **Symptom:** `customer.subscription.updated` pro-rated upgrade branch
  (`stripeWebhook.ts:268`) and renewal branch (`handleSubscriptionRenewed`,
  `stripeWebhook.ts:379`) both `ctx.db.insert('rateLimits', …)`. Stripe
  retries 5xx for up to 3 days and can double-deliver even on 2xx
  (documented behavior). Each replay inserts another full-quota rateLimits
  row → user receives N× credits.
- **Root cause:** no event-id dedupe at the webhook entry point.
  `_handleSubCreated` is idempotent (item-id upsert) but the `Updated`
  paths are not.
- **Next step:** introduce a `stripeEventLog` table indexed by
  `stripeEventId` (= `evt.id` from raw payload). In the webhook handler,
  attempt an insert before dispatch; on uniqueness conflict, return 200
  early.
- **Risk if ignored:** duplicate credits granted on every Stripe retry,
  inflated `rateLimits.left` for affected users, silent revenue leak.
- **Tags:** `#bug` `#billing` `#webhook` `#idempotency`

### F-492 — catalog row claims GitHub webhook but no HTTP handler exists

- **Discovered:** 2026-05-28 (validate-feature F-490..F-501 run)
- **Where:** [docs/feature-catalog.md:531](docs/feature-catalog.md#L531) +
  [docs/test-plan.md:383](docs/test-plan.md#L383) (T-492) vs
  [apps/web/client/convex/http.ts](apps/web/client/convex/http.ts) (only
  `/clerk-webhook` and `/webhooks/stripe` exist) and
  [apps/web/client/convex/githubActions.ts](apps/web/client/convex/githubActions.ts)
  (OAuth + installation callback + PR create actions only).
- **Symptom:** F-492 is unreachable. T-492 ("Replay GitHub event → Convex
  action invoked") cannot execute — no `/github-webhook` route is mounted
  anywhere in the repo.
- **Root cause:** either (a) GitHub webhook was never ported, or (b) the
  catalog row is mis-tagged and should describe the OAuth/installation
  actions, not a webhook.
- **Next step:** decide intent. If a webhook IS planned, scaffold a
  `/webhooks/github` httpAction that verifies the `X-Hub-Signature-256`
  HMAC and dispatches at minimum `installation.created` / `installation.deleted`.
  Otherwise rewrite the catalog row + T-492 to describe the existing
  OAuth/install/PR actions and drop the `#webhook` tag.
- **Risk if ignored:** misleading inventory — agents and humans assume
  GitHub event sync exists when it doesn't.
- **Tags:** `#docs` `#bug` `#integration`

### F-500 — tRPC `sandbox` router is a hello-world stub; no production caller

- **Discovered:** 2026-05-28 (validate-feature F-490..F-501 run)
- **Where:** [apps/web/server/src/router/routes/sandbox.ts](apps/web/server/src/router/routes/sandbox.ts) +
  mount [apps/web/server/src/router/index.ts:6](apps/web/server/src/router/index.ts#L6)
- **Symptom:** `create`, `start`, `stop`, `status` return `"hi <input>"`
  or canned objects. Every `sandbox.*` reference in
  `apps/web/client/**/sandbox/**` targets `api.sandbox.*` (Convex
  namespace, not yet ported — search `TODO(sandbox-port)`). The Fastify
  tRPC sandbox router is mounted but not called from any production code
  path.
- **Root cause:** placeholder left after the CodeSandbox → Vercel +
  Convex migration; never wired to a real lifecycle.
- **Next step:** either delete the router (and the F-500 catalog row), or
  ship a real implementation that calls the Vercel Sandbox provider in
  [packages/code-provider](packages/code-provider/src/providers/vercel-sandbox/index.ts).
- **Risk if ignored:** dead code in the tRPC surface; agents wire new
  features to a stub thinking it works; bloats `AppRouter` type.
- **Tags:** `#tech-debt` `#sandbox`

### F-131 — invalid project ID maps to "unknown" variant instead of "invalid-id"

- **Discovered:** 2026-05-26 (validate-feature F-120..F-135 run)
- **Where:** [apps/web/client/src/app/project/[id]/page.tsx:113-148](apps/web/client/src/app/project/[id]/page.tsx#L113-L148)
- **Symptom:** signed-in user visits `/project/abc` (any string that is not a
  valid Convex `Id<"projects">`); server logs
  `ArgumentValidationError: Value does not match validator. Path: .projectId`
  and the page renders `OfflineEditorBootstrap` with
  `fallbackVariant="unknown"`. T-128 in [docs/test-plan.md](docs/test-plan.md)
  expects a **variant-specific** error (`not-found`, `unauthorized`, or
  `invalid`).
- **Root cause:** catch block at lines 132-140 maps via substring match on
  `forbidden|unauth|session|not found|not_found`. The Convex
  `ArgumentValidationError` message matches none of those. The dedicated
  `invalid-id` branch at line 75 only fires for the literal string
  `projectId === 'undefined'`.
- **Next step:** add a branch matching
  `/does not match validator|argumentvalidationerror|invalid id/i` →
  `'invalid'`. Confirm `ProjectLoadError`'s variant set includes `'invalid'`
  (currently has `'unauthorized' | 'forbidden' | 'not-found' | 'unknown' |
  'invalid-id'` — pick the right name and keep it consistent).
- **Risk if ignored:** users hitting a malformed deep-link see a generic
  "something went wrong" instead of "that project ID is malformed", masking
  bad-link bugs in upstream callers.
- **Tags:** `#bug` `#auth-gated` `#editor`

### F-122 — unauth bounce sends user to `/w/new` instead of `/sign-in`

- **Discovered:** 2026-05-26 (validate-feature F-120..F-135 run)
- **Where:** [apps/web/client/src/app/projects/creating/page.tsx](apps/web/client/src/app/projects/creating/page.tsx) — middleware + `useAuthContext` interplay
- **Symptom:** unauthenticated user navigates to
  `/projects/creating?templateId=…` and lands on `/w/new` (workspace create
  page) instead of `/sign-in?returnUrl=%2Fprojects%2Fcreating…` like every
  sibling under `/projects/*`.
- **Root cause:** unclear. Either middleware exempts `/projects/creating`,
  or the client component's auth modal logic redirects via
  `localStorage`/`localforage` state before the sign-in redirect fires.
- **Next step:** repro with a fresh incognito profile (cleared cookies +
  localStorage). Compare middleware matcher against `/projects/creating`
  vs `/projects/new`. Fix divergence so all `/projects/*` routes share the
  same unauth path.
- **Risk if ignored:** confusing UX — magic-link / OAuth callbacks for the
  "create from template" flow land on the wrong landing page.
- **Tags:** `#bug` `#auth-gated` `#routing`

### Missing test-plan rows for F-126, F-130, F-132, F-133

- **Discovered:** 2026-05-26 (validate-feature F-120..F-135 run)
- **Where:** [docs/test-plan.md](docs/test-plan.md)
- **Symptom:** four features in the catalog have no `T-XXX` test row.
  - **F-126** `/projects/import` (import hub) — no nav/render test.
  - **F-130** `/project` (bare index) — no listing/redirect test.
  - **F-132** `/project/[id]/loading.tsx` — no skeleton test.
  - **F-133** `/project/[id]/error.tsx` — no error-boundary render test.
- **Next step:** add minimal `T-XXX` rows. For F-132 / F-133, write
  integration tests that force the loading / error state (throttle a query;
  render `error.tsx` with `new Error('boom')`).
- **Risk if ignored:** silent regressions in the loading skeleton and error
  fallback — both surface to users on slow networks and crashes.
- **Tags:** `#test-gap` `#docs`

### `bun test` does not auto-load `apps/web/client/.env.local`

- **Discovered:** 2026-05-26 (validate-feature F-120..F-135 run)
- **Where:** [apps/web/client/src/components/store/create/manager.test.ts](apps/web/client/src/components/store/create/manager.test.ts) and any test that transitively imports [apps/web/client/src/env.ts](apps/web/client/src/env.ts)
- **Symptom:** running `bun test src/components/store/create/manager.test.ts`
  from `apps/web/client/` fails with `Invalid environment variables: …
  OPENROUTER_API_KEY: expected string, received undefined` even though
  `.env.local` contains the key. Tests only pass after explicit
  `set -a; source .env.local; set +a`.
- **Root cause:** Bun loads `.env.local` from CWD, but tooling expectation
  (per Bun docs) doesn't align here — likely because the test file imports a
  module that reads `process.env` at module-load time before Bun's loader
  sequence applies.
- **Next step:** either (a) add a `bunfig.toml` `[test]` preload that sources
  the env, or (b) add a `tests/setup.ts` that calls `dotenv.config({ path:
  '.env.local' })` and wire it via `bun test --preload`. Document in
  [CLAUDE.md](CLAUDE.md) test section.
- **Risk if ignored:** every new contributor and every fresh CI shell hits
  the same false-failure; signal-to-noise on local test runs degrades.
- **Tags:** `#infra` `#dev-loop`

### Lint warnings inside F-120..F-135 scope (0 errors, 7 warnings)

- **Discovered:** 2026-05-26 (validate-feature F-120..F-135 run)
- **Where:**
  - [apps/web/client/src/components/store/create/manager.ts:34](apps/web/client/src/components/store/create/manager.ts#L34) — `readActiveWorkspaceId` defined but unused.
  - [apps/web/client/src/app/projects/import/local/page.tsx:8](apps/web/client/src/app/projects/import/local/page.tsx#L8) — `Icons` imported but unused.
  - [apps/web/client/src/app/projects/import/local/_context/index.tsx](apps/web/client/src/app/projects/import/local/_context/index.tsx) — 1 `react-hooks/exhaustive-deps` (`validateProject`), 1 unused `startOrphanSandbox`, 3 `@typescript-eslint/no-explicit-any` at lines 303, 435, 441.
  - [apps/web/client/src/app/projects/layout.tsx:19](apps/web/client/src/app/projects/layout.tsx#L19) — `||` should be `??` per `prefer-nullish-coalescing`.
- **Next step:** delete unused symbols, tighten the three `any`s, and fix the
  `??` swap. The exhaustive-deps warning needs a real look — adding the dep
  may trigger a re-validation loop, so verify before changing.
- **Risk if ignored:** `bun lint --max-warnings 0` (CI gate) will keep
  failing on any touch to these files.
- **Tags:** `#tech-debt` `#lint`

### Node 22 stream compat noise in Convex client logs

- **Discovered:** 2026-05-26 (validate-feature F-120..F-135 run)
- **Where:** server logs during any failed `fetchQuery` call from the editor route.
- **Symptom:** `TypeError: controller[kState].transformAlgorithm is not a
  function` appears in stderr next to legitimate request errors. Originates
  inside the Convex client's `Response` body handling on Node ≥ 22.
- **Root cause:** undici / Node-internal stream API drift; not in our code.
- **Next step:** bump `convex` SDK once upstream ships the fix, or pin Node
  to 20.x in `engines` and Railway/Vercel runtime config if the noise gets
  worse. Track upstream issue.
- **Risk if ignored:** log noise only — does not block requests. Becomes a
  real problem if real errors get hidden behind the spam.
- **Tags:** `#tech-debt` `#infra` `#noise`

---

## Resolved

_None yet — move closed entries here with the resolution date and PR/commit._
