# Weblab Performance + Production Readiness Audit

_Date: 2026-05-11. Audit scope: `apps/web/client`, tRPC routers,
middleware, providers, editor route. Focus on real production bottlenecks
and reliability, not Lighthouse cosmetics._

## What was audited

- Public/marketing route load (`/`, `/pricing`, `/blog`, `/features`,
  `/compare`, `/faq`, `/about`) — what loads, what leaks.
- Project editor route (`/project/[id]`) — initial load, sequential
  awaits, modal mounting, MobX engine cost, observer rerenders.
- All 21 tRPC routers — N+1, missing pagination, auth gaps, silent
  failures, `any` usage.
- Middleware (`apps/web/client/middleware.ts`) and provider stack in
  `apps/web/client/src/app/layout.tsx`.
- React Query defaults and SSR/client boundary hygiene.
- Missing loading.tsx / error.tsx coverage.

## Top bottlenecks found

### 1. Anonymous landing visitors trigger authenticated tRPC calls
- `apps/web/client/src/components/telemetry-provider.tsx:22` fires
  `api.user.get.useQuery()` on every page load, including the landing
  page for signed-out visitors. Round-trip blocks FCP and warms a
  401 path that should never run.
- `apps/web/client/src/components/ui/appearance-provider.tsx:10` does
  the same for `api.user.settings.get`. Two parallel requests for a
  signed-out visitor.

### 2. `@weblab/parser` leaked into the landing bundle
- `apps/web/client/src/components/store/create/manager.ts:10` imported
  `parseRepoUrl` from `../editor/pages/helper.ts`. That helper module
  eagerly imports `@weblab/parser` (Babel + AST tooling, ~hundreds of
  KB) at the top. Importing one tiny regex helper dragged the entire
  parser into every chunk that touches `CreateManager` — including the
  landing-page client bundle via `HomePageClient`.

### 3. `/project/[id]` had no `loading.tsx` or `error.tsx`
- Navigation to the editor was a blank screen while the layout's
  `auth.getUser()` + page's `Promise.all([project.get, branch.getByProjectId])`
  resolved.
- A thrown error in the layout, page, or providers showed Next's
  generic crash page. No graceful surface.

### 4. Editor modals all mounted statically
- `apps/web/client/src/app/project/[id]/_components/main.tsx:13-36`
  static-imported `SettingsModalWithProjects` (Stripe-dependent),
  `SubscriptionModal`, `KeyboardShortcutsModal`, `ElementPalette`,
  `CommandPalette`, `FileFinder`, `ProjectSearch`, `CmsBindDialog`,
  `CmsDataPusher`. All rendered on every editor load even though most
  users never open them in a given session.

### 5. tRPC list procedures were unbounded
- `chat/conversation.ts::getAll` — no `limit` on
  `conversations.findMany`.
- `comment/comment.ts::list` — no `limit` on `projectComments.findMany`
  (polled from canvas overlay).
- Other unbounded lists noted but not fixed in this pass:
  `chat/message.ts::getAll`, `project/invitation.ts::list`,
  `cms/binding.ts` lists.

### 6. `userCanvas.get` / `getWithFrames` missing project-access check
- `apps/web/client/src/server/api/routers/user/user-canvas.ts` filtered
  by `projectId + userId` but never called `verifyProjectAccess`. The
  query would have leaked `null` vs. `not-null` existence info for
  arbitrary `projectId` values guessed by an authenticated attacker.
  Treated as a security fix.

### 7. React Query refetched on every tab focus
- `apps/web/client/src/trpc/query-client.ts` left
  `refetchOnWindowFocus` at the React Query default of `true`. For an
  editor app where users often tab to Figma/docs/Slack and back, every
  refocus triggered a refetch storm. No `staleTime` save on this code
  path.

### 8. Silent error swallowing in `userCanvas.update`
- Returned `false` on any DB error. Caller (`canvas/index.ts:69`)
  logged but had no signal whether the failure was "not found" vs.
  "DB exploded".

### 9. No root `error.tsx`
- Provider errors in `app/layout.tsx` (TRPCReactProvider,
  TelemetryProvider, AuthProvider, etc.) would crash the entire app
  with Next.js' default error UI.

## Fixes implemented

