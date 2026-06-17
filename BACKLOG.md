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

### Connected-flow round (2026-06-18, authed Playwright) — 2 bugs FIXED + preview root-caused

Drove the full flow live: sign-in → dashboard → `/projects/new` → **Start blank** → stack modal (Cloud + Next.js/Static HTML) → **create** → editor → **preview renders** ("Hello from Weblab"). Findings:

- ✅ **FIXED — local `SANDBOX_NOT_LISTENING` was an env issue, not product code** (commit `165eb1dab`). The iter-6 preview failure was: (1) **:8080 squatted by Open WebUI** (`open-webui-venv`), so the real Fastify sandbox server couldn't bind it; (2) running the sandbox server on another port (via `NEXT_PUBLIC_SANDBOX_SERVER_URL`) was then **CSP-blocked** because `next.config.ts` dev `connect-src` hardcoded `ws://localhost:8080`. Fix: derive the sandbox WS origin in the dev CSP from `NEXT_PUBLIC_SANDBOX_SERVER_URL` (keep :8080 defaults; prod CSP unchanged). With the server on :8085 the preview now boots end-to-end. **NOTE:** the **prod** `SANDBOX_NOT_LISTENING` concern (Railway :8080 web-server, agent-memory `project_sandbox_server_not_deployed`) is a separate deployment matter and still stands.
- ✅ **FIXED — editor `saveCanvas.cancel is not a function`** (commit `f9c66d8e0`). `CanvasManager.saveCanvas = debounce(...)` is a function-valued field; `makeAutoObservable(this)` wrapped it as an action, stripping lodash's `.cancel`, so `clear()` (teardown) threw on every project (the canvas "1 Issue" badge). Fix: `makeAutoObservable(this, { saveCanvas: false })`. Verified live: navigate-away no longer logs it; "1 Issue" badge gone.
- ℹ️ **Not a product bug — `UNAUTHORIZED: a valid Clerk session token is required`** seen in long editor runs is the **multi-agent test collision**: a parallel QA agent re-auths the shared `weblab.qa+clerk_test` user, invalidating this session's Clerk token, so the sandbox server (correctly) rejects its tRPC calls. The fast create→render path shows zero of these. To eliminate in tests, each agent needs a distinct existing Clerk user (new-user signup is CAPTCHA-blocked headless; Clerk Backend API user-mint was denied by the safety classifier — needs owner approval).

Final clean run: preview rendered, **0 saveCanvas errors, 0 other product console errors** (only the env UNAUTHORIZED from the collision).

### AI chat bug-hunt (iter-6 — full chat pipeline; 5 parallel subagents, line refs confirmed by main thread)

- **Discovered:** 2026-06-17 (`/bug-hunt` over use-chat hook + transports, api/chat routes, chat-messages render, composer/tiptap, chat-input/tools)
- **Fixed this pass (committed separately):**
  - Stop button dead when AI availability flips mid-stream — `ai-prompt-composer/index.tsx` (commit `2a02c4126`, see `stop-button.ts`).
  - Image dropped from first message of a turn — `use-chat/index.tsx:340` now forwards the pre-clear `context` to `processMessage`.
  - Server→client generated-image hand-off threw "tool not available" — `packages/ai/src/tools/toolset.ts` `filterUnavailable` now key-gates only the SERVER image tools (`generate_image`/`edit_image`), keeping the two ClientTools dispatchable. Regression test `toolset.test.ts`.
  - Wrong-mode toast hardcoded "ask mode" — `components/tools/tools.ts:51` now interpolates `currentChatMode`.
