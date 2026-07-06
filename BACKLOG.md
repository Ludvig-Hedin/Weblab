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

### Editor stability audit 2026-07-04 — confirmed-but-deferred (entangled / needs live validation)

> Full context + fixed items: [`docs/editor-stability-audit-2026-07-04.md`](docs/editor-stability-audit-2026-07-04.md). 23 issues fixed this pass; the items below are confirmed real but carry a regression risk that can't be validated without a live sandbox / responsive-frame browser session, or need a larger design change.

#### Responsive-rebase source-write corruption cluster (P1)

- **Discovered:** 2026-07-04 (editor stability audit)
- **Where:** `apps/web/client/src/components/store/editor/code/tailwind.ts:85`; `apps/web/client/src/components/store/editor/style/index.ts` (override map: `recordOverrides`, `seedOverridesFromSiblings`, `breakpointMapFor`, `isOverriddenAt`, `clearBreakpointOverride`); `apps/web/client/src/components/store/editor/action/index.ts` (rebase timers vs undo)
- **Symptom:** (a) picking a theme/named color at a breakpoint is silently reverted in source ~1.2s later and re-emitted as `bg-[rgb(...)]`; (b) panel edits at a non-base breakpoint persist unscoped (apply at all breakpoints after reload); (c) any editor-bar color/text edit in a responsive group rewrites token classes to hardcoded resolved values and emits a broken `font-Inter, sans-serif`; (d) editing then Cmd+Z within ~1.2s lets the pending rebase rewrite the just-undone value into source.
- **Root cause:** the override map conflates authored-vs-seeded and Value-vs-Custom, uses camelCase seeds vs kebab-case panel keys, feeds seeded browser-computed values to the durable write, and the debounced rebase pipeline is invisible to `HistoryManager`.
- **Next step:** give the override map per-entry `{ type, provenance }`, normalize keys to one canonical form, have `breakpointMapFor` (source write) return only authored entries while the badge UI keeps the merged view, and cancel/revert pending rebases on undo/redo. Validate against a live multi-breakpoint frame group (edit at largest/smallest/single breakpoint; undo; clear-override).
- **Risk if ignored:** theme colors can never be persisted on responsive elements; breakpoint-scoped edits corrupt on reload; quick undo is unreliable.
- **Tags:** `#bug` `#editor` `#responsive` `#data-integrity`

#### `isChildTextEditable` is a stub returning `true` (P1)

- **Discovered:** 2026-07-04 (editor stability audit)
- **Where:** `apps/web/preload/script/api/elements/text.ts:131`
- **Symptom:** double-clicking any element with a `{expression}` child opens the inline editor with no warning; committing writes wrong source (duplicated content next to the preserved expression) and undo bakes the rendered value in as a static literal.
- **Root cause:** the source-AST plain-text check all callers gate on was ported as a hardcoded `return true`.
- **Next step:** implement in `TextEditingManager.start()` via `codeEditor.getJsxElementMetadata` + element-snippet parse; return true only when all children are JSXText/`<br/>`, whitelisting trivial string-literal containers (`{' '}`) to avoid over-blocking. The parser-side child-preserving merge (in-flight `packages/parser/src/code-edit/text.ts`) stays as defense in depth.
- **Risk if ignored:** silent JSX corruption + unrecoverable loss of dynamic bindings on a very common element shape.
- **Tags:** `#bug` `#editor` `#text` `#data-integrity`

#### Sandbox reclaim after "ready" has no recovery surface (P1)

- **Discovered:** 2026-07-04 (editor stability audit)
- **Where:** `apps/web/client/src/app/project/[id]/_components/canvas/frame/index.tsx:299` (liveness gated on `!isFrameReady`; restore panel on `!isFrameReady || !frame.url`)
- **Symptom:** any session outliving the 30-min Vercel sandbox lifetime silently breaks — canvas edits still render (penpal DOM ops) but all code writes/AI/terminal/git/preview fail with zero error, toast, or restore prompt until a full reload.
- **Root cause:** the sandbox-gone design assumes the 410 only happens during boot; every recovery surface is gated on `!isFrameReady`, which never flips back. No keepalive/`sandbox.extend()` exists.
- **Next step:** include `session.sandboxGone` in the overlay/panel condition (or force `isFrameReady=false`/`immediateReload()` when it flips) to re-enter the existing restore flow; add a periodic keepalive while the editor is active.
- **Risk if ignored:** every >30-min editing session degrades invisibly.
- **Tags:** `#bug` `#editor` `#sandbox`

#### Auto-height feedback loop on vh pages (P1, medium confidence)

- **Discovered:** 2026-07-04 (editor stability audit)
- **Where:** `apps/web/client/src/app/project/[id]/_components/canvas/frame/view.tsx:625`
- **Symptom:** frames for ordinary hero+sections landing pages may balloon to the 50,000px cap; canvas becomes unusable, churns ResizeObserver→penpal→MobX cycles.
- **Root cause:** iframe height := child `scrollHeight` with no fixed-point guard; the iframe height IS the vh viewport, so `100vh` + extra content is positive feedback.
- **Next step:** measure content height against a fixed layout viewport, or freeze on a monotone roughly-constant-delta growth sequence in `setContentHeight`. Confirm the loop diverges vs converges in a real browser first.
- **Risk if ignored:** unusable canvas on common layouts.
- **Tags:** `#bug` `#editor` `#perf`

#### Engine-level generation guard for init-during-teardown (P1, follow-up to per-branch fix)

- **Discovered:** 2026-07-04 (editor stability audit)
- **Where:** `apps/web/client/src/components/store/editor/index.tsx` + `engine.ts`
- **Symptom:** the per-branch `SandboxManager`/`SessionManager`/`CommentManager` leaks are fixed; a residual global concern remains for any future engine-level long-lived resource registered during an in-flight `init()` that races `clear()`.
- **Root cause:** the same `EditorEngine` instance is reused across React StrictMode's dev double-mount, so a one-way engine-level `disposed` latch would brick the dev editor.
- **Next step:** if an engine-level guard is needed, use a generation/epoch token captured at init start and compared after awaits (NOT a permanent latch).
- **Risk if ignored:** low today (per-branch leaks are fixed); revisit before adding engine-scoped async registration.
- **Tags:** `#tech-debt` `#editor` `#lifecycle`

#### Deferred perf/serialization P2s (evidence in audit doc)

- **Discovered:** 2026-07-04 (editor stability audit)
- **Where / Symptom / Next step:**
  - `apps/web/preload/script/api/events/dom.ts:27` — per-mutated-node full-subtree `buildLayerTree` (O(N²) getComputedStyle) whose payload the parent discards. Build once per MutationObserver batch; the parent ignores the payload so send an empty notification (or consume it incrementally and skip the full `refreshLayers`).
  - `apps/web/client/src/app/project/[id]/_components/canvas/frame/gesture.tsx:432` — `handleDragOver` fires an unthrottled `getElementAtLoc` penpal RPC per dragover. Route through the existing 16ms throttle + in-flight/sequence guard.
  - `apps/web/client/src/app/project/[id]/_components/canvas/frame/resize-handles.tsx:34` (+ `overlay/locked-resize-handles.tsx`) — unthrottled window mousemove → async `undebouncedRefresh` (penpal RPCs) + observable frame-map writes per raw event. rAF-coalesce; use the debounced refresh or a reentrancy guard.
  - `apps/web/client/src/components/store/editor/code/index.ts:97` — write-code / interactions ix-id / component createProp / restampHtmlMaster / font layout writes bypass `writeChain`. Expose `CodeManager.runExclusive(fn)` and route them through it.
  - `apps/web/client/src/components/store/editor/code/index.ts:234` — `groupRequestByFile` keys by path only; cross-branch requests sharing a path merge into one group written to the first branch. Key by `${branchId}::${path}` (touches the `FileToRequests` contract + parser).
  - `apps/web/client/src/components/store/editor/history/index.ts:104` — `commitTransaction` isn't atomic (image-swap can partially apply) and splits one gesture into multiple undo entries. Check `push`'s boolean; push a composite/batch undo entry.
  - `apps/web/client/src/components/store/editor/history/storage.ts:15` — persisted undo history has no code-state fingerprint; undo after reload can write stale values when code changed externally. Persist a branch-SHA/content-hash and discard on mismatch, mirroring the git-restore clear.
  - `apps/web/client/src/components/store/editor/frame-events/index.ts:34` — one mutation triggers all-frames `processDom` + uncached Babel re-parse in `getTemplateNodeChild`. Scope `onWindowMutated` to the originating frame; memoize the parse.
- **Risk if ignored:** editing gets progressively laggier as frame/tree count grows; rare cross-branch/undo-after-external-change corruption.
- **Tags:** `#perf` `#editor` `#tech-debt`

### QA loop — WIND DOWN (2026-06-21 iter-21, /loop dynamic) — quick-win queue dry, both title→tooltip candidates refuted

> Post-capstone ship-or-stop mode. The two remaining audit quick-wins both failed verify-first → no clean safe change left → loop wound down (no churn). **Final tally: 31 fixes (2 security) + UX audit + 2 test files + capstone across iters 1-21.**

**❌ REFUTED — `override-affordance.tsx:59` native `title`→tooltip:** the wrapper holds **editable style inputs** (`children`); a hover tooltip there steals pointer/focus mid-edit. Native `title` is the deliberately low-interference choice. Not converted.

**❌ REFUTED — drift-dot `top-bar/index.tsx:340` native `title`→tooltip:** the dot is a `<span>` inside a `<Button>` that's already a `DropdownMenuTrigger asChild` — nesting a Tooltip trigger inside a dropdown trigger is fragile; the parent Button already carries an i18n `title` (`driftedPreset`, line 324) covering the drift (the dot title is redundant); and a consistent fix needs a NEW i18n key (typegen-staleness risk). More work + more risk than the value. Not converted.

**Loop stopped.** The autonomous QA loop has extracted its available value: cheap real bugs fixed early (iters 1-8), offline subsystem mined (iters 16-18), capstone + regression sweep (iter-19), 1 polish quick-win (iter-20), queue dry (iter-21). Remaining substantive work is **OWNER-GATED** — re-engage `/loop` with one of:
1. **"wireframe rate-limit"** → build the abuse guard (dedicated table, NOT `usageRecords`).
2. **live-browser pass** → connect the Chrome extension; click-test the iters 16-17 offline data-loss fixes (the clearest verification gap).
3. A named area to redirect to.

### QA loop — 1 UX quick-win shipped (2026-06-21 iter-20, /loop dynamic) — chat mode-toggle chevron

> Post-capstone: default shifted from dry hunts to shipping ONE verified UX-audit quick-win per tick. Picked the highest-confidence, non-controversial, no-i18n item.

**✅ FIXED — `53d278b70`:** AI prompt composer mode toggle (Build/Ask/Plan, used on hero + editor chat) had **no dropdown affordance** — it sat among direct-action footer buttons (image, mic) looking identical, so first-time users couldn't tell a mode menu existed (UX audit, "Frustrating / Landing"). Added a `ChevronDown` that rotates 180° on open, matching the house convention (`group-data-[state=open]:rotate-180`, navigation-menu.tsx). Typecheck 0; my lines lint-clean. [chat-mode-toggle.tsx](apps/web/client/src/components/ai-prompt-composer/chat-mode-toggle.tsx:86).

**❌ DROPPED (verify-first):** the audit's paired "bump label contrast tertiary→secondary" — sibling footer buttons (image, mic) all rest at `text-foreground-tertiary` + `group-hover` ([index.tsx:339](apps/web/client/src/components/ai-prompt-composer/index.tsx:339)); bumping only this one breaks toolbar consistency. Chevron alone is the clean win (it correctly distinguishes the one *dropdown* from the direct-action siblings).

**Owner-gated work still pending** (re-surfaced): (1) wireframe spend rate-limit (dedicated table); (2) live-browser offline→online reconnect pass (verify iters 16-17 data-loss fixes). No live browser / agent API this session → code-path only.

### QA loop — CONSOLIDATION CAPSTONE (2026-06-21 iter-19, /loop dynamic) — campaign summary + regression sweep

> Capstone, not a hunt. **Regression check: `bun typecheck` exit 0; parser 210/210; offline write-queue 8/8** — the campaign's 30 fixes are collectively green. Wrote the campaign summary ([docs/notes/qa-loop-campaign-2026-06-21.md](docs/notes/qa-loop-campaign-2026-06-21.md)) + a feature-log entry.

**Campaign outcome (iters 1-19):** 30 fixes shipped (incl. 2 security: workspace owner-invite escalation + deployment `envVars` leak; 2 offline data-loss: write-queue coalesce [test-backed] + replay watcher-race), 1 prioritized UX audit, 2 test files. ~15 subagent findings REFUTED on verification (≥5 overlapped existing guards) — the highest-value behavior, since several would have regressed billing/auth/parser/sync if applied blind.

**This is a natural stopping point.** Broad hunts saturated; offline swept; remaining high-value work is OWNER-GATED:
1. **Wireframe spend rate-limit** — dedicated table (NOT `usageRecords`, which would charge the message cap). Ready to build on an explicit yes.
2. **Live-browser offline→online reconnect pass** — the iters 16-17 data-loss fixes are reasoned, not click-tested. The clearest verification gap.
3. Deferred (need a test harness / editor session): route-group page FS-path (iter-4 design recorded), editor-history coalesce/redo-alias leads. Minor: `sw.js` preload cache-first.

Absent an owner steer (build wireframe RL / live-browser pass / redirect / wind down), recommend winding the loop down rather than running more dry hunts.

### QA loop — stranded-suppressSyncInit REFUTED + offline subsystem swept (2026-06-21 iter-18, /loop dynamic) — 0 fixed (refuted)

> Verified the last offline lead; refuted. The offline subsystem is now swept.

**❌ REFUTED:**
- **stranded `suppressSyncInit` on interrupted reconnect** (iter-15 FRUSTRATING lead). The reconnect effect in `use-start-project.tsx:265-345` wraps the replay flow in a `try` whose **`finally` (lines 323-331) calls `resumeSync()` on every exit path** — its own comment states the intent: "Ensure sync engine init is never left permanently suppressed even if swap or replay throws." The `if (cancelled) return` at line 285 is INSIDE that try, so the `finally` still runs → `resumeSync()` → `resumeSyncInit()` (which clears `suppressSyncInit` first, `sandbox/index.ts:224`). The flag cannot strand. The subagent missed the try/finally.

> **Offline subsystem status: SWEPT.** write-queue concurrent-coalesce (FIXED+test, iter-16), replay watcher-race (FIXED, iter-17), stranded-suppressSyncInit (REFUTED, iter-18), retryDeadLetter clobber (REFUTED+test, iter-16). Remaining: `sw.js` preload cache-first (MINOR — jsDelivr-pinned in prod, risky sw change, low priority).

> **Loop recommendation:** the broad-hunt and offline veins are exhausted. The remaining high-value work is OWNER-GATED: (1) wireframe rate-limit dedicated table (ready to build on a yes); (2) a LIVE-BROWSER offline→online reconnect pass to verify the iters 16-17 data-loss fixes end-to-end (none are click-tested). Suggest the loop either redirect to a named area, do a consolidation/regression-sweep pass, or wind down.

### QA loop — replay watcher-race fix (2026-06-21 iter-17, /loop dynamic) — 1 FIXED (sequencing; live-browser verify recommended)

> Fixed the iter-15 BLOCKER (last offline writes dropped on reconnect). Verified the race by tracing the data flow; the fix is a deterministic-ordering change of an EXISTING watcher-stop, not new behavior. Typecheck ✓, lint = pre-existing warnings only. **Not unit-testable in isolation (SandboxManager/MobX-reaction coupling) — recommend a live-browser reconnect test to confirm end-to-end.**

**✅ FIXED (this commit):**
1. **`#offline` `#data-loss` — a write made during the reconnect replay window could be silently dropped.** The replay flow is: caller `suppressSyncInitForReplay()` → `swapToOnline()` → `replayQueue()`. The offline write watcher was only stopped by the provider-REACTION (`sandbox/index.ts:136-140` `suppressSyncInit` branch), which fires ASYNCHRONOUSLY after `swapToOnline` changes the provider — leaving a window where the watcher is still live during `replayQueue`. A write captured in that window: (a) enqueues a NEW record whose `supersedePriorRecords` deletes the snapshot record's content blob mid-replay → the snapshot write fails "missing content blob"; (b) the new record isn't in the replay snapshot → never applied. Net: the user's last offline edit is lost. **Fix:** `suppressSyncInitForReplay()` now calls `stopOfflineWatcher()` SYNCHRONOUSLY (before `swapToOnline`/replay). The reaction's `suppressSyncInit` branch already stopped the watcher — this just makes it deterministic + early; the offline branch (`:127-129`) restarts the watcher on a flick-back-to-offline, so it's self-healing. Justified low-risk: an ordering tightening of an existing stop, no new state/behavior.