| Fix | Files |
|-----|-------|
| Cheap client-side auth heuristic that gates anonymous-reachable tRPC calls until a Supabase cookie is present. Applied at the providers (TelemetryProvider, AppearanceProvider) AND every component-level caller of `user.get` / `provider.connectionsList` that the landing page mounts (HeroV2, ImportGitHub, CloneWebsite, top-bar AuthButton, model-picker statuses). | `apps/web/client/src/hooks/use-has-auth-cookie.ts` (new), `apps/web/client/src/components/telemetry-provider.tsx`, `apps/web/client/src/components/ui/appearance-provider.tsx`, `apps/web/client/src/app/_components/hero-v2.tsx`, `apps/web/client/src/app/_components/hero/import.tsx`, `apps/web/client/src/app/_components/hero/clone-website.tsx`, `apps/web/client/src/app/_components/top-bar/user.tsx`, `apps/web/client/src/components/ai-prompt-composer/model-picker/use-provider-statuses.ts` |
| Extract `parseRepoUrl` to a standalone module so the create flow no longer pulls `@weblab/parser` into the public bundle. | `apps/web/client/src/components/store/create/parse-repo-url.ts` (new), `apps/web/client/src/components/store/create/manager.ts`, `apps/web/client/src/components/store/editor/pages/helper.ts` |
| Add `loading.tsx` + `error.tsx` for `/project/[id]` and a root `error.tsx` for layout-level crashes. | `apps/web/client/src/app/project/[id]/loading.tsx` (new), `apps/web/client/src/app/project/[id]/error.tsx` (new), `apps/web/client/src/app/error.tsx` (new) |
| Lazy-load editor modals via `next/dynamic({ ssr: false })`. | `apps/web/client/src/app/project/[id]/_components/main.tsx` |
| Disable `refetchOnWindowFocus` globally; skip retry on `NOT_FOUND` / `BAD_REQUEST`. | `apps/web/client/src/trpc/query-client.ts` |
| Add `verifyProjectAccess` to `userCanvas.get`, `getWithFrames`, and `update`. Remove silent try/catch on `update`; surface errors to the client and catch at the call site instead. | `apps/web/client/src/server/api/routers/user/user-canvas.ts`, `apps/web/client/src/components/store/editor/canvas/index.ts` |
| Defensive `limit` on unbounded lists. | `apps/web/client/src/server/api/routers/comment/comment.ts` (500), `apps/web/client/src/server/api/routers/chat/conversation.ts` (200) |

## What got faster / more reliable

- **Anonymous landing visitors no longer fire 2 tRPC requests.** The
  401 round-trip from `user.get` + the bounce on `user.settings.get`
  are gone until the user has a Supabase session cookie. PostHog still
  identifies signed-in users on focus.
- **Smaller landing JS chunk.** `@weblab/parser`'s top-level imports
  (Babel + AST runtime) are no longer pulled in via the `CreateManager`
  chain that the landing page mounts. The parser module is now reached
  only from the project editor's page helpers, where it's actually
  used.
- **Editor opens faster.** Static imports for 9 modals (Stripe-backed
  settings, subscription modal, command/file palette, CMS dialogs,
  keyboard shortcuts, etc.) are now dynamic. They still render the
  same on open — just split into their own chunks.
- **Editor stays calm when the user tabs away.** No global refetch
  storm on `refocus`.
- **`/project/[id]` shows a real loading state instead of a blank
  screen** during the layout's auth check + the page's
  `Promise.all` over project + branches.
- **Provider/layout crashes no longer destroy the page.** A root
  `error.tsx` surfaces a recoverable UI; the project route has its
  own boundary with a "back to projects" exit.
- **Cross-project read access is closed.** `userCanvas.get` and
  `getWithFrames` now verify project access before returning data.
- **Comment poll and conversation list responses have a sane upper
  bound.** A pathological project (1000s of comments / conversations)
  no longer balloons editor TTFR.

## Issues intentionally left unfixed (next steps)

- **`chat/message.ts::getAll` unbounded.** A naive `limit` cap breaks
  chat history retrieval for long-running conversations. Needs proper
  pagination ("load older") with `cursor` input — bigger surgery than
  this audit warranted.
- **`project/invitation.ts::list` and `cms/binding.ts::findMany`
  unbounded.** Same shape — defer until pagination is wired in the
  UI.