- **RESOLVED 2026-06-18 ("carefully fix all"):** findings #1–#9, #11–#14, #16, #17 fixed (see numbered list; line refs re-verified in the main thread before each fix). Unit tests added for `tool-name` and `suggestion-popup-state` (plus the earlier `toolset` / `stop-button`). New i18n keys `multiBranchRevert.toastSuccess` / `toastPartialFailed`. **Verified NOT bugs (no change):** #10 (summarizer — `shouldSummarize` + `inFlightRef` already gate the POST; the cleanup-reset is needed for model-change re-eval), #15 (suggestion retry — the effect's `isGeneratingSuggestions` dep re-runs it, so retries already fire). **Partial:** #12 fixed sub-bug A (inflated 2nd-group timer); sub-bug B (no elapsed on reload) is a data limitation — there's no stored end-time and the proposed `now - createdAt` fix would render a days-long elapsed, so left as the honest "Worked (N)" label. Code-level verified (typecheck / lint / tests); the editor popup (#3) and image flows still want a live-editor pass.
- **Original findings (ranked; now resolved per above):**
  1. **HIGH `#billing` — multi-step turns undercharge credits** (`api/chat/route.ts:578`, used at `:635`): `messageMetadata` stores `usage: part.usage` from each `finish-step` (PER-STEP), so a turn that runs multiple tool loops (`stepCountIs(8)`) keeps only the last step's usage; `finalizeUsage`/`reconcileUsage` bill against that single step → systematic undercount on every multi-step EDIT turn. Fix: capture cumulative `part.totalUsage` from the `finish` part. TODO in code. *Not auto-fixed: billing — a wrong fix overcharges; needs verification against the Convex reconcile path.*
  2. **HIGH `#billing` — aborted turn fully refunded + untracked** (`api/chat/route.ts:599`): abort path issues a blanket `refundUsageOnce` and never calls `finalizeUsage`, so provider tokens already spent mid-stream are refunded and emit no `aiUsageEvents` row. Fix: finalize partial usage + reconcile to real partial cost on abort. TODO in code.
  3. **HIGH `#editor` — Enter can't confirm @mention / /slash popup** (`ai-prompt-composer/tiptap-editor.tsx:99-101`): parent `onKeyDown` (chat-input) unconditionally `preventDefault()`s Enter and sends; `editorProps.handleKeyDown` returns `true` on `defaultPrevented` before the `@tiptap/suggestion` plugin's Enter handler runs → Enter sends the message instead of selecting the highlighted item (arrows/click still work). Fix: expose an "isSuggestionOpen" flag from the mention/slash extensions and skip the parent submit while a popup is open. TODO in code. *Needs a live editor to verify the fix.*
  4. **HIGH `#abuse` — any non-`ollama/` model string accepted** (`api/chat/route.ts:316` `isValidChatModel`): a model whose provider infers to `openrouter` but isn't in `MODEL_PRICING` streams and prices at cost 0 (`estimateLLMCost` → 0) → free paid turn, fully refunded. Fix: validate against the `CHAT_MODEL_OPTIONS` allow-list, not "any non-ollama string".
  5. **MED `#bug` — empty Ollama response never finalizes** (`use-chat/ollama-web-transport.ts:86-92`): zero-chunk stream enqueues no `start`/`finish` envelope, only `close()` → SDK message left non-finalized, `onFinish`/`finishReason` may never fire. Fix: emit a start+finish envelope on zero-chunk completion. TODO in code.
  6. **MED `#bug` — readFile null-guards are dead branches** (`chat-input/index.tsx:457-458`, `:636`, `:656`): code guards `if (!fileContent)` / `if (!raw)` for the "could not read" toasts, but `CodeFileSystem.readFile` THROWS on a missing file (returns `string | Uint8Array` otherwise) → those toasts never fire (errors hit the generic catch) and a legit 0-byte file ("") falsely trips the guard. Fix: rely on try/catch for missing; treat only `null`/`undefined` as the empty case.
  7. **MED `#bug` — `activeBranchData` getter read before the branch null-check** (`chat-input/index.tsx:610-611`): `onMentionSelect` reads `editorEngine.branches.activeBranchData` (a getter that throws when no branch) on L610, then null-checks `activeBranch?.id` on L611 → the guard is unreachable; an uninitialized-branch mention throws into the catch. Fix: guard `branchId` first. (Same shape in `searchFiles`.)
  8. **MED `#race` — edit-while-streaming orphans the prior stream** (`use-chat/index.tsx:489`): `editMessage` calls `stop()` without awaiting, then immediately `regenerate`s; the still-aborting prior stream's late `onFinish`/`addToolResult` can write into a superseded response with continuation re-enabled. Fix: await `stop()` (or gate `regenerate` until `status==='ready'`).
  9. **MED `#race` — interrupted-stream recovery may double-send** (`use-chat/index.tsx:~553`): recovery compares the last user message text vs the mount-time pending turn inside an 800ms `setTimeout`; if hydration lands the interrupted turn just after the snapshot it can resend an already-present turn or regenerate the wrong one. Fix: re-read `messagesRef` + re-assert `status==='ready'` inside the timeout and dedupe by message id.
  10. **MED `#hook` — summarizer can re-fire for the same count** (`use-chat/use-summarizer.ts:~110`): effect cleanup resets `lastTriggeredCountRef=0` on every dep change, and each new summary bumps `summary.upToMessageId`, so the dedupe guard is zeroed and a summarize POST can re-fire for the count it just summarized. Fix: only reset on `conversationId` change.
  11. **LOW `#bug` — multi-branch restore toast logic** (`chat-messages/multi-branch-revert-modal.tsx:84`): fires `toastAllFailed` whenever `failCount > 0` (so partial failures read as total failure) and shows NO success toast when all succeed. Fix: branch on `failCount === results.length` (all-failed) vs `0 < failCount < length` (partial) vs success — needs two new i18n keys (regen `en.d.json.ts`, see agent-memory `project_i18n_typegen_staleness`), hence deferred.
  12. **LOW `#bug` — "Worked for Xs" timers wrong** (`chat-messages/message-content/index.tsx:252` + `actions-group.tsx:67`): every action group in a multi-cycle message gets the message-level `createdAt` as `startedAt` (2nd+ group elapsed inflated), and a group mounting already-finished (reload) never sets `frozenElapsed` so it drops the real duration. Fix: per-group start time; init `frozenElapsed` from `startedAt` when `!isStreaming` on mount.
  13. **LOW `#hook` — plan question card stuck interactive** (`chat-messages/message-content/plan-question-card.tsx:26`): `submitted` seeds from `answered` only on mount; if the question resolves elsewhere (5-min auto-timeout, other tab) and `answered` flips false→true, the card keeps showing clickable options. Fix: effect to set `submitted` when `answered` becomes true, or derive disabled from `submitted || answered`.
  14. **LOW `#ux` — composer steals focus on every message update** (`chat-input/index.tsx:206`): focus effect deps `[isStreaming, messages]` re-focus the input whenever messages change while not streaming, yanking focus from canvas/other fields. Fix: fire only on the `isStreaming` false-edge.
  15. **LOW `#bug` — suggestion retry budget inert** (`chat-input/index.tsx:189`): on failure it nulls `lastSuggestionSignatureRef` to allow a retry, but the effect only re-runs when its deps change, so the retry rarely fires. Fix: drive retries off an explicit counter in deps.
  16. **LOW `#tech-debt` — tool-name parse fragile** (`message-content/index.tsx:91`, `tool-call-display.tsx:43`, `tool-call-simple.tsx`, `tool-call-image-result.tsx`): `toolPart.type.split('-')[1]` works only because every tool name is snake_case; a hyphenated tool name or an AI-SDK `dynamic-tool` part would mis-parse. Fix: strip the leading `tool-` prefix and handle `dynamic-tool` via `toolPart.toolName`.
  17. **LOW `#security` — summarize route echoes Zod error** (`api/chat/summarize/route.ts:101`): returns `err.message` (may include body slices) to the caller; sibling `/api/chat` returns a fixed string. Low impact (user's own data). Fix: return `'Invalid request body'`, log server-side.
- **Clean (subagent-confirmed):** `hardStop` resets tool-spinner + gates continuation; queue persistence is idempotent; `inflightToolCalls` ref-counts parallel tools correctly; image compression auto-flattens promise; mention list modulo guarded with `Math.max(_,1)`.
- **Tags:** `#bug` `#billing` `#editor` `#ai` `#race`

### Component/wireframe/figma bug-hunt (iter-5 — untouched areas; subagent line refs, confirm before fixing)

- **Discovered:** 2026-06-17 (QA pass iter-5 — Sonnet subagent over component system / wireframes / copy-to-figma)
- **Note:** the iter-4 auth segment error-boundary dead-end (entry below) was **FIXED this pass** — see commit; `useErrorBoundaryAuthRedirect` now wired into `projects/error.tsx` + `project/[id]/error.tsx`.
- **Findings (ranked; verify each line ref before fixing):**
  1. **BLOCKER — `[object Object]` written on prop-reset in HTML projects** — ✅ **FIXED 2026-06-18 (commit `b6da02251`, iter-7).** `packages/parser/src/pipelines/html/index.ts` `applyEdits` ran every attribute value through `String(raw)`, so the `{ __remove: true }` sentinel (instance prop reset to default — handled by the JSX path) was coerced to the literal `"[object Object]"` and written into the HTML attribute instead of deleting it. Added a local `isRemoveSentinel` guard (kept out of the JSX/babel dependency) that `removeAttribute`s (mapping `className`→`class`) before the coercion, + a regression test in `html-pipeline.test.ts` (18 pass / 0 fail, typecheck + lint green).
  2. **BLOCKER — copy-to-Figma loses the user-gesture activation** (`src/components/store/editor/copy/figma.ts:~39-62`): `navigator.clipboard.write()` runs after `await fetchScene()` (100-500ms penpal RPC) → Chrome's transient-activation window expires → `NotAllowedError`, nothing pastes. Fix: pass a `ClipboardItem` whose `text/html` value is the deferred `fetchScene().then(...)` promise so the write is initiated synchronously inside the gesture. (Distinct from the ignored `getFigmaSceneData` not-found error.)
  3. **BLOCKER — wireframe maps every SSR error to "not found"** (`src/app/project/[id]/wireframe/page.tsx:~32-33`): auth failure / Convex outage / network error all become the `'not-found'` variant → logged-out users + outages see "Project not found" with no retry. Fix: re-throw `UNAUTHORIZED` as an auth variant, unknown errors as a retryable `'unknown'`.
  4. **HIGH** — `parser/src/template-node/map.ts` `getTemplateNodeChild` — ✅ **FIXED 2026-06-18 (commit `12f95012c`).** The "writes to the LAST sibling" claim was a misread: assign-then-stop already returned the Nth sibling for the common case. The real (narrow) defect was that a target sibling WITHOUT an oid leaked the previous sibling's instanceId instead of `null`. Now resolves the oid only at the target index; + `getTemplateNodeChild` tests (was untested). Remaining open in this cluster: `packages/figma-clipboard/src/figma-schema.ts:21` `FIG_KIWI_VERSION=15` hardcoded + decoded version skipped → silent no-paste on Figma format bump; wireframe `style-guide-view.tsx:~73` `handleSaveApply` has no try/catch/busy/error; wireframe `wireframe-workspace.tsx:~54` `void ensureDoc(...)` → infinite "Preparing…" on failure.
  5. **MED** — component prop writes bypass undo history (`components/index.ts:~467-548` — confirms known "prop undo" gap); `createHtmlComponentFromSelection` (`:~821`) first-occurrence `.replace` converts the wrong duplicate; right-click-menu figma actions (`right-click-menu/index.tsx:178,189`) drop the promise (no `void`); wireframe local-project silently emits to cloud; `generateStyleGuide` allows zero wireframes; no `wireframe/loading.tsx`.
  6. **LOW** — `StyleMode.Instance` is dead (never assigned → instance-only styling silently routes to master); `wireframeActions.ts:~45` `runWithRetry` zero-delay (no backoff on 429).
- **Clean (subagent-confirmed):** `~`-oid suffix split/join idempotent + double-guarded; `instanceId` scoped to boundaries; figma pako/buffer encoding + coordinate math correct; wireframe blockId coerce exhaustive with safe fallback; emit guard rejects zero-page projects.
- **Next step:** #1 (parser `[object Object]`) is the strongest verifiable next fix. #2/#3 need an authed/live editor to confirm.
- **Tags:** `#bug` `#editor` `#convex` `#parser`

### Auth/billing/chat bug-hunt (iter-4 — untouched areas; subagent line refs, confirm before fixing)

- **Discovered:** 2026-06-17 (QA pass iter-4 — Sonnet subagent over auth / settings-billing / AI-chat / breakpoints)
- **Findings (ranked; verify each line ref before fixing — moderate-confidence pass):**
  1. **HIGH — segment error boundaries dead-end on token expiry** (`src/app/projects/error.tsx`, `src/app/project/[id]/error.tsx`): a Convex `UNAUTHORIZED` thrown under these segments is caught by the segment boundary *before* the root boundary's re-auth redirect can fire → "Something went wrong" card with no sign-in path; "Try again" re-throws. Fix: mirror the root `error.tsx` — detect the unauthenticated error + `useAuth`, redirect to `/sign-in?returnUrl=…`. (Relates to the already-fixed root boundary, agent-memory `project_auth_signout_boundary`.) **Most actionable next fix; verifiable once an authed session exists.**
  2. **HIGH — pricing `pro-card` double-submit** (`src/components/ui/pricing-modal/pro-card.tsx:87-108`): `setIsCheckingOut(true)` is set inside each branch handler (`createCheckoutSession`/`updateExistingSubscription`/`handleCancelScheduledDowngrade`), not before dispatch → rapid double-click fires two Stripe checkouts. **Correct fix is a `useRef` synchronous in-flight guard at the top of `handleCheckout` (`if (inFlightRef.current) return; inFlightRef.current = true;` reset in `finally`)** — NOT merely moving `setIsCheckingOut(true)` earlier, which is still async React state and doesn't close the same-frame race. Deferred: payment code, not live-verifiable headless, and a wrong `finally` reset could leave checkout permanently disabled. Same class as iter-1's create double-submit + the commit double-submit.
  3. **HIGH — raw error strings to users**: `pro-card.tsx:134-168` shows `ALREADY_SUBSCRIBED` verbatim in a toast; `free-card.tsx:75-94` "Downgrade to Free" throws raw `"No active subscription found"` when `subscription` is transiently null. Fix: friendly mapping + early-return guard.
  4. **MED** — `use-chat/index.tsx:489` `editMessage` calls `stop()` without awaiting then re-queues → two streams in flight, old `onFinish` may still debit credits; `use-chat` `void regenerate(...)` (286/383) swallows pre-stream rejections (no `.catch`); queued messages stranded on non-`stop` finish reasons (712-718). `subscription-tab.tsx:67-79` "Manage billing" opens nothing + no error when `session.url` absent. `stripeWebhook.ts:330-358` `cancelAt` branch doesn't clear `scheduledPriceId` → UI shows downgrade + cancel at once.
  5. **LOW** — `subscriptions.ts:175` `getPriceId` declared `mutation` but pure read (write-lock per click; same pattern as iter-1's `_countProjectsByNamePrefix`, needs codegen to change); two middleware files (`src/middleware.ts` vs `apps/web/client/middleware.ts`) drifted; `src/components/ui/settings-modal/billing/` subtree + `auth-redirect.tsx` are dead code; import layouts drop `returnUrl`.
  6. **Corroboration** — the subagent independently re-found the shared-debounce style-write data loss (`editor/code/index.ts:276`), already logged from iter-1. Raises its confidence; same `do-not-fix-blind` caveat (core live-sync).
- **Next step:** Fix #1 (auth dead-end) first — highest user impact, mirrors an existing fix. #2/#3 are quick + safe once verified in an authed session.
- **Tags:** `#bug` `#auth` `#billing` `#ai`

### NOT-A-BUG correction: file-tree directory rename → `moveFile` (iter-3 finding retracted)

- **Discovered:** 2026-06-17 (QA pass iter-4 verification of the iter-3 "directory rename OID staleness" finding)
- **Resolution:** Not reachable. `file-tree-node.tsx:71` blocks rename for directories (`if (node.data.isDirectory) return`), so `handleRenameFile` (`code-tab/index.tsx:519`) only ever receives **file** paths — `moveFile` is correct for its inputs. Directory moves that DO happen (page rename/move) already call `moveDirectory` via `pages/helper.ts:962-1073`. The iter-3 entry below over-rated this; left as a record so it isn't "fixed" again.
- **Tags:** `#not-a-bug`

### Editor bug-hunt: CMS bind-dialog, file-tree directory rename, commit flow (iter-3)

- **Discovered:** 2026-06-17 (QA pass iter-3 — focused editor bug-hunt subagent, 39 tool-uses, line refs read-confirmed)
- **Where:** CMS `…/cms/bind-dialog.tsx`, `…/cms/items-table.tsx`, `convex/cmsBindings.ts`; file tree `…/file-tree/index.tsx`, `packages/file-system/src/code-fs.ts`; commit `…/top-bar/git-actions.tsx`
- **Findings (ranked):**
  1. **HIGH — CMS bind-dialog stale target** (`bind-dialog.tsx:157-174`): mode detection reads `editorEngine.elements.selected[0]` on every render. Open the dialog on element A, click element B on canvas → `mode` reflects B while `oid` still targets A; saving can persist a `REPEAT`/`CURRENT_FIELD` binding onto a non-list element. Fix: resolve by `oid` (not `selected[0]`), or close on selection change.
  2. **HIGH — directory rename leaves OID index stale** (`file-tree/index.tsx:533` `handleRenameFile` → `code-fs.ts:499`): renaming a *directory* calls `CodeFileSystem.moveFile` (re-keys OID only for file pairs), never `moveDirectory`, so OID metadata for files under the renamed dir keeps old paths → canvas silently can't resolve elements in those files. Fix: dispatch directory targets to `moveDirectory`.
  3. **HIGH — CMS filters silently dropped on re-save** (`bind-dialog.tsx:167-174`): re-saving a `FIRST_FIELD`/`REPEAT` binding doesn't load existing `filters`/`filterMode` into form state; `upsert` overwrites the whole doc → saved filters lost. Fix: round-trip or merge existing payload.
  4. **MED** — `items-table.tsx:72` item list capped at 100 (badge/search/preview miss overflow; TODO at :69); `items-table.tsx:186-192` bulk-delete partial failure deselects failed ids + swallows error message; `git-actions.tsx:109` commit double-submit race (`useState` guard read before re-render → two commits — use a `useRef` in-flight guard); `git-actions.tsx:158-162` staged-only commit always uses `'New Weblab backup'` placeholder instead of auto-generating (TODO at :156); `file-tree/index.tsx:561-597` delete-directory tab-close prefix check can miss orphaned tabs (path normalization).
  5. **LOW** — `cmsBindings.ts:82,102` binding list truncates at 2000; `git-actions.tsx` `continueDisabled` excludes `fileCount===null` (commit possible while count loads); code-tab rapid double-close dirty-check race.
- **Clean:** `cmsCollections.remove` cascades correctly; `cmsBindings.upsert` dedup handles the TOCTOU race; file/folder create modals derive collision warnings correctly; commit dialog surfaces git errors + PR URL and blocks committing on the default branch.
- **Next step:** Fix #1–#3 first (data-corruption / silent-failure). All are editor-internal → verify in an authed editor session (currently blocked).
- **Risk if ignored:** Corrupted CMS bindings, broken element resolution after directory rename, duplicate commits.
- **Tags:** `#bug` `#editor` `#cms` `#convex`

### Dead code: `/landing-old` route + old home chain (`home-page-client-old`, V1 section, `ComponentsBlock`)

- **Discovered:** 2026-06-17 (QA pass iter-3, while tracing hydration #418)
- **Where:** `apps/web/client/src/app/landing-old/page.tsx`; `…/_components/home-page-client-old.tsx`; `…/landing-page/what-can-weblab-do-section.tsx` (V1, vs the live `-v2`); `…/landing-page/feature-blocks/components.tsx` (`ComponentsBlock`); `…/landing-page/_demo-backup-20260605/` dir
- **Symptom:** The live landing (`/`) renders `home-page-client.tsx` (V2 sections). The V1 chain is reachable only via the separate `/landing-old` route. It still ships in the bundle and carries real SSR hazards (e.g. `ComponentsBlock`'s live `new Date().toLocaleString('default')` calendar). An iter-1 UX critique and an iter-3 #418 hunt both wasted time on this dead chain.
- **Next step:** Confirm `/landing-old` isn't an intentional reference/A-B route (ask owner — do NOT delete unilaterally), then remove the route + `home-page-client-old.tsx` + V1 section + `ComponentsBlock` + the `_demo-backup-20260605` dir. `bun typecheck` will confirm nothing else imports them.
- **Risk if ignored:** Dead code rots and repeatedly misleads audits; ships unused JS.
- **Tags:** `#tech-debt`

### React hydration error #418 on the production landing page

- **Discovered:** 2026-06-17 (QA pass iter-2 — direct Playwright against live `weblab.build`)
- **Where:** `apps/web/client/src/app/page.tsx` + `_components/hero/*` / promo bar / footer (exact component TBD)
- **Symptom:** Live landing throws a single `pageerror`: *"Minified React error #418; …args[]=HTML"* (hydration: server-rendered HTML did not match client). Console is otherwise clean (0 console errors) and the page renders fine across 1440/768/375. Also seen: one `net::ERR_ABORTED` on a `/projects?_rsc=` prefetch — likely benign Next prefetch cancellation, not tracked separately.
- **Root cause:** Not yet pinned. Iter-3 ruled out the obvious suspects on the *reachable* landing tree (page.tsx → HomePageClient → HeroV2 / ResponsiveMockupSection / WhatCanWeblabDoSectionV2 / FeatureTrioSection / FAQSection / ChangelogGrid / CTASection / PageFooter):
  - `unicorn-background.tsx` + `promo-banner/index.tsx` — both correctly mount-guarded (`webglSupported===null` / `mounted` flag) → render identically server vs first-client. Not it.
  - `changelog-grid.tsx` — formats dates via `date-fns format(parsed,'MMM d, yyyy')`, which is locale-deterministic. Not it.
  - `feature-blocks/components.tsx` (`ComponentsBlock`, renders live `new Date().toLocaleString('default',…)` + a "today"-highlighted calendar — a genuine SSR hazard) is **dead on the real landing**: only `what-can-weblab-do-section.tsx` (V1) renders it, and V1 is only reachable via `home-page-client-old.tsx` → the `/landing-old` route. Not the `/` culprit.
  - Live DOM nesting scan (Playwright) found no reparenting patterns (`a a`, `button button`, `p>div`, `p>p`). Only `div`-in-`button` (×17 swatch indicators) — invalid per spec but browsers don't reparent it, so not a hydration cause.
- **Next step:** Static + DOM analysis didn't pin it — needs the React component stack. Run the landing against a non-minified build (`next dev` or a non-prod-minified build) so the `react.dev/errors/418` decoder names the component, OR add a temporary `onRecoverableError` logger in the root layout to capture the component stack in prod. Likely a motion-driven conditional render or a third-party (UnicornScene / next-intl / framer) SSR/client divergence.
- **Risk if ignored:** Hydration mismatch forces a client re-render of the subtree (layout flash / wasted work) and can desync interactive state; also a soft SEO/perf signal. Cosmetic today but real.
- **Tags:** `#bug` `#perf` `#public`

### Dead component: `hero/start-blank.tsx` (`StartBlank`) has no importers

- **Discovered:** 2026-06-17 (QA pass iter-2)
- **Where:** `apps/web/client/src/app/_components/hero/start-blank.tsx`
- **Symptom:** `StartBlank` is not imported anywhere (`rg "import .*StartBlank|<StartBlank"` → 0 hits). The real "Start blank" CTA users see is in `apps/web/client/src/app/projects/_components/project-chooser-cards.tsx` (calls `useCreateBlankProject` directly). Iter-1's UX assessment critiqued this dead component's low-weight `text-foreground-secondary` button — moot until it's wired up or deleted. Note: the live component is also a raw `<button>` (button-enforcement candidate).
- **Next step:** Delete `start-blank.tsx`, or wire it in if it was meant to be the hero CTA. Separately, audit `project-chooser-cards.tsx`'s blank CTA against [button-enforcement.md](docs/agent-context/button-enforcement.md).
- **Risk if ignored:** Dead code rots; future agents (like iter-1) waste effort assessing it.
- **Tags:** `#tech-debt`

### Preview-down (`SANDBOX_NOT_LISTENING`) gives a silent dead-end, and edits are lost after a false recovery

- **Discovered:** 2026-06-17 (QA pass — editor preview/sandbox bug-hunt, subagent line refs need a final confirm)
- **Where:** `apps/web/client/src/lib/sandbox-server-client.ts` (`:8080` WS URL fallback); `apps/web/client/src/app/project/[id]/_components/canvas/frame/index.tsx` + `view.tsx` (boot overlay grace windows: `NOTFOUND_GRACE_MS` ~90s, `PENPAL_LOG_FAILURE_THRESHOLD` = 2)
- **Symptom:** Two coupled problems. (1) When the in-sandbox `:8080` web-server (`@weblab/web-server` running `next dev`) is unreachable in prod (the known un-deployed-Railway-service case), the boot overlay suppresses any retry CTA for up to ~90s while `livenessState === 'notFound'`, and the first 2 Penpal/502 failures are silenced — so the user stares at a blank canvas + spinner with **zero affordance** for up to ~90s. (2) Worse false-recovery: the Convex liveness probe checks the *public preview URL*, which can eventually return 200 once `next dev` boots, so the overlay clears and the editor *looks live* — but the edit channel (WS to `:8080`) never connected, so **every code/style edit is silently discarded**. No edit-channel health indicator exists.
- **Root cause:** Preview liveness and edit-channel liveness are checked independently; only preview liveness gates the overlay. Plus the grace windows optimize for the cold-boot happy path at the cost of the genuine-failure path.
- **Next step:** (a) Surface a WS/edit-channel connection status indicator in the editor toolbar (highest-impact single fix). (b) Show a "still connecting…" banner from the *first* 502 instead of waiting for the threshold. (c) Gate the overlay-clear on edit-channel health, not just public-URL 200. Pairs with the still-pending manual Railway `:8080` service + `NEXT_PUBLIC_SANDBOX_SERVER_URL` (see agent-memory `project_sandbox_server_not_deployed`).
- **LIVE REPRO (2026-06-17 iter-6, authed Playwright on localhost):** Opened a 26m-old project's editor. Editor chrome renders perfectly (Design/Code/CMS tabs, Desktop/Tablet/Phone frames, Chat panel). Preview iframe = `https://sb-…vercel.run/` returning **`502: SANDBOX_NOT_LISTENING`**. Sequence: the original sandbox returned **410 (gone/expired)**, the editor tried to wake a fresh one (`sb-4enrynb0b27r`) → 502 not-listening, persisting through 75s. **Root cause seen in console:** `ws://localhost:8080/trpc` WebSocket handshake → **500** (×13) → `[VercelBrowserProvider] dev server setup failed: Closed before connection was established` → the sandbox never runs `next dev`. **CORRECTION to the symptom above:** the recovery is NOT a silent 90s dead-end — by ~45s the overlay shows "Still starting up", an underlined **"Restart preview"**, and a **"Trouble connecting to your preview. Your sandbox may still be waking up." + "Retry preview"** card. Clear + timely. (Caveat: the `:8080` server in this run was a pre-existing one of unknown health — the WS-500 may be a stale-server artifact; confirm with a fresh `bun dev:remote` before treating the 500 as a code bug. The 410→502 sandbox-expiry/re-provision path is real.)
- **Risk if ignored:** Core prod failure mode = user silently loses all edits with no error. This is the most dangerous UX defect found.
- **Tags:** `#bug` `#editor` `#infra`

### Hero create flow: AI-prompt dead-end + "Start blank" is visually buried

- **Discovered:** 2026-06-17 (QA pass — UX assessment, 32-tool-use subagent, higher confidence)
- **Where:** `apps/web/client/src/app/_components/hero/create.tsx` (AI input + UNAVAILABLE toast path, ~line 272); the hero "Start blank" button component; `apps/web/client/convex/projectActions.ts` create-cap gating
- **Symptom:** On Vercel the hero AI prompt input is the most visually prominent element but is non-functional — typing a prompt and submitting yields a developer-worded toast ("…sandbox layer is being migrated to Convex…") with **no forward action**, then the hero resets. The only working path, "Start blank", is rendered as low-weight `text-foreground-secondary` link-style text below the pill buttons — easy to miss. New users hit a dead end on their most likely first action.
- **Next step:** (a) Add a "Start blank instead" action button to the unavailable toast + rewrite the copy in user terms. (b) Elevate "Start blank" to an outline pill button matching the other CTAs. (c) Ideally render the AI input in a visibly-disabled "coming soon" state at render time (feature flag) instead of failing at submit. Verify visually once an authenticated browser session is available.
- **Risk if ignored:** High new-user bounce — first interaction looks broken and the working path is hidden.
- **Tags:** `#bug` `#ux` `#editor`

### Project-create reliability: orphaned rows on scheduler failure + orphaned paid VM on provision timeout

- **Discovered:** 2026-06-17 (QA pass — create-flow bug-hunt; subagent line refs are approximate, confirm before fixing)
- **Where:** `apps/web/client/convex/projectActions.ts` (`createBlank` insert→`scheduler.runAfter(_provisionSandbox)`, ~line 472-491); `packages/code-provider/src/providers/vercel-sandbox/index.ts` (`withTimeout` ~45s race around `Sandbox.create`, and `VercelTerminal.run()` overwriting `this.command` without `.kill()`)
- **Symptom:** (1) If scheduling `_provisionSandbox` throws after the optimistic project graph is inserted, the project rows persist with no sandbox and no `_markProvisioningFailed` — the editor spins forever with no error path. (2) On the 45s provision timeout the overlay errors out but the underlying `Sandbox.create` SDK call keeps running to Vercel's own timeout → orphaned **paid** VM (no abort/cancel). (3) `VercelTerminal.run()` can accumulate zombie background processes (no kill of the prior detached command).
- **Next step:** (1) Compensating cleanup in the catch, or move inserts into the scheduled action so partial state is impossible. (2) Wire an `AbortController`/SDK cancel into the `withTimeout` race `finally`. (3) `this.command?.kill()` before reassigning. Confirm exact lines first (these came from a low-tool-use subagent).
- **Risk if ignored:** Stuck "ghost" projects; real billing leak from orphaned VMs.
- **Tags:** `#bug` `#convex` `#infra`

### Editor style-write data loss via single shared rebase debounce (needs confirmation)

- **Discovered:** 2026-06-17 (QA pass — subagent finding, line ref approximate)
- **Where:** `apps/web/client/src/components/store/editor/code/index.ts` (`scheduleSourceRebase` shared `lodash.debounce`, ~line 276); related `apps/web/client/src/components/store/editor/sandbox/index.ts` (async sync-engine init reaction, no serialization guard)
- **Symptom:** A single debounce instance is shared across all `(oid, property)` rebases — two different elements/properties edited within ~600ms cancel each other, dropping the first element's style write (silent data loss). Separately, an async MobX reaction can call `releaseSyncEngine()` on an in-flight `initializeSyncEngine()` during rapid provider transitions, silently stopping canvas sync.
- **Next step:** Per-`(oid, property)` keyed debounce map; serialize the sync-engine init with an `isInitializing` guard or cancel-in-flight. **Verify both line refs and the actual debounce sharing before changing — do not fix blind; this is core live-sync code and a wrong fix breaks editing.**
- **Risk if ignored:** Intermittent lost style edits during fast multi-element editing.
- **Tags:** `#bug` `#editor`

### Project-name dedup — over-count fixed; residual gap/race remains

- **Discovered:** 2026-06-17 (QA pass) — **over-count FIXED this commit**
- **Where:** `apps/web/client/convex/projects.ts` `_countProjectsByNamePrefix` (~line 1099); caller `apps/web/client/convex/projectActions.ts` (~line 459)
- **Symptom (fixed part):** `startsWith` prefix match counted `"New Project · Jun 1"` against `"Jun 10".."Jun 19"`, inflating the `(N)` suffix. Now matches the exact base + numbered siblings only (offline-verified: 6→3, suffix 7→4).
- **Residual:** Two creates in the same tick read the same count (no atomicity), and deleting a middle sibling leaves a gap so `existingCount + 1` can still collide.
- **Next step:** Move dedup into an atomic insert (compute next-free suffix inside the insert mutation), or switch `_countProjectsByNamePrefix` → an `internalQuery` returning taken names and pick the smallest free `(N)` — note this requires Convex codegen regen (blast-radius care on the shared tree).
- **Risk if ignored:** Occasional duplicate/gapped project names on rapid or post-delete same-day creation. Cosmetic.
- **Tags:** `#bug` `#convex`

### QA tooling blockers (live authenticated QA could not run autonomously)

- **Discovered:** 2026-06-17 (QA pass)
- **Where:** environment / MCP config, not app code
- **Symptom:** Three blockers stopped live end-to-end QA of the authenticated app: (1) `weblab-agent` MCP returns `[AUTH_FAILED] invalid or missing agent token` — no live API signal even read-only (agent token expired/unset; per memory the agent API is dev-only / prod unconfigured). (2) gstack `browse` daemon fails — Playwright chromium not installed (`npx playwright install` needed). (3) The live app (create/editor/preview/publish) is Clerk-gated, unreachable headless without a logged-in browser session. Public marketing landing is healthy (verified via WebFetch).
- **Next step:** To enable live authed QA next iteration: (a) refresh the `weblab-agent` MCP token (and confirm whether it points at dev `avid-gnat-539` or prod), or (b) run `npx playwright install` + drive gstack `browse` in CDP mode against a real Chrome already logged into weblab.build, or (c) provide an authenticated cookie export for `browse cookie-import`.
- **Risk if ignored:** Project-creation + editor flows can only be reviewed at code level, not exercised live; the preview-down recovery defect above can't be reproduced end-to-end without this.
- **Tags:** `#infra` `#test-gap`

### Layers panel: "Cannot delete element — Remove action not found"

- **Discovered:** 2026-06-17 (user report — deleting `div` / `main` rows from the Layers panel)
- **Where:** client `apps/web/client/src/components/store/editor/element/index.ts:170-178` (emits the toast when `getRemoveAction` returns null); preload `apps/web/preload/script/api/elements/dom/remove.ts:8-43` + `apps/web/preload/script/api/elements/dom/helpers.ts:20-33` (where the null originates)
- **Symptom:** Selecting a layer and deleting shows toast **"Cannot delete element — Remove action not found. Try refreshing the page."** and the element stays.
- **Root cause (CONFIRMED by elimination):** `getRemoveAction(domId)` returns `null` via its **"Element has no oid"** exit — the selected DOM element carries no `data-oid`, so it can't be mapped to source and removed. Verified that the deterministic layers are all correct: the parser stamps every element incl. `<main>`/`<div>` (`addOidsToAst`), the shipped preload artifact is current (contains `getRemoveAction` + the `"has no oid"` path), and the sync engine's `this.fs` is a `CodeFileSystem` (instruments on write). The one code path that writes JSX to the sandbox **bypassing** CodeFileSystem is the scaffolder (`scaffoldNextProject` / `scaffoldStaticHtmlProject` in `packages/code-provider/src/providers/vercel-sandbox/index.ts`) — it wrote raw `<main className="min-h-screen" />` etc. So a freshly-scaffolded element's oid depended entirely on the async boot `pullFromSandbox → instrument → pushModifiedFilesToSandbox` chain landing, and that push is fire-and-forget with per-file errors swallowed (`sync-engine.ts:242, 559-581`).
- **Fixed this pass (Vercel Next scaffold):** scaffold JSX is now pre-instrumented with `data-oid` before being written to the sandbox, so the first served render is editable independent of the boot push. New module `packages/code-provider/src/providers/vercel-sandbox/scaffold-instrument.ts` (`instrumentScaffoldJsx`, idempotent with boot re-sync, raw-fallback on parse failure) + `scaffold-instrument.test.ts`; wired into `scaffoldNextProject`.
- **Remaining (follow-ups):**
  1. **Existing projects** scaffolded before this fix are NOT retroactively healed — they rely on the boot push-back. If a reload doesn't restore deletability, harden `pushModifiedFilesToSandbox` (currently `void` + swallowed per-file errors): `await` it and retry failed files so existing projects self-heal on reload.
  2. **Static-HTML scaffold** (`scaffoldStaticHtmlProject`, raw `<body><main></main>`) has the same gap via the HTML pipeline — pre-instrument with `htmlPipeline.injectOids`.
  3. **Local/desktop scaffold** (`getNextJsScaffoldFiles` via `use-open-local-project.ts`) writes raw too — same class.
  4. **Diagnostics:** make `getRemoveAction` return a discriminated reason instead of bare `null` so the toast can distinguish "not linked to source" from "transient — try refreshing".
- **Risk if ignored:** Users can't delete freshly-scaffolded elements; the "Try refreshing the page" advice is misleading for the missing-oid case.
- **Tags:** `#bug` `#editor` `#partially-fixed`

### Prod preload pin staleness (jsDelivr SHA must be hand-bumped on every rebuild)

- **Discovered:** 2026-06-17 (copy-to-figma "Method `getFigmaSceneData` is not found" investigation)
- **Where:** `packages/constants/src/files.ts` (`WEBLAB_PROD_PRELOAD_SCRIPT_SRC`, `PRIOR_WEBLAB_PROD_PRELOAD_SCRIPT_SRCS`)
- **Symptom:** In prod (`isDev=false`) the editor injects the preload `<Script>` from a jsDelivr URL pinned to a fixed commit SHA. The pin sat at `ec326199` (2026-05-03) while preload methods kept landing on `main`, so **every preload method added after the pin** (`getFigmaSceneData`, `serializeDocumentForOffline`, `playInteraction`/interactions bridge, `setCmsData`) threw penpal `METHOD_NOT_FOUND` in prod. Fixed this round by bumping the pin to `d73589eed` + deprecating the old URL so baked-in layouts self-heal on next sandbox boot.
- **Root cause:** jsDelivr `@<sha>` is immutable, so the pin requires a manual bump + redeploy on every preload rebuild. Easy to forget; rots silently (no error until a user calls a newer method). 2nd preload-staleness class (see also "preload artifact must be committed").
- **Next step:** kill the manual step. Either (a) serve the prod preload from the app's own origin (`https://weblab.build/weblab-preload-script.js`) via an env-driven absolute URL — scripts load cross-origin without CORS, the file is already in `public/` + allowed by middleware, and it auto-tracks every deploy; or (b) add a build/CI guard that diffs the artifact at the pinned SHA against `apps/web/client/public/weblab-preload-script.js` and fails on drift. (a) removes the footgun entirely; (b) just catches it.
- **Also:** `packages/parser/test/layout.test.ts` hardcodes `SHOULD_UPDATE_EXPECTED = true`, so that suite always rewrites its `expected.tsx` fixtures and can never fail — a no-op gate. Flip to `false` (env-gated for updates) so it actually protects injection output.
- **Risk if ignored:** next preload method added without a pin bump silently breaks in prod again; the always-green layout test masks injection regressions.
- **Tags:** `#tech-debt` `#infra` `#test-gap`

### Code-review follow-ups (2026-06-17 pre-push review pass)

- **Discovered:** 2026-06-17 (caveman-review + manual review of the token-cost / model-lineup / sandbox-server / create-flow ship)
- **Where:** `apps/web/client/src/app/api/ai/tab-complete/route.ts`; `apps/web/client/src/components/ai-prompt-composer/model-picker/model-selector-v2.tsx`; `apps/web/client/src/components/ui/pricing-modal/pro-card.tsx`
- **Items (none blocking — all conscious trade-offs or style, no regression vs prior behavior):**
  1. **tab-complete reconcile is fire-and-forget** (`void incrementUsage(req).then(reconcile)`). On a serverless freeze after the Response returns, the chained `reconcileUsage` can be dropped, leaving the completion at the conservative flat 1-credit (the ~100× overcharge this ship fixes). `terminal-command`/`summarize` `await` reconcile for exactly this reason. Fix if accuracy > completion latency: `await` the increment→reconcile chain. No regression today (matches the pre-existing fire-and-forget meter).
  2. **Custom OpenRouter model input accepts any string.** An unknown ID is absent from `MODEL_PRICING` (reconcile → cost 0 → free request) and `MODEL_MAX_TOKENS` (no max-output). Add a `provider/model` shape guard, and surface a "billed at cost; unpriced models are free" hint. Power-user escape hatch; not a breakage.
  3. **Style nits:** model-selector custom input uses raw `<input>`/`<button>` (should be `@weblab/ui` `<Button>` + canonical input per button-enforcement.md); `pro-card` tier-selector trigger uses hardcoded `bg-[#0d0d0d]`/`#181818` instead of design tokens (intentional high-contrast fix — migrate to tokens when a high-contrast token pair exists).
- **Risk if ignored:** Minor — occasional tab-complete overcharge under serverless freeze; tiny revenue leak on manually-entered unpriced models. No user-facing error.
- **Tags:** `#tech-debt` `#billing` `#ui`

### Token-cost billing: follow-ups after the reserve-then-reconcile cutover

- **Discovered:** 2026-06-17 (token-cost billing ship)
- **Where:** `apps/web/client/convex/{usage,lib/creditCost,schema}.ts`, F-557
- **Symptom / follow-ups (none blocking — feature is live & verified):**
  1. **Deploy gate:** the new `costUsd` field on `usageRecords` + the
     `reconcileUsage` mutation must be deployed to the Convex backend (dev
     `avid-gnat-539` synced via `convex codegen`; prod ships via
     `convex-deploy-production.yml`). Until prod deploys, `reconcileUsage`
     calls 404 and the route's try/catch swallows it → billing silently stays
     at the conservative reserved 1 credit. Verify after the next prod deploy.
  2. **Tuning levers** live in `convex/lib/creditCost.ts`:
     `LLM_COST_BUDGET_FRACTION` (0.5 = 50% of plan price is model-spend budget)
     and `FREE_CREDIT_VALUE_USD` (0.125, mirrors T1). Free users currently get
     ~$6.25/mo of model spend (50 credits × $0.125) — lower `FREE_CREDIT_VALUE_USD`
     if free-tier burn is too high at scale.
  3. **Sync footgun:** `PRO_TIER_COST_CENTS` in `creditCost.ts` mirrors the
     `cost` of `PRO_PRICES` in `packages/stripe/src/constants.ts` (the Convex
     `prices` table has no `cost` column). Cross-ref comments added on both
     sides; a future improvement is to store `cost`/`creditValueUsd` on the
     `prices` row + backfill via the Stripe webhook to kill the duplication.
  4. **Not yet token-priced (intentional, out of scope):** `ASK`/`PLAN` chat
     remain free (as before); image generation stays a flat 5 credits
     (`reserveImage`). Re-price these if/when desired.
  5. **Unknown-model cost = 0** → reconcile fully refunds the reservation (free
     message). All routed models are in `MODEL_PRICING`; a registry gap would
     silently make those requests free. The existing `[observability] no pricing
     for model` warning is the signal to watch.

### Cloud preview overlay never reveals an alive-but-not-yet-bridged page

- **Discovered:** 2026-06-16 (bug-hunt; preview AI-1, verdict partial/high)
- **Where:** `apps/web/client/src/app/project/[id]/_components/canvas/frame/index.tsx:312,578-586`; `frame-connection.ts:28-43`; `use-sandbox-liveness.ts`
- **Symptom:** For a CLOUD (Vercel) frame, the opaque `bg-background` boot overlay only lifts on `isFrameReady = preloadScriptReady && isPenpalConnected`. A sandbox serving HTTP 200 (`livenessState==='alive'`) stays fully hidden behind the overlay until the preload+penpal bridge completes. The `alive`-lifts-overlay shortcut (`localPreviewReady`, index.tsx:312) is `isLocalFrame`-only — no cloud equivalent.
- **Root cause:** No `cloudPreviewReady`. `shouldUnlockCodeSandboxPreview()` hardwired false.
- **Next step:** Add `const cloudPreviewReady = !isLocalFrame && livenessState==='alive' && !hasBuildErrors && preloadScriptReady;` and, once true, switch the overlay from opaque to a translucent "connecting tools" hint (show the rendered page, small corner spinner) while penpal finishes. Do NOT reveal before `preloadScriptReady` (an unbridged iframe makes select/edit no-op). Keep build-error + `sandboxIsGone`/Restart paths intact.
- **Risk if ignored:** After the :8080 deploy lands, normal boots are fine, but a slow/failed penpal handshake reads as "blank page, loading forever" instead of a usable preview.
- **Tags:** `#bug` `#editor` `#preview`

### Blank-create path forces a full window.location.reload() mid-create

- **Discovered:** 2026-06-16 (bug-hunt; creation AI-3, verdict confirmed/high)
- **Where:** `apps/web/client/src/app/project/[id]/_components/canvas/frame/index.tsx:183-189`; `convex/projectActions.ts:472-491` (createBlank optimistic) vs `:683-728` (createFromPrompt synchronous)
- **Symptom:** "Start blank" inserts frames with empty URLs + provisions in the background; when the real URL lands, the frame effect calls `window.location.reload()`, replaying the whole loader chain (loading.tsx → Main → frame overlay) + a white flash. The hero AI-prompt path (`createFromPrompt`) provisions synchronously and is NOT affected.
- **Next step (preferred):** Align `createBlank` with `createFromPrompt` — provision the sandbox synchronously and `_insertProjectGraph` with `sandboxUrl` set, so frames are never inserted at `url:''` and the reload effect never fires. Cost: blank open waits ~13s (warm) on one loader (same UX as the prompt path). Alternative (keeps optimistic open): replace `window.location.reload()` with `immediateReload()` (reloadKey bump) ONLY after making the EditorEngine branch sandbox metadata reactive to the live Convex query — naive reloadKey swap regresses the "boot with correct branch sandboxId" guarantee (comment at index.tsx:180-182).
- **Risk if ignored:** Blank-create feels broken (double loaders + flash). Not on the user's AI-prompt flow.
- **Tags:** `#bug` `#editor` `#ux`

### projectReadyState.sandbox flips true on provider construction, not real readiness

- **Discovered:** 2026-06-16 (bug-hunt; wiring AI-3, verdict partial/high)
- **Where:** `apps/web/client/src/app/project/[id]/_hooks/use-start-project.tsx:186-188`; `components/store/editor/sandbox/session.ts:157-161`
- **Symptom:** `sandbox` ready-flag flips the instant `VercelBrowserProvider` is constructed (synchronous), independent of whether the :8080 WS actually connected or the dev server started. So the editor can open (isProjectReady true via Convex-driven canvas+conversations) with a dead/booting preview and no surfaced error.
- **Next step:** Add a `session.devServerReady` observable set after `task.open()`/dev-server start resolves, and gate `updateProjectReadyState({ sandbox: true })` on it. (Partly mitigated already by the 60s `startDevServer` WS timeout added 2026-06-16 in `vercel-browser-provider.ts`, which now surfaces a hard error instead of hanging.)
- **Risk if ignored:** "Entered the editor but preview never works, no error" until the watchdog fires.
- **Tags:** `#bug` `#editor` `#preview`

### Preload-injection failure can't be re-armed by the user; "alive but preload-failed" mislabeled

- **Discovered:** 2026-06-16 (bug-hunt; preview AI-2, verdict partial/high)
- **Where:** `components/store/editor/sandbox/index.ts:373-401` (latch + private `resetPreloadRetryState`); `use-frame-reload.ts:68-80` (`immediateReload` doesn't reset preload state); `frame/index.tsx` restart panel
- **Symptom:** After the preload-retry budget (5 non-transient / 30 transient) is exhausted, `preloadScriptState` latches NOT_INJECTED. The existing Restart/Retry panels reload the iframe but never re-call `ensurePreloadScriptExists()`, so a preload/parse failure can't recover without a full provider restart or page reload. When the page is `alive` but preload failed, the panel offers "Restart dev server" — which doesn't fix injection.
- **Next step:** Expose a public `retryPreloadInjection()` (calls `resetPreloadRetryState()` + `ensurePreloadScriptExists()`) and call it from the frame retry/restart handlers. Add a distinct `preloadFailed` signal (NOT_INJECTED && budget exhausted && !sandboxGone) with a panel whose primary action is `retryPreloadInjection()`.
- **Risk if ignored:** Rare terminal preload failures need a manual page reload to recover.
- **Tags:** `#bug` `#editor` `#preview`

### resumeCreate doesn't mark the create request terminal on send failure

- **Discovered:** 2026-06-16 (bug-hunt; wiring AI-5, verdict partial/medium)
- **Where:** `apps/web/client/src/app/project/[id]/_hooks/use-start-project.tsx:541-547` (catch); `convex/projectCreateRequests.ts:24-39` (`updateStatus` accepts FAILED already)
- **Symptom:** If `sendMessage` throws, the create request stays PENDING forever (`hasPendingCreation` truthy), the right panel keeps its mount-only wide "first-creation" layout, and the user gets only a dismissible toast — no inline retry.
- **Next step:** In the catch, when the failure is at/after `sendMessage`, `await updateCreateRequest({ projectId, status: ProjectCreateRequestStatus.FAILED })` (enum value exists). For pre-send (context-gather) failures, trigger a real retry (bump a retry-counter in the effect deps; `processedRequestIdRef=null` alone doesn't re-fire). Surface an inline retry CTA in the chat panel, not the frame overlay.
- **Risk if ignored:** A failed first AI send leaves a stale PENDING request + lingering wide panel until reload.
- **Tags:** `#bug` `#editor` `#ai`

### Editor AI tool loop: one full HTTP round-trip per tool step

- **Discovered:** 2026-06-16 (bug-hunt; ai-loop AI-1, verdict partial/high)
- **Where:** `packages/ai/src/tools/toolset.ts:54-73`; `apps/web/client/src/app/project/[id]/_hooks/use-chat/index.tsx:161-164`; `apps/web/client/src/app/api/chat/route.ts`
- **Symptom:** read/list/grep/edit are client tools with no server `execute`, so each assistant turn ending in tool-calls terminates the server stream and the browser fires a fresh POST `/api/chat` that re-runs the full route setup + re-sends the growing transcript. N sequential tool turns ≈ N round-trips. (The biggest per-step stall — unbounded mem0 search — was fixed 2026-06-16: timeout + skip-on-continuation in route.ts.)
- **Next step (cheap wins first):** Cache per-turn-invariant context (skills, tier, summary, projects.get) across continuation POSTs of the same turn (key on conversationId+traceId or thread via the transport). Lean on the existing conversation summarizer so continuations ship a compacted transcript. Confirm the Anthropic prefix cache is actually hit on continuations. Server-side tool batching (convert read tools to ServerTool) is a separate, large architecture project — requires a server-authoritative file store for the agent; do not bundle.
- **Risk if ignored:** Multi-step AI tasks feel slow on high-latency networks even after the mem0 fix.
- **Tags:** `#tech-debt` `#ai` `#perf`

### GitHub OAuth completes but bounces to /sign-in (Clerk verified-email / account-linking config)

- **Discovered:** 2026-06-16 (user-reported "GitHub login doesn't work; Vercel works")
- **Where:** Clerk Dashboard config — NOT code. The app OAuth flow is provider-agnostic: `apps/web/client/src/app/sign-in/_components/clerk-auth-form.tsx:332` (`authenticateWithRedirect`, only the `strategy` string differs), callback `apps/web/client/src/app/sign-in/sso-callback/page.tsx`.
- **Symptom:** User authorizes on GitHub, returns, lands back on `/sign-in?returnUrl=/w/personal-…/projects` (the workspace layout's `getCurrentUser()` → null → `redirect(getSignInUrl(...))`). Vercel OAuth works through the identical callback infra.
- **Root cause:** Clerk instance requires a **verified email** (`user_settings.attributes.email_address` = `required:true` + `verify_at_sign_up:true`, confirmed live via FAPI `GET https://clerk.weblab.build/v1/environment`). GitHub returns no verified/usable primary email for this user (email privacy or unverified), OR the existing (Vercel-created) account isn't auto-linked because account-linking is off / demands a verified email. Vercel always returns a verified email → succeeds. **It is NOT the GitHub OAuth-app callback URL** — `https://clerk.weblab.build/v1/oauth_callback` is correct, and GitHub accepting the consent screen proves the client_id/redirect_uri are valid.
- **Next step:** Clerk Dashboard → SSO Connections → GitHub: confirm production custom credentials (Client ID/Secret from the GitHub OAuth app) + `user:email` scope. Configure → Account linking: enable "link users with the same verified email". Verify the GitHub account's primary email is verified on GitHub. For the exact failure, reproduce and read the redirect off `clerk.weblab.build/v1/oauth_callback` (`error` / `error_description`) or Clerk Dashboard → Logs.
- **Risk if ignored:** GitHub sign-in unusable; users sharing an email across providers can't sign in / link.
- **Tags:** `#bug` `#auth` `#config`

### React #418 hydration mismatch on /sign-in — ROOT-CAUSED (not a markup bug)

- **Discovered:** 2026-06-16 (seen in console during the GitHub OAuth bounce above)
- **Investigated:** 2026-06-16 — **confirmed NOT a code/markup bug.** Two fresh prod SSR renders of `/sign-in` are byte-identical; every layout provider that wraps it (theme/cookie-consent/desktop-chrome/appearance/smooth-scroll) is mounted-guarded; a **clean cloud browser (no SW, no extensions) shows ZERO #418** on both the clean load and the `?returnUrl=` bounce URL (status 200, form renders, 0 console errors).
- **Root cause (client-state, not our React tree):** (1) **Stale service worker** — the user's console also showed the SW returning a network-error response: after a deploy the old `/_next/static/*` chunks 404, `cacheFirstAsset` returns `Response.error()`, and a stale document hydrates against a newer bundle → #418 (+ the "preloaded font/css not used" warnings = stale-HTML signature). (2) **Form-injecting browser extension** — `/sign-in` is a `<form>` with an email input; password managers / Grammarly mutate it before hydration, which React #418's own message lists as a cause. Both are user-browser-specific.
- **Fix shipped:** SW `VERSION` v2→v3 (purges every poisoned shell/runtime/data cache for all users on next visit) + dropped auth-dynamic `/projects` from the precached shell (`apps/web/client/public/sw.js`). User-side immediate workaround: hard-reload / DevTools → Application → unregister SW + Clear storage; test in incognito with extensions off to confirm the extension half.
- **Residual / follow-up:** consider serving only `/offline` (never a build-versioned cached document) as the navigation fallback so a future deploy can't re-poison a slow-nav user; React already recovers from the extension case (no action needed).
- **Risk if ignored:** Occasional hydration regeneration on `/sign-in` after a deploy until the SW updates; cosmetic flicker, no functional break.
- **Tags:** `#bug` `#tech-debt` `#auth` `#infra`

### Verify production desktop build ships prod Clerk keys (not the dev instance)

- **Discovered:** 2026-06-15 (user-reported "desktop app opens weblab.build in browser, not the app")
- **Where:** `apps/desktop/main.js` (`DEFAULT_LAUNCH_URL` → `weblab.build/sign-in`), `apps/web/client/.env.local:213` / root `.env` use `pk_test_…` + `full-redbird-32.clerk.accounts.dev`; prod expects `clerk.weblab.build` per `.env.prod.example`.
- **Symptom:** Desktop sign-in hands off to the system browser; if the round-trip back via `weblab://auth/handoff` fails, the user finishes signing in on weblab.build *in the browser* and never returns to the app. A dev Clerk key on a prod build makes the handshake/handoff flaky.
- **Root cause:** Browser-handoff auth (intended) + fragile `weblab://` return path. Code fallback added in `handoff-client.tsx` (stalled → Download / Continue-in-browser), but the env half can't be verified from the repo.
- **Next step:** Confirm Railway prod env for the web app and the packaged desktop build use `pk_live_*` + `CLERK_FRONTEND_API_URL=https://clerk.weblab.build`. Confirm the installed `.app`/`.exe` registers the `weblab://` protocol (macOS: app in /Applications, launched once). Close the `main.js:225` handoff-nonce CSRF TODO.
- **Risk if ignored:** Desktop users can't get into the app; stranded on the website after sign-in.
- **Tags:** `#bug` `#infra` `#auth`

### Tri-lens audit (2026-06-14) — deferred items not fixed in the bug-hunt commit

Source: `/assess-ux-of-main-user-flows` + `/ux-polish` + `/bug-hunt` workflow
(22 surfaces, adversarially verified). The 7 high-confidence, isolated bugs were
auto-fixed and committed. The items below are real (verified) but were deferred
because they touch foreign uncommitted files, are judgment calls, or are feature
gaps rather than mechanical fixes.

#### Middle-mouse pan release forces DESIGN instead of restoring prior mode

- **Discovered:** 2026-06-14 (tri-lens audit, bug-editor-ui-logic)
- **Where:** `apps/web/client/src/app/project/[id]/_components/canvas/index.tsx:278-280`
- **Symptom:** Middle-mouse drag-pan from PREVIEW/COMMENT/CMS drops the user into DESIGN on release (same class as the space-key bug just fixed in `canvas/hotkeys/index.tsx`).
- **Next step:** Mirror the hotkeys fix — capture `editorEngine.state.editorMode` in `middleMouseButtonDown` into a ref, restore it in `middleMouseButtonUp` instead of hardcoding `EditorMode.DESIGN`.
- **Risk if ignored:** Pan gesture silently changes editor mode; confusing for power users.
- **Deferred because:** `canvas/index.tsx` has uncommitted i18n edits from another session — fixing now would entangle the commit. Apply once that work lands.
- **Tags:** `#bug`

#### `updateDeploymentRow` conflates "error" and "not found" (both return null)

- **Discovered:** 2026-06-14 (tri-lens audit, bug-convex-billing)
- **Where:** `apps/web/client/convex/deployments.ts:234-246`
- **Symptom:** On a DB error the catch logs and returns `null`, the same value as "row not found". Callers can't distinguish a transient failure from a missing deployment.
- **Next step:** Let the error propagate (remove the catch) or return a discriminated result `{ ok: false }`; keep the `if (!existing) return null` not-found path.
- **Risk if ignored:** Deployment status polling may treat a DB hiccup as "deployment gone".
- **Deferred because:** Judgment call on caller contract, not a mechanical auto-fix.
- **Tags:** `#bug` `#tech-debt`

#### Project-wide search (Cmd+Shift+F) is a dead stub

- **Discovered:** 2026-06-14 (tri-lens audit, flow-power-editor)
- **Where:** `apps/web/client/src/app/project/[id]/_components/project-search/index.tsx:14-46`
- **Symptom:** The shortcut opens a panel that performs no actual project-wide text search; a power user expecting grep-across-files gets nothing.
- **Next step:** Either wire it to the file-system search or remove the affordance + shortcut until implemented.
- **Risk if ignored:** Advertised power-user capability is non-functional.
- **Tags:** `#bug` `#feature-gap`

#### Workspace billing nav points to global `/pricing`

- **Discovered:** 2026-06-14 (tri-lens audit, flow-settings-billing)
- **Where:** `apps/web/client/src/app/w/[slug]/settings/_components/settings-nav.tsx:26`
- **Symptom:** "Billing" in workspace settings links to `/pricing` (marketing) instead of a workspace-scoped billing page, dropping the user out of the settings context.
- **Next step:** Point to the workspace billing route (`/w/[slug]/settings/billing`) which already exists.
- **Risk if ignored:** Confusing billing navigation; user loses workspace context.
- **Tags:** `#bug` `#ux`

#### Stripe success callback doesn't close window or guide next step

- **Discovered:** 2026-06-14 (tri-lens audit, flow-settings-billing)
- **Where:** `apps/web/client/src/app/callback/stripe/success/page.tsx:11`
- **Symptom:** After checkout the success page neither auto-closes the popup nor offers a "return to app" action; user is stranded.
- **Next step:** Add `window.close()` (popup flow) or a clear CTA back to the editor/dashboard with a success toast.
- **Risk if ignored:** Post-purchase dead-end.
- **Tags:** `#ux`

#### Publish button "Live"/"Update" state derived from undo history, not real change tracking

- **Discovered:** 2026-06-14 (tri-lens audit, flow-import-publish + polish-topbar)
- **Where:** `apps/web/client/src/app/project/[id]/_components/top-bar/publish/trigger-button.tsx:39-43`
- **Symptom:** The button decides "Live" vs "Update available" from undo-stack depth rather than a diff against the published deployment, so it can show stale/incorrect state (e.g. after undoing all edits, or across reloads).
- **Next step:** Track a real "dirty since last publish" flag (compare current source/commit to the last successful deployment).
- **Risk if ignored:** Users can't trust whether their site has unpublished changes.
- **Tags:** `#bug` `#ux`

#### New-user "Create" intent lost across the signup pipeline

- **Discovered:** 2026-06-14 (tri-lens audit, flow-new-user — highest-impact UX finding)
- **Where:** `hero-v2.tsx:30-41` → `sign-in/verify/page.tsx:217-222` → `profile-setup/page.tsx:65-76` → `_components/hero/create.tsx:112-120`
- **Symptom:** A brand-new user who types a prompt and hits "Get started" completes sign-up + profile-setup and lands on `/projects`, NOT `/projects/new?resumeCreate=1`. Their typed prompt (saved in localForage) is orphaned and the create intent is lost.
- **Next step:** Thread `returnUrl` through the whole auth pipeline; after profile-setup, redirect new sign-ups with a saved draft to `/projects/new?resumeCreate=1`. (Note: `profile-setup` redirect can also resolve to `null` when `sanitizeReturnUrl` returns null — verify `router.replace` never receives null.)
- **Risk if ignored:** First-run users lose their first prompt — direct hit to activation.
- **Tags:** `#bug` `#ux` `#activation`

### Stale `en.d.json.ts` breaks `@weblab/web-client` typecheck

- **Discovered:** 2026-06-13 (caveman-review / bug-hunt of local changes — found while validating an unrelated font change; break is NOT from that work).
- **Where:** `apps/web/client/src/app/project/[id]/_components/members/member-row.tsx:28,51` — `useTranslations('editor.members.row')` + `t('removed', { name })`.
- **Symptom:** `bun typecheck` fails (exit 2): TS2345 `'"editor.members.row"' is not assignable to NamespaceKeys<…>` and `{ name: string }` not assignable to `undefined`. Only errors in the whole web-client typecheck; everything else is green.
- **Root cause:** `editor.members.row` **exists** in `messages/en.json`, but `messages/en.d.json.ts` (the next-intl-generated declaration that `useTranslations` is typed against, via `createMessagesDeclaration` in `next.config.ts`) is **stale** — it predates that namespace. Surfaced from a parallel in-flight i18n migration (commits `fe1ff4c99`, `07ed7f42a`; `member-row.tsx` is actively edited in another session).
- **Next step:** Regenerate the declaration by running `next dev`/`next build` (next-intl rewrites `en.d.json.ts` on boot), then commit the regenerated file alongside the i18n change. Do **not** hand-edit `en.d.json.ts`.
- **Risk if ignored:** CI/build typecheck stays red; any PR is blocked until the declaration catches up.
- **Tags:** `#bug` `#infra` `#tech-debt`

### Storybook preview still loads Inter web-font (out of sync with app)

- **Discovered:** 2026-06-13 (caveman-review of font change).
- **Where:** `apps/web/client/.storybook/preview.tsx:3,9-12,25`.
- **Symptom:** App dropped the Inter `next/font` web-font for a pure system stack (`layout.tsx`, `styles/globals.css`, `packages/ui/src/globals.css`), but Storybook still imports `Inter` and wraps stories in `--font-inter`. Component previews render in Inter while production renders in the system stack — previews misrepresent real typography.
- **Next step:** Remove the `Inter` import + the `--font-inter` wrapper in `preview.tsx` so Storybook inherits the same system stack as `globals.css`.
- **Risk if ignored:** Visual QA in Storybook doesn't match shipped fonts; cosmetic only.
- **Tags:** `#tech-debt` `#docs`

### Locale files `en.json` / `sv.json` reindented 4→2 spaces (off-standard)

- **Discovered:** 2026-06-13 (caveman-review).
- **Where:** `apps/web/client/messages/en.json`, `messages/sv.json` (landed in `fe1ff4c99`/`07ed7f42a`).
- **Symptom:** Both reformatted from 4-space to 2-space, while `es/ja/ko/zh.json` and the prettier config (`tooling/prettier/index.js`, `tabWidth: 4`) stay 4-space. JSON is valid and en≡sv key parity holds, so nothing breaks at runtime — but it's a ~6.5k-line whitespace churn + cross-locale inconsistency. The repo `format` script is `eslint --fix` (ignores JSON), so no tool auto-corrects it.
- **Next step:** Re-run prettier with the repo config (`--config tooling/prettier/index.js`) on just `en.json` + `sv.json` to restore 4-space, in a dedicated formatting-only commit.
- **Risk if ignored:** Noisy diffs / merge friction on locale files; cosmetic.
- **Tags:** `#tech-debt`

### Dead i18n keys in `settings` namespace

- **Discovered:** 2026-06-13 (caveman-review).
- **Where:** `messages/en.json` + `sv.json` — `settings.project.copyIdFailed`, `settings.page.accessTypeLabel`.
- **Symptom:** Both keys have zero references in `apps/web/client/src` (component uses `toastCopyIdFailed`; the access toggle has no `accessTypeLabel` consumer). Harmless dead weight.
- **Next step:** Delete the two keys from both locale files (and any other locale that copied them).
- **Risk if ignored:** None functional; minor bloat / confusion.
- **Tags:** `#tech-debt`

### AI Wireframes — deferred follow-ups (MVP shipped 2026-06-13)

- **Discovered:** 2026-06-13 (AI wireframes feature build — F-790…F-794). The feature is complete and green: real shadcn blocks render in-canvas and emit as real code to **both** local (desktop NodeFs bridge) and cloud (Vercel Sandbox). These are scoped enhancements.
- **Where:** `packages/wireframe-blocks/`, `apps/web/client/convex/wireframeEmit.ts`, `apps/web/client/src/app/project/[id]/wireframe/`
- **Items:**
  1. **Per-section AI regenerate** — wireframe "regenerate" is page/all-level only; add a per-section action that re-runs `generateObject` for one section (new copy / alternate block) instead of the user swapping variants manually. `#tech-debt`
  2. **Style-guide contrast guard** — `styleGuideToCssVars`/the token editor don't warn when fg/bg or primary/primary-foreground fall below a readable luminance ratio (spec edge case "style guide breaks contrast"). Add a luminance check + inline warning. `#tech-debt`
  3. **Real font loading** — `fontHeading`/`fontBody` are applied as `font-family` name + system fallback only; the Google webfont isn't actually loaded in the live preview or the emitted project (emit can't add a top `@import` after `@import 'tailwindcss'`). Inject a `<link>` in the emitted `layout.tsx` and a preview-scoped font loader. `#tech-debt`
  4. **Expand curated block set** — only ~15 of the 214 vendored pro blocks are registered (1–2 per category). Grow toward fuller coverage by adding prop-driven blocks to `packages/wireframe-blocks/src/blocks/` (+ any new primitives under `src/vendor/ui`) + `meta.ts` + regenerating emit assets; consider codegen from the manifest. `#tech-debt`
  5. **Infinite-canvas pan** — Sitemap is a card tree and Wireframe/Design are scaled frame strips with zoom controls (robust, no fragile custom canvas). A true zoom/pan infinite canvas (like the screenshots) is a polish follow-up. `#tech-debt`
  6. **Emit-asset drift guard** — `packages/wireframe-blocks/src/emit/emit-assets.generated.ts` is committed; add a CI step that re-runs `bun run generate:emit-assets` and fails on diff so block/primitive source edits can't desync from the bundle. `#test-gap` `#infra`
  7. **Cloud emit creates a new project** — `emitToCloud` provisions a fresh Vercel-Sandbox project (mirrors `createFromFigma`); local emit writes into the current project root. Consider unifying so cloud also emits into the current project's sandbox when one is live. `#tech-debt`
- **Risk if ignored:** all enhancements, not regressions — the feature works end-to-end (real shadcn blocks, local + cloud emit, all 13 categories, generation, editing, persistence).
- **Tags:** `#tech-debt` `#ai`

### Bug-hunt round 2 2026-06-13 — deferred findings (sync/parser/server/billing sweep)

- **Discovered:** 2026-06-13 (second deep bug-hunt across canvas editing, sync/fs/parser, server+provider, billing/versions, panels; ~35 bugs fixed in the same session — see feature-log). Each item has a matching `TODO(bug-hunt)` comment in code.
  1. **write-code applies only `diffs[0]`** — `apps/web/client/src/components/store/editor/code/index.ts`: a multi-diff write-code action drops every file after the first, while `reverseWriteCodeAction` reverses all of them (asymmetric inverse); an empty `diffs` array throws "Not implemented". Apply every diff + reject empty up front. `#bug`
  2. **Parser HTML insert index off by whitespace text nodes** — `packages/parser/src/pipelines/html/index.ts` (`insertChildAt`): element-index from the editor is spliced into parse5 `childNodes` that interleave whitespace `#text` nodes → wrong source position. Mirror the JSX element-index→children-index mapping. `#bug`
  3. **Parser JSXText written verbatim** — `packages/parser/src/code-edit/text.ts`: user text `{x}` becomes a JSX expression (runtime error); multi-line branch wipes nested elements. Escape braces into string-literal expression containers. `#bug`
  4. **Tailwind class accumulation** — `packages/parser/src/code-edit/style.ts` (cn()/clsx branch): repeated style edits append `w-[100px] w-[101px] …` with exact-match dedupe only; CSS order wins, not recency, so edits appear not to apply. Resolve utility conflicts. `#bug`
  5. **Sync init reaction not serialized** — `apps/web/client/src/components/store/editor/sandbox/index.ts` (`initializeSyncEngine`): overlapping reaction runs can release an instance mid-`start()` (zombie watchers). Serialize. `#bug`
  6. **Server `fileRead` utf8-only** — `apps/web/server/src/sandbox/index.ts`: binary assets (images/fonts) round-tripped through ZenFS get mojibake-corrupted. Detect binary + base64. `#bug`
  7. **`code-fs` cross-file OID regeneration incomplete** — `packages/file-system/src/code-fs.ts`: `processJsxFile` now passes `getOidsExcludingFile` so NEW duplicated elements get unique oids, but a file copied wholesale with oids already baked in isn't retroactively re-stamped (needs `branchOidMap` wiring). `#tech-debt`
  8. **Sandbox handle cache unbounded** — `apps/web/server/src/sandbox/index.ts`: handles only evicted on a "gone" error; long-running Railway deploys accumulate stale entries. Add TTL/LRU. `#tech-debt`
  9. **`withTimeout` orphans paid VM** — `packages/code-provider/src/providers/vercel-sandbox/index.ts`: losing the create race rejects locally but doesn't abort the SDK call; a slow-but-successful `Sandbox.create` runs until its own timeout. Thread an AbortSignal. `#bug`
  10. **VercelTerminal/VercelTask output subscribers lost across run/restart** — same provider file: `onOutput` binds to the current command only; `run()` replaces it without killing the previous detached process. Keep terminal/task-level subscribers + re-attach. `#bug`
- **Billing residuals (not money-leaks, lower priority):** chat `FIX`/`CREATE` turns unmetered (`api/chat/route.ts` — confirm intentional or meter); summarizer refund cost-leak (already logged, F-472-adjacent). `#tech-debt`
- **Tags:** `#bug` `#tech-debt`

### Editor hotkeys/canvas 2026-06-13 — deferred findings (verified-bug fix pass)

- **Discovered:** 2026-06-13 (editor hotkeys + style-control bug fix session; 10 bugs fixed in the same session). Each item has a matching `TODO(bug-hunt)` comment in code.
  1. **UNDO/REDO hijack native text undo** — `apps/web/client/src/app/project/[id]/_components/canvas/hotkeys/index.tsx` (UNDO/REDO bindings): both run with `enableOnFormTags + enableOnContentEditable`, so cmd+z/cmd+shift+z fire the canvas history even when focus is in a text field, hijacking the browser's native text undo. Possibly intentional Figma parity, but pairs badly with stale-draft commits. Next step: canvas-ownership gate (like COPY/PASTE) or yield when focus is in an editable field with its own undo stack. `#bug`
  2. **Space / middle-mouse pan-end always forces DESIGN mode** — `canvas/hotkeys/index.tsx` (space keyup) + `canvas/index.tsx` (`middleMouseButtonUp`): both reset to DESIGN on pan-end instead of restoring the mode active before the pan, so panning while in PREVIEW/COMMENT/CMS drops the user into DESIGN. Next step: capture the prior mode on pan-start and restore it. `#bug`
  3. **Layer eye-toggle desyncs from undo** — `left-panel/design-panel/layers-tab/tree/tree-node.tsx` (`toggleVisibility`): mutates `node.data.isVisible` locally outside the undo action, so undoing the visibility change reverts the style but leaves the eye icon desynced. Next step: drive `isVisible` from committed style, or refresh on undo/redo. `#bug`

### Bug-hunt 2026-06-13 — deferred findings (main-user-flow sweep)

- **Discovered:** 2026-06-13 (full bug-hunt across create/dashboard, editor load, chat/AI, auth/settings, CMS/pages; ~25 bugs fixed in the same session — see feature-log)
- **Where / Symptom / Next step:** each item also has a matching `TODO(bug-hunt)` comment in code:
  1. **Route-group page CRUD broken** — `apps/web/client/src/components/store/editor/pages/helper.ts` (`getRouteDirectoryPath`): scan strips `(group)` segments from node paths, but CRUD rebuilds FS paths as `basePath + route`, so delete/rename/move/metadata fail with "Page not found" for `app/(marketing)/about/page.tsx`. Fix: store the real FS-relative path on `PageNode`. `#bug`
  2. **Hardcoded `page.tsx`** — same file (`getPageFilePathForRoute`, non-dir delete): scanner accepts `page.{tsx,ts,jsx,js}` but ops assume `.tsx`; `.jsx/.js` pages in imported projects fail. `#bug`
  3. **CMS wizard slug bypass** — `apps/web/client/convex/cmsActionsInternal.ts` `_wizardCreateCollection`: no `validateSlug`/dup check → duplicate or empty slugs from remote type names. `#bug`
  4. ~~**Interrupted-stream recovery regenerates the wrong turn**~~ FIXED same session (second pass): pending turn now persisted alongside the inflight flag and re-sent when absent from hydrated history; also fixed recovery never firing at all (status effect cleared the flag on mount before the recovery effect read it — now snapshotted in `useState` initializers). `use-chat/index.tsx` + `queue-storage.ts`, tests in `test/chat/queue-storage.test.ts`.
  5. **Conversation-summary cursor invalidated every turn** — `convex/messages.ts` `replaceConversationMessages` re-mints `_id`s, so `summarizedUpToMessageId` misses after reload → silent full-context sends + repeat summarize credits. Fix: stable cursor (index/hash) or stable ids. `#bug`
  6. **User-delete cascade orphans sole-member team workspaces** — `convex/internal/cascade.ts`: only `personal` workspaces cascade; a zero-member team workspace becomes unreachable/undeletable with orphaned projects. `#bug`
  7. ~~**Expired-pending re-invite blocker (project invites)**~~ FIXED same session (second pass): `_validateAndInsert` now treats pending-but-expired rows as non-conflicting and flips them to `EXPIRED` (mirrors `workspaces.inviteCreate`).
  8. **`projects.list` truncates before sorting** — `convex/projects.ts`: 200-row take in membership-index order before `updatedAt` sort; >200-membership users can lose recent projects. `#bug` (low)
  9. **`createFromGit` framework mismatch** — `convex/projectActions.ts`: validator accepts vite/remix/astro/tanstack but provisions nextjs while persisting the requested framework (latent foot-gun, no current template hits it). `#tech-debt`
  10. **Blank-project `(N)` suffix prefix collision** — `convex/projectActions.ts`: `startsWith` makes "Jun 1" match "Jun 10–19" (cosmetic). `#tech-debt`
  11. **VercelBrowserTask drops branch `port`/`devCommand` on boot** — `store/editor/sandbox/vercel-browser-provider.ts` `getTask`: boot path calls `sandbox.setup` without them; package.json inference is the only fallback → wrong port → 502 for custom dev commands. Needs a server-contract decision. `#bug`
  12. **Chat `FIX`/`CREATE` turns unmetered** — `api/chat/route.ts`: only `ChatType.EDIT` increments usage; may be intentional product choice — confirm or meter. `#tech-debt`
- **Pre-existing test failures noticed during validation (not from this session):**
  - `@weblab/backend` `test` script is stale — `cd supabase/functions/api` no longer exists → root `bun run test` always exits 1. Fix or remove the script. `#infra`
  - web-client `test/messages.test.ts` i18n key parity fails (12 keys missing vs `en`) and `test/frame/preload-script.test.ts` fails ("No layout files found in src/app" fixture issue). `#test-gap`
- **Risk if ignored:** items 1/4/5 are silent data-or-cost losses in primary flows; the stale backend script masks real test regressions at the root gate.
- **Tags:** `#bug` `#test-gap` `#infra`

### Component system v1 — deferred follow-ups (F-788/F-789)

- **Discovered:** 2026-06-12 (component-system build session)
- **Where:** `apps/web/client/src/components/store/editor/components/`, `packages/parser/src/component/`
- **Symptom:** v1 ships master/instance + properties + variants + slots(children) + unlink for React and HTML; these pieces are intentionally deferred:
  1. **Convex `componentMeta` table** — display names, descriptions, prop groups/tooltips/order, per-instance rename (`instanceNames`). Nothing structural; schema sketch in the approved plan (`~/.claude/plans/design-webflow-style-component-system-concurrent-sparrow.md`).
  2. **Undo/redo for instance-prop writes** — `setInstanceProp` goes through `code.writeRequest` directly, bypassing the action/history pipeline. Needs a `write-code`-style action with inverse.
  3. ~~**Inline prop-override text editing on canvas**~~ — RESOLVED 2026-06-13 (commit pending). Double-clicking a text-bound element inside an instance now edits THAT instance's value inline via the existing text editor with a `commitOverride` routed to `setInstanceProp`; entering master edit is reserved for non-bound elements / the boundary / `⌘⏎`. Matches Webflow's documented inline-bound-value gesture.
  4. **Named-slot insertion UI** — `children` works via the normal insert path; named ReactNode slots need a `SET_SLOT_CONTENT` structure change + drop-target resolution (transform sketch in plan §slots).
  5. **HTML in-canvas master edit routing** — elements inside stamped instances carry `masterOid~instanceId` oids; canvas edits on them currently hit the *page* copy (overwritten on next re-stamp). Route `~`-oids → master partial edit + restamp (`resolveEditTarget` HTML branch in plan §6).
  6. **node_modules / external component instances** — currently `getDefinitionForInstance` returns null (no chip/panel). Wanted: instance-only mode (literal attrs editable as untyped fields, no master edit/detach).
  7. **richtext prop creation** — discovery types exist; `createPropFromElement` doesn't generate ReactNode props yet.
  8. **Design-system page specimens** — green palette swatches added; component chip / edit banner / prop-field specimens still to add to `/design-system`.
- **Next step:** pick items off in order of user pain; 3 and 5 are the most user-visible.
- **Risk if ignored:** prop edits not undoable (2); HTML instance edits silently lost on re-stamp (5).
- **Also (low, from the 2026-06-12 review pass):**
  9. `countComponentUsages` is name-based — same-named components from other files/libraries inflate the banner's "applies to N instances". Filter by resolved import → `def.filePath`.
  10. `toImportPath` in `store/editor/insert/index.ts` still hardcodes the `@/` alias for Components-tab drag-inserts (create-from-selection now resolves tsconfig paths — reuse `resolveImportPath`).
  11. Extract leaves now-unused imports in the source page (lint noise, not breakage).
  12. Raw `<button>`s in component-instance/master sections + chip/tree pencils violate [button-enforcement.md](docs/agent-context/button-enforcement.md) — swap for ghost `<Button>` or add an icon-chip variant.
  13. Component chip uses `zIndex: 60` (matches CmsPill) — paints over panels when the rect is near edges; both should clamp.
  14. `detachInstanceHtml` leaves an orphan `<div data-wb-slot-content>` wrapper (attr stripped, div kept) — cosmetic stray div in unlinked static HTML; should unwrap to children for parity with React detach.
- **Tags:** `#tech-debt` `#editor`

### Dock / "Open With Weblab" `open-file` doesn't verify the path is a directory

- **Discovered:** 2026-06-12 (caveman-review of desktop folder-drop)
- **Where:** apps/desktop/main.js `deliverOpenFolder` (`open-file` handler) → renderer `useOpenLocalProject.openLocalFolderAtPath`.
- **Symptom:** macOS `open-file` can fire for a FILE, not just a folder. `deliverOpenFolder` forwards any string path to the renderer, which calls `localfs.list(rootPath, '.')` — on a file path that errors and surfaces a generic toast.
- **Root cause:** `CFBundleDocumentTypes` registers `public.folder` only, but the OS / "Open With" can still hand a file path; no `fs.statSync(p).isDirectory()` guard in main before delivering.
- **Next step:** in `deliverOpenFolder`, guard with `fs.existsSync(p) && fs.statSync(p).isDirectory()`; if it's a file, drop it (or open its parent dir).
- **Risk if ignored:** confusing error when a file is opened via dock/"Open With"; cosmetic, not data-loss.
- **Tags:** `#bug` `#desktop`

### "Reset all properties" removes dynamically-bound instance attributes too

- **Discovered:** 2026-06-12 (caveman-review of component instance props)
- **Where:** apps/web/client/src/components/store/editor/components/index.ts `resetAllInstanceProps`.
- **Symptom:** it builds `{ __remove: true }` for every key from `getInstancePropValues`, which includes props whose value parsed as `null` (a dynamic expression like `title={foo}`). "Reset all" therefore strips a real dynamic binding, not just literal overrides.
- **Next step:** skip keys whose parsed value is `null` (dynamic) when building the remove set, or confirm with the user. `resetInstanceProp` (single) has the same property but is explicit per-prop.
- **Risk if ignored:** a "reset" can silently delete a hand-written dynamic prop on the usage site.
- **Tags:** `#bug` `#editor`

### Editable instance-prop input overwrites a dynamic binding with a literal silently

- **Discovered:** 2026-06-12 (caveman-review of component instance props)
- **Where:** apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v4/sections/component-instance.tsx `PropField`.
- **Symptom:** when an instance prop is bound to a dynamic expression, `getInstancePropValues` returns `null`; `effective = value ?? prop.defaultValue` shows the *default* in an editable text input. Committing writes a string literal, silently replacing the dynamic expression — with no "dynamic" indicator on editable types (only non-editable props show the italic "dynamic" hint).
- **Next step:** when `value === null` on an editable prop, render a read-only "dynamic" chip with an explicit "override" affordance instead of a pre-filled input.
- **Risk if ignored:** user unknowingly clobbers a dynamic prop value.
- **Tags:** `#bug` `#editor` `#ux`

### Keep `getNextJsScaffoldFiles` in sync with cloud `scaffoldNextProject`

- **Discovered:** 2026-06-12 (caveman-review of local blank scaffolding)
- **Where:** packages/code-provider/src/scaffold-templates.ts `getNextJsScaffoldFiles` vs packages/code-provider/src/providers/vercel-sandbox/index.ts `scaffoldNextProject`.
- **Symptom:** the local Next.js blank claims to be "byte-for-byte the same project as a CLOUD blank" (minus an intentional `postcss.config.mjs`). There's no test asserting parity, so the two file sets can drift (deps, `next.config`, tsconfig) unnoticed.
- **Next step:** add a unit test comparing the two file sets (allowing the documented `postcss.config.mjs` divergence), or extract a shared base.
- **Risk if ignored:** local vs cloud blanks diverge over time → "works in cloud, not local" surprises.
- **Tags:** `#test-gap` `#tech-debt`

### `stopDevServer` doesn't await child exit — restart race can pick a different port

- **Discovered:** 2026-06-12 (bug-hunt after the local-port fix)
- **Where:** apps/desktop/weblab-local.js `stopDevServer` (+ IPC `weblab:localdev:stop`), `NodeFsTask.restart` in packages/code-provider/src/providers/nodefs/index.ts. `TODO(bug-hunt)` is on the function.
- **Symptom:** `restart()` does `await dev.stop(root)` then immediately `await dev.start(...)`, but `stopDevServer` only sends SIGTERM and deletes the record synchronously — it never awaits the child's `exit`. The dying dev server can still hold the port when `start` runs, so `findFreePort` skips it and binds a DIFFERENT port → the iframe (built from the old `frame.url`) goes blank. (Before the free-port fix this surfaced as the EADDRINUSE the user hit.)
- **Next step:** make `stopDevServer` return a promise that resolves on the child's `exit` (with a ~3s timeout fallback so a stuck process can't hang restart), and have the `stop` IPC handler + `NodeFsTask.restart` await it. Pairs with the frame.url propagation entry below.
- **Risk if ignored:** intermittent blank preview after "Restart", especially under fast stop→start.
- **Tags:** `#bug` `#flake`

### Local dev-server port re-pick is not propagated to `frame.url` (runtime collision → blank preview)

- **Discovered:** 2026-06-12 (desktop local-port EADDRINUSE fix)
- **Where:** apps/desktop/weblab-local.js (`startDevServer` → `findFreePort`), apps/web/client/src/components/store/editor/sandbox/{session.ts,index.ts}, convex/projects.ts `createLocal`. See `TODO(local-port-propagation)` in weblab-local.js.
- **Symptom:** the create flow now picks a free uncommon port and `restart` frees+rebinds the same one, so the common cases match. But if a *foreign* process grabs the project's stored port between sessions, the bridge increments to a different free port while `frame.url` (built at `createLocal`) still points at the old port → the iframe shows a blank/loading frame (no crash). Same for **legacy local projects created before this fix** whose stored `runtime.local.port` is 3000 — they collide with the editor's own :3000 and never match.
- **Root cause:** the bound port is authoritative on the desktop bridge, but nothing adopts the returned `{url}` back into `frame.url` when it differs from the stored port.
- **Next step:** after the local dev server reports running, compare its `url` to the branch frames' url; if different, `editorEngine.frames.updateAndSaveToStorage(frameId, { url })` + `reloadView` (SandboxManager has `editorEngine` + `branch`). A one-time migration (or auto-repick-on-open) handles legacy :3000 rows.
- **Risk if ignored:** rare blank preview on foreign-process collisions; legacy :3000 local projects stay broken until re-created.
- **Tags:** `#bug` `#tech-debt`

### Static-HTML / explicit-port local projects can still collide (`serve -l 8080` ignores PORT)

- **Discovered:** 2026-06-12 (desktop local-port EADDRINUSE fix)
- **Where:** packages/code-provider/src/scaffold-templates.ts (`STATIC_HTML_SCAFFOLD_PORT = 8080`), apps/desktop/weblab-local.js (`startDevServer`), apps/web/client/src/hooks/use-open-local-project.ts (`resolveFreeLocalPort` is skipped for non-Next frameworks).
- **Symptom:** the free-port fix only moves PORT-honoring frameworks (Next.js) to an uncommon port. Static-HTML pins `serve -s -l tcp://0.0.0.0:8080`, and any project with an explicit `-p/--port`/`-l` flag pins its own port; those ignore the PORT env, so an occupied port still fails (and 8080 is a "please avoid" port per the user). Vite (5173) likewise auto-increments on its own without telling the frame.
- **Root cause:** can't move a dev server off a hardcoded flag port via env; would require rewriting the dev command's port flag to a free port and keeping `frame.url` in sync (and `STATIC_HTML_SCAFFOLD_PORT` is shared with the cloud scaffold, so it can't be blindly changed).
- **Next step:** for local static-HTML, rewrite the spawned command's `-l <port>` to a free uncommon port (don't touch the cloud constant), and pair with the port-propagation work above so `frame.url` follows.
- **Risk if ignored:** static-HTML local projects collide on 8080; explicit-port projects crash on a busy port.
- **Tags:** `#bug` `#tech-debt`

### Optimistic-creation window boots OfflineProvider — edits made before provisioning can clobber the scaffold

- **Discovered:** 2026-06-12 (working-tree review of optimistic creation)
- **Where:** apps/web/client/src/components/store/editor/sandbox/session.ts (~103), src/services/offline/write-queue.ts, convex/projectActions.ts `_provisionSandbox`
- **Symptom:** while `sandboxId` is empty (background provisioning), the editor starts OfflineProvider; writes made in that window queue in localforage against an empty ZenFS and replay into the freshly scaffolded sandbox after the auto-reload — potentially clobbering scaffold files — and the editor presents an "offline" state for a brand-new online project.
- **Next step:** gate editing surfaces (or at least chat sends / file writes) on a provisioned state (`frame.url`), or hold the offline write queue while `provisioningPending`.

### `_insertProjectGraphOptimistic` duplicates `_insertProjectGraph` (~100 lines)

- **Discovered:** 2026-06-12 (working-tree review)
- **Where:** apps/web/client/convex/projects.ts
- **Symptom:** none yet — drift risk; future change to frames/canvas/conversation seeding must be made twice. Related: `createBlank`'s name-count + insert run in separate transactions, so two concurrent calls can produce duplicate names (cheaper to hit now that createBlank returns fast).
- **Next step:** extract a shared insert helper taking optional sandbox fields; make the name suffix collision-tolerant (e.g. retry with count+1 inside the insert mutation).

### `CodeFileSystem.withWriteLock` has no timeout — one hung write wedges all saves silently

- **Discovered:** 2026-06-12 (working-tree review)
- **Where:** packages/file-system/src/code-fs.ts (`withWriteLock`)
- **Symptom:** if one `super.writeFile` never settles (dead sandbox socket mid-flight), every later write/delete/move/rebuild queues forever with no surfaced error.
- **Next step:** per-op watchdog (log + optionally reject after ~30s); add an interleaving unit test for the lock (concurrent writeFile + rebuildIndex preserving OIDs).


### Static-HTML projects have no OID pipeline — every canvas edit fails

- **Discovered:** 2026-06-11 (canvas-editor bug hunt)
- **Where:** packages/file-system/src/code-fs.ts (`isJsxFile`), packages/code-provider/src/providers/vercel-sandbox/index.ts (`scaffoldStaticHtmlProject`)
- **Symptom:** in a static-HTML project the OID index is always empty ("Index built: 0 elements from 0 files"), DOM elements have no `data-oid`, and every style/resize/move/text edit throws "No oid found …" with an error toast.
- **Why:** `isJsxFile()` only matches `.js/.jsx/.ts/.tsx`, so `index.html` never gets `data-oid` injection and is never indexed. No HTML oid path exists anywhere (parser, preload, index).
- **Next step:** either add an HTML oid-injection path (parse5/htmlparser2 + same index metadata) or gate canvas editing for `static-html` framework projects with a clear "code-only project" message instead of per-edit error toasts. `TODO(bug-hunt)` marker sits at the `isJsxFile` return.

### `VercelBrowserProvider.runCommand` swallows transport failures into empty output

- **Discovered:** 2026-06-11 (canvas-editor bug hunt)
- **Where:** apps/web/client/src/components/store/editor/sandbox/vercel-browser-provider.ts (`runCommand` catch)
- **Symptom:** callers (git manager, CLISession) receive `{ output: '' }` when the sandbox is unreachable and misinterpret it (e.g. "package.json parse failed", git ops silently no-op).
- **Why:** the catch returns an empty result instead of rethrowing; mitigated for the dev-runner by an empty-output retry, but git flows still can't distinguish failure from empty stdout.
- **Next step:** change `runCommand` to throw and audit every caller (`git.ts` ~20 call sites, terminal.ts). `TODO(bug-hunt)` marker in the catch block.


### Skill registry loads have no timeout (read_skill / list_skills can hang the chat turn)

- **Discovered:** 2026-06-11 (create-with-AI bug hunt)
- **Where:** packages/ai/src/skills/registry.ts (`loadFromDb` → `scope.trpcCaller.skills.list.query()`)
- **Symptom:** if the skills source stalls, the server-side `read_skill` execute blocks the stream indefinitely — chat shows "Reading skill …" forever with no error.
- **Root cause:** no timeout/AbortSignal on the skills query inside `loadSkills`/`loadSkillByName`.
- **Next step:** wrap the query in `withTimeout` (~10s) and let the tool return an `output-error` so the turn continues.
- **Risk if ignored:** rare but unrecoverable stuck chats; user must reload.
- **Tags:** `#bug` `#infra`

### Create handoff: queued prompt not visible in chat until context gather finishes

- **Discovered:** 2026-06-11 (create-with-AI UX pass)
- **Where:** apps/web/client/src/app/project/[id]/_hooks/use-start-project.tsx (`resumeCreate`) + chat panel
- **Symptom:** after the editor opens, the chat stays empty for several seconds (sandbox file reads with up to ~6.5s retry backoff) before the user's prompt appears. Toast now fires immediately, but the prompt bubble itself is still late.
- **Next step:** render the pending `creationRequest` prompt as an optimistic user message (or "queued" pill) in ChatMessages while `hasPendingCreation` is true and the send hasn't fired.
- **Risk if ignored:** create flow still feels momentarily dead between loader and first stream.
- **Tags:** `#tech-debt` `#ux`

### Create-flow strings hardcoded in English

- **Discovered:** 2026-06-11
- **Where:** use-start-project.tsx ("Got your prompt", "Building: …"), main.tsx ("Getting ready to build your site", loader steps/caption)
- **Symptom:** bypasses next-intl; non-English locales see English.
- **Next step:** move to `messages/en.json` keys under `editor.creation.*`.
- **Tags:** `#tech-debt` `#i18n`

### ask_user_question tool resolver can strand the chat spinner

- **Discovered:** 2026-06-11 (stop-button investigation)
- **Where:** apps/web/client/src/components/tools/tools.ts:37-47 (`AskUserQuestionTool.register` promise never resolves if the question card unmounts / chat type has no card UI)
- **Symptom:** `isExecutingToolCall` stays true forever → "Working…" spinner that Stop previously couldn't clear (hard-stop now force-clears it, but the underlying promise still leaks).
- **Next step:** resolve/reject the registered resolver on conversation switch/unmount, or add a timeout with `output-error`.
- **Tags:** `#bug` `#tech-debt`

### V4 style panel: gradient editor is a "coming soon" stub

- **Discovered:** 2026-06-10 (user report)
- **Where:** `apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v4/sections/background.tsx:224` (`{type === 'gradient' && <p>Gradient editor — coming soon</p>}`).
- **Symptom:** Selecting the Gradient background type in the V4 right panel shows a "coming soon" placeholder — no editor. A working gradient editor already exists in the **editor-bar** color dropdown (`editor-bar/inputs/color-picker.tsx` — `Gradient` component + `useGradientUpdate`).
- **Next step:** Build a V4 gradient section by wiring the existing editor-bar gradient editor (or a shared extract) into `background.tsx`, committing via `useStyleSetter`/`updateMultiple` (backgroundImage + backgroundColor). Fold in the per-move throttle/transaction noted in the perf entry below so stop-dragging doesn't storm source writes.
- **Risk if ignored:** Gradient fills can't be edited from the main style panel (only the top toolbar). Feature gap, not a regression.
- **Tags:** `#feature` `#editor` `#style-panel`

### Style panel perf — three deferred follow-ups (gradient drag, double-write, observer granularity)

- **Discovered:** 2026-06-10 (style-panel perf deep-dive; 4 parallel reviewers)
- **Where / Symptom / Fix sketch (each independent):**
  1. **Gradient stop drag commits per move** — `apps/web/client/src/app/project/[id]/_components/editor-bar/inputs/color-picker.tsx:454` `handleGradientChange` → `handleGradientUpdateEnd` → `style.updateMultiple({backgroundColor, backgroundImage})` on every `onGradientChange` (line 775) with no throttle/transaction. Dragging a stop fires a full AST round-trip per pointermove → lag on gradient edits. Fix: wrap the drag in `history.startTransaction()/commitTransaction()` (so moves accumulate, one source write on release) like `resize.tsx` dimension/radius drags, keeping live visual via iframe inject. Deferred: the `Gradient` component (`Gradient.tsx`) owns the pointer lifecycle, so the transaction has to hook its drag start/end — needs care to not desync the committed value.
  2. **Two full AST round-trips + two prettier runs per committed edit** — every style edit does an immediate source write (`code.write` → `processGroupedRequests` parse+generate, then `code-fs.ts` `processJsxFile` → `formatContent` prettier) AND, 600ms later, a responsive-rebase write (`writeResponsiveStyle` → same pipeline again) to the **same file** for the **same property**. On a large file prettier alone is 20–200ms, run twice. Fix: coalesce the immediate + responsive writes (skip/deferred prettier on the optimistic immediate write, or fold the responsive rebase into the immediate write). HIGH RISK — this is the pipeline that was just stabilized against corruption (`writeChain` + `code-fs` lock); change only with a repro harness.
  3. **Panel re-renders per committed edit (coarse observers)** — `StyleManager.updateStyleNoAction` (`style/index.ts`) replaces `this.selectedStyle` wholesale on every edit; each V4 section is its own `observer` reading `selectedStyle` via `use-style-value.ts`, so one edit re-renders ~13 sections. Per *committed* edit (inputs debounce 500ms), not per keystroke, and inputs hold local state so nothing is lost — so it's polish, not a bug. Fix: finer-grained observers (per input row) and/or avoid replacing `selectedStyle` when only one property changed. Profile before refactoring (MobX reactivity is easy to break).
- **Risk if ignored:** Gradient editing is laggy; large files feel heavy on each property commit. The exponential-selection + seeding-storm + per-keystroke offenders (the actual "3× RAM / brake" report) are already fixed; these are the residual polish gaps toward "Framer-smooth."
- **Tags:** `#perf` `#editor` `#tech-debt`

### Browser FS persistence can fail under heavy editor navigation when storage is full/busy

- **Discovered:** 2026-06-07 (local/prod E2E QA pass)
- **Where:** editor browser storage/ZenFS persistence path; surfaced in dev logs while cycling project/editor routes.
- **Symptom:** Dev logs showed `Compaction failed: No space left on device`, `Persisting failed: Another write batch or compaction is already active`, and IndexedDB `AbortError` reads/writes for chat conversation persistence during heavy local editor navigation.
- **Root cause:** Partially confirmed. Offline project-cache writes could race and keep retrying after storage pressure. A lower-level ZenFS/dev-toolchain persistence path can still report compaction/write contention when the browser/dev cache is already full.
- **Progress:** 2026-06-08 serialized offline project-cache writes, trims cached frames/conversations, and disables further project-cache writes after quota/abort/backing-store failures. Chat last-active-conversation storage now logs one warning instead of spamming.
- **Next step:** Add storage-pressure detection to the ZenFS persistence layer itself and show a user-visible degraded-storage warning with a clear "clear local cache" recovery action.
- **Risk if ignored:** Users with full browser storage can still see noisy lower-level persistence errors and may lose cached editor file state.
- **Tags:** `#bug` `#editor` `#storage` `#reliability`

### Pro + exemplar blocks have no runtime delivery to the builder agent

- **Discovered:** 2026-06-05 (review of F-785 full-catalog session)
- **Where:** `component-registry/pro/**`, `component-registry/blocks/**`, `component-registry/templates/**`; referenced by `skills/shadcn/SKILL.md` and the `<component-registry>` prompt.
- **Symptom:** the agent runs in the user's Vercel sandbox and cannot read the Weblab repo, so the 198 vendored pro blocks and the exemplar blocks/templates are not reachable as source — only their names/descriptions reach the agent (via the skill). Registry blocks (shadcn/ui, shadcnblocks, Watermelon) are fine because they install by URL. Wording was corrected this session to say "reproduce the pattern / install the closest equivalent" instead of "copy from component-registry/…", but the pro blocks still can't be installed directly.
- **Next step:** host the pro blocks as a shadcn-compatible registry (serve `manifest.json` + per-item registry JSON from a Weblab endpoint) so the agent can `bunx --bun shadcn@latest add "<weblab-url>"`; then give pro entries real `installUrl`s in the catalog.
- **Risk if ignored:** the local pro blocks are reference-only — the agent can imitate them but not install them.
- **Tags:** `#enhancement` `#tech-debt`

### Watermelon catalog descriptions are derived, not real

- **Discovered:** 2026-06-05 (full-catalog session)
- **Where:** `component-registry/scripts/fetch-components.mjs` (`deriveDescription` / `STEM_DESC`); 964 Watermelon entries in `manifest.json`
- **Symptom:** Watermelon registry items carry no title/description, so descriptions are derived from the name stem ("Accordion: collapsible disclosure rows (variant 03)"). A few are awkward (e.g. "aave swap component component"). shadcnblocks descriptions are real; Watermelon's are best-effort.
- **Next step:** optionally fetch each Watermelon item and summarize its source for a real description, or expand `STEM_DESC`. Low priority — names are already descriptive.
- **Risk if ignored:** slightly weaker block descriptions for one source.
- **Tags:** `#enhancement`

### shadcnblocks free set is probe-classified (293/3365) — may miss rate-limited items

- **Discovered:** 2026-06-05 (full-catalog session)
- **Where:** `component-registry/scripts/fetch-components.mjs` (`catalogShadcnblocksFree`); cache `component-registry/.cache/shadcnblocks-free.json`
- **Symptom:** free vs pro is detected by probing each `/r/<name>.json` (pro → "Authentication failed"). A rate-limited/transient failure during the run would mis-mark a free block as pro and drop it. Current run found 293 free.
- **Next step:** re-run with `--skip-shadcnblocks-probe` off periodically; consider ret/backoff on non-200s to avoid false negatives. Cache makes re-runs cheap.
- **Risk if ignored:** a handful of free shadcnblocks could be missing from the catalog.
- **Tags:** `#tech-debt`

### Catalog is synced across three places + a manual skill re-append

- **Discovered:** 2026-06-05 (component-registry session)
- **Where:** `component-registry/manifest.json` (generated), `packages/constants/src/component-registry.ts` (`COMPONENT_REGISTRY`, hand-mirrored CORE set), and `skills/shadcn/SKILL.md` (catalog appended from `skill-catalog.md`, then `generate:skills`)
- **Symptom:** rebuilding the catalog requires: run fetcher → re-append `skill-catalog.md` into `SKILL.md` (replacing the old Catalog section) → `bun run generate:skills`. The constants CORE list is also hand-maintained. Easy to drift.
- **Next step:** codegen `COMPONENT_REGISTRY` (core) and the `SKILL.md` catalog section from `manifest.json` so the manifest is the single source.
- **Risk if ignored:** catalog drift between the folder, the prompt CORE set, and the skill body.
- **Tags:** `#tech-debt`

### Design tokens duplicated: scaffold copy vs tokens.css

- **Discovered:** 2026-06-05 (full-catalog session)
- **Where:** `packages/code-provider/src/providers/vercel-sandbox/index.ts` (`NEXTJS_GLOBALS_CSS`) and `component-registry/theme/tokens.css`
- **Symptom:** the OKLCH token values are written in two places — the scaffolder can't read the repo file at runtime in prod, so the CSS is inlined. Editing one and not the other drifts the palette.
- **Next step:** codegen `NEXTJS_GLOBALS_CSS` from `tokens.css` at build, or move the canonical tokens into `@weblab/constants` and import in both.
- **Risk if ignored:** blank-scaffold palette can diverge from the registry tokens.
- **Tags:** `#tech-debt`

### `@weblab/ai` package lint is red from pre-existing warnings (max-warnings 0)

- **Discovered:** 2026-06-05 (component-registry session — surfaced, not caused)
- **Where:** `packages/ai/test/stream/convert.test.ts`, `test/tools/edit.test.ts`, `test/tools/read.test.ts` (`no-explicit-any`, `await-thenable`, prettier); `packages/ai/src/prompt/provider.ts:~220` (`img.id || 'unknown'` → prefer `??`)
- **Symptom:** `bun --filter @weblab/ai lint` exits 1 with 383 warnings, 0 errors. This session's new prompt files lint clean — the debt predates it.
- **Next step:** type the test fixtures (drop `any`), remove non-thenable `await`s, run `format`, and switch the provider `||` to `??` (confirm empty-string id semantics first).
- **Risk if ignored:** the ai workspace lint stays red, so genuinely new warnings get lost in the noise.
- **Tags:** `#tech-debt` `#test-gap`

### Editor micro text sizes (`text-[11px]`/`text-[12px]`) still hardcoded after type-scale fix

- **Discovered:** 2026-06-05 (standard-text-scale session)
- **Where:** editor panels — `apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v2|v3|v4/**`, `left-panel/design-panel/**`; className literals `text-[11px]` and `text-[12px]`.
- **Symptom:** these micro-labels stay a fixed px and do **not** follow the Appearance → Font size (density) setting, unlike the now-tokenized `text-tiny`/`text-sm` siblings. Minor inconsistency at non-default density.
- **Why it matters:** design-system guidance (`design-system/_components/demos/data.ts`) recommends tokens over hardcoded px; mixed approaches drift.
- **Next step:** convert real-text `text-[11px]`→`text-micro` (0.6875rem, exact) and `text-[12px]`→`text-mini` or `text-xs` (both 0.75rem, exact). **Skip** SVG/icon-glyph sizing (e.g. `landing-page/feature-trio-section.tsx` `text-[13px]` inside an `h-3 w-3` box) and landing `design-mockup`. Left out of the 2026-06-05 sweep per "editor can be custom".
- **Also:** `--text-tiny` (10px) is defined in `@theme` (`packages/ui/src/globals.css`) but not shown in the design-system typography visual scale (`typography.tsx` iterates the `--font-size-*` family, not `--text-*`). Add a row/note there.

### Bug Hunt 2026-06-05 — project creation (needs-review findings)

Auto-fixed this pass (committed): `captureScreenshot` logged the expected
deleted-project `NOT_FOUND` race as a hard error (console spam) → now a quiet
skip; `getTimeoutMs` returned a negative `input` verbatim as the sandbox
lifetime → now guarded `> 0`. Remaining (not yet fixed):

- **static-html GitHub import → permanent 502.** [convex/projectActions.ts:413](apps/web/client/convex/projectActions.ts#L413) `createFromGit` reads `framework` and persists it but never passes it to `VercelSandboxProvider.createProjectFromGit`, so the provider uses Next's `DEFAULT_PORT` (3000). A static-html template (`serve` binds 8080) gets port 3000 persisted (`?? 8080` never fires) → preview 502s forever. `TODO(bug-hunt)` in code. Fix: thread `framework` → provider, map port/devCommand from `FRAMEWORK_RUNTIME`. Only static-html git imports affected.
- **`startGitHubTemplate` drops the parsed branch.** [components/store/create/manager.ts](apps/web/client/src/components/store/create/manager.ts) destructures `parseRepoUrl` for `{owner, repo}` only and lets `createFromGit` default branch to `main`; a repo whose default branch is `master`/`develop` (or a `/tree/<branch>` URL) clones the wrong/nonexistent ref → git failure. Fix: parse + pass the branch (action already accepts `branch`).
- **Silent prompt drop on double seed-failure.** [convex/projectActions.ts](apps/web/client/convex/projectActions.ts) `createFromPrompt` returns `{projectId}` even when both `_insertCreateRequest` attempts fail, so the editor opens with no pending request and the user's prompt is silently dropped (no replay, no error). Fix: surface a non-fatal toast ("project created but prompt couldn't be saved — retype it").
- **Sandbox-server lifecycle hardening (low).** `apps/web/server/src/sandbox/index.ts` `getSandbox` cache is unbounded + only evicts on rejection (stale handles to reclaimed VMs accumulate; 410 on first op after reclaim) — add TTL/LRU or evict on 410. And the provider's snapshot-resume shares the 45s `SDK_CALL_TIMEOUT_MS`; a legit cold resume >45s falls off a cliff to the 60-90s scaffold path — give snapshot-resume its own higher ceiling.
- **`createFromGit.repoUrl` unvalidated (low, from code-review).** Unlike `scrapeUrl` (which calls `assertSafeHttpUrl`), `convex/projectActions.ts` `createFromGit` hands `repoUrl` to the Vercel git-clone with no scheme/host guard. Blast radius is small (authed; clone runs in Vercel's isolated VM, not Convex), but the action is the trust boundary — add an http(s)-scheme + non-private-host check. `static-html` git-import port bug above is the deeper, multi-layer one (provider port + the server `setup()` hardcoding 3000); currently dormant since the static-html starter was removed and GitHub-import defaults to nextjs.
- **Duplicated sandbox-cleanup catch ×4 (nit).** `fork` factored a `stopSandbox` helper; createBlank/createFromPrompt/createFromGit/createFromWebsiteClone still inline the same `Sandbox.get → stop` block. Reuse the helper. (`readActiveWorkspaceId` ×3 dedup was fixed in the code-review commit.)

### Perf: first editor open pays a cold Next compile (snapshot is baked pre-dev-server)

- **Discovered:** 2026-06-05 (bug-hunt). The blank snapshot (`scripts/create-vercel-template.mjs`) is taken *after* `npm install` but *before* the dev server starts, so resume is fast (~13s) but the first preview pays a 30-90s cold Turbopack compile (`server/src/sandbox/index.ts` `setup()` polls up to 90s). No double-boot — the editor reuses the live sandbox by id (`Sandbox.get`), confirmed.
- **Fix (in progress this turn):** warm the dev server (with `--hostname 0.0.0.0`) before snapshotting so the snapshot carries a hot `.next` build cache → first open recompiles in seconds. Bake script updated + re-baked; `VERCEL_BLANK_SNAPSHOT_ID` rotated. An in-action pre-warm was rejected — the scaffolded `package.json` dev script lacks `--hostname`, so pre-warming with the wrong command would make `setup()` skip its correct spawn and 502 the preview.
- **Tags:** `#perf` `#sandbox`

### Copy to Figma (F-783): fidelity follow-ups + two live-Figma-only risks

- **Discovered:** 2026-06-04 (Copy to Figma ship)
- **Where:** [packages/figma-clipboard/src/map.ts](packages/figma-clipboard/src/map.ts) (mapping), [src/figma-schema.ts](packages/figma-clipboard/src/figma-schema.ts) (codec), [fractional-index.ts](packages/figma-clipboard/src/fractional-index.ts), [copy/figma.ts](apps/web/client/src/components/store/editor/copy/figma.ts) (clipboard write)
- **Symptom:** v1 pastes editable layers but is lossy for rich CSS, and two correctness details can only be confirmed in the real Figma app.
- **Risks that need a real-Figma check (T-814):**
  1. **Clipboard `version` tolerance** — we write `fig-kiwi` version 15 (per `fig-kiwi`) while the vendored schema came from a v106 `.fig`. If a Figma build rejects the mismatch on paste, derive both from a fresh real clipboard copy and pin them together.
  2. **`parentIndex.position` fractional-index** — we emit fixed-width ascending strings (Figma re-keys on paste). If siblings mis-order or paste is rejected, replace `positionForIndex` with Figma's real fractional-index algorithm (capture from a live copy).
- **Deferred fidelity (each a `// TODO`-worthy follow-up):**
  - **Image fills** — `<img>`/`background-image` currently become a gray placeholder rect. Real image fills need the bytes uploaded as buffer `blobs` + an `IMAGE` paint referencing the hash.
  - **flex → auto-layout** — v1 uses absolute positioning. Detect `display:flex` and emit Figma `stackMode`/spacing/padding/align for resilient, editable layouts.
  - **Gradients / box-shadow / transforms / filters / SVG** — approximated or skipped; add gradient paints, `DROP_SHADOW`/`INNER_SHADOW` effects, and transform decomposition.
  - **Mixed text+element nodes** — an element with both loose text and child elements drops the loose text (treated as a box).
  - **Safari clipboard activation** — the async `getFigmaSceneData` bridge call before `clipboard.write` may drop user-activation in Safari; primary target is Chromium. Mitigate with a promise-based `ClipboardItem` or pre-fetch-on-selection if Safari support is needed.
- **Next step:** schedule the real-Figma validation (T-814) first; it gates whether the two risks need rework. Fidelity items are independent enhancements.
- **Risk if ignored:** feature works for simple elements/frames; complex components paste with reduced fidelity. No crash — failures toast and no-op.
- **Tags:** `#feature` `#editor` `#integration` `#tech-debt`

### Editor URL `/project/<id>` is still the raw Convex id (not the site name)

- **Discovered:** 2026-06-03 (URL-humanization session — workspace slugs shipped, this deferred)
- **Where:** route [apps/web/client/src/app/project/[id]/page.tsx](apps/web/client/src/app/project/[id]/page.tsx); link builders [use-clone-website.ts:107,138](apps/web/client/src/hooks/use-clone-website.ts#L107), [use-create-blank-project.ts:84](apps/web/client/src/hooks/use-create-blank-project.ts#L84), [shared-with-me.tsx:37](apps/web/client/src/app/w/[slug]/_components/shared-with-me.tsx#L37). Route value `Routes.PROJECT` in [src/utils/constants/index.ts](apps/web/client/src/utils/constants/index.ts).
- **Symptom:** while editing, the address bar shows `/project/k97fawpe0hv2bt3g5qv1df583h8794fh` — opaque, not the site name. (Sibling work: workspace URLs were humanized this session; published `<slug>.weblab.app` default was switched to name-derived.)
- **Root cause:** the route param IS the Convex project `_id`, fed straight into `api.projects.getEditorBootstrap`, the offline bootstrap, and `editorEngine.projectId`. There is no project routing-slug column.
- **Why deferred (don't-break-anything):** a flat `/project/<slug>` namespace forces slugs to be **globally** unique across all users → common names collide constantly → `portfolio-2`, `portfolio-x7f9` everywhere (not actually human). Doing it the Webflow/Framer way means re-scoping the route under the workspace (`/w/<workspace>/<project>`), which rewrites the core editor entry point + offline bootstrap — too risky to bundle with the slug change.
- **Next step:** (a) add `projects.routeSlug` (unique **within workspace**), generate from name on create + backfill; (b) introduce nested route `/w/[slug]/[projectSlug]` (or make `/project/[idOrSlug]` resolve slug→id at the boundary via `ctx.db.normalizeId` fallback for back-compat so old id links never 404); (c) resolve to the real `_id` at the page boundary and keep passing the id downstream unchanged; (d) update the ~3 link builders; (e) decide offline-cache keying (slug URLs can't resolve offline → keep id-based links working as the offline path).
- **Risk if ignored:** none functional — editor URLs stay ugly but fully working. Cosmetic only.
- **Tags:** `#feature` `#editor` `#convex` `#ux`

### Fork-based create paths still stubbed: project clone + marketplace templates (`TODO(sandbox-fork)`)

- **Discovered:** 2026-06-03 (create-paths audit session)
- **Where:** `projectActions.fork` ([convex/projectActions.ts](apps/web/client/convex/projectActions.ts)) throws "Project fork is temporarily unavailable… snapshot-based fork is not yet implemented". Callers: project clone ([clone-project.tsx](apps/web/client/src/app/projects/_components/settings/clone-project.tsx), `clone-project-dialog.tsx`) and marketplace "Use template" ([template-modal.tsx](apps/web/client/src/app/projects/_components/templates/template-modal.tsx) → `forkTemplate`).
- **Symptom:** "Clone project" and marketplace "Use template" toast "Sandbox service temporarily unavailable".
- **Root cause:** Fork = duplicate an existing project's sandbox state into a new one. Needs Vercel snapshot-based fork (resume the source project's persisted `snapshotId` into a fresh sandbox, then insert a new project graph). Same blocker as `branch.fork` / publish.
- **Next step:** implement `fork` via snapshot resume — read source `projects.snapshotId`, provision from it (model on `createBlank`/`createFromGit`), insert project graph. Handle expired/missing snapshot (re-scaffold fallback or clear error).
- **Risk if ignored:** can't duplicate a project or start from a marketplace template. (Start-blank / AI-prompt / git-URL / folder / GitHub-repo / website-clone all work as of 2026-06-03.)
- **Tags:** `#feature` `#sandbox` `#convex`

### Figma import is low-fidelity (colored-box stubs) — high-fi follow-up

- **Discovered:** 2026-06-03 (create-paths audit session); end-to-end wiring shipped 2026-06-13 (see Resolved + feature-log).
- **Where:** scaffolder [packages/figma/src/scaffold.ts](packages/figma/src/scaffold.ts) (`scaffoldFrameComponent`); server action `createFromFigma` in [convex/projectActions.ts](apps/web/client/convex/projectActions.ts).
- **Symptom:** import now works end-to-end (real Next.js project, one editable component per frame), but each component is an empty colored `<div>` sized to the frame — no text, no fills, no nested layout.
- **Next step:** (a) deeper fidelity — expand `figmaActions.fetchFile` to pull the full Figma node tree and emit real JSX (text, fills, auto-layout → flex). (b) **alternative** high-fi visual clone — render frame screenshots via Figma `/v1/images/` and feed them into `createFromWebsiteClone`/`createFromPrompt` image context.
- **Tags:** `#feature` `#figma` `#enhancement`

### GitHub private-repo import needs token passthrough

- **Discovered:** 2026-06-03 (create-paths audit session)
- **Where:** GitHub private repos — `createFromGit` clones over HTTPS with no auth token.
- **Symptom:** private GitHub repos fail at clone with a generic error (public repos work).
- **Next step:** thread the user's GitHub token into `createFromGit`'s clone URL.
- **Tags:** `#feature` `#integration`

### Edit-message submit guard is a no-op (`sendMessage` not awaited)

- **Discovered:** 2026-06-02 (chat-panel UI review session, surfaced by `claude-review`)
- **Where:** `apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-messages/user-message.tsx:147-153` (caller `handleSubmit:122-131`)
- **Symptom:** Editing a user message and pressing Submit twice quickly can fire the edit twice; the Submit spinner (`isSubmittingEdit`) never visibly renders.
- **Root cause:** `sendMessage` calls `toast.promise(onEditMessage(...))` but never `await`s or `return`s the inner promise, so it resolves to `undefined` immediately. `handleSubmit` awaits it and the `finally` resets `isSubmittingEdit` before the edit completes, defeating the `if (isSubmittingEdit) return;` dedup guard. `handleRetry` (133-145) already does this correctly.
- **Next step:** make `sendMessage` await/return its promise — `const p = onEditMessage(...); toast.promise(p, {...}); await p;` (mirror `handleRetry`).
- **Risk if ignored:** rare double-submit of an edited message; no visible submitting state. Pre-existing (not introduced by this session's UI tweaks); left out of scope to avoid touching unrelated logic in a multi-session tree.
- **Tags:** `#bug`

### Project settings expansion — deferred sub-features

- **Discovered:** 2026-06-02 (project-settings expansion session)
- **Where:** `apps/web/client/src/components/ui/settings-modal/*`
- **Context:** Built this pass — Overview (General), Site Access tab, SEO tab (robots.txt + crawler/AI quick-inserts + llms.txt + custom sitemap.xml). The items below were deferred; each has a reason + a quick alternative.
- **Deferred — blocked by disabled publish/serving on Vercel (`TODO(publish-vercel)`):**
  - **Website password** + **Make staging private** — need a serving-layer auth gate on the published/staging site; nothing serves it yet. *Quick alt:* persist the setting now, label "applies once publishing is live" (no real protection until then). `pageAccess.passwordHash` schema already exists to build on.
  - **301 redirects** — need `next.config` redirects or a redirect server honoring them. *Quick alt:* persist a redirect list now; write to `next.config` / wire serving when publish lands.
  - **Forms** (sender name / send-to / submissions) — no form-capture backend, and submissions require the served site to POST somewhere. *Quick alt:* embed a 3rd-party form (Formspree/Tally) on the page — works with zero backend from us.
- **Deferred — feasible but medium-high / better handled elsewhere:**
  - **Fonts** (Google/custom/Adobe) — must inject into the user's project code (`next/font`, Tailwind v4 theme, or `<link>`) + an asset pipeline for custom uploads; fragile across arbitrary project setups. *Quick alt:* ask the AI chat ("use Inter") — it edits the project's actual font setup correctly today.
  - **Organize in folder** — no folder model exists; it's an org/dashboard-level concept, not per-project settings. *Quick alt:* project **tags** already exist for grouping.
  - **SEO v2** — auto-generate sitemap from the pages tree, global canonical URL (needs root-metadata plumbing like the Site tab), staging-indexing toggle (moot until staging serves). *Quick alt:* the custom `sitemap.xml` editor already shipped covers manual sitemaps.
  - **Overview: total asset size + site activity** — need storage metering + an `auditLog` query (the `auditLog` table exists, no client query yet).
- **Handoff prompts written** (2026-06-03) for picking these up: [docs/prompts/add-publishing-controls.md](docs/prompts/add-publishing-controls.md) (password · private staging · 301 redirects · Forms), [docs/prompts/add-fonts-tab.md](docs/prompts/add-fonts-tab.md), [docs/prompts/add-seo-v2.md](docs/prompts/add-seo-v2.md). The **folder** item is now DONE (folder dropdown shipped in General settings).
- **Tags:** `#feature` `#tech-debt` `#infra`

### AI chat UX — deferred polish follow-ups

- **Discovered:** 2026-06-02 (chat-tab `/ux-assesment` + `/ux-polish` session)
- **Where:** `apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/*` + `messages/en.json` (`panels.edit.tabs.chat.*`)
- **Symptom / items not done this pass** (the high-value W1–W9 + thread-title orientation shipped):
  - **Queue clarity (S3):** the message queue never explains *why* messages queue or *when* they send, and a committed queued-edit shows no save confirmation. `chat-input/queue-items/*`.
  - **History-recall affordance (S2):** ↑/↓ recalls prior prompts but there is no hint and no "browsing history (n/total)" active indicator. `chat-input/index.tsx:281-320`.
  - **Context-pill near-limit count:** made the remove-X always visible (W6) but did **not** add the `n/max` image-limit indicator — intentionally skipped to avoid clutter. `context-pills/input-context-pills.tsx`.
  - **Stale composer copy:** `chat.input.tooltip` = "Chat with AI about the selected element" (selection no longer required — misleading) and `chat.mode.tooltip` = "Switch between Build and Ask modes" (omits **Plan**). `messages/en.json` (~1164, ~1167).
- **Next step:** small, independent edits; each a self-contained quick win. Fix the two stale strings first (one-line copy each).
- **Risk if ignored:** minor friction / mild confusion; nothing broken.
- **Tags:** `#ux` `#polish` `#i18n`

### Settings modal i18n is partial — only 4 tabs translated

- **Discovered:** 2026-06-02 (settings-modal polish session)
- **Where:** `apps/web/client/src/components/ui/settings-modal/*` — new `settings.*` namespace in `messages/en.json` + `sv.json`
- **Symptom:** Switching language now updates the **Appearance, Language, Editor, and Domain** tabs (Swedish added), but the remaining tabs (Account, AI, Skills, Shortcuts, Git, Subscription, Site, Project, Versions) and nested dialogs (skill-form, billing-info-edit, user-delete) still render hardcoded English.
- **Root cause:** Scope was limited to the highest-traffic tabs + the tab in the original report. Account-tab was deferred because its support-link helper needs `t.rich` and it embeds the sensitive delete flow.
- **Next step:** Convert the remaining tab files to `useTranslations()` under `settings.*`, extend `en.json`/`sv.json` (and ideally the other locales). Use the 4 done tabs as the pattern.
- **Risk if ignored:** Inconsistent localization — Swedish users see a mixed-language settings modal.
- **Tags:** `#i18n` `#tech-debt`

### Orphaned Convex `uiDensity` field after Density control removal

- **Discovered:** 2026-06-02 (settings-modal polish session)
- **Where:** `apps/web/client/convex/schema.ts` (userSettings `uiDensity`), `convex/users.ts` (`updateSettings`/`getMappedSettings` still map it)
- **Symptom:** The Density appearance control was removed because `--spacing-unit` (set by `[data-density]`) was consumed nowhere — the toggle did nothing. The Convex `uiDensity` field is now write-dead.
- **Root cause:** Density was never wired to real spacing; removing the UI is correct, but the schema field was left to avoid a migration.
- **Next step:** Either drop `uiDensity` from the userSettings schema + mapper in a dedicated additive→narrow migration, OR re-implement density for real (multiply component padding by `--spacing-unit`). Low priority.
- **Risk if ignored:** Harmless dead field; minor schema clutter.
- **Tags:** `#tech-debt` `#convex`

### Editable Weblab subdomain — end-to-end serving unverified (publish disabled)

- **Discovered:** 2026-06-02 (settings-modal polish session)
- **Where:** `convex/domains.ts` (`setPreviewSlug`, `previewSlugGet`), `convex/domainActionsDb.ts` (`_previewCreate`), `domain/preview.tsx`
- **Symptom:** Users can now reserve/rename `<slug>.weblab.app`. The slug persists (`projects.previewSlug`) and `_previewCreate` honors it, but `publish` is disabled on Vercel (`TODO(publish-vercel)`), so the slug can't be exercised against live routing/serving yet.
- **Root cause:** Publish path gated until snapshot-based fork lands.
- **Next step:** When publish is re-enabled, verify a chosen slug actually serves the deployed site and that the wildcard DNS + `by_full_domain` lookup resolves it. Pre-publish slug collisions across projects are only guarded at set-time (and at publish-time in `_previewCreate`).
- **Risk if ignored:** Setter UX works, but a reserved slug might not route until verified post-publish.
- **Tags:** `#infra` `#convex` `#test-gap`

### Terminal tab drag-reorder is single-branch only; live exec depends on sandbox runtime

- **Discovered:** 2026-06-02 (terminal overhaul — F-331/F-331a/F-331b/F-480)
- **Where:** [terminal-area.tsx](apps/web/client/src/app/project/[id]/_components/bottom-bar/terminal-area.tsx) `handleReorder`; [session.ts](apps/web/client/src/components/store/editor/sandbox/session.ts) `reorderTerminalSessions`.
- **Symptom / limitation:** Drag-to-reorder of terminal tabs only works **within a single branch**. Dragging a tab across branch boundaries is a deliberate no-op because per-branch session maps can't represent cross-branch interleaving. The common single-branch project is unaffected. Multi-branch projects can't interleave tabs from different branches.
- **Also:** The new command input row + AI mode are fully wired to the provider PTY (`terminal.write`) / `session.runCommand`, but **live command execution depends on the Vercel sandbox runtime** (the TOP-PRIORITY entry below) — `VercelBrowserProvider.runCommand`/terminals are currently stubs, so commands won't produce output on cloud projects until that lands. Works today on the local `nodefs` provider. The AI translation route (F-480) is independent and works now (returns a command string).
- **Next step (reorder):** if cross-branch interleaving is ever needed, lift terminal ordering out of per-branch maps into a single editor-level ordered list keyed by composite `branchId-sessionId`.
- **Tags:** `#editor` `#terminal` `#low`

### Editor sandbox runtime is UNIMPLEMENTED (deferred migration) → every project "loads forever" [TOP PRIORITY]

- **Discovered:** 2026-05-29 (create-flow e2e + root-cause). This is THE reason the editor preview never boots (penpal timeout + `__missing_router_config__` + "Trouble connecting"). Reproduces on every project, all environments.
- **Root cause — all three layers are stubs:**
  - `apps/web/client/src/components/store/editor/sandbox/vercel-browser-provider.ts` — every method returns a safe default: `listFiles → {files:[]}`, `readFile → ''`, `writeFile → {success:false}`, `runCommand → {success:false}`, terminals/tasks/watch are no-ops ("return safe defaults until the routes are ported").
  - `apps/web/server/src/router/routes/sandbox.ts` — `sandboxRouter` only has `create/start/stop/status` and they're placeholders (`create` returns `` `hi ${input}` ``).
  - `apps/web/server/src/sandbox/index.ts` — `start/stop/status` return hardcoded `http://localhost:8084` URLs.
- **Consequences:** `listFiles` empty → `detectRouterConfig` null → preload never injects → penpal never connects; `runCommand` no-op → dev server never starts → preview URL 502s. So the canvas, code panel, AI edit, and preview are all dead even though the sandbox provisions fine (`createBlank` works; a direct snapshot resume serves HTTP 200 in ~13s).
- **The building blocks all exist + are verified:** browser→server tRPC WS client `apps/web/client/src/lib/sandbox-server-client.ts` (+ Clerk JWT auth bridge `sandbox-server-auth-bridge.tsx`), `NEXT_PUBLIC_SANDBOX_SERVER_URL` (defaults `ws://host:8080/api/trpc`), and the `@vercel/sandbox` SDK (`Sandbox.get({sandboxId,teamId,projectId,token})` → `fs.readFile/writeFiles/mkdir/stat`, `runCommand`, `domain(port)` — all confirmed working via probe).
- **Build spec (incremental, verify each on localhost):**
  1. `apps/web/server/src/sandbox/index.ts`: real helpers over `Sandbox.get` — `listFiles` (via `runCommand('find . -type f' ...)` excluding node_modules/.next/.git), `readFile`, `writeFile` (`fs.writeFiles`), `stat`, `mkdir`, `runCommand`, `runBackgroundCommand` (dev server), `domain`.
  2. `apps/web/server/src/router/routes/sandbox.ts`: tRPC procedures (`fileList/fileRead/fileWrite/fileStat/fileMkdir/fileDelete/commandRun/commandRunBackground/taskOpen/taskRestart`) calling the helpers; auth via the existing Clerk-JWT context.
  3. `vercel-browser-provider.ts`: replace each stub with a call to `sandbox-server-client.ts`. Implement `VercelBrowserTerminal`/`VercelBrowserTask` streaming over the WS subscription, and `setup()` → `npm install` + spawn `npm run dev -- --hostname 0.0.0.0` (background).
  4. Verify order on localhost: router config detected → preload injected → dev server serves → penpal connects → preview renders.
- **SECURITY PREREQUISITE (blocker for the whole build):** the Fastify tRPC context `apps/web/server/src/router/context.ts` does NO real auth — it sets `user = { name: req.headers.username ?? 'anonymous' }`. The sandbox-server-auth-bridge claims the server "verifies the token via Clerk's JWKS in its tRPC context", but it does NOT. Wiring `fileRead`/`fileWrite`/`commandRun` onto this would expose **arbitrary file read/write + command execution on ANY sandbox to ANY unauthenticated caller** (RCE + cross-tenant data access). Before any sandbox procedure ships: (a) verify the Clerk JWT (passed in WS connectionParams) against Clerk JWKS in `createContext`, (b) resolve the caller's userId, (c) authorize that the caller owns/can-access the requested `sandboxId` (map sandboxId→project→`requireCap('project.edit')`). This is the gating reason the wiring must be a reviewed, security-tested build, NOT a blind push. The server-side `VercelSandboxProvider` (reused by `createBlank`) already wraps the SDK correctly — reuse it, but the AUTH layer is net-new and security-critical.
- **Risk:** this is the editor's core runtime AND a remote sandbox-access surface — build behind verification + a security review, do NOT ship partial or unauthenticated.
- **Tags:** `#bug` `#sandbox` `#migration` `#editor` `#high` `#blocks-everything`

### Editor preview never boots on a freshly-created blank project — sync engine wipes the sandbox on first connect (DATA-PATH RISK)

- **Discovered:** 2026-05-29 (create-flow e2e, localhost, authenticated). This is the real "loads forever" the original report showed (penpal timeouts + `__missing_router_config__`).
- **NOT offline mode:** ruled out — `navigator.onLine === true`, `/api/health` → 200, and the project connected to a **real** sandbox (`[Sync] Created new sync instance for sbx_…`). The synthetic-project offline fallback (`session.ts:102`, sandboxId `test-…`/`example.com`) is a separate, intended path (that's why the seeded "QA Test Project" is offline).
- **Symptom / sequence on first connect:** `[Sync] Created new sync instance for sbx_…` → `[Sync] Deleted directory: /public` → `[Sync] Pushing locally modified files back to sandbox…` → `Error: File system not initialized` (`CodeFileSystem.writeFile`) → `[SandboxManager] Router config not detected yet` (repeats forever) → penpal timeouts. The client ZenFS (`CodeFileSystem`) appears uninitialized, so the sync engine treats local as empty and **pushes empty / deletes `/public` (and the router dir) on the sandbox** instead of pulling sandbox→local first. With `app/` gone, `detectRouterConfig` returns null forever → preload never injects → preview never connects.
- **The sandbox itself is healthy** — a direct snapshot-resume probe serves HTTP 200 in ~13s. The bug is in the editor's initial sync, not the sandbox.
- **Next step (do carefully — this path persists user code):** trace `CodeProviderSync` (`src/services/sync-engine/sync-engine.ts`) initial-sync direction + `CodeFileSystem` init order (`packages/file-system`). The initial `pullFromSandbox` must complete (and ZenFS must be initialized) BEFORE any push/delete. Add a guard: never push/delete to the sandbox until the first successful pull. Repro is deterministic on a fresh blank create.
- **Risk if ignored:** every freshly-created project (and any reconnect with an uninitialized FS) can have its sandbox files deleted → permanent "loads forever" + potential loss of scaffolded files.
- **Tags:** `#bug` `#sandbox` `#sync` `#data-loss-risk` `#high`

> Note: `bun dev` (`@weblab/web dev`) only starts client+preload, not `@weblab/web-server`. Start `apps/web/server` separately (`bun --filter @weblab/web-server dev`, port 8080) for full local editing. This was NOT the cause of the boot failure above but is needed for a complete local stack.

### Editor comments fail to load — ConvexHttpClient query is unauthenticated (UNAUTHORIZED)

- **Discovered:** 2026-05-29 (editor console). `CommentManager.loadCommentsOnce` → `ConvexHttpClient.query(api.comments...)` → `Server Error / UNAUTHORIZED at requireUser (convex/lib/permissions.ts:44)`.
- **Root cause:** the one-shot `ConvexHttpClient` is created without `.setAuth(token)`, so it carries no Clerk identity; `requireCap('project.view')` → `requireUser` throws. Would fail on prod too (comments never load in the editor).
- **Next step:** pass the Clerk JWT to the `ConvexHttpClient` used by `CommentManager` (`client.setAuth(await getToken())`), or switch to the reactive authenticated Convex client.
- **Risk if ignored:** project comments silently never load.
- **Tags:** `#bug` `#convex` `#auth`

### 3 of 4 create paths disabled — AI / clone / upload need Convex re-implementation (Vercel 402 now RESOLVED)

> **RESOLVED 2026-06-03** — all three are wired: AI prompt (`createFromPrompt`, commit `ab96d3e69`), site clone (`createFromWebsiteClone`, commit `38a0cf921`), upload folder (entry points route to the working `/projects/import/local` page → `createEmptySandbox`, commit `7a9c5df8e`). GitHub repo import also re-enabled (`createFromGit`). Remaining create gaps tracked in the two fork/figma entries at the top of Open.

- **Discovered:** 2026-05-29 (create-flow e2e session). External Vercel 402 blocker is **gone** — verified `Sandbox.create` provisions in ~3.6s and a blank snapshot resume serves HTTP 200 in ~13s. So **blank create works end to end** (`api.projectActions.createBlank`). The other three paths are still stubbed.
- **Where / current state:**
  - **AI prompt:** [src/components/store/create/manager.ts](apps/web/client/src/components/store/create/manager.ts) `startCreate` throws `UNAVAILABLE_MESSAGE`. Editor reads `api.projectCreateRequests.getPendingRequest` ([convex/projectCreateRequests.ts](apps/web/client/convex/projectCreateRequests.ts)) → only sets `isFirstCreation` (copy). **No insert mutation for `projectCreateRequests`, and no editor consumer that actually sends the prompt to the AI chat** — the auto-kickoff was part of the removed `project.create(creationData)` flow.
  - **Site clone:** [src/hooks/use-clone-website.ts](apps/web/client/src/hooks/use-clone-website.ts) `cloneFromUrl` — `scrapeUrl` ([convex/utils.ts:152](apps/web/client/convex/utils.ts#L152), returns markdown/HTML + base64 screenshot) works, then `unavailable('Cloning from URL')`. Clone = scrape → AI rebuild, so it depends on the same missing AI-kickoff.
  - **Upload folder:** [src/hooks/use-import-local-project.ts](apps/web/client/src/hooks/use-import-local-project.ts) throws before the FS-Access picker; needs the removed `sandbox.fork` + `orphanBulkUpload` + `startOrphan`.
- **Root cause:** Convex migration removed `sandbox.fork`, `project.create(creationData)`, and the bulk-upload/orphan primitives. `createBlank` returns `{projectId}` only and takes no initial files; `writeFile` exists on the provider ([packages/code-provider/src/providers/vercel-sandbox/index.ts:586](packages/code-provider/src/providers/vercel-sandbox/index.ts#L586)) but nothing wires scrape/upload content into a provisioned sandbox.
- **Next step (incremental, verify each in a logged-in browser before shipping):**
  1. **Upload** (no AI): client FS-Access gather → new Convex action: provision (createBlank path) → bulk `writeFile` into the live sandbox → re-snapshot → insert project graph.
  2. **AI kickoff**: add a `projectCreateRequests` insert mutation; add an editor consumer that, on a pending request, sends the stored prompt to the AI chat and marks the request done.
  3. **Clone**: reuse (2) — feed the `scrapeUrl` result as the create-request context.
- **Risk if ignored:** only blank create is usable; AI/clone/upload show "temporarily unavailable".
- **Tags:** `#feature` `#sandbox` `#convex` `#ai`

### Built-in skills `tailwind` and `impeccable` could not be embedded (missing sources)

- **Discovered:** 2026-05-29 (skills built-in seeding session)
- **Where:** `agent-temp-input/tailwind` → `../../.agents/skills/tailwind` and `agent-temp-input/impeccable` → `../../.agents/skills/impeccable` (dangling symlinks); generator [packages/ai/scripts/generate-skills.ts](packages/ai/scripts/generate-skills.ts) reads `skills/<name>/SKILL.md`.
- **Symptom:** User asked for both to ship as default-on built-ins, but their symlink targets resolve to `coder-new/.agents/skills/*`, which does not exist on disk; no matching `SKILL.md` found under `~/.claude` either. The other 7 requested skills were embedded; these two were skipped.
- **Next step:** Obtain the real `tailwind` + `impeccable` `SKILL.md` sources, drop them into `skills/tailwind/SKILL.md` and `skills/impeccable/SKILL.md`, then run `bun run generate:skills`. No code change needed.
- **Risk if ignored:** the agent's built-in skill menu is missing two skills the user expected.
- **Tags:** `#docs` `#tech-debt`

### Image credit deduction can't span multiple Pro rate-limit buckets

- **Discovered:** 2026-05-29 (image-gen independent review)
- **Where:** [convex/lib/usageMath.ts](apps/web/client/convex/lib/usageMath.ts) `selectDeductionBucket` (has a `TODO(image-credits)` marker); consumed by `applyIncrement` / `reserveImage` in [convex/usage.ts](apps/web/client/convex/usage.ts).
- **Symptom:** A Pro user whose remaining credits are split across two buckets (e.g. 3 + 4 left = 7 total) can't generate a 5-credit image because no single bucket holds ≥5 — they get `USAGE_LIMIT_REACHED` despite having enough total. Reachable near billing-period rollover. Text usage (cost 1) is unaffected.
- **Root cause:** deduction targets one bucket and the usageRecord links one bucket so `revertIncrement` can refund it; spanning buckets needs multi-link tracking.
- **Next step:** add a `linkedRateLimits: {id, amount}[]` field (or child table) on `usageRecords`, drain oldest-first across buckets in `applyIncrement`, refund each in `revertIncrement`.
- **Risk if ignored:** rare false "out of credits" for paying users near period boundaries.
- **Tags:** `#bug` `#billing`

### Skills settings tab strings are hardcoded (no i18n)

- **Discovered:** 2026-05-29 (skills scope-clarity work)
- **Where:** [apps/web/client/src/components/ui/settings-modal/skills-tab/index.tsx](apps/web/client/src/components/ui/settings-modal/skills-tab/index.tsx) and [scope-badge.tsx](apps/web/client/src/components/ui/settings-modal/skills-tab/scope-badge.tsx).
- **Symptom:** all strings ("Skills", "All skills", scope help, empty/loading states) are inline English, unlike the sibling `skill-import-dialog.tsx` which uses `next-intl`. New scope-help copy added this session followed the file's existing hardcoded convention.
- **Next step:** route through `editor.settings.skills.*` keys in `messages/en.json` (base for all locales).
- **Risk if ignored:** the Skills tab stays untranslated for non-English users.
- **Tags:** `#i18n` `#tech-debt`

### Blank-project create pays the sandbox cold-boot cost twice (slow create + slow editor)

- **Discovered:** 2026-05-29 (project-creation investigation session)
- **Where:** [convex/projectActions.ts:244](apps/web/client/convex/projectActions.ts#L244) (`createBlank` → `VercelSandboxProvider.createProject`, synchronous), then editor cold-resume via [src/components/store/editor/sandbox/session.ts](apps/web/client/src/components/store/editor/sandbox/session.ts) `start()`.
- **Symptom:** "Start blank" shows the creation loader for 15–45s while `createBlank` scaffolds + `npm install` + snapshots + resumes the sandbox synchronously. It then `router.push`es to the editor, which cold-resumes the *same* sandbox from snapshot — the dev server respawns and the preview 502s for another 20–60s. The user waits through the boot twice.
- **Root cause:** Provisioning is fully synchronous in the action, and the editor does not reuse the still-warm sandbox from create; it re-resumes from the persisted `snapshotId`.
- **Next step:** Either (a) keep the create-time sandbox warm and hand its live session to the editor so it skips the second resume, or (b) provision asynchronously (return `projectId` immediately, boot in the background) and let the editor's now-resilient boot loop (see self-heal in [use-frame-reload.ts](apps/web/client/src/app/project/[id]/_components/canvas/frame/use-frame-reload.ts)) cover the wait. Also wire `WEBLAB_VERCEL_WARM_POOL_SIZE` so a pre-warmed VM is claimed instead of cold-provisioned. Needs a live Vercel-sandbox env to verify.
- **Risk if ignored:** every new project feels slow and "stuck"; the perceived double-wait is the top creation-flow complaint.
- **Tags:** `#perf` `#infra` `#sandbox` `#needs-verification`

### Sandbox liveness probe is a no-op on Convex — editor can't tell "booting" from "dead"

- **Discovered:** 2026-05-29 (project-creation investigation session)
- **Where:** [src/app/project/[id]/_components/canvas/frame/use-sandbox-liveness.ts:23](apps/web/client/src/app/project/[id]/_components/canvas/frame/use-sandbox-liveness.ts#L23) (TODO(convex-migration): always returns `'unknown'`); also stubbed in [project-preview-surface.tsx:93](apps/web/client/src/app/projects/_components/select/project-preview-surface.tsx#L93).
- **Symptom:** `useSandboxLiveness` never probes, so every auto-recovery branch in [frame/index.tsx](apps/web/client/src/app/project/[id]/_components/canvas/frame/index.tsx) that keys off `livenessState === 'alive' | 'gone' | 'notFound'` is dead code. The editor relies solely on the penpal handshake + reload loop; a genuinely-reaped sandbox can't surface a Restore CTA, and the boot loop can't distinguish "still cold" from "gone forever". Partially mitigated this session by a background self-heal reload after the cap, but that's a fallback, not a real signal.
- **Root cause:** The legacy `sandbox.checkAlive` tRPC procedure (apps/web/server) was never ported to Convex during the migration.
- **Next step:** Add a Convex `action` `sandboxActions.checkAlive({ projectId })` that server-side `HEAD`s the project's *own* stored `sandboxUrl` (look it up server-side — do NOT accept an arbitrary URL from the client, SSRF) and classifies `2xx/3xx/404→alive`, `502/503/504→booting`, `410/DNS-fail→gone`. Wire it into `useSandboxLiveness` (poll while `enabled`). Unit-test the classifier in isolation.
- **Risk if ignored:** reaped sandboxes spin forever with no Restore path; boot UX stays guess-based.
- **Tags:** `#bug` `#sandbox` `#convex` `#tech-debt`

### Stripe `past_due` / `unpaid` subscriptions keep full Pro access (no failed-payment gating)

- **Discovered:** 2026-05-29 (test-hardening session: billing audit, HIGH-confidence)
- **Where:** [convex/lib/stripeWebhook.ts:279](apps/web/client/convex/lib/stripeWebhook.ts#L279) (`isRenewal` only handles `stripeStatus === 'active'`), [convex/lib/enums.ts](apps/web/client/convex/lib/enums.ts) (`vSubscriptionStatus` is only `active | canceled`), entitlement at [convex/usage.ts:54](apps/web/client/convex/usage.ts#L54) (keys solely off `status === 'active'`).
- **Symptom:** When a renewal charge fails, Stripe sends `customer.subscription.updated` with `status: 'past_due'`. `_handleSubUpdated` has no branch that maps non-active statuses, so the row stays `active` and the user keeps Pro credits while not paying. There is **no `invoice.payment_failed` handler** (grep: 0 matches). Conversely, when `customer.subscription.deleted` finally fires, access is yanked with no prior grace/warning.
- **Root cause:** The subscription model has only two states; `past_due`/`unpaid`/`incomplete` are unrepresentable, and entitlement never consults `stripeCurrentPeriodEnd`.
- **Next step:** Decide the dunning policy (grace window vs immediate gate), extend `vSubscriptionStatus` + `_handleSubUpdated` to map `past_due`/`unpaid`, and add an `invoice.payment_failed` handler in the webhook switch ([convex/http.ts](apps/web/client/convex/http.ts)). Add a `convex-test` harness so `_handleSubUpdated` can be unit-tested.
- **Risk if ignored:** revenue leak (failed renewals keep access) + abrupt access loss with no warning UX.
- **Tags:** `#bug` `#billing` `#convex` `#money-path`

### Stripe webhook reads billing period from `items.data[0]`, not the subscription — API-version fragile

- **Discovered:** 2026-05-29 (test-hardening session: billing audit, NEEDS-VERIFICATION)
- **Where:** [convex/http.ts:195](apps/web/client/convex/http.ts#L195) (`current_period_start/end` read off `subscription.items.data[0]`; 202-drop guard at ~L222), SDK constructed with no pinned `apiVersion` at [convex/subscriptionActions.ts:27](apps/web/client/convex/subscriptionActions.ts#L27).
- **Symptom:** `current_period_start/end` moved onto subscription **items** only in Stripe API `2025-03-31.basil`+. On an older account default API version those fields are `undefined` → the guard returns `202` and silently drops the event — including `customer.subscription.created`, so a brand-new paid subscription is never persisted (user charged, zero access). Renewal quota reset also depends on a distinct `subscription.updated` rather than the canonical `invoice.paid` signal.
- **Next step:** Confirm the Stripe API version pinned for this account's webhook endpoint; make the parser fall back to `sub.current_period_*` when the item fields are absent; pin `apiVersion` on the `new Stripe()` client so the webhook JSON shape and SDK agree.
- **Risk if ignored:** on an API-version mismatch every checkout silently no-ops server-side.
- **Tags:** `#bug` `#billing` `#convex` `#needs-verification`

### Email / custom-domain values are not canonicalized at write — case-sensitive lookups can miss

- **Discovered:** 2026-05-29 (test-hardening session: auth + domain audit, MEDIUM)
- **Where:** invite member-conflict guard [convex/projectInvitations.ts:428](apps/web/client/convex/projectInvitations.ts#L428) (probes only lowercased + as-typed email); `users.email` stored raw from Clerk ([convex/clerkWebhooks.ts:31](apps/web/client/convex/clerkWebhooks.ts#L31), [convex/lib/permissions.ts:88](apps/web/client/convex/lib/permissions.ts#L88)). Custom-domain reuse/remove exact-match on stored `fullDomain`: [convex/domainActionsDb.ts:273](apps/web/client/convex/domainActionsDb.ts#L273) (`_ensureUserOwnsDomain`), [:82/:95](apps/web/client/convex/domainActionsDb.ts#L82) (`_customRemove`).
- **Symptom:** A member whose stored email is `John.Doe@Acme.com` invited again as `john.doe@acme.com` (third casing) bypasses the "already a member" guard → duplicate pending invite (NOT a privilege escalation; `accept` is case-insensitive + idempotent). Custom-domain reuse/remove can miss when casing differs from the stored value.
- **Root cause:** emails/domains persisted verbatim; guards assume a lowercased invariant that writers don't enforce. (The verification **create** path was normalized 2026-05-29 — see commit; reuse lookup left raw for backward-compat with pre-existing rows.)
- **Next step:** lowercase `users.email` in the Clerk webhook + JIT writers (one-time backfill for existing rows), then normalize the reuse/remove domain lookups too. Extract a pure `canonicalizeEmail` + reuse the existing `isEmailMatch`.
- **Risk if ignored:** duplicate invites + occasional "you don't own this domain" / silent no-op on remove for mixed-case entries. Low severity.
- **Tags:** `#bug` `#auth` `#convex` `#low-severity`

### Dead-code domain helpers in `packages/utility` have a real ccTLD bug

- **Discovered:** 2026-05-29 (test-hardening session: auth audit)
- **Where:** [packages/utility/src/domain.ts:58](packages/utility/src/domain.ts#L58) `getRootDomain` (naive `parts.slice(-2)`), plus `isSubdomain` (:49) and `verifyDomainOwnership` (:14).
- **Symptom:** `getRootDomain('app.foo.co.uk')` → `"co.uk"` (public suffix, not the registrable apex). These have **zero production callers** (grep across `apps/`+`packages/`); the live Convex path uses tldts (`convex/lib/freestyle.ts::parseDomain`, now unit-tested). Vestigial from the pre-Convex tRPC domain router.
- **Next step:** delete the dead helpers, or if revived, reimplement on tldts/PSL and add tests.
- **Risk if ignored:** none today (dead); a future caller would inherit the ccTLD mis-parse.
- **Tags:** `#tech-debt` `#dead-code`

### Test hygiene: `navigation.test.ts` fails in bare env; `subdirectory.test.ts` is empty

- **Discovered:** 2026-05-29 (test-hardening session: baseline run)
- **Where:** [apps/web/client/test/frame/navigation.test.ts](apps/web/client/test/frame/navigation.test.ts) (transitively imports `src/env.ts`); [apps/web/client/test/sandbox/subdirectory.test.ts](apps/web/client/test/sandbox/subdirectory.test.ts) (0 bytes).
- **Symptom:** `navigation.test.ts` is the only failing test in the client suite — it throws "Invalid environment variables" at import time because `OPENROUTER_API_KEY` is unset under `bun test` (env IS set at runtime, so not a product bug). `subdirectory.test.ts` is empty → false-confidence "coverage" with zero assertions.
- **Next step:** preload a test-only env (bunfig `preload` or set a dummy `OPENROUTER_API_KEY` in a test setup file) so the suite is green in CI; delete or fill `subdirectory.test.ts` (no subdirectory-resolution helper currently exists to test).
- **Risk if ignored:** perpetually red suite masks new real failures; empty file misleads.
- **Tags:** `#test-gap` `#flake` `#infra`

### `parseDomain` comment claims PSL private-domain handling it doesn't do

- **Discovered:** 2026-05-29 (test-hardening session; pinned in `freestyle.test.ts`)
- **Where:** [convex/lib/freestyle.ts:65](apps/web/client/convex/lib/freestyle.ts#L65) + the comment at [domainActions.ts:58](apps/web/client/convex/domainActions.ts#L58).
- **Symptom:** Comment says tldts splits `.co.uk` / `.github.io` / `.vercel.app` "correctly via the PSL", but `parse()` is called without `allowPrivateDomains: true`, so PRIVATE suffixes are NOT honored: `parseDomain('user.github.io')` → apex `github.io`, `parseDomain('x.vercel.app')` → apex `vercel.app`. `.co.uk` (ICANN suffix) is correct. Behavior is now pinned in `convex/lib/freestyle.test.ts`.
- **Next step:** either fix the comment (private suffixes not handled) or pass `{ allowPrivateDomains: true }` if those should be treated as apexes — and update the test. Low impact: users connect real registrable domains, not `*.github.io`.
- **Risk if ignored:** misleading comment; apex dedup key for a `*.vercel.app`/`*.github.io` custom domain would be the shared private suffix.
- **Tags:** `#docs` `#low-severity`

### Billing settings redesign built but not wired into the Subscription tab

- **Discovered:** 2026-05-29 (full-repo code review)
- **Where:** [apps/web/client/src/components/ui/settings-modal/billing/](apps/web/client/src/components/ui/settings-modal/billing/) — `plan-card.tsx`, `payment-methods.tsx`, `billing-information.tsx`, `billing-info-edit-dialog.tsx`, `billing-history.tsx`, `cancel-plan.tsx`, `use-billing-details.ts`, `format.ts`. Backed by new Convex actions in [convex/subscriptionActions.ts](apps/web/client/convex/subscriptionActions.ts) (`getBillingDetails`, `updateBillingInfo`, `setDefaultPaymentMethod`, `deletePaymentMethod`, `addPaymentMethod`, `cancelSubscription`, `reactivateSubscription`).
- **Symptom:** Nothing imports any of these components — `grep` for `PlanCard`/`PaymentMethods`/`useBillingDetails` outside the dir returns zero hits. The live Subscription tab ([subscription-tab.tsx](apps/web/client/src/components/ui/settings-modal/subscription-tab.tsx)) still renders the old inline UI, so the new payment-method management, billing-address editor, invoice history, and native cancel/reactivate are invisible to users.
- **Root cause:** In-flight WIP committed before the integration step. Components + actions typecheck/lint clean (compiled as dead code), so no build break — but the feature does nothing.
- **Next step:** Wire the new `billing/*` components into `subscription-tab.tsx` (replace or augment the existing plan UI), then browser-verify the full Stripe flow end-to-end against test mode: load details, set/delete default card, add card (portal deep-link), edit billing address, cancel + reactivate. Treat as a payment-critical change — do not ship without manual verification of each path.
- **Risk if ignored:** dead code in the bundle; the intended billing UX never reaches users; future readers assume it's live.
- **Tags:** `#feature-gap` `#billing` `#convex` `#wip`

### Vercel Sandbox returns HTTP 402 — all project/branch creation + editor sandbox resume is blocked

- **Discovered:** 2026-05-29 (investigate: "can't create projects")
- **Where:** Vercel account behind `VERCEL_TEAM_ID` (set on both Convex deployments `avid-gnat-539` dev + `rapid-crab-113` prod). Surfaces at [apps/web/client/convex/projectActions.ts:243](apps/web/client/convex/projectActions.ts#L243) (`VercelSandboxProvider.createProject` → `Sandbox.create`).
- **Symptom:** `projectActions.createBlank` / `branchActions.createBlank` fail; prod client sees masked "Server Error" (request id `d93c958b083e9289`). Prod Convex log: `Uncaught Error: Status code 402 is not ok`. Editing an existing project also breaks because opening the editor resumes the sandbox via the same `Sandbox.create` call.
- **Root cause:** HTTP 402 Payment Required from the Vercel Sandbox API — the token authenticates (else 401/403) but the team has hit a spend/quota limit, has no payment method, or is on a plan that excludes Sandbox. **Not a code bug.**
- **Next step (manual, owner = Ludvig):** In the Vercel dashboard for the team in `VERCEL_TEAM_ID` → Settings → Billing: confirm an active paid plan that includes Sandbox, add/repair a payment method, and raise/clear the spend-management cap. Then retry "Start blank". If it should run on a different team, rotate `VERCEL_TEAM_ID`/`VERCEL_PROJECT_ID`/`VERCEL_TOKEN` on **both** Convex deployments (`npx convex env set … ` and `… --prod`).
- **Risk if ignored:** core product is unusable — no project can be created, opened, or edited.
- **Tags:** `#bug` `#infra` `#blocker` `#sandbox` `#billing`

### Prompt / GitHub-template project creation not yet ported to Convex (`TODO(sandbox-port)`)

> **RESOLVED 2026-06-03** — `startCreate` → `createFromPrompt`, and `startPublicGitHubTemplate` / `startGitHubTemplate` → `createFromGit` are all wired (commits `ab96d3e69`, `7a9c5df8e`). The only stubbed manager method left is `createSandboxFromGithub`, which is dead code (no caller). Marketplace "Use template" (forkTemplate → `fork`) is still blocked — see the `TODO(sandbox-fork)` entry at the top of Open.

- **Discovered:** 2026-05-29 (investigate; pre-existing TODO)
- **Where:** [apps/web/client/src/components/store/create/manager.ts:24](apps/web/client/src/components/store/create/manager.ts#L24) — `startCreate`, `startGitHubTemplate`, `startPublicGitHubTemplate` all throw `UNAVAILABLE_MESSAGE`.
- **Symptom:** AI/prompt create (hero input) and GitHub-template imports show "Project creation is temporarily unavailable while the sandbox layer is being migrated to Convex." Only the "Start blank" CTA reaches a real Convex action.
- **Root cause:** legacy flow chained tRPC `api.sandbox.fork` + `api.project.create` + `api.github.validate`; none have Convex equivalents that accept a prompt, image context, or github subpath. `projectActions.createBlank` only handles the blank shape.
- **Next step:** port a `projectActions.createFromPrompt` (+ github variant) that provisions via `VercelSandboxProvider.createProjectFromGit` / scaffold, writes the project graph, and seeds the first chat message. Gated behind the 402 blocker above — nothing creates until billing is fixed.
- **Risk if ignored:** the headline "describe your app" entry point is dead; users must use "Start blank".
- **Tags:** `#tech-debt` `#sandbox` `#convex` `#feature-gap`

### Stripe webhook required-field gate can drop cancel/pause/resume events

- **Discovered:** 2026-05-28 (CodeRabbit-fix pass, local-review)
- **Where:** [apps/web/client/convex/http.ts:216-234](apps/web/client/convex/http.ts#L216-L234) — the `if (!event.id || !sub.id || !item?.id || !priceId || !customerId || !item.current_period_start || !item.current_period_end)` 202 gate
- **Symptom:** the gate requires `priceId` + `customerId` + `current_period_*` for **every** routed event before dispatch, then 202-accept-ignores (no Stripe retry). But `_handleSubDeleted` / `_handleSubPaused` / `_handleSubResumed` only consume `subscriptionId`. If Stripe ever delivers a cancel/pause/resume without a fully-expanded price/period (e.g. canceled-immediately, or future API-version field relocation), the event is permanently dropped and the subscription stays `status:'active'` in our DB → user keeps entitlements they no longer pay for.
- **Root cause:** one-size gate; pre-existing (predates the `evt.id` dedup work, which only added `!event.id` to the same gate).
- **Next step:** gate billing fields only for `created`/`updated` (`const needsBilling = event.type === 'customer.subscription.created' || 'customer.subscription.updated'`). **Must also** relax `vSubEventInput` (make `priceId`/`customerId`/`currentPeriod*` optional) since those handlers don't read them — a gate-only change would pass the gate then fail the validator → 500 retry loop. Needs a convex-test once a harness exists.
- **Risk if ignored:** low in practice (Stripe currently sends the full subscription object on delete/pause/resume) but a silent revenue/entitlement leak if that ever changes.
- **Tags:** `#bug` `#billing` `#webhook`

### `_clearScheduleChange` uses unindexed `.filter` table scan + `.unique()`

- **Discovered:** 2026-05-28 (CodeRabbit-fix pass, local-review)
- **Where:** [apps/web/client/convex/lib/stripeWebhook.ts](apps/web/client/convex/lib/stripeWebhook.ts) — `_clearScheduleChange`, `.filter(q => q.eq(q.field('stripeSubscriptionScheduleId'), …)).unique()`
- **Symptom:** unlike every other lookup in the file (all `withIndex`), this scans the entire `subscriptions` table on each schedule release; `.unique()` throws if two rows ever share a schedule id. Violates the Convex "never `.filter`" guideline.
- **Root cause:** missing index; pre-existing (untouched by the dedup work).
- **Next step:** add `subscriptions.index('by_stripe_subscription_schedule_id', ['stripeSubscriptionScheduleId'])` and switch to `withIndex`; consider `.first()` over `.unique()` per the duplicate-row hazard already acknowledged in `_resolveCallerUserId`.
- **Risk if ignored:** full-table scan cost grows with subscription count; a duplicate schedule id crashes `releaseSubscriptionSchedule`.
- **Tags:** `#tech-debt` `#billing` `#performance`

### Confirm Railway `NEXT_PUBLIC_CONVEX_URL` = prod Convex (`rapid-crab-113`)

> **RESOLVED 2026-06-06** — Railway Source variables now confirm
> `NEXT_PUBLIC_CONVEX_URL=https://rapid-crab-113.convex.cloud` and
> `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_*`. The audit found two adjacent
> production config bugs instead: `CLERK_FRONTEND_API_URL` still pointed at the
> dev Clerk frontend (`full-redbird-32.clerk.accounts.dev`), and
> `CONVEX_DEPLOYMENT` still pointed at the dev deployment selector. Both were
> corrected in Railway production (`CLERK_FRONTEND_API_URL=https://clerk.weblab.build`,
> `CONVEX_DEPLOYMENT=prod:rapid-crab-113`) and a Source redeploy was triggered.

- **Discovered:** 2026-05-28 (prod Google-login crash investigation)
- **Where:** Railway web-client service build vars (Dockerfile ARG `NEXT_PUBLIC_CONVEX_URL`)
- **Symptom:** Could not verify which Convex deployment the live bundle targets — Railway login token expired (`railway login` needed) and the URL sits in a lazy-loaded JS chunk the sandbox probe couldn't reach.
- **Root cause:** n/a (verification gap). Diagnosis strongly implies prod points at `rapid-crab-113` (only an empty deployment produces *both* console errors, and dev `avid-gnat-539` is not empty), but it is unconfirmed.
- **Next step:** `railway login`, then read the web-client service var. Must equal `https://rapid-crab-113.convex.cloud`. If it's the dev URL (`avid-gnat-539`), that's a second bug — repoint it and redeploy. While there, sanity-check `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is the `pk_live_*` prod key.
- **Risk if ignored:** If prod actually points at dev Convex, login still fails after the prod deploy (prod Clerk token rejected by dev's issuer).
- **Tags:** `#infra` `#auth` `#convex`

### React error #418 (hydration) on /sign-in — confirm resolved post-fix

- **Discovered:** 2026-05-28 (prod Google-login crash investigation)
- **Where:** `apps/web/client/src/app/sign-in/**` (rendered with Clerk + Convex providers)
- **Symptom:** Console `Minified React error #418` (hydration text-content mismatch) on the sign-in page during the failed login.
- **Root cause:** Unverified. Most likely secondary — the thrown `users:me` Convex Server Error crashing mid-hydration — and should disappear now that prod Convex is deployed. Could also be an independent SSR/client mismatch.
- **Next step:** After confirming live login works, reload /sign-in and check the console. If #418 persists, run the dev build (non-minified React) to get the real component + reproduce.
- **Risk if ignored:** Possible flicker / hydration warning on the auth page; low user impact if the underlying query no longer throws.
- **Tags:** `#bug` `#auth` `#frontend`

### F-558 — `userActions.remove` deletes Clerk identity before cascade can fail; orphan PII on partial-fail

- **Discovered:** 2026-05-28 (validate-feature F-510..F-565 deep bug-hunt)
- **Where:** [apps/web/client/convex/userActions.ts:42-49](apps/web/client/convex/userActions.ts#L42)
- **Symptom:** Account-delete UI calls Clerk `deleteUser` first, then `internal.internal.cascade.deleteUserCascade`. If the cascade mutation throws (Convex read-limit, transient network, schema validator), the Clerk identity is already gone but every Convex `users` row + all FK'd PII (workspaceMembers, projectMembers, providerConnections, hostingProviderConnections, subscriptions, rateLimits, usageRecords, aiUsageEvents, cursors, skills, deployments, projectInvitations, userCanvases, projectOfflinePins, feedbacks) remains.
- **Root cause:** Deliberate "Clerk-first" ordering per the docstring at line 13-18 ("Delete the Clerk identity FIRST so a partial failure cannot leave a re-signinable orphan"). Trade-off prioritizes auth invariant (no re-sign-in into a half-deleted account) over PII completeness, but no retry / dead-letter queue catches the orphaned-Convex case.
- **Next step:** After `deleteClerkIdentity` succeeds, wrap `deleteUserCascade` in a retry loop (3 attempts with exponential backoff) and, on terminal failure, write a row to a new `pendingUserDeletions` table that a cron sweeps until cascade succeeds. Alternative: split cascade into smaller bounded mutations (per-table chunks) so no single mutation hits the 16k read limit on heavy users.
- **Risk if ignored:** GDPR exposure on any partial-failure delete; admin `/admin/usage` dashboard surfaces a "deleted user" row indefinitely; cascade re-run by hand requires a DB engineer.
- **Tags:** `#bug` `#privacy` `#convex` `#tech-debt`

### F-510 / F-563 — Convex `_generated/api.d.ts` is checked-in but stale (missing `layoutGuideStyles`)

- **Discovered:** 2026-05-28 (validate-feature F-510..F-565 deep bug-hunt)
- **Where:** [apps/web/client/convex/_generated/api.d.ts](apps/web/client/convex/_generated/api.d.ts), drift introduced by [apps/web/client/convex/layoutGuideStyles.ts](apps/web/client/convex/layoutGuideStyles.ts)
- **Symptom:** Running `bunx convex codegen` against the live deployment regenerates `_generated/api.d.ts` with two new lines re-exporting `layoutGuideStyles`. The committed copy on `main` is missing those lines, so any client code that does `api.layoutGuideStyles.list()` (or similar) will fail TypeScript compilation against the checked-in generated file until codegen is re-run.
- **Root cause:** Latent — no production consumer of `api.layoutGuideStyles.*` exists yet (verified by `grep`), so CI hasn't caught it. The first commit that adds a consumer will break TS until someone re-runs codegen.
- **Next step:** Run `bunx convex codegen` from `apps/web/client/`, then `git add apps/web/client/convex/_generated/api.d.ts && git commit -m "chore(convex): refresh _generated for layoutGuideStyles"`. Also add an `F-566` row to [docs/feature-catalog.md](docs/feature-catalog.md) section 25 (and matching `T-566` to [docs/test-plan.md](docs/test-plan.md)) per the Change Protocol — the module is on disk but not catalogued.
- **Risk if ignored:** First PR that imports `api.layoutGuideStyles` will fail CI; reviewer will have to ask "did you re-run codegen?" instead of the diff being clean.
- **Tags:** `#docs` `#dx` `#convex`

### F-335 — Aborted restart leaves the button spinner stuck forever

- **Resolved:** 2026-05-28 (backlog user-flow sweep) — verified fixed in code: [restart-sandbox-button.tsx:213-221](apps/web/client/src/app/project/[id]/_components/bottom-bar/restart-sandbox-button.tsx#L213) now resets `restarting` / `restartElapsedSec` / `restartGraceUntilRef` on the abort path before returning. Stale entry.
- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/app/project/\[id\]/_components/bottom-bar/restart-sandbox-button.tsx:214](apps/web/client/src/app/project/[id]/_components/bottom-bar/restart-sandbox-button.tsx#L214)
- **Symptom:** User clicks Restart Sandbox once → cancels (unmounts mid-restart or grace-window expires) → button stays in `restarting=true` spinner state, `restartElapsedSec` keeps the last value, `restartGraceUntilRef.current` keeps the future timestamp. The button is permanently disabled (`disabled={... || restarting}`) until the component remounts.
- **Root cause:** `if (abortController.signal.aborted) return;` exits early without calling `setRestarting(false)` / `setRestartElapsedSec(0)` / `restartGraceUntilRef.current = null`.
- **Next step:** mirror the cleanup block from the success path before the `return`.
- **Risk if ignored:** any abort path (route change during restart, sibling sandbox change, manual cancel) bricks the bottom-bar restart UI; user must reload the page.
- **Tags:** `#bug` `#editor` `#bottom-bar`

### F-313 ImgSelected toolbar variant is dead code — never dispatched

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/app/project/\[id\]/_components/editor-bar/index.tsx:23-57](apps/web/client/src/app/project/[id]/_components/editor-bar/index.tsx#L23) + [editor-bar/img-selected.tsx](apps/web/client/src/app/project/[id]/_components/editor-bar/img-selected.tsx)
- **Symptom:** Selecting an `<img>` element shows the generic `DivSelected` toolbar — the image-specific controls (`src`, `alt`, `fit`, `bg`) listed in catalog F-313 never render.
- **Root cause:** `TAG_TYPES[IMG]: []` is empty and `editor-bar/index.tsx` never imports `ImgSelected`. The `// TODO: Add img and video tag support` comment acknowledges the gap. `getSelectedTag` falls through to `TAG_CATEGORIES.DIV` for `<img>`.
- **Next step:** import `ImgSelected`, populate `TAG_TYPES[IMG] = ['img']`, branch `if (selectedTag === IMG) return <ImgSelected ... />` in `getTopBar()`. Update [docs/feature-catalog.md](docs/feature-catalog.md) row F-313 either to `#disabled` (with `TODO(img-toolbar)`) or to remove the deceptive "img quick-edit" claim until the dispatch lands.
- **Risk if ignored:** catalog lies; QA can't tell whether F-313 is shipped. Test row T-310 ("Select different element types → Correct variant renders") will fail when an `<img>` is selected.
- **Tags:** `#bug` `#editor` `#editor-bar` `#catalog-drift`

### F-361 — `forkBranch` / `createBlankSandbox` swallow errors to console, no user feedback

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/app/project/\[id\]/_components/branch/branch-controls.tsx:29-57](apps/web/client/src/app/project/[id]/_components/branch/branch-controls.tsx#L29)
- **Symptom:** Per catalog, F-361 is `#disabled` on Vercel Sandbox (`TODO(sandbox-fork)`). T-361 expects "clear error per `TODO(sandbox-fork)`". Reality: `forkBranch` and `createBlankSandbox` both `catch (error) { console.error(...); }`. The user sees the dropdown close + the spinner reset; no toast, no inline error, nothing.
- **Root cause:** Error handling is `console.error`-only. The `#disabled` contract isn't enforced at the UI surface.
- **Next step:** replace each `console.error` with `toast.error(...)` falling back to a fixed string when the upstream Convex error has no `message`. Use the existing `'Branch fork is not available on Vercel Sandbox yet.'` copy from the `TODO(sandbox-fork)` note.
- **Partial fix (2026-05-29):** `BranchManager.createBlankSandbox` now surfaces a `toast.error` with the structured `ConvexError` message as the description (see [branch/manager.ts](apps/web/client/src/components/store/editor/branch/manager.ts) + [convex/lib/sandboxErrors.ts](apps/web/client/convex/lib/sandboxErrors.ts)). `forkBranch` (the stub at `branch-controls.tsx`) is still `console.error`-only — this entry stays open for it.
- **Risk if ignored:** user thinks the button is dead; reports a "nothing happens" bug; T-361 keeps failing.
- **Tags:** `#bug` `#editor` `#branch` `#disabled-contract`

### F-333 — ErrorsConsole keys errors by `branchId + content` → duplicate keys

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/app/project/\[id\]/_components/bottom-bar/errors-console.tsx:205](apps/web/client/src/app/project/[id]/_components/bottom-bar/errors-console.tsx#L205)
- **Symptom:** Two identical error strings on the same branch (very common during HMR — `Module not found: 'foo'` repeated) → React warning "Each child in a list should have a unique key" + the second occurrence shares the first's reconciled state (CopyButton "Copied" tick bleeds across rows).
- **Root cause:** `key={\`${error.branchId}-${error.content}\`}` is not unique under repeat errors.
- **Next step:** add `error.id` to `ParsedError` upstream (uuid per parse) and key by that. As a quick fix: `key={\`${error.branchId}-${idx}-${hashOfContent}\`}` using `useId` or the index.
- **Risk if ignored:** subtle UI state leaks between rows; React warning fatigue masks future real warnings.
- **Tags:** `#bug` `#editor` `#bottom-bar`

### F-333 — `CopyButton` setTimeout not cleared on unmount

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/app/project/\[id\]/_components/bottom-bar/errors-console.tsx:66-72](apps/web/client/src/app/project/[id]/_components/bottom-bar/errors-console.tsx#L66)
- **Symptom:** Close the errors popover within 1.5s of clicking Copy → React fires `setCopied(false)` on an unmounted component → "Can't perform a React state update on an unmounted component" warning + held closure.
- **Next step:** store timeout id in a `useRef` and clear it in a cleanup effect; or migrate the copy-flash UX to a `useEffect` driven by `copied` state.
- **Tags:** `#bug` `#editor` `#bottom-bar`

### F-301 — `formatRelativeTime` returns `"NaNm ago"` on invalid date

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/app/project/\[id\]/_components/right-panel/comments-tab/index.tsx:14-25](apps/web/client/src/app/project/[id]/_components/right-panel/comments-tab/index.tsx#L14)
- **Symptom:** If `comment.createdAt` arrives as malformed string (Convex serialization edge case), `new Date(...).getTime()` is `NaN` → time label renders `"NaNm ago"`.
- **Root cause:** no `Number.isNaN(d.getTime())` guard, no future-date guard either (negative `diff`).
- **Next step:** `if (Number.isNaN(d.getTime())) return ''; if (diff < 0) return 'in the future';`. Better yet, swap to `Intl.RelativeTimeFormat`.
- **Risk if ignored:** broken time label across the comment list whenever the upstream serialization changes.
- **Tags:** `#bug` `#editor` `#comments`

### F-360 — Invite-member toast leaks raw Convex error message

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/app/project/\[id\]/_components/members/invite-member-input.tsx:35-37](apps/web/client/src/app/project/[id]/_components/members/invite-member-input.tsx#L35)
- **Symptom:** When `api.projectInvitationActions.create` throws, the raw `error.message` is shown in the toast description. Convex errors can include stack frames, table names, and request IDs.
- **Root cause:** `description: error instanceof Error ? error.message : String(error)` — verbatim pass-through.
- **Next step:** map known error codes (`USER_ALREADY_INVITED`, `INVALID_EMAIL`, `NO_INVITE_CAP`, …) to user-readable strings; only show raw `message` in `NODE_ENV !== 'production'`.
- **Risk if ignored:** internal API names + request IDs visible to end users on every error; unprofessional + small info leak.
- **Tags:** `#bug` `#editor` `#members` `#error-handling`

### F-360 — Invite-member email not normalized client-side (trim + lowercase)

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/app/project/\[id\]/_components/members/invite-member-input.tsx:27-32](apps/web/client/src/app/project/[id]/_components/members/invite-member-input.tsx#L27)
- **Symptom:** `"  Foo@Bar.COM  "` is sent verbatim → server-side dedupe may store it as a different invitation than `foo@bar.com` → pending-invites list shows both rows.
- **Next step:** `inviteeEmail: email.trim().toLowerCase()` before the mutation call. Verify server canonicalizes too.
- **Tags:** `#bug` `#editor` `#members`

### F-402 — NonProjectSettingsModal missing `'use client'`, ARIA, focus trap

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/components/ui/settings-modal/non-project.tsx:1, 104-167](apps/web/client/src/components/ui/settings-modal/non-project.tsx#L1)
- **Symptom (latent):** file uses `useEffect` / `addEventListener` / `observer` / `useStateManager` but doesn't start with `'use client'`. Today every caller is already a client component, so it works; the moment a server component tries to render `<NonProjectSettingsModal />` Next.js refuses. **Symptom (active):** modal has no `role="dialog"`, no `aria-modal`, no focus trap, no initial focus, no focus return — keyboard users tab into the page behind the modal, screen readers don't announce it as a dialog.
- **Next step:** (a) prepend `'use client';`. (b) replace hand-rolled `motion.div` shell with `Dialog` from `@weblab/ui/dialog` (Radix gives focus trap + ARIA + ESC + overlay click for free). Keep slide animation via Radix `forceMount` + existing motion variants.
- **Risk if ignored:** a11y bug (real users today) + latent build break (future regression).
- **Tags:** `#bug` `#editor` `#modal` `#a11y` `#settings`

### F-402 — Settings modal backdrop click closes mid-edit without confirmation

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/components/ui/settings-modal/non-project.tsx:100](apps/web/client/src/components/ui/settings-modal/non-project.tsx#L100)
- **Symptom:** Backdrop click handler dismisses the modal unconditionally. A user typing in an AI/GitHub/Editor tab loses unsaved input on a stray click.
- **Next step:** add `isDirty` state to `useStateManager` settings; gate close with a confirm dialog when any tab is dirty.
- **Tags:** `#bug` `#editor` `#modal` `#ux`

### F-318 — `useDropdownControl` effect omits `isOpen` from deps → stale closure race

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/app/project/\[id\]/_components/editor-bar/hooks/use-dropdown-manager.tsx:137-143](apps/web/client/src/app/project/[id]/_components/editor-bar/hooks/use-dropdown-manager.tsx#L137)
- **Symptom:** Two rapidly-opened dropdowns can leave one stuck open even though the manager thinks it's closed. The reproducer is racy and hard to catch in QA — most users will dismiss-and-retry rather than report.
- **Root cause:** `useEffect` compares `shouldBeOpen !== isOpen` but only depends on `[openDropdownId, id, isOverflow]`. Stale closure when `isOpen` changes via `handleOpenChange` without one of those deps changing.
- **Next step:** add `isOpen` to deps (acceptable — sync direction is openDropdownId → isOpen, not the reverse, so no loop) OR move `isOpen` into a ref read inside the effect.
- **Risk if ignored:** sporadic "the picker won't close" reports the team won't be able to reproduce.
- **Tags:** `#bug` `#editor` `#editor-bar` `#hook`

### F-300 — `activeBranch.id` accessed without null guard (Interactions tab)

- **Resolved:** 2026-05-28 (backlog user-flow sweep) — verified fixed: [list-view.tsx:96,107](apps/web/client/src/app/project/[id]/_components/right-panel/interactions-tab/list-view.tsx#L96) and [timeline-editor.tsx:60-64](apps/web/client/src/app/project/[id]/_components/right-panel/interactions-tab/timeline/timeline-editor.tsx#L60) now use `activeBranch?.id` + early return. Stale entry.
- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [list-view.tsx:96 + 106](apps/web/client/src/app/project/[id]/_components/right-panel/interactions-tab/list-view.tsx#L96) + [timeline-editor.tsx:60](apps/web/client/src/app/project/[id]/_components/right-panel/interactions-tab/timeline/timeline-editor.tsx#L60)
- **Symptom:** `const branchId = editorEngine.branches.activeBranch.id;` — during branch switch `activeBranch` is transiently `null` → TypeError uncaught.
- **Next step:** `const branchId = editorEngine.branches.activeBranch?.id; if (!branchId) return;` in all three sites.
- **Tags:** `#bug` `#editor` `#interactions`

### F-300 — Interactions tab couples to deprecated `style-tab-v2`

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [list-view.tsx:11](apps/web/client/src/app/project/[id]/_components/right-panel/interactions-tab/list-view.tsx#L11) and [timeline-editor.tsx:23](apps/web/client/src/app/project/[id]/_components/right-panel/interactions-tab/timeline/timeline-editor.tsx#L23) import from `../style-tab-v2/sections/*`.
- **Symptom:** Catalog row F-262 tags `style-tab-v2` as `#deprecated`. Whoever deletes it will silently break F-300.
- **Next step:** lift `Section` and `ElementHeaderSection` into a shared `right-panel/_shared/` directory; update both imports.
- **Tags:** `#tech-debt` `#editor` `#cross-feature-coupling`

### F-300..F-402 — Pervasive raw `<button>` + hardcoded English

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** (representative) [comments-tab/index.tsx:63-84, 99-133](apps/web/client/src/app/project/[id]/_components/right-panel/comments-tab/index.tsx#L63), [errors-console.tsx:76-90](apps/web/client/src/app/project/[id]/_components/bottom-bar/errors-console.tsx#L76), [restart-sandbox-button.tsx:254](apps/web/client/src/app/project/[id]/_components/bottom-bar/restart-sandbox-button.tsx#L254), [terminal-area.tsx:132, 160](apps/web/client/src/app/project/[id]/_components/bottom-bar/terminal-area.tsx#L132), [preview-theme-toggle.tsx:54](apps/web/client/src/app/project/[id]/_components/bottom-bar/preview-theme-toggle.tsx#L54), [timeline-editor.tsx:252](apps/web/client/src/app/project/[id]/_components/right-panel/interactions-tab/timeline/timeline-editor.tsx#L252)
- **Symptom:** Raw `<button>` elements with bespoke Tailwind utility classes (color, radius, height overrides) where canonical `<Button>` from `@weblab/ui/button` is required. Also hardcoded English strings throughout (e.g. `'Open'`, `'Resolved'`, `'Toggle Terminal'`, `'Sandbox restarted successfully'`, `'Forking...'`, `'Remove?'`, `'Settings'`).
- **Root cause:** CLAUDE.md button-enforcement + i18n rules not consistently applied during these features' build-out.
- **Next step:** sweep in one PR per feature: replace each raw `<button>` with the appropriate `<Button>` variant (add new variants to `@weblab/ui/button` rather than per-call className overrides), and lift every English string into `apps/web/client/messages/*` under `editor.panels.edit.tabs.*` keys.
- **Risk if ignored:** non-English locales render English; design-system audit will keep flagging the same files.
- **Tags:** `#tech-debt` `#design-system` `#i18n` `#button-enforcement`

### F-334 — Preview theme toggle `postMessage` uses wildcard targetOrigin

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/app/project/\[id\]/_components/bottom-bar/preview-theme-toggle.tsx:33](apps/web/client/src/app/project/[id]/_components/bottom-bar/preview-theme-toggle.tsx#L33)
- **Code:** `frame.contentWindow?.postMessage({ type: THEME_MESSAGE_TYPE, theme }, '*');`
- **Symptom:** Theme broadcast goes to every iframe regardless of origin. For sandboxed iframes that load arbitrary user code, `'*'` is the wrong default — anyone listening for `'weblab:preview-theme'` gets a free signal that they're embedded in Weblab.
- **Next step:** track the expected sandbox origin per frame; pass it as the second arg. Same-origin sandbox iframes can use `'/'` (same-origin only).
- **Tags:** `#bug` `#editor` `#security` `#defense-in-depth`

### F-332 — Terminal theme update doesn't `refresh()` xterm buffer

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/app/project/\[id\]/_components/bottom-bar/terminal.tsx:91-96](apps/web/client/src/app/project/[id]/_components/bottom-bar/terminal.tsx#L91)
- **Symptom:** Toggling app theme while a terminal has existing output keeps the old colors in the buffer; only new writes use the new theme.
- **Next step:** after `xterm.options.theme = …`, call `terminalSession.xterm.refresh(0, terminalSession.xterm.rows - 1)`.
- **Tags:** `#bug` `#editor` `#terminal`

### F-360 — MemberRow avatar `alt={initials}` is meaningless to screen readers

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/app/project/\[id\]/_components/members/member-row.tsx:68](apps/web/client/src/app/project/[id]/_components/members/member-row.tsx#L68)
- **Symptom:** `<AvatarImage src={user.avatarUrl} alt={initials} />` — screen readers announce `"V B"` instead of the actual member name.
- **Next step:** `alt={displayName}` OR `alt=""` (decorative, with name covered by sibling text).
- **Tags:** `#bug` `#editor` `#a11y` `#members`

### F-313 — Editor-bar `restart-sandbox-button.tsx` comment cites CodeSandbox

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Where:** [apps/web/client/src/app/project/\[id\]/_components/bottom-bar/restart-sandbox-button.tsx:14-17](apps/web/client/src/app/project/[id]/_components/bottom-bar/restart-sandbox-button.tsx#L14)
- **Symptom:** Comment says `"Real cold-boot times run 30–60s on CodeSandbox"`. CSB was archived 2026-05-24 (CLAUDE.md). Misleads future readers — Vercel Sandbox cold boots are typically 5–15s; the 60s ceiling is over-provisioned.
- **Next step:** rewrite the comment for Vercel Sandbox; consider reducing the ceiling to 30s with a separate slow-path warning toast.
- **Tags:** `#docs` `#brand-leak` `#editor`

### F-134 — invalid Convex ID on settings/access shows generic boundary error (not invalid-id)

- **Discovered:** 2026-05-28 (bug-hunt F-120..F-135)
- **Severity:** LOW (downgraded 2026-05-28 after tracing — **not a hard crash / white-screen**).
- **Where:** [apps/web/client/src/app/project/[id]/settings/access/page.tsx:35](apps/web/client/src/app/project/[id]/settings/access/page.tsx#L35)
- **Symptom:** `const projectId = params.id as Id<'projects'>;` is an unchecked cast. A non-Convex id (e.g. `/project/abc/settings/access`) makes the client `useQuery` throw `ArgumentValidationError`. **This is caught by the parent `/project/[id]/error.tsx` boundary**, which renders "We couldn't open this project" + a "Back to projects" escape. So the user is not stranded — they just get a generic message rather than the dedicated "Invalid project ID" copy.
- **Why not fixed this pass:** the natural fix (validate id shape before the hook) is risky — Convex exposes no client-side `Id` validator, and a hand-rolled regex (`length === 32`, charset) would risk rejecting **valid** ids if Convex's id format ever changes, which is strictly worse than the current graceful fallback. The server-component F-131 fix could be reused only if settings/access were converted to fetch server-side first.
- **Next step (low priority):** when the F-131 `classifyProjectLoadError` helper is mature, give settings/access its own segment `error.tsx` that runs the same classifier on `error.message` and renders `ProjectLoadError variant="invalid-id"` for validator errors. Pure additive, no fragile up-front regex.
- **Risk if ignored:** a typo'd settings deep-link shows "couldn't open this project" instead of "invalid link". Minor copy mismatch; user always has an escape button.
- **Tags:** `#ux` `#auth-gated` `#convex` `#low`

### F-125 — `<iframe>` template preview missing `sandbox` attribute

- **Discovered:** 2026-05-28 (bug-hunt F-120..F-135)
- **Where:** [apps/web/client/src/app/projects/templates/[id]/page.tsx:159-165](apps/web/client/src/app/projects/templates/[id]/page.tsx#L159-L165)
- **Symptom:** `<iframe src={template.previewUrl} …>` has no `sandbox` attribute. `previewUrl` is currently static template data (low risk today), but loading any third-party URL into an iframe without `sandbox` gives that page full access to the parent origin via the `window.top` handle once anti-clickjacking headers permit.
- **Next step:** add `sandbox="allow-scripts allow-same-origin allow-forms"` (or stricter — most marketing pages only need `allow-scripts`). Verify the live previews still render. If a specific template needs an exception, add a per-template opt-out rather than removing the attribute.
- **Risk if ignored:** if `previewUrl` ever becomes user-controlled (e.g. user-submitted templates), this is a stored-XSS / clickjacking vector. Even with static data, an upstream demo host serving malicious JS can pivot through the frame.
- **Tags:** `#security` `#defense-in-depth` `#auth-gated`

### F-120..F-135 import/create surface dead-ends at sandbox provisioning (Figma, Local, Templates, Prompt)

- **Discovered:** 2026-05-28 (bug-hunt F-120..F-135). **Corrected scope** from the
  original "Figma card despite #disabled" framing — the dead-end is **not
  Figma-specific**.
- **Where:** every create/import path that needs a sandbox:
  [import/figma/_context/index.tsx:89](apps/web/client/src/app/projects/import/figma/_context/index.tsx#L89) (`forkSandbox` throws),
  [import/local/_context/index.tsx:146](apps/web/client/src/app/projects/import/local/_context/index.tsx#L146) (`forkSandbox` throws),
  [components/store/create/manager.ts](apps/web/client/src/components/store/create/manager.ts) (`startCreate` / `startPublicGitHubTemplate` throw `UNAVAILABLE_MESSAGE`).
- **Symptom:** the import hub shows three equal cards (local / GitHub / Figma). All of
  them — plus prompt-create and template-create — walk the user through a real-looking
  wizard and then throw at the **finalize / provisioning** step. Figma's PAT path is
  genuinely intended to work (only the OAuth *callback* is `#disabled` per
  [callback/figma/page.tsx](apps/web/client/src/app/callback/figma/page.tsx)); the
  wizard stubs out at `forkSandbox`, identical to local import.
- **Root cause:** this is the tracked `TODO(sandbox-port)` — the legacy `api.sandbox.*`
  tRPC routes have no Convex equivalents yet — compounded by the **Vercel 402 blocker**
  (see that backlog entry). Gating one card (Figma) would be inconsistent and mask the
  real, broader gap.
- **Next step:** do NOT band-aid individual cards. Land the sandbox-port (or the
  snapshot-resume fast path via `VERCEL_BLANK_SNAPSHOT_ID`) so all paths provision, OR —
  if create stays disabled for a release — gate **all** sandbox-dependent entry points
  behind one flag and show a single consistent "create is temporarily unavailable" state
  (the prompt hero already does this via `UNAVAILABLE_MESSAGE`). Track under the existing
  sandbox-port / Vercel-402 entries.
- **Risk if ignored:** users complete a multi-step wizard (local folder pick / Figma frame
  select / template choose) and get an opaque error at the last step — wasted intent across
  every create surface, not just Figma.
- **Tags:** `#bug` `#ux` `#auth-gated` `#sandbox` `#tracked`

### F-134 — no client-side email validation before invite send

- **Discovered:** 2026-05-28 (bug-hunt F-120..F-135)
- **Where:** [apps/web/client/src/app/project/[id]/settings/access/page.tsx:184-190](apps/web/client/src/app/project/[id]/settings/access/page.tsx#L184-L190)
- **Symptom:** `disabled={!inviteEmail.trim() || isCreatingInvite}` only blocks an empty string. Strings like `"not an email"` reach `createInviteAction`, which then surfaces whatever server-side validation Convex returns (currently undefined behavior).
- **Next step:** validate with a cheap regex (`/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) or `zod.string().email().safeParse()` before enabling the button. Mirror the validation Convex applies on `projectInvitations.create` so the user sees one consistent message.
- **Risk if ignored:** noisy "Failed to send invite" toasts with no actionable detail. Possible cost on transactional email provider if invalid addresses get retried.
- **Tags:** `#bug` `#ux` `#auth-gated`

### ESLint config — `react-hooks/exhaustive-deps` rule unregistered at inline disable sites

- **Discovered:** 2026-05-28 (bug-hunt F-120..F-135)
- **Where:** repo-wide. Confirmed sites: [apps/web/client/src/app/projects/import/local/_components/verify-project.tsx:36](apps/web/client/src/app/projects/import/local/_components/verify-project.tsx#L36), [apps/web/client/src/app/projects/_components/select/use-screenshot-backfill.ts:127](apps/web/client/src/app/projects/_components/select/use-screenshot-backfill.ts#L127).
- **Symptom:** `bunx eslint <file>` reports `warning: Definition for rule 'react-hooks/exhaustive-deps' was not found  react-hooks/exhaustive-deps` on every `// eslint-disable-next-line react-hooks/exhaustive-deps` comment. The rule is registered in [tooling/eslint/react.js](tooling/eslint/react.js) and the flat config in [apps/web/client/eslint.config.js](apps/web/client/eslint.config.js) spreads `reactConfig`, so the rule should be loaded. The fact that ESLint reports the disable directive as referencing an unknown rule means a later flat-config layer is shadowing the plugin map for the file.
- **Next step:** add an explicit `plugins: { 'react-hooks': hooksPlugin }` to whichever layer in `apps/web/client/eslint.config.js` is shadowing it (likely the storybook layer added last). Verify by re-running `bunx eslint` on the two files above — the "Definition for rule … was not found" should disappear. While there, audit `@next/next/no-img-element` — same symptom across `projects/_components/select/*.tsx` (multiple sites).
- **Risk if ignored:** every inline `eslint-disable-next-line react-hooks/exhaustive-deps` is currently a no-op. If the rule were to actually fire, several real dep-array bugs may be hiding behind suppressions that don't suppress.
- **Tags:** `#infra` `#lint` `#tech-debt`

### F-128 — GitHub setup.tsx still relies on `any`-typed responses on multiple paths

- **Discovered:** 2026-05-28 (bug-hunt F-120..F-135)
- **Where:** [apps/web/client/src/app/projects/import/github/_components/setup.tsx](apps/web/client/src/app/projects/import/github/_components/setup.tsx) lines 40, 51, 67-73
- **Symptom:** `(org: any)`, `(repo: any)`, and `.includes(...)` chains on optional GitHub API fields. The `filteredRepositories` filter was hardened this session (`?.` on `owner` / `name` / `full_name`), but the surrounding handlers (`handleOrganizationSelect`, `handleRepositorySelect`) still rely on the same untyped shape, and downstream sorting/display will throw if the shape drifts.
- **Next step:** import the typed shape from the GitHub OAuth client (`@octokit/rest` or whatever the connector uses), replace `any` with `RestEndpointMethodTypes["repos"]["listForAuthenticatedUser"]["response"]["data"][number]`, drop the unsafe member-access warnings, and add a runtime fall-back for repos with `owner: null`.
- **Risk if ignored:** silent regressions when GitHub adds / nulls a field; archived & transferred repos are most likely to surface this.
- **Tags:** `#bug` `#tech-debt` `#integration`

### CreateManager mutates `this.error` outside `runInAction`

- **Discovered:** 2026-05-28 (bug-hunt F-120..F-135)
- **Where:** [apps/web/client/src/components/store/create/manager.ts:122,143,205](apps/web/client/src/components/store/create/manager.ts#L122)
- **Symptom:** `this.error = null` runs in async function body before the explicit `runInAction(...)` block. Only a problem if MobX strict mode is enabled — current setup is not strict, but auto-binding via `makeAutoObservable` does enforce strict-mode rules in some MobX builds.
- **Next step:** wrap each pre-check assignment in `runInAction(() => { this.error = null; })` for consistency with the rest of the file. Cheap, no behavior change.
- **Risk if ignored:** if MobX is ever configured with `enforceActions: 'always'`, every entry point starts crashing on the first line.
- **Tags:** `#tech-debt`

### F-453 — `PostHogProvider` static import defeats consent-gated dynamic-import claim

- **Discovered:** 2026-05-28 (validate-feature F-450..F-453 deeper pass)
- **Where:** [apps/web/client/src/components/telemetry-provider.tsx:9](apps/web/client/src/components/telemetry-provider.tsx#L9)
- **Symptom:** Cold load of `/pricing` (anonymous, no `weblab.consent` cookie) fetches `_next/static/chunks/node_modules_posthog-js_*.js` regardless. The file's own comment claims "Dynamic import for posthog-js keeps the SDK out of the critical-path bundle on landing/login/dashboard until cookie consent fires" — partially false because `import { PostHogProvider as PHProvider } from 'posthog-js/react'` is static.
- **Next step:** `const PHProvider = lazy(() => import('posthog-js/react').then(m => ({ default: m.PostHogProvider })))`, wrap the provider return in `<Suspense fallback={children}>`. Verify chunk does NOT appear in `_next/static/chunks` on anon `/pricing`.
- **Risk if ignored:** ~50KB posthog-js shipped on every landing/login/marketing surface for visitors who never consent. Privacy and performance regression.
- **Tags:** `#tech-debt` `#perf` `#privacy` `#telemetry`

### ~~F-453 — Cookie consent read only at mount; no runtime re-init~~ FALSE ALARM (resolved 2026-05-28)

- **Resolved:** `apps/web/client/src/app/_components/cookie-consent.tsx:52-56` calls `window.location.reload()` inside `onAccept`. The next mount runs the init effect with the consent cookie present, so SDKs DO initialize on accept. No code change needed.

### ~~F-451 — Pricing table CTA flickers for signed-in users while query loads~~ FIXED (2026-05-28)

- **Resolved:** `pricing-table/index.tsx` now distinguishes `authResolving` (null cookie OR loading user) from `isUnauthenticated`. Passes `isAuthLoading` prop to FreeCard + ProCard. CTAs render a disabled loading spinner while auth is resolving so the signed-in visitor cannot accidentally trigger the auth modal during the flicker window.

### F-452 — Avatar dropdown Convex queries fire unconditionally

- **Discovered:** 2026-05-28 (validate-feature F-450..F-453 deeper pass)
- **Where:** [apps/web/client/src/components/ui/avatar-dropdown/index.tsx:53](apps/web/client/src/components/ui/avatar-dropdown/index.tsx#L53), [apps/web/client/src/components/ui/avatar-dropdown/plans.tsx:19-20](apps/web/client/src/components/ui/avatar-dropdown/plans.tsx#L19-L20)
- **Symptom:** `useQuery(api.users.me, {})`, `useQuery(api.subscriptions.get, {})`, `useQuery(api.usage.get, {})` all run unconditionally. Parent routes currently gate the avatar render behind `isSignedIn`, so this is safe today — but the components carry no defensive auth-cookie gate of their own. Any future surface that mounts them in an unauthenticated context (Storybook, design-system page, marketing) flooded with 401s.
- **Next step:** mirror the `useHasAuthCookie() === true ? {} : 'skip'` pattern from `use-subscription.tsx` and `telemetry-provider.tsx`.
- **Risk if ignored:** defensive layer missing; first leak surfaces as a console flood when someone embeds the avatar somewhere new.
- **Tags:** `#tech-debt` `#auth-gated`

### ~~F-450 — Legacy promotion clipboard handler shows false success~~ FIXED (2026-05-28)

- **Resolved:** Handler is now async with try/catch on `navigator.clipboard.writeText`. On reject, falls back to a programmatic `document.execCommand('copy')` via a hidden textarea. Toast reflects real outcome — `toast.success('Copied to clipboard')` only on confirmed write, `toast.error('Could not copy code')` with a "select and copy manually" hint if both paths fail. Promo code revenue path no longer at risk.

### F-450 — `legacy-promotion.tsx` imports from `framer-motion` while siblings use `motion/react`

- **Discovered:** 2026-05-28 (validate-feature F-450..F-453 deeper pass)
- **Where:** [apps/web/client/src/components/ui/pricing-modal/legacy-promotion.tsx:6](apps/web/client/src/components/ui/pricing-modal/legacy-promotion.tsx#L6)
- **Symptom:** This file imports `motion`, `AnimatePresence` from `framer-motion`. Every other file in the pricing UI (`index.tsx`, `free-card.tsx`, `pro-card.tsx`, `enterprise-card.tsx`) imports from `motion/react`. Both libs ship to the bundle for one feature.
- **Next step:** replace `from 'framer-motion'` with `from 'motion/react'` in legacy-promotion.tsx. Confirm `bun build` removes the `framer-motion` chunk if no other importer remains.
- **Risk if ignored:** wasted bundle size; future drift as one lib's API evolves and the other stagnates.
- **Tags:** `#tech-debt` `#perf`

### F-453 — React-DOM dev warning on cold pricing load (source unknown)

- **Discovered:** 2026-05-28 (validate-feature F-450..F-453 deeper pass)
- **Where:** unknown — fires 8× on cold `/pricing` anon load. Warning text is React-DOM's "Can't perform a React state update on a component that hasn't mounted yet." Not present in any of the four F-450..F-453 files.
- **Symptom:** Dev console pollution. No user-visible effect, but indicates a render-time `setState` side-effect in a sibling provider (motion, radix, clerk, or telemetry-provider's own dynamic-import closures racing strict-mode remount).
- **Next step:** add `Error.captureStackTrace` shim in dev to surface the offending component, or bisect by progressively unmounting providers in `layout.tsx`.
- **Risk if ignored:** real race condition may produce stale state in prod under load. Currently masked because the warning is dev-only.
- **Tags:** `#bug` `#react`

### F-437 — Uploaded favicon / OG image path uses raw `file.name`

- **Discovered:** 2026-05-28 (validate-feature F-420..F-439 deeper pass)
- **Where:** [apps/web/client/src/components/ui/settings-modal/site/index.tsx:88,101](apps/web/client/src/components/ui/settings-modal/site/index.tsx#L88-L101)
- **Symptom:** `faviconPath = \`/${uploadedFavicon.name}\`` and the OG path are built from the raw `File.name`. If the user picks a file with spaces, unicode, parens, or path-separator characters in the name, the metadata URL ends up un-encoded and may fail to resolve in production (or, with crafted names like `../foo.png`, produce odd URLs).
- **Next step:** sanitize the filename before constructing the URL — e.g. `encodeURIComponent(stripDirectorySegments(file.name))` — or read the canonical path returned by `editorEngine.image.upload(...)` instead of reconstructing it on the client.
- **Risk if ignored:** broken favicon / OG image after upload for any user whose filename isn't `[a-z0-9.-]`.
- **Tags:** `#bug` `#editor` `#cms`

### F-360 — `projectInvitations.accept` does not trim whitespace before email lookup

- **Resolved:** 2026-05-28 (backlog user-flow sweep) — `isEmailMatch` now trims both sides ([projectInvitations.ts:14-15](apps/web/client/convex/projectInvitations.ts#L14)) so the accept-path comparison is whitespace-insensitive (fixes legacy rows too); `create` now canonicalizes with `.trim().toLowerCase()` and the legacy fallback uses the trimmed value, so new rows can't store stray whitespace.
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

### F-471 — `toolCallCount` over-counts `tool-input-start` and other trigger events

- **Discovered:** 2026-05-28 (deeper bug-hunt pass on F-470..F-479)
- **Where:** [apps/web/client/src/app/api/chat/route.ts:524-526](apps/web/client/src/app/api/chat/route.ts#L524)
- **Symptom:** `(responseMessage?.parts ?? []).filter((p) => p.type?.startsWith('tool-')).length` counts every `tool-*` part — including `tool-input-start`, `tool-input-delta`, `tool-input-available`, etc. — as a "tool call" recorded in `aiUsageEvents.toolCallCount`.
- **Root cause:** AI SDK stream parts are a discriminated union; only `tool-call` / `tool-result` represent semantic invocations. The substring filter is too permissive.
- **Next step:** narrow to the actual call/result variants, or count distinct `toolCallId`s.
- **Risk if ignored:** inflated tool-call metrics in usage dashboards; cost-attribution per turn skewed; no user-facing impact.
- **Tags:** `#bug` `#telemetry`

### F-473 — `chat-images/[id]` double-allocates the response buffer

- **Discovered:** 2026-05-28 (deeper bug-hunt pass on F-470..F-479)
- **Where:** [apps/web/client/src/app/api/chat-images/[id]/route.ts:31-32](apps/web/client/src/app/api/chat-images/[id]/route.ts#L31)
- **Symptom:** `Buffer.from(entry.b64, 'base64')` decodes into a Buffer, then `new Uint8Array(buffer)` copies that into a fresh Uint8Array — two allocations of the same payload, doubling peak memory for large images.
- **Next step:** `return new Response(buffer, ...)` (Node 18+ undici accepts `Buffer` directly), or `Buffer.from(entry.b64, 'base64').buffer` to hand off the underlying `ArrayBuffer`.
- **Risk if ignored:** memory churn at scale; harmless functionally.
- **Tags:** `#perf`

### F-474 — `X-Trace-Id` exposed to client on `inline-edit`

- **Discovered:** 2026-05-28 (deeper bug-hunt pass on F-470..F-479)
- **Where:** [apps/web/client/src/app/api/ai/inline-edit/route.ts:253-256](apps/web/client/src/app/api/ai/inline-edit/route.ts#L253)
- **Symptom:** Server-generated `traceId` is returned in the response headers. Trace IDs are tied to Langfuse spans + usage events and are not strictly secret, but exposing them to the client lets anyone correlate their session with internal observability data and (combined with another bug) potentially poison telemetry across users.
- **Next step:** decide policy — either drop the header in production, or keep it only when an opted-in dev/debug header is present on the request.
- **Risk if ignored:** low — observability surface only. Worth a policy call.
- **Tags:** `#security` `#observability`

### F-471 — `USAGE_LIMIT_REACHED` is detected via substring match

- **Discovered:** 2026-05-28 (deeper bug-hunt pass on F-470..F-479)
- **Where:** [apps/web/client/src/app/api/chat/helpers/usage.ts:92](apps/web/client/src/app/api/chat/helpers/usage.ts#L92)
- **Symptom:** `error.message.includes('USAGE_LIMIT_REACHED')` is how the route discovers that Convex hit the cap. If Convex wraps the error differently in a future runtime (already does in different layers), the substring miss flips the code to the "transient error, don't penalize the user" branch — silently granting free LLM responses to everyone over quota.
- **Next step:** throw a typed `ConvexError` from `usage.increment` and `instanceof` check it, OR pin the message format with an explicit reserved prefix and an integration test that boots Convex and asserts the message shape.
- **Risk if ignored:** future Convex upgrade silently disables the quota cap.
- **Tags:** `#bug` `#billing` `#convex` `#brittle`

### F-472 — Summarize refunds the user credit even when the LLM was actually called

- **Discovered:** 2026-05-28 (deeper bug-hunt pass on F-470..F-479)
- **Where:** [apps/web/client/src/app/api/chat/summarize/route.ts:162-164](apps/web/client/src/app/api/chat/summarize/route.ts#L162)
- **Symptom:** `summarizeConversation()` runs the LLM (cost incurred at OpenRouter). If it returns `null` (e.g. truncation produced no usable summary), `refundOnce()` reverts the user's quota deduction. The user pays nothing, but Weblab still pays OpenRouter.
- **Root cause:** the refund path treats "no result" as "no work done"; in reality it means "work done, result discarded".
- **Next step:** distinguish "no summary produced" (refund) from "summary attempted but LLM returned empty / parse failed" (keep deduction; log + metric). Or accept the asymmetry and document it as a policy choice.
- **Risk if ignored:** small cost leak proportional to summarizer flakiness.
- **Tags:** `#bug` `#billing` `#design-question`

### F-479 — Invalid date strings in `banner.startsAt` / `banner.endsAt` fail open

- **Discovered:** 2026-05-28 (deeper bug-hunt pass on F-470..F-479)
- **Where:** [apps/web/client/src/app/api/promo-resume/route.ts:37-42](apps/web/client/src/app/api/promo-resume/route.ts#L37)
- **Symptom:** `new Date('not-a-date')` returns `Invalid Date`. `Invalid Date > now` and `Invalid Date < now` both evaluate `false` (NaN comparison), so a banner whose `startsAt` or `endsAt` is a malformed string is treated as currently active. A bad commit to `promo-banners.ts` could re-enable an expired promo without anyone noticing.
- **Next step:** validate `startsAt` / `endsAt` at the `PromoBanner` schema layer (zod / TS guard), and bail out (fallback redirect) on `Number.isNaN(date.getTime())` here.
- **Risk if ignored:** stale promo banners silently extend; low blast radius today.
- **Tags:** `#bug` `#billing` `#defensive`

### F-471 / F-474 — `code` field on 501 response is a string while the rest of the API uses numbers

- **Discovered:** 2026-05-28 (deeper bug-hunt pass on F-470..F-479)
- **Re-checked:** 2026-05-28 (user-stopping-bug fix pass) — **not user-stopping after all.**
- **Where:** [apps/web/client/src/app/api/chat/route.ts:306](apps/web/client/src/app/api/chat/route.ts#L306), [apps/web/client/src/app/api/ai/inline-edit/route.ts:182](apps/web/client/src/app/api/ai/inline-edit/route.ts#L182), [apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-messages/error-message.tsx:27](apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-messages/error-message.tsx#L27)
- **Reality:** the client `error-message.tsx` falls through any non-402 case to `errorMessage = parsed.error || chatError.toString();`, so the helpful "Provider X routing is not yet implemented on hosted web. Use the desktop app for CLI providers." text DOES render correctly. The mismatch is API consistency hygiene, not a broken user flow.
- **Next step (low priority):** still worth standardizing the field shape (`code: number`, optional `errorCode: string`) so the client can branch deliberately rather than rely on fall-through.
- **Risk if ignored:** none today; brittle if the client component grows additional branches.
- **Tags:** `#tech-debt` `#api-consistency`

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

### ~~F-472 — Background summarizer charges credit every time client fires~~ FIXED (2026-05-28)

- **Discovered:** 2026-05-28 (validate-feature F-470..F-479 run)
- **Resolved:** 2026-05-28 (user-stopping-bug fix pass)
- **Where:** [apps/web/client/src/app/api/chat/summarize/route.ts](apps/web/client/src/app/api/chat/summarize/route.ts)
- **Fix:** Added two cheap server-side gates in front of the LLM call:
  1. Same-tip skip — read `conversations.getSummary` and 204 immediately if `upToMessageId` already matches the last incoming message id.
  2. Per-process cooldown — `Map<conversationId, number>` with 60s minimum interval; redundant fires within the window 204 without charging the user.
- **Caveat:** the cooldown is in-process; multi-replica deployments could still fire once per replica per cooldown window. That is acceptable today and far below the unbounded burst the buggy/malicious client could previously generate.

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

### ~~F-471 — Chat path: `aiUsageEvents.insert` + `replaceConversationMessages` awaited inside `onFinish` with no timeout~~ FIXED (2026-05-28)

- **Discovered:** 2026-05-28 (validate-feature F-470..F-479 run)
- **Resolved:** 2026-05-28 (user-stopping-bug fix pass)
- **Where:** [apps/web/client/src/app/api/chat/route.ts](apps/web/client/src/app/api/chat/route.ts)
- **Fix:** Added `runWithTimeout()` helper (8s) wrapping both `fetchMutation(api.messages.replaceConversationMessages, …)` and `built.finalizeUsage(…)` inside `onFinish`. On timeout the helper resolves `undefined` and logs `[chat] <label> exceeded …ms; closing stream and continuing best-effort` so the response can close even when Convex stalls. Persistence becomes best-effort under degraded backend conditions, which is the right tradeoff: users no longer see a finished bubble that "never completes."

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

- **Resolved:** 2026-05-28 (backlog user-flow sweep) — the one genuinely-unguarded write, [terminal-area.tsx:82](apps/web/client/src/app/project/[id]/_components/bottom-bar/terminal-area.tsx#L82), now guards `sandbox?.session` before assigning. The `terminal-area.tsx:55` access is inside a try/catch (`continue` on throw — safe), and `restart-sandbox-button.tsx:177` `activeBranch.sandbox.id` is type-safe (`Branch.sandbox` is non-optional in [branch.ts:39](packages/models/src/project/branch.ts#L39)), so neither can crash the editor.
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

### GitHub connect — Convex env required per deployment + single Setup-URL caveat

- **Discovered:** 2026-05-29 (debugging "Failed to generate GitHub installation URL").
- **Root cause (fixed):** `githubActions.*` run in the Convex Node runtime and read `GITHUB_APP_ID`/`GITHUB_APP_SLUG`/`GITHUB_APP_PRIVATE_KEY`/`GITHUB_INSTALL_STATE_SECRET` from the **Convex** env store (separate from Next.js `.env.local`). Both deployments were missing all four → `generateInstallationUrlAction` threw. Set on dev `avid-gnat-539` and prod `rapid-crab-113` via [scripts/set-convex-github-env.mjs](apps/web/client/scripts/set-convex-github-env.mjs).
- **Open caveat:** the single GitHub App (id `3588674`) has one post-install Setup URL. It can only point at one host, so the install callback (`/callback/github/install` → `handleInstallationCallbackUrl`) lands on one deployment. **Local-dev connect won't complete** unless the Setup URL targets localhost; prod (weblab.build) is the supported target. A separate dev GitHub App would be needed for local end-to-end testing.
- **Next step:** confirm the GitHub App Setup URL = `https://weblab.build/callback/github/install`; optionally register a second dev App for localhost. New deployments must run the provisioner (or set the 4 env vars) before GitHub connect works.
- **Tags:** `#integration` `#config` `#convex`

### F-491 — `checkout` allows multiple active subscriptions per user; downstream `.unique()` queries crash billing portal

- **Resolved:** 2026-05-28 (backlog user-flow sweep) — both halves landed: (1) `checkout` now calls `_findActiveSubscriptionForCaller` first and throws `ALREADY_SUBSCRIBED` ([subscriptionActions.ts:73-79](apps/web/client/convex/subscriptionActions.ts#L73)), preventing new duplicates; (2) defense-in-depth — `_findActiveSubscriptionForCaller` + `_findActiveProSubscriptionForPromo` now use `.take(2)` + pick-first + `console.warn` instead of `.unique()`, so a pre-existing duplicate no longer throws and locks the user out of the billing portal / promo.
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

- **Resolved:** 2026-05-28 (backlog user-flow sweep) — verified fixed: the `release` call is now wrapped in try/catch that swallows `invalid_request_error` ([subscriptionActions.ts:183-194](apps/web/client/convex/subscriptionActions.ts#L183)), mirroring `releaseSubscriptionSchedule`, so an already-released schedule no longer aborts the plan change. Stale entry.
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

- **Resolved:** 2026-05-28 (CodeRabbit-fix pass) — added a `stripeEventLog`
  table (`by_event_id`) and an `alreadyProcessed()` guard at the top of every
  `_handleSub*` mutation; `event.id` is threaded through `http.ts`. Dedup is
  transactional (log insert + handler work in one mutation), so a failed
  handler rolls back the log row and Stripe still retries genuine failures;
  Convex OCC closes the concurrent-duplicate race. Table kept bounded by a
  daily `purgeStaleStripeEvents` cron (7-day TTL, Stripe retries ≤3 days).
  Note: the live risk was lower than stated below — existing state-guards
  (priceId/periodEnd patches) plus OCC already prevented most duplicates in the
  Convex runtime; this makes idempotency explicit and future-proof.
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

### ~~F-131 — invalid project ID maps to "unknown" variant instead of "invalid-id"~~ FIXED (2026-05-28)

- **Resolution:** Extracted the catch-block classification into a pure
  `classifyProjectLoadError(message)` helper
  ([apps/web/client/src/app/project/[id]/_adapters/classify-load-error.ts](apps/web/client/src/app/project/[id]/_adapters/classify-load-error.ts))
  that checks `does not match validator` / `argumentvalidationerror` **first**,
  returning the existing `invalid-id` variant. `page.tsx` now short-circuits
  to `<ProjectLoadError variant="invalid-id" />` for malformed ids and skips
  the pointless offline-cache lookup. Verified by
  `classify-load-error.test.ts` (12 cases incl. invalid-id precedence over a
  co-occurring "not found" substring). Was: malformed id → `unknown` variant
  leaked the raw validator string in a `<pre>`.

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

### Figma import — finalize step needs sandbox wiring (was gated "Coming soon")

- **Discovered:** 2026-06-13 (round-4 broken-feature sweep)
- **Resolved:** 2026-06-13 (local validation; typecheck + lint + figma unit tests green)
- **Where:** new server action `createFromFigma` in [convex/projectActions.ts](apps/web/client/convex/projectActions.ts); shared builder `scaffoldFigmaProjectFiles` in [packages/figma/src/scaffold.ts](packages/figma/src/scaffold.ts); rewired [import/figma/_context/index.tsx](apps/web/client/src/app/projects/import/figma/_context/index.tsx); re-enabled card in [import/page.tsx](apps/web/client/src/app/projects/import/page.tsx).
- **Root cause:** finalize hit three throw-stubs (`forkSandbox`/`startOrphanSandbox`/`orphanBulkUpload`). The deferred note suggested copying the local-import template (`createEmptySandbox` + client upload), but that's a **bare** sandbox — Figma scaffolding emits only `src/app/page.tsx` + `src/components/*.tsx` with no package.json/Next.js/deps, so a bare sandbox has nothing to install or serve.
- **Fix:** server-side `createFromFigma` mirrors `createFromWebsiteClone` — provisions a real Next.js sandbox (snapshot fast-path), overlays the Figma-generated TSX via `sandbox.writeFiles`, inserts the full project graph, returns `{ projectId }`. Client now calls this single atomic action. Imported frames render as editable Next.js components.
- **Follow-up:** higher-fidelity output tracked in the Open "Figma import is low-fidelity" entry.

### Style-panel property edits corrupt source + balloon RAM (exponential selection growth + unsynchronized writes)

- **Discovered:** 2026-06-08 (user report: editing width up/down with shift → errors + 3× RAM)
- **Resolved:** 2026-06-09 (local validation; not yet deployed)
- **Where:** `apps/web/client/src/components/store/editor/{action,element,code,interactions,history}/`; `packages/file-system/src/code-fs.ts`; `apps/web/client/src/app/project/[id]/_components/editor-bar/`
- **Root cause:** `ActionManager.updateStyle` re-selected the responsive sibling-frame fan-out and `ElementsManager.click()` never deduped, so the selection grew 1→3→9→27→81 per keystroke (the captured 81-target batch = 3⁴). That storm of edits drove unsynchronized concurrent source writes (immediate write + debounced responsive write + sync watcher) into a read-modify-write race that corrupted `page.tsx` → `No ast found` → Penpal `destroyed connection` cascade. Duplicate React keys, the MobX `_loaded` strict-mode warning, and the empty `Failed to persist history` were collateral.
- **Fix:** (1) `click()` dedupes selection by `frameId:domId`; (2) `updateStyle` re-selects only the originally-selected nodes (fan-out still writes everywhere); (3) `CodeManager.writeRequest` serializes editor writes via a promise chain; (4) `CodeFileSystem` serializes `writeFile`/`deleteFile`/`moveFile`/`rebuildIndex` via an instance-wide write lock (covers editor + sandbox watcher + index mutations — this closes the former "Sync layer + index cache" open item); (5) interactions post-`await` observable writes wrapped in `runInAction`; (6) history persists a plain-JSON snapshot (no `DataCloneError`).
- **Validation:** `bun typecheck` ✓, `bun lint` (touched files, max-warnings 0) ✓, parser suite 159 + 2 new regression tests ✓. Live editor flow not exercisable locally (Clerk auth + sandbox + `:8080` required) — needs manual confirmation.
- **Tags:** `#bug` `#editor` `#concurrency` `#mobx`

### Expired Vercel sandbox restore/liveness is still unavailable after Convex migration

- **Discovered:** 2026-06-07 (local/prod E2E QA pass)
- **Resolved:** 2026-06-08 (local validation, not yet deployed to production)
- **Where:** `apps/web/client/convex/projectActions.ts`; `apps/web/client/convex/projects.ts`; `apps/web/client/src/app/project/[id]/_components/canvas/frame/use-sandbox-liveness.ts`; `apps/web/client/src/app/project/[id]/_components/canvas/frame/index.tsx`
- **Fix:** Added Convex-backed preview liveness probing and snapshot restore. The editor now validates branch-owned Vercel preview URLs server-side, detects stopped/reclaimed sandboxes, creates a new Vercel sandbox from the branch snapshot, updates project/branch/frame sandbox metadata, and reloads the editor onto the fresh preview.
- **Validation:** `bun --filter @weblab/web-client typecheck` passed. Local Convex sync via `bun --filter @weblab/web-client convex:dev:once` was required before browser testing. The previously expired project restored to a new sandbox URL and `curl -I https://sb-7hsurxnx9im0.vercel.run` returned `HTTP/2 200`.
- **Remaining production note:** Requires deployment plus Convex function deployment before `weblab.build` can serve the fix.
- **Tags:** `#bug` `#editor` `#sandbox` `#convex`

### 2026-06-07 — Editor FS cleanup and expired-sandbox sync cascade

Resolved by the 2026-06-07 local/prod E2E QA pass.

- `CodeFileSystem` no longer tries to save `.weblab/index.json` when the FS was
  never initialized or has already torn down during route changes. The
  project-creation tab-churn console error (`File system not initialized`) is
  now a guarded no-op.
- Expired Vercel sandbox sessions now latch 410 as `sandboxGone`, release sync,
  and skip git/preload work. Local E2E verified the old reclaimed project no
  longer logs directory deletes or push attempts after the guard.
- Full sandbox restore was completed in the 2026-06-08 resolved entry above.

### 2026-06-05 — Component registry extended to full catalog + on-brand scaffold

Resolved by the full-catalog session (F-785).

- Catalog grew from the 21-component MVP to **1533** items: all free shadcn/ui
  (78), shadcnblocks free (293, probe-classified), Watermelon UI (964), and the
  198 local pro blocks vendored from `reference/shadcn-pro-blocks`. Catalog-first:
  registry blocks carry name + description + install URL (installed on demand);
  only pro + a core set are vendored. `manifest.json` + `CATALOG.md` describe all.
- Blank Next.js scaffolds now ship the Weblab tokens — `NEXTJS_GLOBALS_CSS` baked
  into `scaffoldNextProject`'s `globals.css`, so sites are on-brand pre-AI.
- New `shadcn` agent skill (`skills/shadcn/SKILL.md`, embedded via `generate:skills`)
  carries the design foundations + the full catalog index; the prompt points the
  agent at `read_skill("shadcn")`.
- Follow-ups opened above: derived Watermelon descriptions, probe-classified free
  set, three-place catalog sync, and duplicated scaffold tokens.

### 2026-06-05 — Project creation E2E clone + Startd blockers

Resolved by the 2026-06-05 Codex project-creation pass.

- Clone-from-URL now flushes the generated user message into AI SDK state
  before starting `regenerate`; local E2E confirmed `/api/chat` returned 200
  for `https://example.com`.
- Startd template detail pages no longer crash from importing a client-only
  preview helper into a server page.
- Vercel Sandbox git imports now use lockfile-aware installs and conservative
  Next dev commands. Legacy Next templates self-heal to Next 12/React 17 so
  Startd boots on the Node 24 sandbox; local direct preview returned HTTP 200.
- Production auth workflow is documented in
  [prod-e2e-testing.md](docs/agent-context/prod-e2e-testing.md). Prod still
  requires deployment before these local fixes can be verified live.

### 2026-05-28 — User-stopping fixes from F-300..F-402 bug-hunt

Fixed in this session (code-level verified: `bun typecheck` exit 0, scoped lint 0 errors). Frontend re-validation still blocked by the Vercel hobby-plan 402 (project create), so these are logic-traced + type-checked, not yet clicked through the editor.

- **F-335** restart button stuck after abort — [restart-sandbox-button.tsx:214](apps/web/client/src/app/project/[id]/_components/bottom-bar/restart-sandbox-button.tsx#L214). Added `setRestarting(false)` + `setRestartElapsedSec(0)` + `restartGraceUntilRef.current = null` before the abort `return`.
- **F-300** `activeBranch.id` null crash (3 sites) — [list-view.tsx:96+106](apps/web/client/src/app/project/[id]/_components/right-panel/interactions-tab/list-view.tsx#L96), [timeline-editor.tsx:60](apps/web/client/src/app/project/[id]/_components/right-panel/interactions-tab/timeline/timeline-editor.tsx#L60). Switched to `activeBranch?.id` + early-return / persist guard.
- **F-318** dropdown stale-closure (picker stuck open) — [use-dropdown-manager.tsx:143](apps/web/client/src/app/project/[id]/_components/editor-bar/hooks/use-dropdown-manager.tsx#L143). Added `isOpen` to effect deps (no loop — setState only fires when they disagree).
- **F-313** ImgSelected unreachable — [editor-bar/index.tsx](apps/web/client/src/app/project/[id]/_components/editor-bar/index.tsx) (imported + `TAG_TYPES[IMG]=['img']` + dispatch branch) and [img-selected.tsx](apps/web/client/src/app/project/[id]/_components/editor-bar/img-selected.tsx) (wired functional `ImgFit` / object-fit control; deliberately omitted the no-op `ImageBackground` stub). `<img>` now gets a real image-specific toolbar.
- **F-361** fork / createBlankSandbox silent fail — [branch-controls.tsx:37+52](apps/web/client/src/app/project/[id]/_components/branch/branch-controls.tsx#L37). Added `toast.error(...)` in both catch blocks (honors the `#disabled` "clear error" contract).
- **F-402** missing `'use client'` (latent build break) — [non-project.tsx:1](apps/web/client/src/components/ui/settings-modal/non-project.tsx#L1).
- **F-301** `formatRelativeTime` → `"NaNm ago"` — [comments-tab/index.tsx:16](apps/web/client/src/app/project/[id]/_components/right-panel/comments-tab/index.tsx#L16). Added `Number.isNaN` + negative-diff guards.

**Still Open (intentionally deferred — cosmetic or broad, NOT user-stopping):** F-402 backdrop-close dirty-check + ARIA/focus-trap (broad — needs Radix Dialog swap + state-manager `isDirty`); F-333 duplicate keys / CopyButton timeout; F-360 error-leak / email-normalize; F-334 wildcard postMessage; F-332 xterm refresh; pervasive raw-`<button>` + i18n sweep; ImageBackground dead stub; F-313 catalog row should note object-fit-only scope.

### 2026-06-13 — Home AI-tell elevation: copy + system-font swap (partial)

Shipped (code-verified: `bun typecheck` exit 0, scoped eslint 0 errors; both i18n keys confirmed rendered):
- Reworded 2 home AI-tell strings in `apps/web/client/messages/en.json` (English only): `landing.whatCanWeblabDoV2.subhead` (was "Everything in one canvas. No tabs, no handoffs, no translation losses.") and `landing.featureTrio.heading` (was "Pick your model, own your terminal, work with an AI that ships.").
- Swapped default body font Inter → pure system stack (`system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`) in `packages/ui/src/globals.css` + `apps/web/client/src/styles/globals.css`, and removed the `next/font` Inter load from `apps/web/client/src/app/layout.tsx`. SF Pro on Mac, Segoe UI on Windows, no web-font download.

Deferred:
- **i18n locale drift** — the 2 reworded strings are updated in `en.json` only. `sv/es/ja/ko/zh` still carry translations of the old phrasing. Re-translate `landing.whatCanWeblabDoV2.subhead` + `landing.featureTrio.heading` in the 5 non-English message files.
- **Off-home copy tells (flagged, not edited — home-only scope):** `landing.testimonials` "Tens of thousands of builders love Weblab" (unverifiable; conflicts with "90+ contributors") and `landing.andSoMuchMore` "...and so much more". Rewrite when scope widens beyond home.
- **Parked home elevation plan** (approved direction: editorial-premium, owned electric blue, elevate both modes — type pivot superseded by owner's system-ui choice): hero proof strip (GitHub stars / contributors / Apache-2.0 / model wordmarks), accent shift off `#0083ff`, section trim (8→4 cards), `transition-all`→explicit transitions + add `:focus-visible` rings (`faq-dropdown.tsx:37`, `model-agnostic-section.tsx:149`), replace cream/Midjourney landing assets. Owner kept hero H1 + subhead as-is.