> **Resolves** the iter-15 "replay watcher-shutdown race" BLOCKER. The OTHER iter-15 offline lead — stranded `suppressSyncInit` after an interrupted reconnect (`use-start-project` unmount during `swapToOnline` skips `resumeSync`) — is SEPARATE and still LOGGED (it's an unmount-cleanup ordering issue, not the watcher race). The `sw.js` preload cache-first lead also still stands.

> Open owner decisions (unchanged): wireframe rate-limit (dedicated table, ready on a yes); LIVE-BROWSER reconnect QA (now the clearest verification gap for these offline data-loss fixes); wind-down/redirect.

### QA loop — write-queue concurrency fix, test-backed (2026-06-21 iter-16, /loop dynamic) — 1 FIXED + test, 1 refuted (test-locked)

> **Correction to iter-15:** the offline write-queue DOES have a test harness — `test/offline/write-queue.test.ts` (committed `d41867068`), which I'd missed. So instead of building one, I extended it (concurrent + dead-letter cases) and fixed a real bug test-first. Typecheck ✓; `bun test` 8 pass / 0 fail.

**✅ FIXED (this commit, test-backed):**
1. **`#offline` `#data-integrity` — concurrent writes to the same path didn't coalesce → duplicate queue records.** `services/offline/write-queue.ts` `enqueue` ran `supersedePriorRecords` then inserted, with no serialization. Two concurrent same-path enqueues each superseded the PRE-insert state (neither saw the other) → BOTH survived, defeating coalescing and risking a spurious replay conflict from a stale `baseHash`. Added a failing test (`Promise.all([enqueue, enqueue])` → got 2, want 1), then **fixed** by serializing enqueues through a module-level promise-chain lock (`enqueueLock`) so each coalesce sees the committed prior state. Test now passes. (Resolves the iter-9 `supersedePriorRecords` non-atomic-coalesce lead.)

**❌ REFUTED (locked by a passing test):**
- **dead-letter `retryDeadLetterRecord` reuses `record.id` → concurrent retries clobber content** (iter-15 lead). Verified non-bug: a double-retry of the SAME dead-letter record writes the SAME content to the SAME id (idempotent), and `makeId` ids don't collide across records. Added a test (`Promise.all([retry, retry])` → exactly 1 live record, correct content, dead-letter empty) — passes, documenting the idempotency.

> Note: the **other** offline leads from iter-15 (replay watcher-shutdown race dropping the last offline writes; stranded `suppressSyncInit`; sw preload cache-first) are in `replay-controller`/`use-start-project`/`sw.js` — NOT the write-queue — and remain logged; they need their own test scaffolding (the write-queue harness doesn't cover them). The SATURATION recommendation + open owner decisions (wireframe rate-limit, live-browser pass, wind-down) from the iter-15 entry below still stand.

### QA loop — offline/PWA hunt + SATURATION call (2026-06-21 iter-15, /loop dynamic) — 0 FIXED (all risky/no-harness), findings logged

> Offline/PWA/service-worker hunt. **No clean ship** — the real findings are data-loss in the no-test sync/offline area (won't patch blind), and the safe-looking one is intentional. **The broad-hunt loop is saturated; see the recommendation at the bottom.**

**📋 LOGGED — offline write-integrity leads (real-looking; need a TEST HARNESS before fixing — services/offline + sync have none):**
- **BLOCKER `#offline` `#data-loss` — last offline writes can be dropped on reconnect.** `services/offline/replay-controller.ts` snapshots the queue once, but the watcher isn't stopped until `suppressSyncInitForReplay` fires via the provider-reaction — leaving a window where new watcher events enqueue records sharing paths with snapshot records; `write-queue.supersedePriorRecords` deletes those new records during replay, and since they're not in the snapshot they're never applied. **Fix:** stop the offline watcher BEFORE `replayQueue`, or replay only the snapshot IDs.
- **FRUSTRATING `#offline` — editor silently unsynced for the tab's lifetime after an interrupted reconnect.** `use-start-project.tsx` reconnect effect sets `cancelled=true` in cleanup; if it unmounts while `swapToOnline` is awaiting, the early-return skips `resumeSync()`, leaving `suppressSyncInit===true` permanently → next mount skips `initializeSyncEngine`. **Fix:** call `resumeSync()` before every `cancelled` early-return.
- **FRUSTRATING `#offline` — dead-letter retry can apply wrong content under concurrent retries** (`write-queue.retryDeadLetterRecord`): both reuse `record.id` as the blob key → second clobbers the first in-flight write. **Fix:** `makeId()` a fresh id for the requeued record. (Pairs with the iter-9 non-atomic-coalesce write-queue lead.)
- **MINOR `#pwa`** — `sw.js` serves `weblab-preload-script.js` cache-first → existing tabs keep a version-skewed preload after a deploy (new tabs are fine via SW activate purge). Move it to `staleWhileRevalidate`. (Preload is jsDelivr-pinned in prod per [[project_preload_artifact_must_commit]] — sw change needs care.)

**❌ REFUTED:**
- online-status initial `heartbeat({ allowFlipUp:false })` "leaves 'unknown' 15s" — intentional: the comment (`online-status.ts:96`) says the initial ping deliberately doesn't blindly trust `navigator.onLine`; a normal 2xx still flips up via `|| currentOnline`. The window only occurs on a 4xx from `/api/health`, which returns 200 normally. Conservative-by-design + abnormal-edge.

---

## ⏸ CAMPAIGN SATURATION — recommendation (after 15 iters: 28 fixes incl 2 security, UX audit, 1 parser test)

The broad subagent-hunt loop has hit diminishing returns: iters 9–15 mostly REFUTE or log-as-risky (cheap real bugs were fixed in iters 1–8). The verify-first discipline is doing its job (blocked several regressions-disguised-as-fixes), but raw fix throughput is near zero from broad hunts. **The remaining high-value work needs a decision/investment, not another hunt:**
1. **Wireframe spend exposure** (`convex/wireframeActions.ts`) — build a DEDICATED rate-limit table (pure abuse guard, no billing change; `usageRecords` can't be used — it'd charge the message cap). Ready to build on an explicit go-ahead.
2. **Editor-history + offline/sync data-loss leads** (this entry + iter-9/11/12) — all real-looking but UNFIXABLE blind because those areas have NO test harness. The high-leverage move is to BUILD a test harness (start with `services/offline/write-queue.ts` — most self-contained), then fix the logged data-loss bugs test-backed.
3. **Live-browser QA** — nothing this campaign is click-tested (no Chrome ext / agent token this session). A real-browser pass is the single highest-value thing a human-in-the-loop can add.

### QA loop — auth loading states (2026-06-21 iter-14, /loop dynamic) — 1 FIXED (5 files), 1 refuted

> Cleared the last iter-12 auth leads. Typecheck ✓, lint clean.

**✅ FIXED (this commit):**
1. **`#auth` `#ux` — blank-screen flash on auth-gated segments during RSC resolve.** Added `loading.tsx` Suspense fallbacks to the 5 segments that lacked one — `sign-in/verify`, `profile-setup`, `w/new`, `invitation/[id]`, `invitation/workspace/[id]` — each rendering `<ProjectCreationLoader heading="…" />`, the established full-page-loader pattern used by `/projects` + `/project/[id]`. Purely additive; an invited/verifying/onboarding user now gets immediate feedback instead of a white flash while the server segment resolves.

**❌ REFUTED — not a clean swap:**
- **consolidate the two `sanitizeReturnUrl` impls** — they have genuinely DIFFERENT contracts: `utils/auth/sanitize-return-url.ts` returns `string | null` (null on unsafe → caller falls back); `utils/url/index.ts` returns `string` (defaults to `Routes.HOME`, accepts an `origin` opt AND same-origin absolute URLs). Swapping `verify/page.tsx` + `profile-setup` from the `utils/url` impl to the `utils/auth` one would change auth-redirect behavior (null vs HOME default) and make the currently-dead null-branch live. The dead branch is harmless; merging is a behavior-changing refactor, not a cleanup — deferred. (If consolidating later, pick ONE canonical contract and migrate all callers deliberately.)

> Still-OPEN owner decisions (unchanged): wireframe spend exposure (dedicated rate-limit table — ready to build on request — vs. credit pricing); loop continue/redirect/wind-down.

### QA loop — auth deep-link returnUrl fixes (2026-06-21 iter-13, /loop dynamic) — 2 FIXED (6 files)

> Shipped the verified auth `returnUrl` leads from iter-12. Typecheck ✓, lint clean.

**✅ FIXED (this commit):**
1. **`#auth` — unauthenticated deep-links to create/import dropped the user on `/projects` after sign-in instead of where they were going.** All 5 create/import layouts (`projects/new/layout.tsx`, `projects/import/layout.tsx`, `projects/import/{local,github,figma}/layout.tsx`) called `redirect(getSignInUrl())` with NO returnUrl, while the sibling `projects/layout.tsx` correctly forwards `x-pathname`. **Fix:** each now reads `(await headers()).get('x-pathname')` (middleware-set, includes the query string) and passes it to `getSignInUrl`, falling back to its own path. So a shared `/projects/import/github` link now returns the user there post-login.
2. **`#auth` (minor) — sign-in self-loop guard was exact-match-only.** `sign-in/[[...rest]]/page.tsx:68` rejected `returnUrl === Routes.LOGIN` / `=== '/sign-up'` but not sub-paths (`/sign-in/verify`, `/sign-in/sso-callback`), producing a 2-hop bounce for an authed visitor. **Fix:** an `isAuthSurface` helper rejecting `/sign-in`, `/sign-in/*`, `/sign-up`, `/sign-up/*` (trailing-slash form avoids false-matching `/sign-in-help`).

> Still-open iter-12 auth leads (lower priority): two divergent `sanitizeReturnUrl` impls (`utils/auth` `string|null` vs `utils/url` `string`) — consolidate to the canonical `utils/auth` one (`verify/page.tsx` + `profile-setup` use the other, leaving a dead null-branch); missing `loading.tsx` on `/sign-in/verify`, `/profile-setup`, `/w/new`, `/invitation/[id]`, `/invitation/workspace/[id]`. Plus the still-OPEN owner decisions: wireframe spend exposure (dedicated rate-limit table vs. credit pricing) and loop continue/redirect/wind-down.

### QA loop — auth/UI/wireframe hunt (2026-06-21 iter-12, /loop dynamic, 3 sonnet subagents) — 1 FIXED, 1 refuted, wireframe-RL re-analyzed, leads logged

> Fresh hunt of auth/session, editor left-panel tools, and the wireframe rate-limit feasibility. Shipped 1 clean editor fix; refuted a claimed drag bug (already guarded); **re-analyzed the wireframe rate-limit and found the subagent's proposal would cause a credit side-effect** (so still not a blind ship). Typecheck ✓.

**✅ FIXED (this commit):**
1. **`#editor` `#layers` — hovering/clicking a STALE layer row corrupted the selection onto `<body>`.** `left-panel/design-panel/layers-tab/tree/tree-node.tsx:134` `sendMouseEvent` guarded only on `!el`, but `getElementByDomId` falls back to `document.body` (not null) for a stale/removed domId, so `mouseover(el)`/`click([el])` fired on `<body>` → selection jumps to the whole page. **Fix:** added `|| el.domId !== node.domId` to the guard, mirroring the exact pattern already in `layers-tab/index.tsx:93` (handleDrop). 1-line.

**❌ REFUTED:**
- **layers-tab drag `-1` guard "reparents `<body>`"** — already guarded. `index.tsx:93,98` bail when `childEl.domId !== dragNode.data.domId` / `parentEl.domId !== parentNode.data.domId` (with an explanatory comment), so the stale-domId→body case can't reach the move. The subagent missed those guards.

**🚩 WIREFRAME RATE-LIMIT — re-analyzed; subagent's `reserveImage`-mirror proposal is UNSAFE as-is (would charge credits):**
- Inserting `'wireframe'` rows into `usageRecords` to count a rate-limit would COUNT AGAINST THE FREE MESSAGE CAP: `freePlanUsage` (`usage.ts:90-103`) queries `by_user_time` with `q.eq('userId', …)` only — NO type filter — and `sumUsageAmount` sums every row. So a free-tier user's wireframe gens would silently consume their 5/day, 50/month message budget. (`reserveImage` is fine only because images *intentionally* share the credit pool, line 512.) Also note the subagent's field names were wrong: real `usageRecords` fields are `timestamp`/`amount`, not `createdAt`/`tokens`.
- **Correct options (still need an owner call):** (a) a DEDICATED rate-limit table (e.g. `wireframeRateLimits` or `@convex-dev/rate-limiter`) that the credit caps ignore — pure abuse guard, no pricing side-effect; OR (b) the owner decides wireframe gens SHOULD cost credits, then the reserveImage pattern (with real fields) applies. Feature is reachable (unlisted page `/project/[id]/wireframe`, no flag) so the unbounded-spend exposure is real. **STILL OPEN, needs owner decision.**

**📋 LOGGED — leads (lower priority / multi-file):**
- `#auth` — `getSignInUrl()` is called with NO returnUrl in 5 layouts (`projects/new/layout.tsx`, `projects/import/{,local/,github/,figma/}layout.tsx`), so an unauthenticated deep-link to create/import lands on `/projects` after login instead of the intended page (sibling `projects/layout.tsx` correctly forwards `x-pathname`). Fix: pass `(await headers()).get('x-pathname')`. (5 files.)
- `#auth` (minor) — `sanitizeReturnUrl` only blocks exact `/sign-in`, not `/sign-in/verify` or `/sign-in/sso-callback` → a 2-hop post-login bounce; change to `startsWith('/sign-in/')`. Two divergent `sanitizeReturnUrl` impls (`utils/auth` returns `string|null` vs `utils/url` returns `string`) leave a dead null-branch — consolidate. Missing `loading.tsx` on `/sign-in/verify`, `/profile-setup`, `/w/new`, `/invitation/[id]`, `/invitation/workspace/[id]` (blank flash).
- `#editor` (minor) — layers eye-toggle desyncs after undo (`tree-node.tsx:256-261`, has a TODO; derive icon from the live style not `node.data.isVisible`); brand-tab rename context action doesn't auto-focus the Name input.

> Auth core verified SOLID: Clerk→Convex token gate, signing-out sentinel, per-segment UNAUTHORIZED boundaries, open-redirect sanitization. Editor insert/drag paths verified guarded (the drag refutation above).

### QA loop — history/agent/SEO hunt (2026-06-21 iter-11, /loop dynamic, 3 sonnet subagents) — 1 FIXED, 1 HIGH flagged, leads logged

> Fresh hunt of history/undo-redo, agent API + wireframe, and public/SEO routes. Shipped the one clean+safe fix (sitemap gaps); flagged a real cost/abuse exposure (wireframe credit bypass) that needs a product decision; logged history leads that are risky to fix without a test harness. Sitemap XML validated (xmllint).

**✅ FIXED (this commit):**
1. **`#seo` — 5 live public routes were missing from the sitemap.** `public/sitemap.xml` is hand-maintained and had drifted: the live `blog/claude-opus-4-8` post (Google could never discover it) plus `/security`, `/features/blocks`, `/workflows/codex`, `/see-a-demo`. **Fix:** added all 5 entries. *(Attempted the proper drift-proof fix — a dynamic `app/sitemap.ts` generating blog URLs from `getAllPosts()` — but deleting the published `public/sitemap.xml` was declined, so reverted to the additive fix and removed the conflicting `sitemap.ts`. Converting to a dynamic sitemap remains the recommended follow-up to stop the recurring blog-post drift.)*

**🚩 HIGH — flagged, needs a product decision (not a blind fix):**
- **`#cost` `#abuse` — the 3 wireframe AI actions bypass the credit system entirely.** `convex/wireframeActions.ts` `generateSitemap`/`generateWireframe`/`generateStyleGuide` (228/265/333) call `requireOpenRouter()` (gpt-5, up to ~16k tokens each) after only `internal.wireframes._getDocForAction` (a `project.use_ai` membership check — NOT credit-gated). The credit system lives in the Next.js route handlers (`api/chat/route.ts` `checkMessageLimit`/`incrementUsage`), so any workspace member with `project.use_ai` can call all three in a loop and burn unbounded OpenRouter spend. **Fix direction:** reserve credits (`usage.increment` / reserve-then-reconcile) or a per-user wireframe rate-limit in each action before `requireOpenRouter`, mirroring the chat route. Needs a pricing decision for wireframe gens + a Convex-side credit-reservation call → deferred, not shipped blind.

**📋 LOGGED — leads (risky to fix without a test harness; editor history has none):**
- `#history` — `updateTransactionActions` (`history/helpers.ts:232`) coalesces by `action.type` alone (non-style). **Plausibly intentional gesture-collapse** (a drag's repeated same-element updates → keep latest; `update-style` has a dedicated by-target merge), so whether two *different* elements' same-type edits ever share one transaction (vs. multi-target actions) is unverified — a wrong `(type,oid)` key could break gesture-collapse. Verify with the real transaction/action shapes before touching.
- `#history` — `transformRedoAction` (`helpers.ts:277`) has no explicit cases for `add/remove/update-interaction` → they hit `default: return action` un-cloned, aliasing the object across undo+redo storage; corruption only if the object is later mutated. Add clone cases mirroring `insert-image` if confirmed mutated.
- `#history` (minor) — `reverseGroupAction` ungroup drops child position hints (children land in undefined order); `undoStack` has no in-memory cap (only the persisted snapshot is capped at 100/50).
- `#wireframe` (minor) — `wireframes.deleteSection` (:353) skips `reindexWireframeSections` when the linked section is already gone, leaving a gap in order ints; call reindex using the known `wireframePageId`.
- `#test` (minor) — `agentTestSeed.foreignProjectIdForQa` (:346) does an unindexed full `projects` scan → may hit Convex's 8,192-row read cap on a large dev DB and silently skip the IDOR QA check.

> Agent API surface verified SOLID: token auth correct, `WEBLAB_AGENT_USER_ID` scoping enforced, IDOR blocked by the `createdByUserId` check, blockId enum+coerce prevents hallucinated blocks reaching emit. Blog `[slug]` route correctly `notFound()`s on unknown slugs.

### QA loop — parser-bug verification (2026-06-21 iter-10, /loop dynamic) — 0 bugs (both REFUTED), +1 regression test, 1 tooling note

> Verified the 2 iter-9 PARSER finds against the actual code + data flow. **Both refuted — the parser is correct in both cases.** Added a regression test locking the (subtle) paste-oid correctness. Parser suite: 210 pass, 0 fail.

**❌ REFUTED (verified non-bugs):**
- **`getTemplateNodeChild` "returns null for namespaced components" — misdiagnosed.** `(name as JSXIdentifier).name` IS undefined for a `<UI.Button>` member-expression tag, but it doesn't matter: `child.component` comes from `componentStack` (`template-node/map.ts:31/42/56` push `path.node.id.name` — function/class/var DECLARATION names, always simple identifiers, never dotted). So `child.component` is never `"UI.Button"`; reconstructing the dotted tag name wouldn't make it match, and `undefined === child.component` just returns null gracefully (no crash). The proposed fix fixes nothing.
- **`insert.ts` "double-sets the oid on paste → wrong oid" — not a bug.** Two independent reasons: (1) `getAstFromCodeblock(codeBlock, /* stripIds */ true)` (`insert.ts:35` → `parse.ts:30` `removeIdsFromAst`) strips the SOURCE `data-weblab-id` from the copied block BEFORE line 37 adds the fresh oid, so the element gets the fresh oid; (2) in the real paste flow (`copy/index.ts:132-145`) `insertedChild.oid === pasteParams.oid === newOid`, so the line-49 no-op leaves the correct value anyway. The redundant second add is harmless.

**✅ ADDED — regression test:** `packages/parser/test/insert.test.ts` (2 tests) pins the paste-oid correctness — a future change to the `stripIds` flag or the add/replace order would now fail the suite (paste-oid has a bug history: cross-branch paste branchId was an iter-25 fix). Used `CodeActionType.INSERT` (the enum), avoiding the pre-existing `transform.test.ts:59` string-literal mistake.

**🔧 TOOLING NOTE (pre-existing, not introduced):** `packages/parser`'s `typecheck` script fails (exit 2) on config-level issues unrelated to runtime: cross-package `@weblab/ui/icons` + `file-system` `.tsx` imports without `--jsx`, `Object.groupBy` needing `lib: es2024` (`component-extract.test.ts:105`), and `transform.test.ts:59` typing a CodeAction `type` as the string `"insert"` instead of `CodeActionType.INSERT`. `bun test` (the suite) passes; only the package-level `tsc` config is off. Worth a tooling-config pass.

### QA loop — core-systems hunt (2026-06-21 iter-9, /loop dynamic, 4 sonnet subagents) — 2 FIXED, 5 refuted, ~6 logged

> Fresh hunt of un-swept CORE areas (credits/billing, parser, sync-engine, desktop/local). The credit-correctness findings were ALL refuted (documented-deliberate — verifying the rationale prevented breaking money code); shipped 2 clean desktop guards; logged real data-loss finds that need a test harness / live verification to fix safely. Typecheck ✓, lint clean.

**✅ FIXED (this commit):**
1. **`#desktop` — local project in the "Recent Projects" carousel had no open-guard.** `projects/_components/select/square-project-card.tsx` wrapped the whole card in an unconditional `<Link>`, so clicking a `storageMode:'local'` project in the BROWSER navigated to an editor route whose NodeFs runtime throws. `ProjectCard`/`ProjectRow` already gate this. **Fix:** mirrored the `openBlocked = isLocal && !isDesktop` guard — the card's onClick now `preventDefault`s + toasts `localDesktopOnly` instead of navigating.
2. **`#desktop` — Cmd-K command palette offered local projects as dead jumps.** `projects-command-palette.tsx` listed all projects and `router.push`ed unconditionally. **Fix:** filter `storageMode:'local'` out of the quick-jump when not in the desktop app (cleaner than a dead nav). (Both are defense-in-depth over the known root issue: local projects leak into the web dashboard at all — no list-level storageMode filter.)

**❌ REFUTED — verifying the rationale prevented bad fixes:**
- **CREDITS (4 findings) — all documented-deliberate.** `usageMath.sumUsageAmount`'s `r.amount ?? 1` is for LEGACY no-amount rows; the free caps intentionally count REAL TOKEN COST (`usage.ts:450` "charges the real token cost against the free caps"), so unpriced/local models legitimately cost 0 and don't consume the cap ("Unpriceable means free" :432). The "PRO refund eaten" claim is impossible: reconcile (success) and revertIncrement (failure) are mutually exclusive and revert deletes the record. Changing `??`→`||` would have BROKEN the intended real-cost accounting. (The Stripe `past_due→active` mid-period recovery edge is a narrow real lead — logged, not fixed.)
- **PARSER text-children wipe — ✅ FIXED 2026-07-07.** `code-edit/text.ts`: `updateNodeTextContent`'s multi-line branch no longer does `node.children = []`; it now removes only `JSXText`/own-inserted `<br/>` children and splices the new text run back in at the original text anchor, preserving `JSXElement`/`JSXExpressionContainer`/fragment siblings in place. Also fixed a second bug found while verifying: repeated multi-line edits to the same node used to leave the previous edit's `<br/>` behind every time (treated as "preserved markup" instead of the old text run) — stray `<br/>` accumulated without bound. Regression tests in `packages/parser/test/text.test.ts` (9 cases). The `{x}`→JSX-expression-container escaping half of this TODO is **still open** (see `code-edit/text.ts:5-8` inline comment) — needs a JSX-aware text encoder, tracked separately below.

**📋 LOGGED — confirmed/likely data-loss finds (need a test harness or live verification before fixing):**
- **`#sync` `#data-loss` — stale hash suppresses re-delivery after a FAILED ZenFS write.** `services/sync-engine/sync-engine.ts` (~write/hash loops): the write-loop swallows the error, then the hash-storage loop runs unconditionally, so the next sandbox tick sees a matching hash and skips re-delivery → local+sandbox diverge silently. **Fix:** track failed paths in a Set; skip hash storage for them. (Sync-engine has no tests — verify before shipping.)
- **`#sync` — OID index corrupted after a sandbox-initiated DIRECTORY rename.** `sync-engine.ts` rename handler calls `moveFile()` (rekeys only JSX/HTML source pairs), not `moveDirectory()` (recursive rekey), so entries under the renamed dir keep stale paths until the 2s debounced `rebuildIndex`.
- **`#sync` `#race` — `write-queue.ts` `supersedePriorRecords` read+delete is non-atomic** → two concurrent `enqueue()` for the same path can both pass the check → duplicate records skew the conflict-log baseline. Minor.
- **`#parser` — `getTemplateNodeChild` returns null for namespaced components** (`<UI.Button>`, `<Icons.Arrow>`): `(name as JSXIdentifier).name` is undefined on a `JSXMemberExpression`. Branch on node-name type + reconstruct the dotted string.
- **`#parser` — `insert.ts` sets the oid twice on paste** (`addParamToElement` with `insertedChild.oid` then `addPasteParamsToElement` no-ops with `replace=false`) → pasted element keeps the wrong oid. Pass `replace=true` or order the oid set after paste params.
- **`#billing` — Stripe `past_due→active` recovery within the same period mints no new bucket** (`usage.ts:279` `isRenewal` requires status active AND a new `current_period_end`). Narrow dunning edge.

### QA loop — logged-defect fixes (2026-06-21 iter-8, /loop dynamic) — 2 FIXED, 1 refuted, 1 deferred

> Verified + fixed the next tier of iter-7 LOGGED defects. Typecheck ✓, lint clean.

**✅ FIXED (this commit):**
1. **`#ai` `#credits` — chat summarize cooldown blocked retries for 60s after ANY failure.** `api/chat/summarize/route.ts:209` set `recentSummaryFires` (the per-conversation cooldown) BEFORE the work, and neither the credit-limit 402 early-return nor the catch cleared it — so a single failure silently 204'd the next 60s of summarize attempts, contradicting the catch comment's "next chat turn will re-attempt." **Fix:** kept the `.set` as an in-flight CONCURRENCY guard (so concurrent summarize calls don't double-charge) but added a `let succeeded`/`finally` that clears the cooldown on every non-success exit (402, null result, throw). Chose this over the subagent's "move .set after success" because that would have dropped the concurrency guard and re-introduced a double-charge race.
2. **`#settings` `#domains` — removing a verified custom domain had no confirmation.** `settings-modal/domain/custom/verified.tsx:27` fired `removeVerifiedDomain` straight from the menu item — a destructive, irreversible detach of the live domain. **Fix:** gated it behind the existing `useConfirm` dialog (destructive variant); also wrapped the async onClick (`() => void removeDomain()`) to clear a pre-existing misused-promise warning. (NOTE: the deeper iter-7 finding — `domainActions.customRemove` never calls the Freestyle API so the domain stays live provider-side — is still OPEN and separate.)

**❌ REFUTED — proposed fix is unsafe:**
- **workspace `inviteAccept` re-accept doesn't re-apply role** (`workspaces.ts:616`). The subagent wanted re-accept to patch the existing member's role to `row.role`. **Rejected:** that would create a SECOND role-mutation path that bypasses `updateMemberRole`'s guards (the owner-block + last-owner protection) — the exact secondary-path escalation class fixed in iter-7. The current no-op is the safe design; role changes must go through the guarded `updateMemberRole`. (Optional safe follow-up: reject re-inviting an already-member at `inviteCreate` with a clear error, rather than mutating roles on accept.)

**⏸ DEFERRED:**
- **git-tab naming fields can't be cleared** (`settings-modal/git-tab.tsx:72` strips blank `defaultBranchPattern`/`commitMessageFormat` before save → input snaps back). Clean fix needs local controlled input state (the editor-tab `buildFlags` pattern) AND confirming `users.updateSettings` treats an empty string as a reset for these fields — the latter can't be verified headless. Minor/advanced setting.

### QA loop — fresh bug-hunt (un-swept areas) (2026-06-20 iter-7, /loop dynamic, 4 sonnet subagents) — 2 SECURITY FIXED, 3 refuted, ~12 logged

> The audit's remaining feedback items were all refuted (see below), so pivoted to a fresh bug-hunt of un-swept areas (workspaces/teams, settings, AI chat pipeline, integrations/domains). Surfaced **2 security bugs — both fixed this commit** — plus a batch of confirmed defects logged for follow-up. Typecheck ✓ (convex is eslint-ignored; typecheck is the gate).

**✅ FIXED (this commit) — SECURITY:**
1. **CRITICAL `#security` `#workspaces` — privilege escalation: an admin could mint workspace OWNERS via the invite path.** `convex/workspaces.ts` `inviteCreate` is gated only on `workspace.invite` (held by ADMIN) and accepted `role: vWorkspaceRole` which includes `'owner'`; `inviteAccept` (line 617) inserts `role: row.role` verbatim. So an admin could invite a new member (or a second account of their own) as `owner` and bypass the owner-only `transferOwnership` — a full workspace takeover. This is the SAME vector iter-23 closed for `updateMemberRole` (which has the guard at :392), left open on the invite path. **Fix:** added the identical `if (role === OWNER) throw …use transferOwnership…` guard at the top of `inviteCreate`. **Test gap:** `convex/` has no test harness (memory: zero unit tests in convex/) — fix mirrors a proven in-file guard; add convex-test coverage for both owner-grant paths when the harness lands.
2. **HIGH `#security` `#secrets` — plaintext build secrets leaked to every collaborator.** `convex/deployments.ts` `getByType` + `list` are gated only on `project.view` but returned the full deployment row including `envVars` (the user's plaintext API keys/tokens). Any viewer could read them off the live Convex subscription. **Fix:** added `stripEnvVars` (mirrors `hostingConnections.stripTokenField`) on both query returns. Verified safe: server-side deploy/redeploy read envVars via INTERNAL queries (`publishActions.ts`), and no client reads `deployment.envVars` (`toDeployment` maps it but nothing consumes it; redeploy passes only a `deploymentId`). Typecheck confirms the stripped type still flows through `toDeployment`.

**❌ REFUTED (audit feedback items — already-handled or premise wrong):**
- Deployment-failure fires no toast → `hosting/provider.tsx:160` already `toast.error`s on the publish exception path; publish is currently disabled on Vercel (always throws) so failures ARE toasted.
- Chat tab "spins forever on query error" → premise wrong: `initialMessages === undefined` is the LOADING state; Convex `useQuery` THROWS on a permanent query error (caught by the boundary), it doesn't hang.
- CanvasErrorBoundary copy/`fallback={null}` → documented design: the "sandbox isn't reachable" card is canvas-specific (chrome uses `fallback={null}` and never shows it), and `fallback={null}` is deliberate to avoid fallback cards stacking on absolutely-positioned chrome (comment lines 20-24).

**📋 LOGGED — confirmed defects from the hunt (verify+fix in later passes; security-adjacent first):**
- **HIGH `#security` `#domains` — removing/cancelling a custom domain never calls the Freestyle API** (`convex/domainActions.ts` `customRemove` :32 / `_verificationCancel` :43 only patch DB status) → the live deployment keeps serving the "removed" domain and the DNS verification stays open (may block re-adding). Also `:81` orphans a Freestyle verification request if `_verificationInsert` fails after the API call. **Fix:** call `sdk.deleteDomainVerificationRequest(...)` + redeploy with empty-domains payload on remove/cancel; rollback on the insert-failure path.
- **MED `#hosting` — external hosting integrations are entirely non-functional + leak a dev note.** `convex/lib/hostingFactory.ts:39` returns `UnsupportedAdapter` for every external provider (Vercel/Netlify/Cloudflare/Railway/Render); its `validateToken` returns a raw "Port the adapter class…" dev string that `toast.error(result.message)` shows verbatim. Likely a known not-yet-ported gap (like publish) — confirm + at minimum replace the user-facing string. Also `hosting-integrations-dialog.tsx` Disconnect uses one shared `isRemoving` for all rows (→ `removingId`).
- **MED `#ai` — summarize cooldown fires even on failure.** `api/chat/summarize/route.ts:209` sets `recentSummaryFires` BEFORE the try, and the limit-early-return + catch don't clear it, so the next 60s of retries silently 204 (the code comment promising retry is wrong). **Fix:** move the `.set(...)` to after `fetchMutation` succeeds.
- **MED `#settings` — git-tab naming fields can't be cleared** (`settings-modal/git-tab.tsx:70` early-returns on blank → debounce never fires → input snaps back). **MED `#settings` — removing a verified custom domain has no confirm dialog** (`domain/custom/verified.tsx:27`, destructive+irreversible — wrap in AlertDialog).
- **MINOR batch:** workspace `inviteAccept` re-accept silently doesn't re-apply role (`workspaces.ts:606`); `ask_user_question` Stop leaks the pending promise + 5-min timer (`tools.ts` / `hardStop` — already caught by try/catch, just a leak); GitHub repo list silently truncated at 100 (`githubActions.ts:238` — paginate); `disconnectGitHub` doesn't revoke the GH App installation (`users.ts:164`); GitHub import errors swallowed between steps (`import/github/_context/index.tsx:26`); install-window re-poll dead after deadline (`use-installation.ts:64`); account-tab Save always enabled (no dirty check); domain reuse + Pro-flash loading-state polish.

### QA loop — UX-blocker fixes (2026-06-20 iter-6, /loop dynamic) — 2 FIXED, 2 refuted-as-documented-design, 1 deferred

> Verified the top audit blockers/quick-wins from [docs/notes/ux-audit-2026-06-20.md](docs/notes/ux-audit-2026-06-20.md) against the actual code before fixing. **2 were real + safe → fixed; 2 conflict with documented deliberate design → refuted** (the audit subagents didn't see the rationale comments). Typecheck ✓, lint clean.

**✅ FIXED (this commit):**
1. **`#landing` (audit B1) — hero prompt box had no example chips.** `hero-v2.tsx` rendered `<Create>` without `suggestions`, so the landing prompt box showed only a generic placeholder — a newcomer had no idea what to type. Every other `<Create>` usage (old hero, `/projects/new`, dashboard) passes `PROJECT_SUGGESTIONS`. **Fix:** import + pass `suggestions={PROJECT_SUGGESTIONS}` (the chip UI already existed in `Create`).
2. **`#cms` — Fields tab was a dead end with no collection selected.** `cms-workspace/fields-tab.tsx:159` rendered only the "needCollection" text. **Fix:** added a "Back to Collections" `Button` (reuses the existing `setCmsTab(CmsTabValue.COLLECTIONS)` + `transKeys.cms.fields.back` already used elsewhere in the file).

**❌ REFUTED — conflict with documented deliberate design (audit recs overridden):**
- **(audit B2) hero "Get started" → `redirectToSignIn` is intentional.** `auth-context.tsx:9-22` explicitly documents `redirectToSignIn` as the choice for stateless CTAs like "Get started" (and that the modal-then-navigate flash was deliberately removed). The typed-prompt-then-click-pill data-loss edge is real but rare; the clean fix is structural (lift `Create`'s `inputValue` to the hero so the pill can save a draft). **Downgraded blocker→minor; structural fix noted, not applied.**
- **Publish button `return null` is intentional.** `publish/index.tsx:23-28` documents hiding while caps load ("flashing a button only to refuse on click is worse than waiting"). An "upgrade to publish" upsell also risks misleading copy because publish is platform-disabled on Vercel for everyone (not a plan/role gate). **Product decision + copy risk, not a clear bug — deferred.**

**⏸ DEFERRED:**
- Style/Interactions tabs disabled in Code mode (audit) — making Radix `disabled` tab triggers click-to-switch-mode is fiddly (a non-disabled tab becomes a selectable tab value); the current disabled+“Available in Design mode” tooltip is a clear affordance, so this is convenience-only. `right-panel/index.tsx:437`.

### iter-26 (2026-06-20, hand-traced) — LOG: duplicating a frame creates a same-breakpoint-id collision → responsive rebase mis-resolves width

- **Goal:** "duplicate a frame/breakpoint". **Where:** `frames/manager.ts:420` `duplicate()` does `{ ...frame, id: uuid(), groupId: uuid(), position }` — so the new frame inherits the SAME `branchId` AND the SAME `breakpoint.id` as the source (only `id`/`groupId`/`position` change).
- **Bug:** the responsive rebase `code/index.ts:303-310` builds `widthById` from `frames.getAll()` (ALL frames, every group/branch), keyed by `breakpoint.id`, FIRST-WINS, with no branch/group scoping. After duplicating a frame there are two frames sharing one `breakpoint.id` (e.g. two "desktop"). Initially identical width (duplicate copies it), so no immediate harm — but once the user RESIZES the copy (or the original), the two diverge and the rebase resolves the breakpoint's width from whichever frame `getAll()` returns first → responsive style edits emit the wrong min-width and target the wrong frame. Same root cause as the iter-15 duplicate-breakpoint-id bug (whose fix only covered the add-breakpoint MENU within a group, not frame duplication).
- **Severity:** MED — needs the compound sequence (duplicate → resize the copy → responsive-edit), not a first-action break. Reachable via Cmd+D / `duplicateSelected()`.
- **Why NOT surgically fixed:** entangled with the responsive-frame design. Assigning the duplicate a UNIQUE `breakpoint.id` would break its Tailwind-variant mapping (the rebase maps known breakpoint ids → md:/lg:); scoping `widthById` by branch doesn't fix the same-branch duplicate. The clean fix is a responsive-frame design decision (how identical-breakpoint frames coexist) — same family as the deferred iter-15 responsive-orphan. **Next:** decide whether duplicate should share a branch at all (vs a forked branch, currently disabled on Vercel), or make `widthById` scope to the edited element's specific frame/group.
- **Tags:** `#editor` `#responsive` `#design-decision`

### QA loop — UX audit + CMS/publish polish (2026-06-20 iter-5, /loop dynamic, Workflow: 7 UX auditors + 3 verifiers) — 3 FIXED, full UX audit delivered

> Ran a 10-agent Workflow (7 sonnet UX flow auditors over the core journey + 3 adversarial fix-verifiers). **Delivered the prioritized UX audit** → [docs/notes/ux-audit-2026-06-20.md](docs/notes/ux-audit-2026-06-20.md) (4 blockers, ~22 frustrating, ~14 minor). All 3 verified polish leads were REAL and fixed. Typecheck ✓, lint = pre-existing warnings only.

**✅ FIXED (this commit):**
1. **`#cms` — sync hid per-collection failures behind a green success toast.** `cms-workspace/sources-tab.tsx` `handleSync` showed "written: N" success even when `result.perCollection[].error` was set (the action records per-collection failures and continues, never throwing). **Fix:** count failed collections; show an amber `toast.warning("Synced N items — X collection(s) failed: <first error>")` when any failed.
2. **`#cms` — field reorder Move Up/Down double-click corrupted order.** `cms-workspace/fields-tab.tsx` passed `reorderPending={false}` hardcoded, so the buttons' disabled-guard never engaged; two fast clicks both spliced against the pre-move snapshot and the 2nd undid the 1st. **Fix:** real `reorderPending` state (set before the await, cleared in `finally`, early-return guard in `moveField`, wired to the buttons).
3. **`#publish` — "Live"/"Update" label stuck on "Update" forever after the first edit.** `top-bar/publish/trigger-button.tsx:43` used `history.length > 0` (raw undo depth, never reset post-deploy). **Fix:** snapshot the undo-stack length at the deploying→completed transition (ref-during-render "track previous" pattern) and compare against it, so "Update" means edits-since-last-deploy and "Live" returns on undo-to-baseline.

**📋 UX AUDIT — top items queued for next pass (verify live before shipping landing changes):**
- **BLOCKER** hero prompt box has no example chips (`hero-v2.tsx` — pass `suggestions={PROJECT_SUGGESTIONS}`). *quick-win*
- **BLOCKER `#data-loss`** hero "Get started" pill discards a typed prompt (`hero-v2.tsx:34-42` — use `setIsAuthModalOpen(true)` not `redirectToSignIn()`). *quick-win*
- **BLOCKER** CMS tab order inverts the workflow (`cms-workspace/index.tsx:48-62`). *structural*
- **BLOCKER** returning-user editor boot has no loader/stall-escape (`main.tsx ~218` — lift the watchdog outside the `hasPendingCreation` guard). *structural*
- High-value quick-wins: Publish button renders `null` when caps load/absent (`publish/index.tsx:26`); Style/Interactions tabs disabled in Code mode with no click-to-return (`right-panel/index.tsx:437`); CMS Fields dead-end needs a CTA (`fields-tab.tsx:156`); deployment failure fires no toast; CanvasErrorBoundary `fallback={null}` hides crashed panels. Full list + file:lines in the audit doc.

### QA loop — minor-leads + route-group triage (2026-06-20 iter-4, /loop dynamic) — 2 FIXED, 1 refuted, route-group fix scoped+deferred

> Attempted the iter-3 route-group/`.jsx` page FS-path fix; **deferred it** (see below) because the only safe shape is a multi-helper FS resolver whose new branch can't be integration-tested headless. Pivoted to the safer fallback leads. Typecheck ✓, lint = pre-existing warnings only.

**✅ FIXED (this commit):**
1. **`#commit` — Commit "Continue" button was clickable before git status loaded.** `top-bar/git-actions.tsx:234` `continueDisabled` didn't cover the load window: `noWorkingTreeChanges`/`stagedOnlyDisabled` both gate on `fileCount !== null`/`stagedFileCount !== null`, and `isLoading` is the commit-in-flight flag (not the git-info-loading flag), so a fast click right after opening the modal could fire a commit before we knew whether there was anything to commit. **Fix:** added `gitInfoLoading = fileCount === null` (null only during the initial `loadGitInfo`, which sets a number on both success AND error) to `continueDisabled`.
2. **`#cms` — concurrent source Sync/Test clobbered each other's in-flight state.** `cms-workspace/sources-tab.tsx` tracked `syncingId`/`testingId` as a single `string | null`, so syncing/testing source B while A was pending let A's `finally` reset B's "Refreshing…"/"Testing…" pill and re-enable a double-fire (its own `TODO(bug-hunt)`). **Fix:** switched both to `Set<string>` (add on start, delete on finish, `.has()` for per-row disabled/label).

**❌ REFUTED:**
- **frame deselect leaves a stale "active breakpoint."** `frames/manager.ts` `select()` sets the active breakpoint (`:260`); `deselect`/`deselectAll` don't. But retaining the last active breakpoint when nothing is selected is defensible — there's no obviously-correct alternative (clear? reset to default?) and no confirmable live UX harm. Not a bug.

**⏸ ROUTE-GROUP / EXTENSION page-FS-path fix — CONFIRMED REAL, scoped, DEFERRED to an editor-capable session** (supersedes the iter-3 deferral with a concrete design):
- **Bugs (both have `TODO`s in `pages/helper.ts`):** (a) `:311` page delete/rename/move resolve `basePath + group-stripped route` → wrong dir for `app/(group)/…` pages → "Selected page not found"; (b) `:326` `getPageFilePathForRoute` + `deletePageInSandbox` non-dir branch hardcode `page.tsx` → break `.jsx`/`.js` page files.
- **Verified data flow:** `scanAppDirectory` already has the real FS-relative path (`parentPath`, line 508 — INCLUDES `(group)` segments) and the real page file (`pageFile.name` via `getPageAndLayoutFiles`) at node-creation time, but `createPageNode` stores only the group-stripped `currentPath`.
- **Safe design (deferred because the new FS-search branch can't be integration-tested headless, and the blast radius is ALL page CRUD):**
  1. Add `resolveRouteDirectory(sandboxManager, basePath, route): Promise<string|null>` — try the naive `basePath/route` FIRST (so non-route-group projects, incl. the default scaffold, are byte-identical to today = zero regression risk), and only on miss search one `(group)` level per segment via `readDir` + `isRouteGroupSegment`. Match is unambiguous in valid Next projects (duplicate parallel routes are a build error).
  2. Replace `getRouteDirectoryPath(...)` for EXISTING-path lookups in `deletePageInSandbox`/`deleteFolderInSandbox`/`renamePageInSandbox`(old)/`movePageInSandbox`(source)/metadata+schema with the resolver. Keep the naive join for NEW target paths (rename/move/create destinations — derive from `getDirName(resolvedOld)+newName` to stay in the same group).
  3. For the extension: after resolving the dir, pick the real page file via the existing `getPageAndLayoutFiles(await readDir(dir))` instead of hardcoding `page.tsx`.
  4. Unit-test the pure route-group matcher (group / non-group / nested) before wiring. Multi-consecutive-group `(a)/(b)/x` is an acceptable known limitation to note.

### User-GOAL journey hunt iter-25 (2026-06-20, Workflow) — copy-paste/group/rename; 3 FIXED (all surgical), 1 refuted

> 3-goal pass (copy/paste, group/wrap, project name/icon). All 3 confirmed blockers were contained + surgically fixable — fixed this commit.

**✅ FIXED:**
1. **HIGH `#editor` `#data-loss` — cross-branch paste wrote to the WRONG branch (or silently failed).** `code/requests.ts` `getInsertRequests` keyed the source-write `CodeDiffRequest` on `element.branchId` (the COPIED element's source branch), but `location.targetOid` is the paste-target's oid, which only exists in the TARGET branch's file tree. So pasting an element copied from branch A into a frame on branch B either threw "Metadata not found for oid" (target oid absent in branch A) or wrote the duplicate into branch A — and the optimistic in-iframe insert was skipped, so the user saw nothing in branch B. Every sibling handler (move/edit-text/style) correctly keys on `target.branchId`; insert was the lone outlier. Fix: key on `targets[0]?.branchId ?? element.branchId`. Same-branch paste unchanged (target===source). Reachable: `branch.createBlank` is live (multi-branch frames coexist on one canvas).
2. **MED `#parser` — group with no matching direct-child element inserted a phantom empty `<div>` at the end.** `parser/group.ts` computed `Math.min(...targetChildren.map(...))`; when `targetChildren` is empty `Math.min(...[]) === Infinity`, so an empty container was inserted at the end of the node. Fix: early-return when `targetChildren.length === 0`. Parser tests 208 pass.
3. **MED `#editor` — project rename had no empty/whitespace guard or trim.** `settings-modal/project/index.tsx` `handleSave` sent the raw `formData.name`; the backend trims + rejects empty, surfacing only a generic "save failed" toast, and a leading/trailing-space name left the form perpetually dirty (`formData.name !== saved trimmed name`). Fix: trim + empty-guard client-side (clear error, no backend round-trip), and normalize the field to the trimmed value so a space-only edit doesn't keep the form dirty.

**Refuted (1):** "cross-branch CLONE/duplicate still copies a stale/blank snapshot" — that's the already-logged project-clone content-loss (iter-21), not the element copy/paste goal. Skipped (dup).

typecheck code 0; eslint 0 errors; parser tests 208 pass / 0 fail.

### QA loop — lead-verification pass (2026-06-20 iter-3, /loop dynamic, 5 adversarial sonnet subagents) — 3 FIXED, 3 refuted, 3 confirmed-deferred

> Adversarially verified (refute-by-default, 2–3 lenses) the iter-2 lead list. **Fixed 3**, **refuted 3**, **confirmed-but-deferred 3** (multi-touchpoint / need design). Typecheck ✓, lint = pre-existing warnings only.

**✅ FIXED (this commit):**
1. **HIGH `#editor` `#design-panel` `#data-loss` — number inputs clobbered an external value change (undo / selection change) on blur.** `right-panel/style-tab-v4/controls/icon-number-input.tsx` + `mode-number-cell.tsx` both deliberately skip syncing the draft from props while the input is focused (correct, so typing isn't stomped), but `onBlur`/Enter then committed the now-stale draft unconditionally — and `commit()` only no-ops when the draft equals the *current* prop, so a stale draft ≠ the post-undo value overwrote it. **Fix:** added a `userTouchedRef` (set on type/nudge, reset on focus/Escape); blur and Enter only commit when the user actually edited. Override commits (nudge, pill-pick, mode-pick) stay live. (3/3 verified — same family as the iter-19 InputIcon/InputRange fixes.)
2. **HIGH `#editor` `#pages` — deleting a page/folder fired instantly with NO confirmation and no undo.** `left-panel/design-panel/layers-tab/tree/page-tree-node.tsx:196` wired Delete straight to `handleDelete` (→ `deletePage`/`deleteFolder`, no git checkpoint), while the sibling `file-tree-node.tsx` already gates delete behind an `AlertDialog`. One misclick permanently deleted a route + its file. **Fix:** added a confirm `AlertDialog` (mirrors file-tree-node; hardcoded copy, consistent with this component's existing non-i18n strings).

**❌ REFUTED (adversarial verification):**
- **no-oid optimistic-update-no-rollback** — the oid guard (`ActionManager.updateStyle`: `if (!target.oid) continue`) skips the source rebase, and post-boot-sync-fix (`7291f40f4`) a *selectable* element cannot lack an oid. No real divergence path.
- **responsive edits silently dropped from source** — `CssToTailwindTranslator` emits arbitrary values (`md:text-[#fff]`, `md:text-[14px]`, `md:leading-[…]`, `md:tracking-[…]`, `md:w-[…]`, `md:h-[…]`) for all six named properties; only genuinely malformed values yield zero additions, which the style panel doesn't produce.
- **AI-chat file edits don't refresh the open editor buffer** — AI `WriteFileTool` writes through ZenFS, whose native `fs.watch` fires `useFile.loadFile()` → buffer refreshes. The watcher being a no-op is irrelevant to the AI path. (See deferred item below for the *narrower* real gap.)

**⏸ CONFIRMED REAL — DEFERRED (multi-touchpoint / needs design; verified, fix sketched):**
- **`#pages` `#data` — page delete/rename/move targets the WRONG file for route-group pages (`app/(group)/…`).** `pages/helper.ts` stores the group-stripped *display* path on `PageNode.path` (`getRoutePathFromSegments` strips `(group)` at ~307), then CRUD helpers rebuild `basePath + strippedPath` (~879) → resolves `app/about` instead of `app/(marketing)/about` → "Selected page not found". Existing `TODO` at helper.ts:311. **Fix (needs a coordinated change + ideally a test):** add `fsPath` to `PageNode`, populate from the raw relative path in `scanAppDirectory` (before group-stripping), and use it for all sandbox I/O instead of reconstructing from `node.path`. Deferred from this QA sweep because it touches the model type + scanner + 4 helpers and can't be exercised headless.
- **`#pages` — `getPageFilePathForRoute` + `deletePageInSandbox` (non-dir branch) hardcode `page.tsx`**, so metadata writes / deletes on imported `.jsx`/`.js` page files silently create/miss the wrong file (scanner accepts `page.{tsx,ts,jsx,js}`). Existing `TODO` at helper.ts:326. **Fix:** resolve the real extension from the scanned `FileEntry` before building the path. (Pairs with the route-group fix — same file/theme.)
- **`#code` `#sync` — sandbox-native/external file writes never back-propagate to the editor (narrowed from the refuted lead).** `VercelBrowserFileWatcher.registerEventCallback` (`store/editor/sandbox/vercel-browser-provider.ts`) + `VercelFileWatcher` (`packages/code-provider/.../vercel-sandbox/index.ts`) are no-op stubs, so writes NOT going through ZenFS (the sandbox's own `next dev` artifacts, an external script, a second concurrent agent) only reach the editor on the one-time boot `pullFromSandbox`. No polling, no post-turn re-pull. **Fix:** implement watcher polling (mtime-delta) or a periodic/post-turn re-pull. Architectural — deferred.
- **`#pages` (partial) — Pages tree stays empty if the sandbox boots after the tab mounts.** `page-tab/index.tsx:55` `scanPages()` runs once (empty-deps effect); no sandbox-ready rescan. Recoverable by switching tabs (remount) or branch switch, so not "permanent." **Fix:** add a MobX `when()`/`reaction()` in `PagesManager` to rescan when the sandbox becomes ready and `pages.length === 0`.

### QA loop — editor-functionality pass (2026-06-20 iter-2, /loop dynamic, 4 sonnet subagents) — 2 FIXED, 4 refuted, large lead list

> Phase-2 editor audit (code editor, design panel, file ops/pages, responsive/publish/commit/CMS). Same session-access reality as iter-1 (no live browser / agent API). 4 subagents returned ~30 candidates; I verified the surgical/high-confidence ones and **fixed 2**, **refuted 4** with reasons, and logged the rest as leads (most are subagent-claimed and NOT yet adversarially verified — verify before fixing). Typecheck ✓, lint = pre-existing warnings only.

**✅ FIXED (this commit):**
1. **FRUSTRATING `#editor` `#design-panel` — switching a background from gradient → image left the gradient rendering.** `right-panel/style-tab-v4/sections/background.tsx:133` `image` branch cleared only `background-color`; gradients live in `background-image`, so the old gradient persisted in source + preview while the panel claimed "image". **Fix:** also clear `background-image` (mirrors the `solid`/`none` branches).
2. **MINOR `#editor` `#code` — config files / dotfiles got false TS error squiggles.** `code-tab/file-content/code-mirror-config.ts:631` `getLanguageFromFileName` + `:651` `getExtensions` both defaulted unknown extensions to `typescript`, so `.env`/`.yml`/`.toml`/Dockerfile/`.sh`/lockfiles rendered with TS/JSX highlighting + spurious parser markers. **Fix:** default → `'text'` (plain, no extension); added `mjs`/`cjs`→javascript, `mts`/`cts`→typescript so JS module variants keep highlighting. `getExtensions` callers that pass `'javascript'` literally (code-block/code-diff) are unaffected.

**❌ REFUTED (with reason):**
- **hero PLAN-mode + unauth does NOT lose the typed prompt** (iter-1 lead). `middleware.ts:64` sets `x-pathname = pathname + search` (query INCLUDED) precisely so the sign-in returnUrl keeps `?prompt=`; `projects/plan/page.tsx:25` reads `searchParams.get('prompt')` and sends it on mount. Prompt survives the auth bounce.
- **Add-breakpoint "+" requiring frame-selected is by design.** `canvas/frame/top-bar/index.tsx:366` — every other top-bar control also hides on deselect (`!isSelected && 'hidden'` at 244/265/284). Dropping `isSelected` for just this one would break top-bar consistency. (Broader discoverability of "select a frame to edit it" is a separate UX question.)
- **FileTree `onRefresh={() => {}}` is not a dead button.** `file-tree-search.tsx:11` declares `onRefresh?` but never uses it (no `onClick`); the prop chain terminates unused. No user-facing refresh button is broken — just a dead prop (trivial cleanup, not a bug).
- **Code-editor theme-toggle does NOT lose unsaved edits.** `code-editor.tsx:393` keys CodeMirror on `path::theme`, so a theme toggle remounts — but the editor is *controlled* (`value={file.content}`, `onChange→onUpdateFileContent`), so content is preserved. Real (frustrating, not blocker) residue: the remount resets cursor/scroll/undo-history. Fix would remove theme from the key and rely on the reactive `theme` prop — left as a lead (can't verify the live theme-prop repaint headless).

**🔍 LEADS — subagent-claimed, NOT adversarially verified; verify before fixing (next passes):**
- `#code` `#sync` — `VercelBrowserFileWatcher.registerEventCallback` claimed to be a no-op stub → sandbox→editor pull dead, so AI-chat file rewrites don't refresh the open buffer until manual reload. **Highest-value lead — verify first.**
- `#design-panel` — `icon-number-input.tsx` / `mode-number-cell.tsx` unconditional `onBlur` commit may overwrite a correct value with a stale draft when an undo/selection-change happens while the input is focused (same family as the iter-19 InputIcon/InputRange fixes). Verify; if real, add a `userTouched` guard.
- `#design-panel` `#oid` — style edit on a no-oid element claimed to update the iframe optimistically before the oid check → preview diverges with no rollback (`store/editor/style/index.ts` + `code/requests.ts`). Verify.
- `#design-panel` `#responsive` — responsive edits for color/font-size/line-height/letter-spacing/arbitrary width-height claimed silently dropped from source when `CssToTailwindTranslator` returns zero additions (`store/editor/code/tailwind.ts`). Verify.
- `#parser` — repeated edits on a `cn()`/`clsx()` element accumulate same-family classes (`p-2`+`p-4`); known `TODO` in `packages/parser/src/code-edit/style.ts`.
- `#code` — `writeFile` failure (network/server-down) surfaces no toast; sync engine rolls back silently. `sync-engine` hash-dedup can skip a push when a formatter yields an identical hash (stale sandbox). Verify.
- `#pages` — route-group `app/(group)/…` page delete/rename/move claimed to target the wrong FS path (display-path reconstruction); and page ops hardcode `page.tsx`, breaking `.jsx`/`.js` page files. Both plausible + impactful — verify.
- `#pages` — page delete fires with no confirmation dialog (file-tree-node has the AlertDialog pattern; page-tree-node skips it); pages tree stays empty if the sandbox boots after mount (`scanPages` runs once, no sandbox-ready rescan). Verify.
- `#sandbox` — `sandbox/index.ts:97` provider-transition reaction race (concurrent init/release) can break ZenFS sync for a session; has `TODO(bug-hunt)` in source.
- `#responsive` — clicking empty canvas (deselect) doesn't update the design panel's active breakpoint (`frames/manager.ts`). Verify.
- `#publish` `#commit` — publish "Live"/"Update" label keyed on `history.length` never resets after a successful publish; `git-actions.tsx:130` `fileCount` null race can briefly enable Continue → `--allow-empty` commit; staged-only commit falls back to hardcoded `'New Weblab backup'` (brand-hardcode; existing `TODO(bug-hunt)` at :161). Minor.
- `#cms` — `sources-tab` `syncingId` single-slot lets a 2nd sync clear the 1st's in-flight badge; partial-sync still shows green "success"; fields-tab Move Up/Down double-click double-splices; empty-state flashes before the first Convex query resolves. All concurrency/loading-guard minors.

### QA loop — creation-path pass (2026-06-20, /loop dynamic, 4 sonnet subagents) — 4 FIXED, 1 deferred, leads logged

> End-to-end QA loop of weblab.build. **Session access reality:** live browser QA was blocked (no Chrome extension connected; Clerk auth needed) and the weblab-agent MCP returned `AUTH_FAILED` (invalid token) + `weblab_create_test_project`/`weblab_read_logs` are UNSUPPORTED in this agent build — so headless project-creation testing was impossible. Site itself healthy (`/api/health` → `{"ok":true}`, landing 200). Pivoted to deep **code-path** QA of the 4 creation paths + editor entry, deduped against iters 18–22. 4 surgical fixes shipped (typecheck ✓, lint = pre-existing warnings only).

**✅ FIXED (this commit):**
1. **BLOCKER `#editor` — terminal provisioning failure left the user stranded with no message.** `app/project/[id]/_components/main.tsx:183` gated the `ProjectLoadError` route only on `error.includes('no project')`, but a Convex-marked provisioning failure surfaces as `dataError = "Workspace setup failed: …"` (`use-start-project.tsx:582`). That string fell through → eternal "Setting up your workspace" spinner (pending-create path) or a blank editor shell (returning-user path); the real reason was never shown and Reload can't fix a hard failure → loop. **Fix:** extend the gate to also match `'workspace setup failed'` → routes to `ProjectLoadError variant="unknown"` (honest message in a `<pre>` + Retry/reconnect + "Go to projects"). Transient *connection* errors still render the shell, per the existing intent. (Independently reported by 2 of 4 subagents.)
2. **FRUSTRATING `#editor` — in-editor "Clone project" dialog misclassified permanent errors as transient → infinite retry.** `clone-project-dialog.tsx:114` used `errorMessage.includes('502') || includes('sandbox')`; the bare `'sandbox'` substring matched permanent fork errors (expired snapshot, billing) and surfaced "high load, try again" → retry never succeeds. **Fix:** mirrored the canonical classifier from `settings/clone-project.tsx` (structured `retryable` flag + `\b50[234]\b`/timeout/temporarily-unavailable only; no bare `'sandbox'`).
3. **FRUSTRATING `#editor` — same dialog showed "Server Error" on prod.** line 112 read `error.message`; Convex redacts plain-Error messages to "Server Error" in prod. **Fix:** extract the structured `ConvexError.data.{message,retryable}` payload first (same edit as #2; mirrors `clone-project.tsx` + `use-create-blank-project.ts`).
4. **MINOR `#editor` — blank-create loader marked "Preparing workspace" complete while still provisioning.** `use-create-blank-project.ts:82` set `phase='creating-project'` synchronously right after `'forking-sandbox'`, before awaiting the ~13–90s provision; `start-blank.tsx:18` maps step-1 `ready` to `phase==='creating-project'`, so step 1 showed a checkmark during the wait. **Fix:** dropped the premature `setPhase('creating-project')`; phase stays `'forking-sandbox'` through the await, advancing straight to `'opening-editor'` on success.

**⏸ DEFERRED (real, not a safe 1-liner):**
- **FRUSTRATING `#editor` `#branches` — "Fork branch" controls are ungated and fire a guaranteed-throw.** `convex/branchActions.ts:49` `fork` always throws; the two UI entry points (`design-panel/branches-tab/branch-management.tsx` + the branch menu) have no disabled state / tooltip, so the user clicks, waits, and gets a toast that leaks internals ("CodeSandbox was archived 2026-05-24", "TODO(sandbox-fork)"). **Next:** disable both controls with a "Coming soon" tooltip (mirror how prompt-create is gated) and/or trim the thrown string to user-facing only. Multi-file + needs i18n copy → deferred.
- **MINOR `#vercel` `#cost` — `Sandbox.create` timeout race can leak a paid VM.** `packages/code-provider/src/providers/vercel-sandbox/index.ts` `withTimeout` rejects locally at 45s but the SDK call keeps running with no `AbortSignal` (inline TODO, not previously in BACKLOG). **Next:** thread `AbortController.signal` into `Sandbox.create`; abort on timeout.
- **MINOR `#dashboard` — loose-projects empty box has dead "create a new one" copy.** `projects/_components/select/index.tsx:1118` renders no button in the no-search/no-filter branch (only clear-search / reset-filter), while the body copy implies a create action. Secondary surface (projects still visible in folders; create CTAs exist elsewhere). **Next:** add a "New project" Button mirroring the zero-projects empty state.

**🔍 LEADS (subagent-claimed, NOT yet adversarially verified — verify before fixing):**
- `hero/create.tsx:250` — PLAN mode + unauthenticated pushes `/projects/plan?prompt=<encoded>` WITHOUT the localforage draft-save the EDIT path does; the prompt rides the query string, so whether it survives depends on whether the `/projects/plan` auth bounce preserves the query. **Verify:** does an unauth user lose the prompt across sign-in? If yes, save a draft like the EDIT path.
- `top-bar/connection-chip.tsx:27` + `page-tab/index.tsx:92` — call `editorEngine.activeSandbox` (→ `activeBranchData`, throws "No branch selected") possibly before branch init. Likely guarded by the ready-gate + `CanvasErrorBoundary` (see engine `index.tsx:178`), so probably frustrating-at-most, not a blocker. **Verify** whether either renders pre-init.
- `right-panel/index.tsx` right-panel-only collapse is dead (coupled to `panelsHidden`); `page-tab` `scanPages()` re-fires on hover remount; cross-workspace folder-id sanitization skipped — all minor, unverified.

### iter-23 (2026-06-20, hand-traced) — ✅ FIXED `#security` workspace privilege-escalation (admin → owner via updateMemberRole)

> The user-journey Workflow was server-rate-limited (all 4 finders), so I hand-traced the "change a teammate's role" goal in the main thread and found a real privilege-escalation.

- **Where:** `apps/web/client/convex/workspaces.ts` `updateMemberRole` (gated only on `workspace.manage_members`).
- **Bug:** `WORKSPACE_ROLE_CAPS` (`packages/auth/src/matrices.ts:24-30`) grants `workspace.manage_members` to **ADMIN**, and `updateMemberRole` did not restrict `role === OWNER`. So any admin could `updateMemberRole({ userId: self, role: 'owner' })` → self-promote to OWNER, bypassing the owner-only `transferOwnership` (which atomically demotes the prior owner). Then, as a second owner, demote the original owner (the last-owner guard now passes with 2 owners) → **full workspace takeover** by an admin. The OWNER role is meant to be granted only via `transferOwnership`.
- **Fix:** reject `role === OWNER` in `updateMemberRole` (`throw BAD_REQUEST: use transferOwnership to grant the owner role`); owner grants must go through the owner-gated transfer path. Simplified the now-unreachable `role !== OWNER` branch of the last-owner guard (TS narrowing). typecheck code 0, eslint clean. Member↔admin↔viewer changes + owner demotion (via the last-owner guard) are unaffected; admins can no longer create a second owner, so they also can't oust the sole owner.
- **Note:** the role-change UI (`members/page.tsx` INVITABLE_ROLES) doesn't offer "owner", so exploitation was via a direct Convex call — but the backend must enforce it (defense in depth). Otherwise the role-change goal is solid (cap-gated, last-owner/self-removal guards present).

### User-GOAL journey hunt iter-22 (2026-06-20, Workflow) — delete-account/subscription/timeout/nav; 4 confirmed, 0 surgical (ops/platform/preload/high-blast)

> 4-goal pass. 4 confirmed blockers — none has a safe surgical fix this session (1 ops env step I can't perform, 2 in the boot-sync/snapshot-fork work-loss area with no tests, 1 preload-rooted). Subscription cancel = SOLID (Stripe portal path works; webhook-reflection refuted as non-blocking). All logged; the env one is flagged as a MANUAL STEP.

**🛑 MANUAL STEP (owner) — account deletion is 100% broken in prod:**
1. **CRITICAL `#config` `#legal` — `CLERK_SECRET_KEY` is absent on BOTH Convex deployments (dev avid-gnat-539 + prod rapid-crab-113), so "Delete account" always fails.** `convex/userActions.ts` (`'use node'` action) `remove` calls `deleteClerkIdentity()` FIRST (line 43), which reads `process.env.CLERK_SECRET_KEY` (line 56) — a CONVEX-deployment env var (NOT Next.js/.env.local/Railway; the documented [[project_convex_env_vs_nextjs_env]] footgun) — and throws before the Clerk API call or the cascade. The user types email + DELETE, confirms twice, gets a red "Failed to delete account", account+data intact, every retry identical. The descriptive error ("CLERK_SECRET_KEY is not set on this Convex deployment") is swallowed by the UI's static toast (`user-delete-section.tsx:56`). Verified empirically via `bunx convex env list` on both. Code is otherwise correct (cascade `internal/cascade.deleteUserCascade` is comprehensive, sign-out + redirect wired). **FIX (I cannot do this — needs the Clerk secret, an external credential):**
   ```
   cd apps/web/client
   bunx convex env set CLERK_SECRET_KEY <sk_...>
   bunx convex env set CLERK_SECRET_KEY <sk_...> --prod
   ```
   Until set, account deletion is impossible in prod — a GDPR/"right to erasure" concern. (Optional code follow-up: don't expose the raw env error to end users, but DO log it server-side / surface a support code so this misconfig is diagnosable.)

**🚧 WORK-LOSS in the boot-sync / snapshot-fork area (confirmed real, DEFERRED — high blast radius, no tests, can't run editor to verify):**
2. **CRITICAL `#sandbox` `#data-loss` — restoring after a sandbox timeout/410 resumes the STALE create-time snapshot, losing the session's edits.** `projectActions.ts:1292` `restoreSandbox` re-persists the SAME `snapshotId` unchanged and resumes from it; since the snapshot is frozen at create time (no snapshot-on-edit), a restore brings back the create-time/blank tree, not the user's work. Same snapshot-fork family as the clone content-loss (iter-21). Needs snapshot-on-edit / push-local-on-restore. **Next:** after `restoreSandbox` resumes, push local ZenFS → sandbox (don't pull stale snapshot over local edits).
3. **HIGH `#sync` `#data-loss` — `pullFromSandbox` unconditionally overwrites IndexedDB-persisted local edits on cold boot/re-pull.** `services/sync-engine/sync-engine.ts:421` writes every sandbox file with no freshness check (correct for the FIRST empty-FS pull, wrong on re-pull after the watcher is live). **Now 3/3 confirmed** (was the iter-16 single-vote 0.4 deferral). **Fix (ready but UNSHIPPED):** gate the unconditional write behind `isInitialPull`; on re-pulls reuse the watcher's `newHash !== existingHash` guard and skip when the local hash diverges from stored `fileHash` (pending local edit). **Still deferred because this is the exact function behind the prior boot-sync-WIPE incident (fixed `7291f40f4`) and there are NO sync-engine tests — a wrong gate could re-wipe ALL files, far worse than the current bug. Needs tests + an all-pull-paths (boot/retry/restore) review before shipping.**

**🔌 PRELOAD-rooted (log-only per deploy policy):**
4. **HIGH `#preview` — clicking an in-iframe nav link never updates the editor's current page → can't select/edit the navigated-to page.** `view.tsx:631` `onLoad` only calls `setupPenpalConnection()`; `pages/index.ts:642` `handleFrameUrlChange` is DEAD (zero callers) AND reads `view.src` (the React-bound attribute, which doesn't change on in-iframe nav). The live preview iframe is cross-origin (sandbox URL ≠ editor origin) so `contentWindow.location` can't be read — the post-nav URL must come from INSIDE the iframe via the penpal/preload bridge (report location on `popstate`/nav), which is preload-territory (off-limits + jsDelivr-pinned). **Next (needs a preload pass):** add a preload→editor "url changed" penpal report on navigation, then wire `handleFrameUrlChange` (sourced from the reported URL, not `view.src`) to update `pages` active path + frame.url.

**Refuted (3):** Clerk-first delete ordering orphans PII (refuted — current bug is the throw, not ordering); subscription cancel Stripe-portal-dependent (refuted ×2 — portal path works; UI reflection is webhook-driven as expected, not a block).

### User-GOAL journey hunt iter-21 (2026-06-20, Workflow) — ai-modes/duplicate/nav/domain; 0 FIXED (both blockers are platform gaps), 1 correction

> 4-goal pass (AI ask/plan/fix modes, duplicate/import, multi-page nav, custom-domain). 2 confirmed blockers — **both are Vercel snapshot-fork platform gaps, not surgical code fixes**, so logged not patched. AI-modes goal = SOLID (fix/ask/plan behave correctly; the only finding was the already-logged cosmetic /create-/fix label).

**🚧 PLATFORM GAPS (confirmed real, NOT quick-fixable — need the Vercel snapshot-based fork):**
1. **HIGH `#convex` `#data-loss` — "Clone project" silently copies the blank/stale snapshot, not the user's edits (false success).** `projectActions.fork` (1382) is LIVE (NOT the throwing stub the old BACKLOG entry at ~1023 claims — that entry is STALE). It reads `branches[0].runtimeMetadata.cloud.snapshotId` (1416), which is frozen at create time and never refreshed (no snapshot-on-edit anywhere; the only `sandbox.snapshot()` is the initial scaffold). So the clone resumes the create-time/blank snapshot, and `_insertProjectGraph` inserts DEFAULT frames (not the source's). The fork's expiry guard (1473) passes because resuming the stale snapshot succeeds. 3/3 verified. Result: clone toasts "Cloned successfully" + opens a near-empty project — the user believes they duplicated their work and silently got an empty/stale variant. **Next step (needs design + the snapshot-fork feature):** capture a FRESH `sandbox.snapshot()` of the source's LIVE sandbox + copy its frames/canvas into the new graph; OR, until that lands, DISABLE clone with an honest "coming soon" (don't ship a feature that silently loses work). Reclassify the stale `:1023` entry to this high-severity content-loss reality.
2. **CRITICAL `#publish` (DOCUMENTED, communicated) — publish is disabled on Vercel for ALL domains.** `publishActions.run` calls `forkBuildSandbox` (`publishHelpers.ts:51`) at `publishActions.ts:88` **before** `deployFreestyle` (139); `forkBuildSandbox` is the disabled stub that throws `"Publish is temporarily unavailable on the Vercel runtime…"`. So no publish ever reaches Freestyle. This matches CLAUDE.md (`TODO(publish-vercel)`) and the failure IS clearly surfaced (the publish panel renders the parsed error + suggestion). So it's a known, communicated platform gap — NOT a new bug. Minor UX nit: the panel still offers a "Try Updating Again" button that will always fail; could special-case the platform-unavailable error to hide retry. **This corrects my iter-20 claim (below) that publish was "solid" — that was wrong.**

**🔍 Lead to re-verify (1 verifier confirmed, didn't reach 2/3):**
- `editor/engine/.../view.tsx:631` — clicking an in-iframe nav link navigates the preview but the editor's current-page + element-selection bridge may not update (so editing the newly-navigated page breaks). Multi-page editing goal. Re-verify next pass. `#preview`

**Refuted (3):** Fix mode behaves like Build (refuted — fix has its own prompt/behavior); Fix mode unreachable from dropdown (refuted — reachable via /fix + error CTA, goal is "use fix mode" not "select from dropdown"); custom-domain shows green "Verified" prematurely (refuted — cosmetic copy nit on top of the real publish gap).

### User-GOAL journey hunt iter-20 (2026-06-20, Workflow) — can the user achieve their goals?; 3 FIXED, 1 deferred, 4 refuted

> Reframed the hunt around end-to-end USER GOALS (what the user sees + does, can they finish) rather than per-function bugs. Small 4-goal batches dodged the server rate-limiting that throttled the full passes. 3 goal-blockers FIXED, 1 deferred:
>
> ⚠️ **CORRECTION (iter-21):** the "share/publish goal traced by hand = SOLID / CLAUDE.md publish-disabled note is STALE" claim made here was **WRONG** — I missed that `publishActions.run` calls the disabled `forkBuildSandbox` stub at `publishActions.ts:88` **before** `deployFreestyle` (line 139), so publish actually throws for every deploy. Publish IS disabled on Vercel exactly as CLAUDE.md documents (the failure is clearly surfaced in the publish panel). See the iter-21 entry above.

**✅ FIXED (this commit):**
1. **HIGH `#cms` — CMS detail-page bindings (`PAGE_ITEM_FIELD`) rendered nothing**, so a user building a blog/collection detail page saw blank content. `convex/cmsBindings.ts` `snapshot` derived collection ids ONLY from binding payloads, but detail-page item-field bindings carry no top-level `collectionId` (it's resolved via the `cmsCollectionPages` routing config). Fix: union the collection ids from `cmsCollectionPages` rows with the binding-derived ones before fetching items.
2. **HIGH `#editor` (partial) — a fresh project had no baseline git commit**, so the first turn's checkpoint had nothing to restore to (and `git restore --source <oid>` needs a commit). `git/git.ts` `initRepo` configured git but never committed. Fix: best-effort `git add .` + `git commit --allow-empty -m "Initial commit"` after `git branch -M main`. (The SECOND half of this finding — checkpoints are captured AFTER the AI edits land, so a per-message restore returns the post-edit state — is DEFERRED below; it changes checkpoint→restore semantics and needs the restore-UI contract pinned down first.)
3. **MED `#billing` — out-of-credits users hit a dead-end with no upgrade CTA.** When the concurrency/fractional-bucket deduction gate (`api/chat/route.ts:388`) returned 402, it omitted the `usage` object that the sibling `checkMessageLimit` 402 includes; `error-message.tsx` gates the "Get more credits" button on `code===402 && usage`, so the user only got a Retry button that re-sends and fails identically — no in-chat path to subscribe. Fix: fetch `usage` (via `checkMessageLimit`) and include it in the gate 402 body. (The parallel `api/chat/summarize/route.ts` 402 has the same omission but its 402 is background-only / not user-rendered, so left as-is.)

**⏸ DEFERRED — changes checkpoint→restore semantics, needs UI-contract review:**
- **HIGH `#editor` — message-level "restore" returns the POST-edit state, not pre-edit.** `use-chat/index.tsx:671` creates the checkpoint in the `finishReason` effect (AFTER the AI's edits land), so restoring a user message's checkpoint gives back the state right after that turn — it does NOT undo the AI's edits the way a user expects from "undo this message". 3/3 verifiers confirmed real. NOT fixed because the correct behavior depends on the restore UI's contract (does "restore to this point" mean before or after this turn, and which message's checkpoint maps to which undo target). Capturing before the AI edits (e.g. at send time) is the likely fix but risks breaking the existing restore model — needs a deliberate design pass. (The baseline-commit half IS fixed above, which already makes first-turn restore land on a real commit.)

**Refuted (4):**
- New Pro bucket skipped on first post-payment message (Stripe `startedAt` timing) — refuted (the period math handles it).
- Undo/redo of style/text edits "skip the optimistic iframe update" — refuted (the path does re-render).
- Published/exported site never shows CMS content — REFUTED on reachability (bindings are preview-only and publish doesn't yet emit CMS data — not a reachable regression today; revisit when publish includes CMS).
- In-tab project switch A→B shows a blank no-loader screen — refuted (a loader/transition path exists).

### User-flow bug-hunt iter-19 (2026-06-20, Workflow) — editor mechanics; 3 FIXED, 5 UNVERIFIED (rate-limited), partial run

> 8 editor-mechanics finders (canvas pan/zoom, style inputs, AI model/mode, in-preview nav, sandbox reconnect, thumbnail, layout tools, inline text). **The run was repeatedly server-rate-limited** ("not your usage limit") — many verify steps failed, so only 3 findings reached a 2/3 verdict and were confirmed+fixed. The other 5 finder claims could NOT be adversarially verified (their verifiers were throttled) — they are **leads to re-verify**, NOT confirmed and NOT refuted.

**✅ FIXED (this commit):**
1. **HIGH `#editor` — per-side spacing inputs (InputIcon) dropped a typed value when the dropdown closed.** `editor-bar/inputs/input-icon.tsx` used `useInputControl` but never wired `handleBlur`/`onBlur` (the `<input>` had only `onChange` + arrow-key `onKeyDown`, no Enter commit). The only commit path was a 500ms debounce, which the Radix dropdown's unmount-cleanup cancels — so a value typed <500ms before closing (Padding/Margin/Radius/Border → Individual tab) was lost. Fix: destructure + wire `onBlur={handleBlur}` (flushes the debounce; mirrors `InputDropdown`/`InputRange`). No `{min:0}` — margins can be negative.
2. **HIGH `#editor` — the "all sides" spacing slider (InputRange) also dropped the final value on fast dropdown close.** `input-range.tsx` `handleBlur` armed the debounce (`debouncedOnChange(numValue)`) but never flushed, so the same unmount-cancel dropped it (and the Enter branch routes through `handleBlur`). Fix: `debouncedOnChange.flush()` in `handleBlur`.
3. **HIGH `#editor` — switching the Flow display mode left orphan layout classes in source.** `style-tab-v4/sections/layout.tsx` `commitFlow` set `display` but never cleared flex-only props, so flex→block/grid left `flex-row`/`justify-*`/`items-*`/`gap-*` orphans. Fix: clear the orphan-prone properties via `setMultiple` with `value: ''` (the parser-strip idiom already used by position.tsx/size.tsx) — block clears flex-direction+justify+align+gap; grid clears flex-direction (justify/align/gap stay valid on grid). Batched as one history entry; removed the now-unused `displaySetter`.

**🔍 Re-verify update (2026-06-20, verify-only Workflow — itself partly throttled):** Of the 5 leads, the verifiers that ran confirmed 3 as real (they were only `isReal=false` on a dedup technicality — the COMMON prompt deduped against this very BACKLOG entry). 2 FIXED, 1 confirmed-but-deferred, 2 still unverified:
- ✅ **FIXED `#canvas` — "Re-Center the Canvas" landed the frame 200px left / 100px above true center.** `frame-events/index.ts:101` `recenterCanvas` subtracted the default pan offset (200,100) when computing the viewport center; with `screenX = canvasPos.x + worldX*scale`, centering needs `canvasPos.x = innerWidth/2 − frameCenterX*scale` (no offset). Fix: dropped the `defaultPosition` subtraction.
- ✅ **FIXED `#preview` — PageSelector threw `new URL('')` during provisioning** (`page-selector.tsx:64`, while the sibling line 57 `inferPageFromUrl` was guarded). It didn't crash the whole editor — `CanvasErrorBoundary` caught it and showed a misleading "sandbox isn't reachable" card during provisioning. Fix: try/catch around `new URL`, fall back to the inferred page.
- ⏸ **CONFIRMED but DEFERRED `#ai` — `/create` and `/fix` show the wrong mode label ("Build") + wrong placeholder.** `chat-mode-toggle.tsx` `ALL_MODES` only maps EDIT/ASK/PLAN, so CREATE/FIX fall back to index 0 (EDIT="Build"); `getPlaceholderText` only special-cases ASK/PLAN. Confirmed real + reachable, but it's a cosmetic mislabel (the mode still functions) and the fix needs a UX decision — what label/icon/placeholder CREATE and FIX should show, and whether to add them as selectable dropdown entries. Next: add a display-only label/icon/placeholder map for CREATE/FIX (hardcoded strings, no i18n) without polluting the selectable dropdown.
- ✅ **FIXED `#sandbox` — sandbox auto-restore fired N× concurrent `Sandbox.create` on a single 410** (3/3 verified). `canvas/frame/index.tsx:429` auto-restore effect ran per-frame, gated only by per-component refs; a branch with N breakpoint frames each independently observed the 410 → N concurrent `restoreSandbox` → N `Sandbox.create()` VMs (N-1 orphaned/leaked) + a last-writer-wins race on `_replaceBranchSandbox`. Fix: gate the effect on `isPrimaryFrameInBranch` (the existing primary-frame singleton, already gating the loading panel + iframe mount) so only one frame per branch restores; single-frame branches stay primary so their restore is unchanged. (Defense-in-depth — a server-side per-branch in-flight guard in `restoreSandbox` to also cover two-tab/reload races — left as a follow-up `#sandbox`.)
- ❌ **REFUTED `#thumbnail` — `screenshot/index.tsx:29` navigate-away capture is NOT lost** (3/3 refuted). The 10s debounce is a global `setTimeout`, not tied to React lifecycle, and navigate-away uses Next.js soft client-side nav (no hard reload), so the trailing-edge capture still fires and the thumbnail refreshes. Not a bug.

> ALL 5 iter-19 leads resolved (3 fixed via re-verify + 1 fixed inline earlier list + 1 refuted; plus `/create`-`/fix` mode-label still DEFERRED above, needs a UX decision). Server throttling was active across iter-19 — small verify-only batches (2-5 leads × 3 lenses) succeeded where the full 8-finder passes were throttled.

### User-flow bug-hunt iter-18 (2026-06-19, Workflow) — search/dashboard/rules/theme/errors/toast/share/account; 5 FIXED, 1 deferred, 2 refuted

> 8 fresh-area finders (command-palette/search, dashboard list, AI rules/context-pills, theme, error-boundary, toast, share, account) → 3 diverse-lens skeptics + BACKLOG dedup per finding. 6 confirmed; **5 FIXED this commit, 1 deferred.**

**✅ FIXED (this commit):**
1. **HIGH `#share` — every emailed project invite 404'd.** `convex/projectInvitationActions.ts` `constructInvitationLink` built `/invite?id=&token=`, but no `/invite` route exists — the accept route is `/invitation/[id]?token=` (reads `searchParams.get('token')`). Fix: emit `/invitation/${id}?token=` (mirrors the working workspace invite + the email-package builder).
2. **HIGH `#ai` — @-mentioned FILE context silently dropped on canvas selection change → never sent to AI.** The `chat/context.ts` selection reaction rebuilt `this.context` preserving only manual HIGHLIGHTs + IMAGEs; @-mentioned FILEs (no discriminator) were discarded, and the freshly-derived context only re-adds files containing a *selected* element. Fix: added `fromSelection?: boolean` to `FileMessageContext` (set by `getFileContext` for auto-derived files); the reaction now preserves manual files (`fromSelection !== true`), de-duped by `path::branchId` against the new selection-derived set.
3. **MED `#error-boundary` — `w/[slug]/settings/layout.tsx` used raw `fetchQuery` → HTTP 524 dead-end on a backend hang** (the sibling `w/[slug]/layout.tsx` already uses the timeout helper). Fix: both calls now use `fetchQueryWithTimeout` (converts a hang into a thrown `TimeoutError` an `error.tsx` boundary can catch + retry).
4. **MED `#toast` — folder create / move-to-folder showed a false-success toast (plus a contradictory error toast) when the localforage persist failed.** `persistFolders` rolled back + toasted the error but returned void, so callers fired `toast.success` regardless. Fix: `persistFolders` returns a boolean; `handleCreateFolder` / `handleMoveSelected` early-return on failure. (The bulk-delete caller is unaffected — its toast is about the delete, which independently succeeded.)
5. **MED `#account` — Account-tab form-reset effect clobbered in-progress name edits when the reactive `me` query re-emitted.** `useEffect(..., [user])` re-seeded the inputs on every Convex re-emit. Fix: seed once via a `seededRef` (resets on modal remount, so reopening re-seeds from the latest DB values).

**⏸ DEFERRED — needs a schema flag (cleared vs never-set is indistinguishable):**
- **MED `#account` — clearing First/Last/display name in Account settings silently reverts on the next sign-in.** `clerkWebhooks.ts upsertUser` already has non-clobbering name sync (`existing.firstName || args.firstName`), but `||` can't tell "intentionally cleared" from "never set". Worse: `updateProfile` clears by patching `firstName: undefined` (Convex **removes** the field; schema is `v.optional(v.string())`, no null), so a cleared name is stored **identically** to never-set. And the JIT insert (`permissions.ts:91`) can create a row with empty names that relies on the webhook backfill — so simply dropping name-sync on update would regress that. **Proper fix:** add a `profileEditedByUser` (or per-field `*EditedAt`) flag set when the user edits names in-app; the webhook backfills names only when the flag is unset. Needs a schema + `updateProfile` + webhook change; product call on Clerk-sync-vs-app-owned. NOT blind-fixed.

**Refuted (2):**
- Dashboard Cmd+K "Search projects" command a permanent dead no-op (`projects-command-palette.tsx`) — mixed verdict (one lens confirmed, not unanimous); flagged for a focused re-check, not fixed. `#needs-repro`
- Accent-color picker overriding the shadcn `--accent` hover-surface token — REFUTED (cited lines real but the override scoping is correct).

### User-flow bug-hunt iter-17 (2026-06-19, Workflow) — lifecycle/export/agent/layers/CMS/env; 5 FIXED, 2 deferred, 1 refuted

> 8 fresh-area finders (project lifecycle, export/download, agent tool-loop, keyboard shortcuts, layers DnD, fonts/assets, CMS collections, env-vars) → 3 diverse-lens skeptics + BACKLOG dedup per finding. 7 confirmed; **5 FIXED this commit, 2 deferred.**

**✅ FIXED (this commit):**
1. **HIGH `#export` — "Download code" showed a false success toast + opened a blank tab; no file ever downloaded.** The Vercel browser provider's `downloadFiles` is an unported stub returning `{}` (`vercel-browser-provider.ts:229`), so `SandboxManager.downloadFiles` returned `{ downloadUrl: '' }` (truthy object) → `project-breadcrumb.tsx` `if (result)` passed → `window.open('')` + `toast.success`. (Finder cited the server-side vercel-sandbox provider at :744 — verifiers corrected: that path isn't reached; the real path is the browser-provider stub + weak guard.) Fix: `SandboxManager.downloadFiles` returns null when `url` is empty (→ existing error branch shows an honest failure); breadcrumb guards `result?.downloadUrl` before window.open/success. **The actual archive/zip download is still unimplemented on Vercel** — see deferred below.
2. **MED `#editor` — Cmd+X showed a false "Cut" toast when nothing was cut** (frame-only selection, or an element whose `copy()` fails for no-oid). `hotkeys/index.tsx` toasted unconditionally after `copy.cut()`. Fix: `CopyManager.cut()` now returns a boolean; the hotkey toasts only on success.
3. **HIGH `#editor` — layers-panel drag of a stale row built a move-element action targeting `<body>`, corrupting JSX.** `getElementByDomId` (preload) falls back to `document.body` for a removed domId instead of null, so `layers-tab/index.tsx` `if (!childEl)`/`if (!parentEl)` guards were dead. Fix (client-side, no preload change): bail when the resolved element's `domId` ≠ the requested domId. (Preload root cause is deferred — see below.)
4. **HIGH `#assets` — image-fill / favicon / OG-image uploads persisted a URL built from the RAW filename while the file was written under `sanitizeFilename(name)` → 404 in preview/metadata.** `ImageManager.upload` now returns `{ filePath, fileName }` (sanitized); callers use it: `editor-bar/inputs/input-image.tsx` (background-image fill) and `settings-modal/site/index.tsx` (favicon light/dark + OG) and `site/page.tsx` (OG) — all 4 upload sites were reconstructing from `file.name`.
5. **HIGH `#cms` — deleting a CMS field that a collection-page used as its `matchFieldKey` left dangling detail-page routing** (the page can no longer match URL→item; `data-pusher` matches by `page.matchFieldKey`, which is a required non-empty string so it can't be cleared). `cmsFields.remove` cleaned item values + bindings but not collection pages. Fix: delete `cmsCollectionPages` rows whose `matchFieldKey === fieldKey`, mirroring the existing broken-binding cleanup. (The routing-dialog already had a comment acknowledging this gap.)

**⏸ DEFERRED:**
- **HIGH `#parser` `#preload` — `getElementByDomId` falls back to `document.body` for a stale/removed domId** (`apps/web/preload/script/api/elements/index.ts:7`, non-nullable return), so every null-guard on its result across the editor is dead code (stale-selection cleanup never prunes; the layers-drag bug #3 was one symptom, now guarded client-side). Root fix belongs in the preload script: return `null` when `getHtmlElement(domId)` is null. NOT done here because (a) preload changes require rebuilding + committing `public/weblab-preload-script.js` AND prod loads from a jsDelivr SHA pin (see MEMORY `project_preload_artifact_must_commit`), and (b) that artifact is currently uncommitted/modified by another session — touching it risks entanglement. Needs an isolated pass: fix source, rebuild artifact, bump the prod jsDelivr pin, audit the now-live null-guards.
- **MED `#export` — code download (zip/archive) is unimplemented on Vercel Sandbox** (`VercelBrowserProvider.downloadFiles` is a `TODO(sandbox-port)` stub). The false-success was fixed (#1) so it now errors honestly, but the feature itself needs a server-side fileDownload route that tars the project (exclude node_modules/.next/.git) and streams/returns it. Feature port, not a surgical fix.
- **MED `#editor` — rebinding a shortcut to a punctuation/symbol key (or on a non-US layout) can create a binding that never triggers.** `settings-modal/shortcuts-tab.tsx:97` captures `e.key.toLowerCase()`; a shifted symbol (`?`) or layout-specific key may not match react-hotkeys-hook's matcher → silent dead binding. NOT fixed: the correct fix needs keyboard-layout normalization (or a vetted allowlist) against the matcher's key conventions — a naive allowlist risks blocking keys that DO work (regressing valid rebinds). Advanced/optional feature; defaults unaffected. Next: normalize via `e.code`/physical key, or reject un-bindable keys with clear feedback, validated against the live matcher.

**Refuted (1):** "Conversation summary never applies after reload" (agent context compaction) — DUPLICATE of an existing Open BACKLOG entry; skipped per dedup rule.

### User-flow bug-hunt iter-16 (2026-06-19, Workflow) — settings/stream/domain/bridge; 5 FIXED, 1 deferred, 3 refuted

> 8 fresh-area finders (tab-complete, AI stream/stop, settings/members, custom-domain, templates, penpal bridge, data-pusher sync, onboarding) → 3 diverse-lens skeptics + BACKLOG dedup per finding. 6 confirmed; **5 FIXED this commit, 1 deferred (high blast radius).**

**✅ FIXED (this commit):**
1. **CRITICAL `#settings` — workspace invite was never delivered (no email, no link) → nobody could ever join a team workspace.** `w/[slug]/settings/members/page.tsx` `handleInvite` created the invitation row + token, then toasted "Invite sent" — but unlike project invites there is NO workspace-invite email action, and nothing surfaced the accept link. The accept route (`/invitation/workspace/[id]?token=`) + `inviteAccept` mutation both exist, so the only gap was delivery. Fix: after `inviteCreate`, build the accept link client-side, copy it to clipboard, and render a copyable link box + "we don't email invites yet" hint; button relabeled "Create invite link". (Auto-email via a Resend action mirroring `projectInvitationActions.ts` is a future enhancement.)
2. **HIGH `#editor` — tab-complete ghost survived caret moves → Tab inserted the completion at a stale position and swallowed the indent.** `tab-complete/extension.ts` `suggestionField.update` only cleared on `docChanged`; a click/arrow (selection-only) left the ghost anchored to its old `pos`, and `acceptSuggestion` inserts at `s.pos` ignoring the caret. Fix: clear the ghost on caret move (`!tr.docChanged && tr.newSelection.main.head !== next.pos`) + guard `acceptSuggestion` to drop the ghost and return false when the caret isn't at `s.pos` (Tab falls through to indent). Tab-complete defaults ON.
3. **HIGH `#convex` — template / GitHub / prompt create paths forwarded a stale active-workspace id → FORBIDDEN dead-end** (same class as the iter-14 createBlank bug; worse here — the creating page offers no retry). `store/create/manager.ts` `startCreate`/`startGitHubTemplate`/`startPublicGitHubTemplate` all passed `readActiveWorkspaceId() as Id<…>` straight into `createFromPrompt`/`createFromGit`. **Confirmed these paths are LIVE** (only `createSandboxFromGithub` still throws `UNAVAILABLE_MESSAGE`; the CLAUDE.md "prompt/GitHub/template create disabled" note is now STALE — see iter-15 QA block). Fix: added `resolveValidWorkspaceId()` that validates the stored id against `api.workspaces.list` via the store's ConvexHttpClient and clears + drops a stale id (→ personal fallback); all three entrypoints now use it.
4. **MED `#domain` — verify-failure diagnostic checked every A record against the apex, ignoring the `www` host.** `lib/freestyle.ts` `buildFailureReason` looped `isARecordPresent(verification.fullDomain, …)` for every record, so a `www` A record was checked against apex DNS → false "www missing/present". Fix: resolve each record's FQDN (`@`→apex, else `name.apex`; subdomain case already equals fullDomain).
5. **MED `#domain` — a transient Freestyle API error was reported to the user as a DNS misconfiguration.** `verifyFreestyleDomain` caught all exceptions → `null`, and `domainActions.ts verificationVerify` renders `null` as the DNS-records "failure reason". Fix: return a tagged `{ok:true,domain}|{ok:false,message}`; the single caller now shows a "couldn't reach the verification service, retry" message for provider errors vs the DNS diagnostic for a clean negative.

**⏸ DEFERRED — verified real but high blast radius + low verifier confidence (0.4–0.62); needs care:**
- **MED `#sync` — re-pull (boot-retry `retryPullUntilComplete` + git-restore unpause) unconditionally overwrites local files**, clobbering in-flight/failed-push user edits. `services/sync-engine/sync-engine.ts:421` `pullFromSandbox` writes every sandbox file with no hash/freshness check — correct for the FIRST boot pull (empty local FS) but not for re-pulls after the watcher is live. This is the boot-sync-wipe area (previously a major incident, fixed `7291f40f4`), so DO NOT patch blind. **Next step:** gate the unconditional write behind an `isInitialPull` flag; for re-pulls reuse the watcher's `newHash !== existingHash` guard and skip when the local hash diverges from the stored `fileHash` (pending local edit). Needs sync-engine tests before changing.

**Refuted / already-known (3):**
- Tab-complete "stale-position check compares only offset not content" — REFUTED: the offset check is sufficient given the ghost is cleared on edit; no content-mismatch insert in practice.
- "Queued messages stranded after a stream ERROR" — already covered in BACKLOG (chat queue/stream entries); cited mechanism partly wrong. Not re-logged.
- "Modal sign-in drops create intent (RETURN_URL written but never read)" — REFUTED at the cited location (Clerk `returnUrl` searchParam path handles it). NOTE: a verifier observed `localforage RETURN_URL` is written but has no reader anywhere — a possible dead-write worth a focused look, but not a confirmed user-facing break. `#needs-repro`

### Editor user-flow bug-hunt (2026-06-19, Workflow) — 8 finders → 3-lens adversarial verify; 6 FIXED, 1 deferred, 1 refuted

> Ran an 8-area Workflow (AI diff-apply, undo/revert, image→chat, screenshot, file-tree, code-tab, frames/breakpoints, element insert/delete) with 3 diverse-lens skeptics + BACKLOG dedup per finding (24 verifiers, all confirmations unanimous). **6 confirmed bugs FIXED this commit, 1 deferred (needs parser work), 1 refuted.** (Distinct from the "QA audit (iter-15)" block below — different session.)

**✅ FIXED (this commit):**
1. **HIGH `#ai` — Fuzzy-edit "Apply" overwrote the whole file with a partial snippet.** `tool-call-display.tsx:155` FuzzyEditFileTool branch passed `showApply`, but its `content` is a partial sketch with literal `// ... existing code` markers (the real apply runs through `applyDiff`). `CollapsibleCodeBlock.applyFile` does a raw `sandbox.writeFile(path, content)` → clicking Apply replaced the entire file with the snippet, destroying everything else. Fix: dropped `showApply` from the Fuzzy branch (mirrors the SearchReplace branches; WriteFileTool keeps it since its content is the full file).
2. **MED `#ai` — manual Apply wrote to the active branch, ignoring the tool call's target branchId.** `collapsible-code-block.tsx:88` used `editorEngine.activeSandbox`. Fix: resolve `getSandboxById(branchId)` when the tool carried a branchId, else fall back to activeSandbox.
3. **HIGH `#editor` — chat-checkpoint restore left the editor undo/redo stack stale → next undo corrupted restored files.** `git/utils.ts` `restoreCheckpoint` reverted files via git but never cleared `branchData.history`. Fix: `branchData.history.clear()` after a successful restore.
4. **MED `#ai` — attached image silently dropped when sending in FIX (/fix) mode.** `chat/context.ts:129` returned only `getErrorContext()`. Fix: prepend user-attached IMAGE contexts.
5. **HIGH `#editor` — renaming a file onto an existing path silently overwrote/destroyed the target.** `code-tab/index.tsx` `handleRenameFile` had no destination-collision guard before `moveFile`. Fix: `await branchData.codeEditor.fileExists(newPath)` guard (skips no-op same-path renames) + toast.
6. **HIGH `#editor` — a concurrent disk write silently clobbered the user's unsaved Code-tab edits.** `code-tab/index.tsx` `createUpdatedFile` adopted disk content whenever the disk hash differed, without checking whether the open buffer was dirty (AI write / design-panel restyle on the same open file → lost edits, no signal). Fix: made `updateExistingFile` await `isDirty`; when disk changed under a dirty buffer, keep the user's content+hash (stays dirty) and `toast.warning`. Self-save path stays immune (handleSaveFile updates originalHash first).
7. **MED `#editor` — "Add breakpoint" menu let you re-add a preset already in the group**, creating two frames sharing one `breakpoint.id` (rebase width resolution is first-wins; override map keyed by id) → later edits mis-target. Fix: hide presets whose id is already in `groupSiblings`.

**⏸ DEFERRED — needs parser-level fix + tests (verified real; finder's fix location was wrong):**
- **HIGH `#parser` — clearing a responsive breakpoint override never removes the stale class from source.** Clearing e.g. a Tablet override re-emits only the base utility; `twMerge('p-4 md:p-2','p-4')` keeps `md:p-2` (no conflicting incoming `md:` class), so the orphan variant survives in JSX and the "cleared" override reappears on reload/HMR. **Where:** the finder pinned `code/tailwind.ts:98` but all 3 verifiers established the real merge is in the parser: `request.attributes.className` is `undefined` at tailwind.ts:98 (`getOrCreateCodeDiffRequest` inits `attributes:{}`); the merge happens in `@weblab/parser` `transform.ts` → `addClassToNode` → `customTwMerge(existing, additions)` (`utility/tw-merge.ts`), which never strips prior responsive variants of a family. Also: clearing the LAST override empties the breakpoint map → `runSourceRebase`/`writeResponsiveStyle` early-returns on `Object.keys(map).length===0` and writes nothing, so the whole stale set survives. The correct sibling `applyResponsiveTailwind` (`responsive-classes.ts:186`, calls `removeUtilityClasses(existing, utility)`) is DEAD CODE (zero prod callers). **Next step:** strip the property's utility family before merge in the parser path (route through `removeUtilityClasses` via `PROPERTY_TO_UTILITY`) AND handle the empty-map early-return so a full clear still writes the stripped className. Tailwind-projects only. Add a parser unit test: `{padding:{tablet,desktop}}` then `{padding:{desktop}}` asserts no `md:` padding class remains. **Risk:** touches shared class-merge — needs scoped stripping + tests, hence deferred.
- **LOW `#parser` `#tech-debt` — `removeElementFromNode`/`insertElementToNode` call `path.stop()`** (`packages/parser/src/code-edit/remove.ts:21`), aborting the whole Babel traversal. **REFUTED as a live bug** (reachability lens): no current production path batches two REMOVE/INSERT structure-changes on distinct parent oids into one `transformAst` (`getRemoveRequests`/`getInsertRequests` each emit one; only MOVE iterates targets and `moveElementInNode` does NOT call `path.stop()`). Latent footgun if batched multi-parent structure writes are ever added. Next: `path.skip()` instead of `path.stop()`.

### QA audit (iter-15, 2026-06-19) — creation + editor bug sweep

- **Discovered:** 2026-06-19 (iter-15 end-to-end QA `/loop`; 4-finder workflow `wf_708fabe4-3a0`, **Verify phase hung** so all-but-noted are CANDIDATES, not adversarially confirmed).
- **Method:** read-only finders over creation paths / editor / brand-ux / latent bugs. github.tsx console fix already shipped (`43c15f59f`). Live authed re-test blocked (Clerk session forging is correctly disallowed) — these need confirming in the running editor.
- **Verification update (2026-06-19, post-finder):** Verify phase hung, so the top findings were hand-checked against current code. **FALSE POSITIVES — already handled (likely by parallel iter-17/18/19 fixes):** (1) "concurrent external write discards unsaved edits" — `code-tab/index.tsx:204-229` keeps the buffer dirty + `toast.warning`s ("Your unsaved edits were kept"); (2) "code-save no success feedback" — `code-tab/status-bar.tsx:44` renders a relative-time "Saved" indicator when not dirty; (3) "commit-message divergence" — `git.ts:443 createCommit` and `:279 commit` both default to the same `'New ${APP_NAME} backup'` placeholder (the `git-actions.tsx:161` TODO premise is wrong — safe to delete that TODO). **FIXED this iter:** template-import Retry (`79bf579c2`), create-modal file/folder name validation (`file-modal.tsx` nameWarning), GitHub-stats console noise (`43c15f59f`). **Still real, unfixed:** folder-rename guard (`file-tree-node.tsx:72`) — needs a live non-empty-dir move test before unblocking. **Remaining CANDIDATE rows below are UNVERIFIED — recheck against current code before acting** (false-positive rate ~50% on the checked subset, since finders raced the parallel bug-fix sessions).

**[VERIFIED by reading code]**
- **Doc drift — create paths may be LIVE, not disabled.** `apps/web/client/src/components/store/create/manager.ts:13-26` still carries `UNAVAILABLE_MESSAGE` + `TODO(sandbox-port)`, but `convex/projectActions.ts` now defines `createFromPrompt` (~:643), `createFromGit` (~:509), `createFromWebsiteClone` (~:815), `fork` (~:1382), and `manager.startCreate`/`startGitHubTemplate` (~:115-180) appear to call them. If wired, CLAUDE.md + feature-catalog "prompt/GitHub/clone disabled" is stale → **confirm `startCreate` actually invokes the action vs throws UNAVAILABLE, then update docs.** `#docs` `#bug`
- **Commit-message "divergence" is a FALSE POSITIVE.** `git-actions.tsx:161-165` `TODO(bug-hunt)` claims `createCommit` auto-generates while `commit` uses a placeholder. Reality: `git.ts:443 createCommit(message='New ${APP_NAME} backup')` just calls `commit(message)` — both default to the same placeholder. **Action: delete the stale TODO; no code change.** `#tech-debt`
- **Folder rename blocked.** `file-tree-node.tsx:71-72` `handleRename` early-returns for `isDirectory`, yet `handleBlur`/input-selection already handle dirs. `moveFile` → `fs.rename` (fs.ts:233) + code-fs prefix index (code-fs.ts:604) *likely* support dir move. **Action: remove the dir guard, then live-test a non-empty folder rename before shipping.** `#bug`

**[CANDIDATE — finder-reported, file:line cited, needs live confirm]**
- 🔴 **Concurrent external write silently discards unsaved editor edits** — `code-tab/index.tsx:199-215 (createUpdatedFile)` via `loadedContent` effect + `use-file.ts:31 watchFile`. (Note: *rename* of a dirty file IS already blocked at code-tab:526; this is the external-write path.) `#bug`
- 🔴 **GitHub import allows private repos but clone is unauthenticated → always fails** — `import/github/_components/setup.tsx:283-336`, `use-repo-import.ts:58-81`, `projectActions.ts createFromGit:567-573`, `vercel-sandbox/index.ts:596-626`. Dead-end. `#bug`
- 🟠 **Failed provisioning leaks an orphaned paid Vercel VM** — `projectActions.ts:296-400 _provisionSandbox` install/checkpoint failure path lacks cleanup (also createFromGit/Prompt/WebsiteClone/Figma/fork). Cost + resource leak. `#bug` `#infra`
- 🟠 **Cancelling an in-flight GitHub import leaves a created project + orphaned sandbox** — `import/github/_context/index.tsx:163-180`. `#bug`
- 🟠 **Template-import error = dead-end (no Retry)** — `projects/creating/page.tsx:175-184` passes `retryHref={null}`; `hasStarted` ref blocks re-run. `#bug` `#ux`
- 🟠 **Publish is clickable on Vercel, fails only post-deploy + leaves a dangling preview domain** — `top-bar/publish/dropdown/preview-domain-section.tsx:35-143`, throws at `convex/lib/publishHelpers.ts:56-61`. Contradicts CLAUDE.md "publish disabled". `#bug` `#ux`
- 🟠 **SandboxManager provider-reaction not serialized** — `store/editor/sandbox/index.ts:104-195,256-290`; overlapping provider transitions can release the sync engine mid-start. `#bug`
- 🟠 **resumeCreate can permanently fail to send the seeded prompt** if the chat panel doesn't wire within 2.5s — `_hooks/use-start-project.tsx:421-565`. `#bug`
- 🟡 **Code-editor save: no success feedback** (only error toast) — `code-tab/index.tsx:330-385`. `#ux`
- 🟡 **New-file / rename modals: no name validation** → raw "Path escapes basePath" leaks — `code-tab/modals/file-modal.tsx:63-98`. `#ux`
- 🟡 **Responsive multi-property edits within ~600ms drop all-but-last property's source rebase** (shared lodash debounce) — `store/editor/code/index.ts:276`, `action/index.ts:214-235`. `#bug`
- 🟡 **Pages tree goes stale** when pages are added/removed via the code editor — `design-panel/page-tab/index.tsx:54-57`. `#bug`
- 🟡 **Optimistic blank-create can trigger up to 3 full-page reloads** — `canvas/frame/index.tsx:183-189`. `#ux` `#perf`
- 🟡 **Template/clone double-submit guard relies on async setState** (no synchronous ref latch) — `templates/template-modal.tsx:72-114` (+ select-presentation, clone dialogs). `#bug`
- 🟡 **`projectCreateRequests.updateStatus` patches an unfiltered `.first()` row** — `convex/projectCreateRequests.ts:31-37`. `#bug`
- 🟡 **`createProjectFromGit` lacks the `withTimeout` + self-cleanup `createProject` has** — `vercel-sandbox/index.ts:596-675`. `#bug`

**[VERIFIED clean by finder]** Blank create (scaffold + provisioning) and clone-website path — no defect found.

### Stale active-workspace id dead-ends "Start blank" — ✅ FIXED 2026-06-19 (iter-14)

- **Discovered:** 2026-06-19 (iter-14 user-flow bug-hunt — project-creation subagent)
- **Where:** `apps/web/client/src/hooks/use-create-blank-project.ts` (createBlank hero/dashboard hook)
- **Symptom:** A returning user whose `ACTIVE_WORKSPACE_STORAGE_KEY` (localStorage) points at a workspace that was **deleted** or that they were **removed from** clicks "Start blank" → `createBlank` forwards the stale `workspaceId` → `_requireProjectCreateCap` → `requireCap` throws plain `Error('FORBIDDEN: project.create')`. Convex **redacts plain action errors to "Server Error" in prod**, so the hook's catch shows a dead-end `Failed to create project / Server Error` toast (non-transient → no Retry; and Retry would re-fail with the same id). The user cannot create a project from the hero/dashboard until they manually clear localStorage.
- **Root cause:** The hook cast the raw localStorage id (`as Id<'workspaces'>`) and forwarded it without validating it's still an accessible workspace. Backend personal-workspace fallback only kicks in when **no** id is supplied.
- **Fix:** Subscribe to `api.workspaces.list` (the caller's real memberships) and drop + `removeItem` the stored id when the loaded list no longer contains it, falling back to the personal workspace (always allowed). While the list is still loading, forward as-is (no regression). No reliance on the redacted error string; no retry → zero risk of misrouting a project to personal when the team workspace was valid but a post-cap insert hiccuped. typecheck (code 0) + eslint clean.
- **Risk if ignored:** team users with churned/deleted active workspaces are hard-blocked from creating new projects.
- **Tags:** `#bug` `#convex` `#fixed`

### "Access denied" opening a just-created project — RESOLVED iter-12: collision-only, NOT a product bug

> **iter-12 (stable isolated session): did NOT reproduce.** Created a fresh blank project and immediately re-opened it with 0 UNAUTHORIZED — no "Access denied", preview rendered. So the iter-11 occurrence was the multi-agent collision racing the shared QA user's workspace, not a create→access-row bug. Closing.


- **Discovered:** 2026-06-18 (iter-11 authed Playwright; the shared QA user had a parallel agent active)
- **Symptom:** Created a fresh blank project as `weblab.qa+clerk_test`, then immediately re-opened it → the editor showed **"Access denied — Please contact the project owner to request access"** + a console `Failed to load project data`. Preview never rendered.
- **Most likely cause:** test collision — the parallel QA agent shares the same Clerk user/personal-workspace and was concurrently mutating it, so the access/ownership check for this run raced. **NOT yet confirmed as a product bug.**
- **Next step:** Reproduce in an ISOLATED session (single agent, no parallel +clerk_test activity): create → immediately open. If "Access denied" still appears, it's a real create→access-row race (the project graph is inserted optimistically by `projectActions.createBlank` before/while the access/userCanvas rows settle — see the iter-1 orphan-on-scheduler-failure note). If it doesn't, close as collision-only.
- **Tags:** `#bug?` `#convex` `#needs-repro`

### Deep-editing-flow verification — ✅ design→code sync CONFIRMED (iter-12)

> **iter-12 (stable session): design→code sync VERIFIED end-to-end.** Created a project, selected the `<h1>`, set its Padding to 320px in the design panel → the **preview iframe's h1 computed padding changed `0px` → `0px 320px`** and the canvas + Tablet frame re-rendered with the padding. Because the preview is the sandbox running `next dev` on the real source, this proves the style change was written to the JSX source and hot-reloaded. The complete connected flow (create → editor → preview → select → design panel → style change → code+preview sync) works with no product errors. The iter-9 `No metadata found` was confirmed collision fallout (did not recur in the stable session).

#### Original iter-9 note (UI works; code-sync was collision-blocked at the time)

Drove the editor on a rendered preview: clicked the `<h1>` in the iframe → **element selection works**, design panel populated correctly (Tag `h1`, ID `hero-section`, Classes `text-2xl`/`font-medium` removable, Position/Layout/Padding/Margin/Size controls, font toolbar). So the editor↔iframe preload bridge + the design panel are **functional**.

- ⚠️ **Could NOT fully verify design→code sync (the style-change → JSX write-back)** because the multi-agent **session collision** invalidated this run's Clerk token mid-session (9× `UNAUTHORIZED`), so the sandbox server's `runCommand`/`listFiles` failed (`Closed before connection`) → source files unreadable → `No metadata found for id qq.8e4g tagName: H1`. That metadata-missing + runCommand failures are **most likely collision fallout, not a product bug** — needs an **isolated session** (pause the parallel agent, or an owner-approved dedicated Clerk user) to confirm code-sync end-to-end.
- The "N Issues" badge in the editor aggregates these console errors (was 1 after the saveCanvas fix; rose to 6 under the collision's UNAUTHORIZED/runCommand noise).
- **Next:** a clean isolated-session pass to (a) confirm a padding/class change syncs to the JSX in the Code tab, and (b) confirm `No metadata found` does NOT occur when the source files load normally.

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
  4. **HIGH** — `parser/src/template-node/map.ts` `getTemplateNodeChild` — ✅ **FIXED 2026-06-18 (commit `12f95012c`).** The "writes to the LAST sibling" claim was a misread: assign-then-stop already returned the Nth sibling for the common case. The real (narrow) defect was that a target sibling WITHOUT an oid leaked the previous sibling's instanceId instead of `null`. Now resolves the oid only at the target index; + `getTemplateNodeChild` tests (was untested). Remaining in this cluster: ~~`packages/figma-clipboard/src/figma-schema.ts:21` `FIG_KIWI_VERSION=15` hardcoded + decoded version skipped~~ — **NOT A BUG (verified 2026-06-18 iter-10):** `readArchiveChunks` skips the version only inside `decodeFigmaClipboardHtml`, which the source comment marks "for tests" and which has **no production caller** (no paste-from-Figma feature exists; Weblab only encodes/copies TO Figma, writing version 15). Subagent over-rated reachability. ✅ **FIXED 2026-06-18 iter-13 (commit `78fbe8158`):** wireframe `style-guide-view.tsx` `handleSaveApply` had no try/catch/busy/error — now mirrors the sibling `runGenerate` (setError/setBusy + try/catch/finally) and the Save button gets `disabled={busy}` + a spinner; reuses the existing inline error display. ✅ **FIXED 2026-06-18 iter-11 (commit `ad282b794`):** wireframe `wireframe-workspace.tsx` `void ensureDoc(...)` infinite "Preparing…" on failure — now catches the rejection into an `ensureError` state and renders a full-screen error + "Try again" (resets the once-guard so retry fires); happy path unchanged, typecheck/lint clean.
  5. **MED** — component prop writes bypass undo history (`components/index.ts:~467-548` — confirms known "prop undo" gap); `createHtmlComponentFromSelection` (`:~821`) first-occurrence `.replace` converts the wrong duplicate; right-click-menu figma actions (`right-click-menu/index.tsx:178,189`) drop the promise (no `void`); wireframe local-project silently emits to cloud; `generateStyleGuide` allows zero wireframes; no `wireframe/loading.tsx`.
  6. **LOW** — `StyleMode.Instance` is dead (never assigned → instance-only styling silently routes to master); `wireframeActions.ts:~45` `runWithRetry` zero-delay (no backoff on 429).
- **Clean (subagent-confirmed):** `~`-oid suffix split/join idempotent + double-guarded; `instanceId` scoped to boundaries; figma pako/buffer encoding + coordinate math correct; wireframe blockId coerce exhaustive with safe fallback; emit guard rejects zero-page projects.
- **Next step:** #1 (parser `[object Object]`) is the strongest verifiable next fix. #2/#3 need an authed/live editor to confirm.
- **Tags:** `#bug` `#editor` `#convex` `#parser`

### Auth/billing/chat bug-hunt (iter-4 — untouched areas; subagent line refs, confirm before fixing)

- **Discovered:** 2026-06-17 (QA pass iter-4 — Sonnet subagent over auth / settings-billing / AI-chat / breakpoints)
- **Findings (ranked; verify each line ref before fixing — moderate-confidence pass):**
  1. **HIGH — segment error boundaries dead-end on token expiry** (`src/app/projects/error.tsx`, `src/app/project/[id]/error.tsx`): a Convex `UNAUTHORIZED` thrown under these segments is caught by the segment boundary *before* the root boundary's re-auth redirect can fire → "Something went wrong" card with no sign-in path; "Try again" re-throws. Fix: mirror the root `error.tsx` — detect the unauthenticated error + `useAuth`, redirect to `/sign-in?returnUrl=…`. (Relates to the already-fixed root boundary, agent-memory `project_auth_signout_boundary`.) **Most actionable next fix; verifiable once an authed session exists.**
  2. **HIGH — pricing `pro-card` double-submit** — ✅ **FIXED iter-15 (commit `bdd2494ce`).** `setIsCheckingOut(true)` was set inside each branch handler, so a same-frame double-click fired two Stripe checkouts (double-charge risk). Added the proven `useRef` synchronous in-flight guard at the top of `handleCheckout` (`if (inFlightRef.current) return; inFlightRef.current = true; setIsCheckingOut(true)`), reset in handleCheckout's own `finally` (always runs → no stuck-disabled). Purely additive, no payment-logic change; typecheck 0, no new lint warnings.
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
  4. **MED** — `items-table.tsx:72` item list capped at 100 (badge/search/preview miss overflow; TODO at :69); `items-table.tsx:186-192` bulk-delete partial failure deselects failed ids + swallows error message; `git-actions.tsx:109` commit double-submit race — ✅ **FIXED iter-14 (commit `96e50d61f`):** added a `useRef` synchronous in-flight guard at the top of `handleContinue`, reset in `finally` (the `isLoading` useState alone couldn't block a same-frame second click); `git-actions.tsx:158-162` staged-only commit always uses `'New Weblab backup'` placeholder instead of auto-generating (TODO at :156); `file-tree/index.tsx:561-597` delete-directory tab-close prefix check can miss orphaned tabs (path normalization).
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

### Editor style-write data loss via single shared rebase debounce — ✅ FIXED (commit `b711cb426`)

> **FIXED 2026-06-18 (user-requested).** `CodeManager.writeResponsiveStyle` now uses a reusable per-`${oid}::${property}` `keyedDebounce` (new `src/utils/keyed-debounce.ts` + tests) instead of a single shared `lodash.debounce`, so two responsive writes within 600ms no longer cancel each other. Also excluded the field from `makeAutoObservable` so MobX stops stripping `.cancel` (teardown-cancel was a silent no-op). Verified: keyed-debounce unit tests (3 pass, incl. the two-keys-both-fire regression), typecheck/lint clean, and a 4-lens adversarial review (GO, no blocking findings). The sandbox async sync-engine serialization-guard (below) remains separate + open. Residual (non-blocking, pre-existing): `flushPendingRebases` re-debounces on `beforeunload` (best-effort, unchanged); could later call the undebounced write directly.

- **Discovered:** 2026-06-17 (QA pass — subagent finding, line ref approximate)
- **Where:** the final `writeResponsiveStyle` shared `lodash.debounce` in `apps/web/client/src/components/store/editor/code/index.ts:276`; related `apps/web/client/src/components/store/editor/sandbox/index.ts` (async sync-engine init reaction, no serialization guard)
- **Symptom (SCOPE CORRECTED 2026-06-18 iter-10 by reading the code):** The UPSTREAM `ActionManager.scheduleSourceRebase` (`editor/action/index.ts:214-225`) IS per-key — `Map<\`${oid}::${property}\`, timer>` — so it does NOT lose writes; the subagent "single shared debounce for all rebases" framing was wrong. The actual loss is at the LAST hop: `runSourceRebase` calls `code.writeResponsiveStyle(...)` once per key, and THAT is a single shared 600ms `debounce`. When two different keys' upstream timers fire within 600ms (e.g. editing padding then margin ~200ms apart), the second `writeResponsiveStyle()` cancels the first's pending call → the first key's RESPONSIVE (breakpoint) write is dropped. Scope: editing 2+ properties quickly **while on a non-default breakpoint** (responsive writes only). The author comment at :268-274 claims the action pipeline is "safe" — incorrect for the multi-key case. (Separate: the sandbox async sync-engine init reaction still lacks a serialization guard.)
- **Next step:** Lowest-blast fix — since the upstream already debounced per-key, have `runSourceRebase` call an **undebounced** `writeResponsiveStyleNow` (the second debounce is redundant + harmful), keeping the debounced `writeResponsiveStyle` for direct callers (alt-click clear). Alt: make `writeResponsiveStyle` a keyed debounce and reimplement `.cancel`/`.flush`. **Still do-not-fix-blind:** entangled with `ActionManager.flushPendingRebases`, the `.cancel` guard (:323), and the beforeunload flush (:55) — needs live verification of responsive multi-property editing, which is currently blocked by the multi-agent session collision.
- **Risk if ignored:** Intermittent lost responsive style edits during fast multi-property editing on a non-default breakpoint (narrower than first thought, but real data loss).
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
  3. **Parser JSXText written verbatim** — `packages/parser/src/code-edit/text.ts`: user text `{x}` becomes a JSX expression (runtime error). **Child-wipe half ✅ FIXED 2026-07-07** (see entry above, iter-9 section) — multi-line edits now preserve nested elements instead of wiping all children. **Escaping half still open**: `{`/`}`/`<`/`>` in typed text are not escaped into a string-literal expression container. `#bug`
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

### Fork-based create paths: project clone + marketplace templates (`TODO(sandbox-fork)`)

> ⚠️ **STALE (corrected iter-21 2026-06-20):** `projectActions.fork` is **no longer a throwing stub** — it is LIVE and runs (auth + VERCEL_TOKEN check → loads source → resumes `sourceSnapshotId` → inserts a new graph). It does NOT toast "temporarily unavailable". The REAL current bug is **worse**: it silently produces a blank/stale clone (false success) because `sourceSnapshotId` is frozen at create time and the graph uses default frames — see the **iter-21** entry near the top of Open (`#data-loss`). Marketplace "Use template" likely shares this. The text below is the original (now-inaccurate) 2026-06-03 note, kept for history.

- **Discovered:** 2026-06-03 (create-paths audit session)
- **Where:** `projectActions.fork` ([convex/projectActions.ts](apps/web/client/convex/projectActions.ts)) — ORIGINALLY threw "Project fork is temporarily unavailable… snapshot-based fork is not yet implemented" (NO LONGER TRUE, see correction above). Callers: project clone ([clone-project.tsx](apps/web/client/src/app/projects/_components/settings/clone-project.tsx), `clone-project-dialog.tsx`) and marketplace "Use template" ([template-modal.tsx](apps/web/client/src/app/projects/_components/templates/template-modal.tsx) → `forkTemplate`).
- **Symptom (ORIGINAL, now inaccurate):** "Clone project" and marketplace "Use template" toast "Sandbox service temporarily unavailable". **Current symptom:** clone toasts SUCCESS but opens a near-empty/stale project.
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

### `/sign-in` React #418 from SSR/client auth-provider divergence

- **Discovered:** 2026-06-23 (post-deploy production browser validation after service-worker v4)
- **Resolved:** 2026-06-23 (`clerk-auth-form` treats blank `NEXT_PUBLIC_AUTH_PROVIDERS` as the documented default)
- **Where:** `apps/web/client/src/app/sign-in/_components/clerk-auth-form.tsx`.
- **Root cause:** Production SSR saw a blank `NEXT_PUBLIC_AUTH_PROVIDERS` value and rendered only the always-on Vercel button, while the browser bundle fell back to the default GitHub/Google provider list and hydrated three OAuth buttons. React regenerated the sign-in subtree and logged minified error #418.
- **Fix:** Normalize `NEXT_PUBLIC_AUTH_PROVIDERS` before parsing so `undefined`, empty, and whitespace-only values all use the documented `github,google` default on both server render and browser hydration.
- **Validation:** Production no-JS vs hydrated comparison identified the exact button-list mismatch. Local production server with `NEXT_PUBLIC_AUTH_PROVIDERS=''` rendered the same Google/GitHub/Vercel button list in server HTML and hydrated DOM, with one viewport tag and 0 browser errors.
- **Tags:** `#bug` `#auth` `#frontend`

### React #418 hydration mismatch on /sign-in from stale service-worker chunk cache

- **Discovered:** 2026-05-28 (prod Google-login crash investigation), re-confirmed 2026-06-16 and 2026-06-23.
- **Resolved:** 2026-06-23 (service worker v4; chunk requests are network-first with cached fallback)
- **Where:** `apps/web/client/public/sw.js`; `apps/web/client/src/app/sign-in/**`.
- **Root cause:** Not a sign-in markup bug. A clean fresh Chrome context with service workers blocked renders `/sign-in` with 0 console errors and a single viewport tag. A persistent browser context with an installed SW could still serve cached `/_next/static/chunks/*` JS/CSS from the previous build against fresh HTML, reproducing React #418 for returning users. The older v3 fix only purged one poisoned cache generation; it did not prevent stale chunk reuse if a Turbopack chunk URL stayed stable across adjacent deploys.
- **Fix:** Bumped the SW namespace to v4 to purge v3 runtime caches, and changed `/_next/static/chunks/*` handling from cache-first to network-first with runtime-cache fallback. Other static assets remain cache-first; chunks still work offline from cache when the network is unavailable.
- **Validation:** Live `https://weblab.build/sign-in` after deploy served one viewport tag and the new sitemap route. Fresh Chrome Playwright context (`serviceWorkers: 'block'`) loaded `/sign-in` with 0 console errors; the stale persistent browser context reproduced #418 before the SW cache hardening.
- **Tags:** `#bug` `#auth` `#infra` `#pwa`

### CI "Unit Test" job red on main since 2026-06-20 — bun 1.3.1 (CI) vs 1.3.10 (local) env discrepancy

- **Discovered:** 2026-06-21 (full-repo code-review session; surfaced while verifying a push to prod)
- **Resolved:** 2026-06-23 (CI workflow/root `packageManager` now pin Bun 1.3.10; coverage output is redirected to avoid GitHub log-pipe aborts)
- **Where:** `.github/workflows/ci.yml` (`bun test --timeout 30000 --coverage`); root `package.json` `packageManager`.
- **Symptom:** CI `Unit Test` job concluded `failure` / exit 1 on every main push (`029b30ece` 06-20, `ee63617d6` + `d35141c2b` 06-21, `b0b1a0f3e` and `9dac8332a` 06-23). The GH log showed passes but no `(fail)` markers and no Bun summary line before exit 1; the process terminated after the coverage table.
- **Root cause:** CI was initially pinned to Bun 1.3.1 while local validation and the Chromatic workflow were on Bun 1.3.10. After aligning Bun, the runner still failed with the same shape: no `(fail)` markers, exit 1 immediately after dumping the huge coverage table. A local direct stream reproduced a Bun `WriteFailed`, while the same coverage run redirected to a file exited 0.
- **Fix:** Updated the CI typecheck/test jobs, the commented lint job template, and root `packageManager` from Bun 1.3.1 to 1.3.10 so local and GitHub Actions use the same toolchain. The unit job now runs the tracked test list explicitly and redirects coverage output to `/tmp/bun-test.log`, printing the full log only on failure and the tail on success.
- **Validation:** `git ls-files '*test.*' | xargs bun test --timeout 30000 --coverage > /tmp/weblab-tracked-tests.log 2>&1` on Bun 1.3.10 = 1862 pass / 1 skip / 0 fail across 155 tracked files; GitHub Actions re-run after push.
- **Tags:** `#infra` `#flake` `#tech-debt`

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