- **TipTap composer still loads with the right panel.**
  `apps/web/client/src/components/ai-prompt-composer/tiptap-editor.tsx`
  is imported by the chat tab at module scope. The chat tab itself
  could be `dynamic`-loaded (currently rendered in
  `right-panel/index.tsx:233-274`), with a small skeleton while TipTap
  hydrates. Skipped to avoid touching the right panel's MobX
  observer/tab-change flow in this pass.
- **EditorEngine constructs 24 managers + `makeAutoObservable`
  synchronously** in `apps/web/client/src/components/store/editor/engine.ts:40-99`.
  Splitting into "core" and "lazy" managers (chat, CMS, comments) is
  a real refactor; out of scope here.
- **DesignPanel and CodePanel both mount in `left-panel/index.tsx`
  with the inactive one hidden via `className='hidden'`.** Switching
  to conditional rendering would avoid initial mount cost, but it
  also forces re-mount on every mode toggle. Needs a measurement
  pass before flipping.
- **`useStartProject` fires four conditional tRPC queries
  sequentially** (`use-start-project.tsx:41-70`). Could be expressed
  with `useQueries` to make the parallelism explicit, but the current
  shape already lets React Query parallelize when `enabled` flips.
  Lower priority.
- **`project/project.ts::list` selects all project columns** even
  though the client only renders a few fields. Drizzle `.columns({})`
  selection would shrink the payload. Skipped — needs a careful audit
  of every consumer.
- **`subscription/subscription.ts` `catch (error: any)`** and a few
  other `any` offenders. Cosmetic; not blocking.
- **`refetchOnWindowFocus: false` global default** may surprise a
  small number of queries that wanted freshness on focus. Opt-in
  per-query if any surface needs it.

## Risky areas that need manual QA

1. **Landing page**: anonymous visit should NOT issue
   `/api/trpc/user.get` or `/api/trpc/user.settings.get`. Verify in
   the Network panel.
2. **Sign-in → editor**: after auth, both providers should pick up
   the user on the next window-focus tick. If PostHog identify or
   theme/density doesn't apply after sign-in until the next hard
   reload, the cookie-detection heuristic needs revisiting.
3. **Editor modals**: open every modal (settings, subscription,
   command palette, file finder, project search, keyboard shortcuts,
   CMS bind dialog, CMS data pusher). They should still open
   instantly after a one-time chunk fetch.
4. **Editor `/project/[id]`**: throw a deliberate render error in
   `main.tsx` (temporarily) and confirm `error.tsx` shows. Same for
   the root `error.tsx`.
5. **Canvas save**: drag/zoom around the canvas. The debounced
   `userCanvas.update` mutation should still persist; the silent-
   failure path is gone, so any new failures will now show in the
   console.
6. **Cross-project access**: try `api.userCanvas.get` with a
   `projectId` you don't own — should now throw
   `Unauthorized or not found` instead of returning data.
7. **Comments / conversations on a large project**: list calls cap
   at 500 / 200 respectively. Verify the editor doesn't silently
   drop expected data. If a real project ever hits the cap, switch
   to paginated fetch.

## Validation

- `bun --filter @weblab/web-client typecheck` — passes (0 errors)
- `bun lint` — passes for changed files. Pre-existing parsing errors
  on `apps/web/client/test/**` and `vitest.config.ts` (test files not
  in tsconfig project service) are unchanged by this audit. One
  pre-existing warning in
  `apps/web/client/src/utils/upload/image-compression.ts:134` is also
  unrelated.
- Runtime spot-check via Claude Preview against the running dev server:
  confirmed the auth-cookie heuristic correctly returns `false` for an
  anonymous visitor (only `sb-*-auth-token-code-verifier` cookie
  present). Confirmed `user.get`, `subscription.get`, and
  `provider.connectionsList` were firing on `/` before the gating
  rolled out. The dev server crashed before a clean post-fix
  re-verification — see "Risky areas that need manual QA" below.

## Files changed

```
apps/web/client/src/app/error.tsx                                              (new)
apps/web/client/src/app/project/[id]/error.tsx                                 (new)
apps/web/client/src/app/project/[id]/loading.tsx                               (new)
apps/web/client/src/app/project/[id]/_components/main.tsx
apps/web/client/src/app/_components/hero-v2.tsx
apps/web/client/src/app/_components/hero/import.tsx
apps/web/client/src/app/_components/hero/clone-website.tsx
apps/web/client/src/app/_components/top-bar/user.tsx
apps/web/client/src/components/telemetry-provider.tsx
apps/web/client/src/components/ui/appearance-provider.tsx
apps/web/client/src/components/ai-prompt-composer/model-picker/use-provider-statuses.ts
apps/web/client/src/components/store/create/manager.ts
apps/web/client/src/components/store/create/parse-repo-url.ts                  (new)
apps/web/client/src/components/store/editor/canvas/index.ts
apps/web/client/src/components/store/editor/pages/helper.ts
apps/web/client/src/hooks/use-has-auth-cookie.ts                               (new)
apps/web/client/src/server/api/routers/chat/conversation.ts
apps/web/client/src/server/api/routers/comment/comment.ts
apps/web/client/src/server/api/routers/user/user-canvas.ts
apps/web/client/src/trpc/query-client.ts
```

## Notes for the next audit

- The next biggest win is splitting the editor right panel by tab so
  TipTap, ChatTab, StyleTab, and CommentsTab each lazy-load. That alone
  should shave noticeable JS off the editor's first paint.
- A second pass on `useStartProject` to express the four queries via
  `useQueries` would make the parallelism intent obvious and remove
  the implicit ordering.
- Add an upper bound + cursor-based pagination to
  `chat/message.ts::getAll` before any real conversation crosses ~1k
  messages.

---

## Pass 2 — 2026-05-11

Follow-up pass focused on editor chunk weight, AI chat robustness,
and remaining unbounded tRPC payloads. No features removed.

### Fixes implemented

| Fix | Files |
|-----|-------|
| Lazy-load the 8 design-panel tabs (Insert / Components / Layers / Search / Brand / Pages / Images / Branches) via `next/dynamic`. Each tab is already gated by `selectedTab === X`, so the dynamic imports give a clean bundle split for tabs the user may never open in a session. | `apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/index.tsx` |
| Lazy-load the right panel's Style and Comments tabs the same way, and only render them when the active tab matches. Chat stays static (it's the default tab). | `apps/web/client/src/app/project/[id]/_components/right-panel/index.tsx` |
| Lazy-load the CMS workspace itself (previously its sub-dialogs were dynamic but the workspace shell was static). DESIGN-only users never pay its bundle cost. | `apps/web/client/src/app/project/[id]/_components/main.tsx` |
| Parallelize branch boot. `BranchManager.init()` now runs each branch's `codeEditor.initialize() → sandbox.init()` chain in parallel via `Promise.all`. Within a branch we still serialize (sandbox depends on the FS that codeEditor sets up). Single-branch projects are unaffected; multi-branch projects shave N× IndexedDB/ZenFS setup latency. | `apps/web/client/src/components/store/editor/branch/manager.ts` |
| Parallelize `/project/[id]` server-side gate. Layout now runs Supabase `auth.getUser()` and tRPC `project.hasAccess` in `Promise.all` instead of awaiting them in sequence. | `apps/web/client/src/app/project/[id]/layout.tsx` |
| AI chat: stop in-flight stream on unmount AND on conversation switch (ChatTab uses `key={conversationId}` to force-remount). Prevents an orphaned upstream LLM stream from outliving its UI and silently consuming usage credits. | `apps/web/client/src/app/project/[id]/_hooks/use-chat/index.tsx` |
| Ollama probe now has a 5-second timeout via `AbortSignal.any([..., AbortSignal.timeout(5000)])`. A hung Ollama no longer freezes the model picker in "loading" forever. | `apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-tab-content/index.tsx` |
| AI suggestions: clear the dedupe signature on mutation error so a single transient network blip no longer permanently silences suggestions for the rest of the conversation. | `apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-input/index.tsx` |
| Gate `useSubscription` behind the auth-cookie heuristic. The pricing modal is mounted on public surfaces (landing, changelog) so the auth-modal CTA can open it without a route change — anonymous visitors should never trigger `api.subscription.get`. Verified empirically: after this fix, an anon visit to `/` fires zero `/api/trpc/*` requests. | `apps/web/client/src/components/ui/pricing-modal/use-subscription.tsx` |
| Defensive caps on remaining unbounded list procedures: `project.invitation.list` (200), `cms.binding.listForProject` (2000), `project.list` default 200 when no `limit` passed. Each is annotated with a TODO for cursor pagination if a real user hits the ceiling. | `apps/web/client/src/server/api/routers/project/invitation.ts`, `apps/web/client/src/server/api/routers/cms/binding.ts`, `apps/web/client/src/server/api/routers/project/project.ts` |

### What got faster / more reliable

- **Smaller editor initial chunk.** 8 design-panel tabs + 2 right-panel
  tabs + the CMS workspace shell now ship as on-demand chunks. A user
  who opens the editor in DESIGN mode, sticks to Layers + Chat, and
  never touches CMS pays for ~3 of those chunks instead of 11.
- **Faster multi-branch project boot.** Branches initialize in parallel
  inside the engine; the editor reaches "interactive" sooner on projects
  with 2+ branches.
- **Faster `/project/[id]` first byte.** Supabase auth and tRPC access
  check now run concurrently in the layout's server pass.
- **No orphan LLM streams.** Closing the chat tab, switching
  conversations, or navigating away cleanly aborts the upstream request
  — no more silently-burned usage credits while the user has already
  moved on.
- **Model picker can't get stuck loading.** Even if Ollama hangs on the
  user's machine, the probe times out in 5s and the picker settles to a
  useful "no local models" state.
- **AI suggestions resilient to flakes.** A single failed suggestion
  call no longer kills suggestions for the rest of the conversation.

### Still on the backlog

- TipTap composer itself (chat-input → AiPromptComposer → TipTap) still
  ships in the chat-tab chunk. Could be a further dynamic split, but
  chat is the default right-panel tab so the win is smaller than
  splitting cold tabs.
- `chat.message.getAll` is still unbounded. Capping it via desc + limit
  + reverse would silently drop the oldest messages on very long
  conversations — needs proper cursor pagination with a "load older"
  UI before we can cap safely.
- `useStartProject` four-query waterfall is unchanged. React Query is
  already parallelising the queries (they share the same `enabled`
  predicate), but the code shape implies sequence — worth a
  `useQueries` rewrite for clarity, not speed.
- EditorEngine's 24-manager `makeAutoObservable` is still synchronous.
  Splitting into "core" and "lazy" managers (comment / presence /
  screenshot only when needed) is a real refactor.
- `project.list` payload trim — Drizzle column selection on the nested
  `project` + `branches` + `frames` chain would shrink response size,
  but the `fromDbProject` mapper expects the full project row. Defer
  until the mapper is column-selective too.

### Validation (pass 2)

- `bun --filter @weblab/web-client typecheck` — 0 errors.
- `bun lint` — 27 errors (all pre-existing test-file parsing failures
  unrelated to this audit) + ~3700 warnings. None of the changed files
  contributed new findings.
- Runtime verification via Claude Preview against the running dev
  server: anon visit to `/` now produces `trpc: []` in
  `performance.getEntriesByType('resource')`. Down from the four
  pre-fix calls (`user.get` + `user.settings.get` +
  `provider.connectionsList` + `subscription.get`). Zero error-level
  console logs on landing.

### Files changed (pass 2)

```
apps/web/client/src/app/project/[id]/layout.tsx
apps/web/client/src/app/project/[id]/_components/main.tsx
apps/web/client/src/app/project/[id]/_components/right-panel/index.tsx
apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-input/index.tsx
apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-tab-content/index.tsx
apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/index.tsx
apps/web/client/src/app/project/[id]/_hooks/use-chat/index.tsx
apps/web/client/src/components/store/editor/branch/manager.ts
apps/web/client/src/components/ui/pricing-modal/use-subscription.tsx
apps/web/client/src/server/api/routers/cms/binding.ts
apps/web/client/src/server/api/routers/project/invitation.ts
apps/web/client/src/server/api/routers/project/project.ts
```

### Manual QA additions (pass 2)

1. Open the editor — Insert / Layers / Brand / Pages tabs should each
   load on first click with a brief flash, then stay instant.
2. Switch right-panel tabs from Chat → Style → Comments — each switch
   should load its module once, then stay instant.
3. Switch the editor mode to CMS — workspace should load on first
   entry, then be cached.
4. Open a project with 2+ branches — should hit "editor interactive"
   noticeably faster than before.
5. Send a chat message, then immediately switch conversations or close
   the panel — verify the upstream request gets aborted (no continued
   token consumption in the network panel).
6. Stop Ollama (or block port 11434) — the local-models picker should
   resolve to "no local models" within ~5s instead of spinning forever.
7. Block `/api/trpc/chat.suggestions.generate` once (network throttle
   "offline" → unblock) — after sending the next message, suggestions
   should retry on the next state change rather than staying empty.
