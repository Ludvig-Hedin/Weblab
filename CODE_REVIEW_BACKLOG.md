# Code Review Backlog — 2026-04-29

Review of all local changes (uncommitted + last 3 commits) at HEAD `5d364cf1`.
Scope: ~2.5k diff lines + 11 new files spanning UI library, editor canvas/hotkeys,
chat input, comments, projects/select, stores, tRPC, desktop release workflow.

| ID | Status |
|----|--------|
| CR-001 | auto-fixed |
| CR-002 | resolved (2026-05-06) — focus rings removed per product direction |
| CR-003 | fixed (2026-05-04) |
| CR-004 | fixed (2026-05-04) |
| CR-005 | fixed (2026-05-04) |
| CR-006 | fixed (2026-05-03) |
| CR-007 | resolved (2026-05-06) — duplicate WRAP_IN_DIV static + comments removed |
| CR-008 | done (fixed in feature/settings-overhaul working tree) |
| CR-009 | fixed (2026-05-04) |
| CR-010 | fixed (2026-05-04) |
| CR-011 | fixed (2026-05-04) |
| CR-012 | n/a — yml already uses bun install |
| CR-013 | fixed (2026-05-03) |
| CR-014 | fixed (2026-05-03) |
| CR-015 | auto-fixed (2026-05-03 review) |
| CR-016 | fixed (2026-05-03) |
| CR-017 | resolved (2026-05-06) — added helper text clarifying server-side detection scope |
| CR-018 | fixed (2026-05-03) |
| CR-019 | fixed (2026-05-03) |
| CR-020 | fixed (2026-05-03) |
| CR-021 | documented (2026-05-04) — TODO comment added; needs pkg version alignment |
| CR-022 | fixed (2026-05-04) |
| CR-023 | open (2026-05-03 review) |
| CR-024 | discussion-only (2026-05-03 review) |
| CR-025 | resolved (2026-05-06) — DEFAULT_CHAT_MODEL extracted to @weblab/models |
| CR-026 | resolved (2026-05-06) — AIBehaviorSettings extracted; JSDoc clarifies canonical paths |
| CR-027 | open (2026-05-04 review) |
| CR-028 | n/a — orphan table entry, no body in backlog |
| CR-029 | resolved — page shows "Coming soon" for all platforms; no live link |
| CR-030 | auto-fixed (2026-05-03 review) |
| CR-031 | auto-fixed (2026-05-03 review) |
| CR-032 | auto-fixed (2026-05-06 review) |
| CR-033 | auto-fixed (2026-05-03 review) |
| CR-034 | resolved (2026-05-06) — verified clean across infra files |
| CR-035 | auto-fixed (2026-05-03 review) |
| CR-036 | auto-fixed (2026-05-03 review) |
| CR-037 | auto-fixed (2026-05-06 review) |
| CR-038 | auto-fixed (2026-05-03 review) |
| CR-039 | auto-fixed (2026-05-03 review) |
| CR-040 | auto-fixed (2026-05-03 review) |
| CR-041 | auto-fixed (2026-05-03 review) |
| CR-042 | auto-fixed (2026-05-03 review) |
| CR-043 | auto-fixed (2026-05-03 review) |
| CR-044 | code-fixed (2026-05-06) — awaiting manual billing sign-off before shipping |
| CR-045 | resolved (2026-05-06 review) — PII removed from fallback logs |
| CR-046 | fixed (2026-05-06 review) |
| CR-047 | fixed (2026-05-06 review) |
| CR-048 | fixed (2026-05-06 review) |
| CR-049 | resolved (2026-05-06) — searchTerm threaded; scrollToFirstMatch fires on view mount |
| CR-050 | resolved (2026-05-06) — 30s polling on canvas+frames; idempotent applyFrames |
| CR-056 | auto-fixed (2026-05-07 review) — duplicate imports removed |
| CR-057 | auto-fixed (2026-05-07 review) — figma plugin UI hygiene (listener/timeout/useMemo) |
| CR-058 | partially fixed (2026-05-07) — journal entries added; snapshots are placeholder copies, maintainer should regenerate via `bun db:gen` |
| CR-059 | fixed (2026-05-07) — schema columns added, mappers prefer authoritative columns with legacy fallback |
| CR-060 | fixed (2026-05-07) — userId scoping added to update + releaseSubscriptionSchedule |
| CR-061 | fixed (2026-05-07) — verifyProjectAccess added to chat/message, chat/conversation, domain/verify |
| CR-062 | fixed (2026-05-07) — script wrapped in `bash -c` |
| CR-063 | fixed (2026-05-07) — invitation row rolled back on email failure |
| CR-064 | deferred (2026-05-07) — Anthropic models can't run generateObject; needs a non-Anthropic small-tier model added to OPENROUTER_MODELS first |
| CR-065 | auto-fixed (2026-05-08) — `text-smallall` typo in terminal-area.tsx |
| CR-066 | auto-fixed (2026-05-08) — dead `ButtonLink` import in about/page.tsx |
| CR-067 | fixed (2026-05-08) — microphone=(self) restores transcription |
| CR-068 | fixed (2026-05-08) — isComposing removed from props interface |
| CR-069 | fixed (2026-05-08) — DB query removed; 501 returned directly |
| CR-070 | open (2026-05-09) — CRITICAL: `NEXT_PUBLIC_SITE_URL` localhost default leaks into prod |
| CR-071 | auto-fixed (2026-05-09) — CMS `field.update` now scopes via parent collection's projectId |
| CR-072 | auto-fixed (2026-05-09) — CMS `field.delete` now scopes via parent collection's projectId |
| CR-073 | open (2026-05-09) — CMS external source credentials stored as plaintext JSONB |
| CR-074 | open (2026-05-09) — CMS slug uniqueness not enforced at DB level |
| CR-075 | open (2026-05-09) — Supabase session refresh runs on `/api/*` including chat stream |
| CR-076 | open (2026-05-09) — frame breakpoint columns left nullable after backfill |
| CR-077 | open (2026-05-09) — `ensureBreakpointSiblings` not idempotent on partial create failure |
| CR-078 | open (2026-05-09) — N+1 in CMS `collection.list` item-count loop |
| CR-079 | open (2026-05-09) — orphan `hero/create.legacy.tsx` (24KB, no imports) |
| CR-080 | open (2026-05-09) — orphan `chat-input/index.legacy.tsx` (22KB, no imports) |
| CR-081 | open (2026-05-09) — `ActionsGroup` `groupKey` prop declared but never read |
| CR-082 | open (2026-05-09) — `select-folder.tsx` header copy still implies Next.js-only |
| CR-083 | open (2026-05-09) — html-pipeline INSERT_IMAGE/REMOVE_IMAGE error path untested |
| CR-084 | open (2026-05-09) — GitHub install callback history scrubbing only on success/error |
| CR-085 | open (2026-05-09) — Sign-out hard-navigates even if `signOut()` throws |
| CR-086 | open (2026-05-09) — responsive parser tests miss `!important`, arbitrary, pseudo edge cases |

---

## CR-001 — `SIDEBAR_INSERT` hotkey advertised but unbound  *(auto-fixed)*

- **Area:** [canvas/hotkeys/index.tsx](apps/web/client/src/app/project/[id]/_components/canvas/hotkeys/index.tsx), [hotkey.ts](apps/web/client/src/components/hotkey.ts), [design-panel/index.tsx](apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/index.tsx)
- **Type:** bug
- **Impact:** user-facing
- **Risk:** low
- **Summary:** `Hotkey.SIDEBAR_INSERT` (alt+a) was added and exposed as the keyboard shortcut for the new Insert tab in the left-panel tab list and tooltip, but no `useHotkeys` registration existed for it. Pressing alt+a did nothing. All siblings (`SIDEBAR_LAYERS`/`BRAND`/`PAGES`/`IMAGES`/`BRANCHES`/`SEARCH`) are wired.
- **Fix applied:** added `useHotkeys(Hotkey.SIDEBAR_INSERT.command, () => toggleLeftPanelTab(LeftPanelTabValue.INSERT), { preventDefault: true })` next to the other sidebar bindings. Pattern matches existing wirings exactly.

---

## CR-002 — UI focus-ring refactor leaves inconsistent ring widths across components

- **Area:** [packages/ui/src/globals.css](packages/ui/src/globals.css), [packages/ui/src/components/](packages/ui/src/components/) (badge, button, checkbox, dialog, input, navigation-menu, radio-group, scroll-area, select, sheet, sidebar, slider, switch, tabs, toggle, accordion, color-picker)
- **Type:** design debt / a11y
- **Impact:** user-facing (focus-visible appearance)
- **Risk:** low
- **Summary:** Global rule was added to `globals.css` (`button/[role=button]/a/input/select/textarea/summary:focus-visible` → `outline-hidden ring-2 ring-ring ring-offset-2`). At the same time many per-component `focus-visible:ring-[3px]` and `focus-visible:border-ring` classes were *removed* from some components (Accordion, Badge, NavigationMenu, ScrollArea, Select, Sheet) but *kept* on others (Switch, Toggle, RadioGroupItem, Checkbox, Input, Tabs, Slider). The result is that some focusable controls now show a `ring-2` focus ring (from global) while others compose `ring-2` + `ring-[3px]` (from class) producing a thicker ring. Visually inconsistent.
- **Suggested approach:** pick one source of truth. Either remove the remaining per-component `focus-visible:*` classes and rely entirely on the global rule, or keep per-component classes and remove the global rule. Audit Storybook/dev to confirm.

---

## CR-003 — ColorPicker `Input` lost inset focus ring; global focus rule will overflow tight UI

- **Area:** [color-picker/ColorPicker.tsx:13](packages/ui/src/components/color-picker/ColorPicker.tsx)
- **Type:** bug (regression)
- **Impact:** user-facing
- **Risk:** medium
- **Summary:** Removed `outline-0 focus:ring-1 ring-inset ring-foreground-active` from the `tw\`...\`` input styling. The input is still an `<input>` element so the new global rule (`input:focus-visible { ring-2 ring-ring ring-offset-2 }`) applies an *offset* ring that protrudes outside the picker chrome. Inset ring was deliberate.
- **Suggested approach:** restore an inset ring locally, e.g. `focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-foreground-active focus-visible:ring-offset-0`, and override the offset from the global. Verify in the live picker.

---

## CR-004 — Search `useMemo` deps invalidate on every render; BFS uses `Array.shift()`

- **Area:** [search-tab/use-search.ts:128-195](apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/search-tab/use-search.ts)
- **Type:** performance
- **Impact:** internal
- **Risk:** low
- **Summary:** `allFrames`, `selectedFrameIds`, `layerRoots`, `layerSizes` are recomputed each render (each `.filter`/`.map` returns a new array reference), so the result `useMemo` recomputes the entire BFS on every render even when `debounced`/`filter`/`scope` haven't changed. Additionally, the traversal uses `stack.shift()` which is O(n²) on large element trees (a queue should use a write-only index, or DFS via `pop()`).
- **Suggested approach:** stabilize deps with `useMemo`/`useCallback` or use a content key (e.g. concat of `frameId:rootDomId` plus a layer-mapping version counter). Switch traversal to `stack.pop()` for DFS, or use a dedicated queue. Worth measuring on a large frame.

---

## CR-005 — Reasoning content disappears as soon as streaming ends

- **Area:** [chat-messages/message-content/index.tsx:52-66](apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-messages/message-content/index.tsx)
- **Type:** UX regression
- **Impact:** user-facing
- **Risk:** medium
- **Summary:** Previously `Reasoning` was always rendered (with shimmer styles only while streaming). Now it returns `null` unless `isStream && isLastPart`. Once the assistant finishes, the user can no longer expand/inspect what the model was thinking — the reasoning content vanishes from the conversation. Search/audit/debug becomes harder.
- **Suggested approach:** confirm intent with PM/design. If the goal was just to stop the shimmer post-stream, keep rendering `Reasoning` but only apply the shimmer/animate classes while `isStream && isLastPart`. Avoid hiding the content entirely.

---

## CR-006 — Iframe live preview no longer sets `referrerPolicy="no-referrer"`

- **Area:** [project-preview-surface.tsx:97-110](apps/web/client/src/app/projects/_components/select/project-preview-surface.tsx)
- **Type:** privacy / security
- **Impact:** user-facing
- **Risk:** low
- **Summary:** The redesigned project tile iframe dropped `referrerPolicy="no-referrer"`. Each project tile now leaks the projects-page Referer to the embedded site on load. Minor but cheap to restore.
- **Suggested approach:** re-add `referrerPolicy="no-referrer"` (and consider `sandbox` to prevent third-party JS in the previewed site from running freely against an iframe context attached to weblab.build).

---

## CR-007 — `WRAP_IN_DIV` (cmd+alt+g) is identical to `GROUP` (cmd+g)

- **Area:** [hotkey.ts:43-44](apps/web/client/src/components/hotkey.ts), [canvas/hotkeys/index.tsx:185-191](apps/web/client/src/app/project/[id]/_components/canvas/hotkeys/index.tsx)
- **Type:** UX / inconsistency
- **Impact:** user-facing
- **Risk:** low
- **Summary:** `Hotkey.WRAP_IN_DIV` was added as `mod+alt+g` with the label "Wrap in Div", and `UNGROUP` was renamed to "Unwrap parent". Both `GROUP` and `WRAP_IN_DIV` are routed to the same `editorEngine.group.groupSelectedElements()`, so they behave identically despite the different label. If "Wrap in Div" is intended to behave differently (e.g. always wrap a single element in a fresh div regardless of selection count), the handler needs to diverge.
- **Suggested approach:** decide whether `WRAP_IN_DIV` is just a marketing label for `GROUP` or a separate operation, then either drop the duplicate hotkey or implement a distinct `wrapInDiv` action.

---

## CR-008 — Default chat model hardcoded to `OPENROUTER_MODELS.KIMI_K2_6` *(done)*

- **Area:** [chat-tab-content/index.tsx](apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-tab-content/index.tsx)
- **Type:** maintainability
- **Impact:** user-facing
- **Risk:** medium
- **Summary:** Default state was `OPENROUTER_MODELS.KIMI_K2_6` rather than the canonical option list head.
- **Resolution (2026-05-03):** Working tree now uses `useState<ChatModel>(CHAT_MODEL_OPTIONS[0].model)` and additionally hydrates from `userSettings?.chat.defaultModel` once settings load (gated by a `userChangedModel` ref so a session-level pick beats the saved default). Marking done.

---

## CR-009 — Model selector hides label under 260px container

- **Area:** [chat-input/model-selector.tsx:42](apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-input/model-selector.tsx)
- **Type:** UX
- **Impact:** user-facing
- **Risk:** low
- **Summary:** `<span className="@[260px]:inline hidden ...">` only shows the model label when the container is ≥260px wide. On a narrow chat panel the user sees only a chevron — no indication of which model is active.
- **Suggested approach:** keep a short truncated form (e.g. icon + first letters) below the breakpoint, or render a tooltip on hover that always shows the current model.

---

## CR-010 — Mobile/desktop layout swap may flicker and drop unmounted state

- **Area:** [main.tsx:36-130](apps/web/client/src/app/project/[id]/_components/main.tsx)
- **Type:** UX / refactor
- **Impact:** user-facing
- **Risk:** low
- **Summary:** Renders `null` until `useEffect` measures `window.innerWidth`, then conditionally renders `<MobileLayout/>` vs the desktop tree. On viewport resize across the 768px breakpoint the entire editor (Canvas, ChatTab, modals) unmounts and remounts. Brief blank flash on first paint, plus loss of any local component state at the boundary.
- **Suggested approach:** prefer CSS-driven hide/show with both layouts in the DOM at all times, OR use `matchMedia` and an SSR-aware default to avoid the `null` first paint. Only swap the tree if there's strong reason (e.g. touch vs pointer event handling).

---

## CR-011 — Comments router writes user metadata as `authorName` without sanitation

- **Area:** [routers/comment/comment.ts:43-46](apps/web/client/src/server/api/routers/comment/comment.ts), [routers/comment/reply.ts:30-33](apps/web/client/src/server/api/routers/comment/reply.ts)
- **Type:** privacy / display safety
- **Impact:** user-facing
- **Risk:** low/medium
- **Summary:** `authorName` now falls back to `ctx.user.user_metadata?.name ?? ctx.user.user_metadata?.full_name ?? ctx.user.email`. Supabase user_metadata is user-controllable (set during signup or via update profile) — an author can put arbitrary content (including emoji, RTL, or impersonation strings) into it and it will be displayed verbatim everywhere. Also reveals the user's real name on what was previously an email-only display, which is a small privacy shift.
- **Suggested approach:** decide whether you want to (a) display real names (then add length/character validation server-side, and consider a separate `display_name` field) or (b) keep email-only. If displaying name, render with explicit text node only (not innerHTML) — confirm the comments-tab/popover rendering escapes properly.

---

## CR-012 — Desktop release uses `npm install` in a Bun monorepo

- **Area:** [.github/workflows/desktop-release.yml](.github/workflows/desktop-release.yml), [apps/desktop/RELEASES.md](apps/desktop/RELEASES.md)
- **Type:** DX / build correctness
- **Impact:** infra
- **Risk:** medium
- **Summary:** CLAUDE.md states "Use Bun for all installs and scripts; do not use npm, yarn, or pnpm." The new workflow runs `npm install` in `apps/desktop/`. If the Electron app shares any workspace deps with the monorepo, the npm-resolved tree may differ from the Bun lockfile and ship a different version of a transitive dep than what local devs/CI test. Also there's no lockfile commit produced — `npm install` creates a `package-lock.json` that is not tracked, so installs are non-deterministic.
- **Suggested approach:** switch to `bun install --frozen-lockfile` (matching the rest of the monorepo) or commit a `package-lock.json` in `apps/desktop` and use `npm ci`. Either way, lock the install for reproducibility.

---

## CR-013 — `parseRepoUrl` regex matches any host containing the substring "github.com/"

- **Area:** [routers/github.ts:11-23](apps/web/client/src/server/api/routers/github.ts)
- **Type:** security (low blast radius)
- **Impact:** internal
- **Risk:** low
- **Summary:** Regex `github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$` will accept `https://evilgithub.com/owner/repo` (subdomain attack: substring still matches). The mutation runs against the user's authenticated Octokit, so an attacker-controlled `repoUrl` could only cause API calls against `owner/repo` on the real GitHub anyway (Octokit ignores the host string), so the practical impact is limited — but the validation gives a false sense of safety.
- **Suggested approach:** parse with `new URL(repoUrl)` and assert `u.hostname === 'github.com' || u.hostname === 'www.github.com'`. Then take the first two path segments.

---

## CR-014 — `static-templates.tsx` `id: string` decouples from alias map keys

- **Area:** [static-templates.tsx:9](apps/web/client/src/app/projects/_components/templates/static-templates.tsx), [select/index.tsx:48-90](apps/web/client/src/app/projects/_components/select/index.tsx)
- **Type:** maintainability
- **Impact:** internal
- **Risk:** low
- **Summary:** `StaticTemplate.id` is typed as `string`. `STATIC_TEMPLATE_ALIASES` and the `templateNames` map in `select/index.tsx` use `Record<StaticTemplate['id'], …>` which collapses to `Record<string, …>` — adding a new TEMPLATES entry will not produce a TS error if its alias entry is missing, and `availableStaticTemplateIds` will silently drop it.
- **Suggested approach:** narrow the id with a literal-union type (`'portfolio' | 'saas' | …`) and reuse it across both files. Then missing aliases become compile errors.

---

# Review pass 2026-05-03

Scope: 18 modified files + 4 unpushed commits + a large set of new untracked files spanning Ollama support, transcription endpoint, local-folder import, settings overhaul (account/ai/appearance/editor/git/github/language/shortcuts tabs), framework adapters, and an MCP package.

## CR-015 — Transcribe route used `Onlook` brand strings *(auto-fixed)*

- **Area:** [api/transcribe/route.ts](apps/web/client/src/app/api/transcribe/route.ts)
- **Type:** bug (brand)
- **Impact:** internal (OpenRouter dashboard attribution)
- **Risk:** low
- **Summary:** Outbound headers were `HTTP-Referer: https://weblab.build` and `X-Title: Onlook`, in violation of the CLAUDE.md "Weblab" rule for user-facing strings.
- **Fix applied:** swapped to `https://weblab.build` and `Weblab`. No behavior change beyond the OpenRouter attribution string.

## CR-016 — `/api/models/local` is unauthenticated and unrate-limited

- **Area:** [api/models/local/route.ts](apps/web/client/src/app/api/models/local/route.ts)
- **Type:** security / hardening
- **Impact:** internal
- **Risk:** low
- **Summary:** No `getSupabaseUser` check, no rate limit. SSRF is correctly mitigated (loopback-only allowlist on `baseUrl`), but the inconsistency with `/api/chat` and `/api/transcribe` (both auth + rate-limited) is worth addressing.
- **Suggested approach:** Wrap with `getSupabaseUser` and reuse the in-memory limiter from `transcribe/helpers/rate-limit.ts` (or factor a shared limiter).

---

# Review pass 2026-05-03 — feat/import-from-figma worktree + latest brand commits

Scope: nested worktree `.claude/worktrees/happy-ellis-e087a2` local changes on `claude/happy-ellis-e087a2`, plus the top-level latest three local commits at `47852f42`, `0aff6afe`, and `f82c64c4`.

## CR-034 — Brand rename still has non-allowed `Onlook`/`onlook` references in infra and lock metadata  *(resolved)*

- **Area/Scope:** `Dockerfile`, `docker-compose.yml`, `bun.lock`, docs/deploy files
- **Type:** bug / DX
- **Impact:** infra / internal
- **Risk:** medium
- **Summary:** The Phase 2 brand commits originally left `Onlook` references in infra files (`Dockerfile:1` first-line comment, `docker-compose.yml` service/network names, root `bun.lock` workspace metadata).
- **Resolution (2026-05-06):** Re-audited with `grep -ni "onlook"` against `Dockerfile`, `docker-compose.yml`, and `bun.lock` — all three are now clean. The Dockerfile header is `# Build Weblab web client`, the compose project name is `weblab`, and the network is `supabase_network_weblab-web`. Closing.
- **Status:** resolved

## CR-035 — Components router accepted arbitrary absolute `projectRoot` paths

- **Area/Scope:** `apps/web/client/src/server/api/routers/components.ts`
- **Type:** security
- **Impact:** internal
- **Risk:** medium
- **Summary:** The protected `listProjectComponents` endpoint accepted `projectRoot` from the client and only rejected strings containing `..`. Any authenticated user could request another absolute path with a `src` directory and receive discovered component names/file paths from server-local files.
- **Suggested approach:** Runtime requests should always scan the fixed sandbox root; only tests should be allowed to override the root path.
- **Status:** auto-fixed
- **Fix applied:** The router now ignores `projectRoot` outside `NODE_ENV === 'test'` and resolves test-only overrides before scanning.

## CR-036 — Switching from user component click mode to built-in template click left stale insert state

- **Area/Scope:** `apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/components-tab/index.tsx`
- **Type:** bug
- **Impact:** user-facing
- **Risk:** low
- **Summary:** Clicking a built-in component template set `pendingInsertElement`, but did not clear `pendingInsertBlock` or `pendingInsertComponent`. If a prior user-component placement was pending, the stale component state could survive after the element insert and unexpectedly affect the next canvas click.
- **Suggested approach:** Clear the mutually exclusive pending insert states whenever entering a specific insert mode.
- **Status:** auto-fixed
- **Fix applied:** `handleTemplateClick` now clears both `pendingInsertBlock` and `pendingInsertComponent` before switching to design placement mode.

## CR-037 — Component discovery parser does not detect common namespace-wrapped exports

- **Area/Scope:** `apps/web/client/src/server/api/routers/components.utils.ts`
- **Type:** bug / maintainability
- **Impact:** user-facing
- **Risk:** low
- **Summary:** The HOC regex detects lowercase wrapper calls like `observer(...)` and `withRouter(...)`, but misses common namespace wrappers such as `React.memo(...)` and `React.forwardRef(...)`. Those exported components will not appear in "My Components" even though they are valid user components.
- **Suggested approach:** Extend extraction tests with `export const Foo = React.memo(...)` and `React.forwardRef(...)`, then replace or broaden `HOC_WRAPPED_RE` to support member expressions without admitting lowercase non-component exports.
- **Status:** open

## CR-017 — Local-Ollama detection probes the *server's* localhost, not the user's

- **Area:** [api/models/local/route.ts](apps/web/client/src/app/api/models/local/route.ts), [chat-tab-content/index.tsx](apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-tab-content/index.tsx), [ai-tab.tsx](apps/web/client/src/components/ui/settings-modal/ai-tab.tsx)
- **Type:** design / deployment-dependent bug
- **Impact:** user-facing
- **Risk:** medium
- **Summary:** The "detect local Ollama" flow runs server-side (`fetch('http://localhost:11434/api/tags')` from a Next.js Route Handler). On Vercel/hosted deployments, `localhost` is the function container — *not* the user's machine — so the feature only works in self-hosted/dev. In hosted mode it always returns 0 models and silently misleads the AI tab UI ("No local models detected. Make sure Ollama is running.").
- **Suggested approach:** Either (a) move detection to client-side (browser → `http://localhost:11434/api/tags` directly; needs Ollama CORS config), or (b) gate the entire local-models UI behind a self-hosted flag so hosted users don't see a broken affordance.

## CR-018 — Race condition in local-models fetch on URL change

- **Area:** [chat-tab-content/index.tsx](apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-tab-content/index.tsx), [ai-tab.tsx](apps/web/client/src/components/ui/settings-modal/ai-tab.tsx) (`detectLocalModels`)
- **Type:** bug
- **Impact:** user-facing
- **Risk:** low
- **Summary:** Both fire `fetch('/api/models/local?...')` from `useEffect` without an `AbortController`. Rapid edits to the Ollama URL (or unmount during in-flight) can let an older response resolve last and overwrite the newer model list. `response.ok` also isn't checked before `response.json()`, so a 4xx HTML body would throw and be silently swallowed by the `.catch(() => setLocalModels([]))`.
- **Suggested approach:** Wire an `AbortController` per fetch; abort on dep change and on unmount. Check `response.ok` and treat non-2xx as "unavailable" with a console warn.

## CR-019 — Ollama base URL double-`/api` if user includes path segment

- **Area:** [packages/ai/src/chat/providers.ts](packages/ai/src/chat/providers.ts) (`getOllamaProvider`), [api/models/local/route.ts](apps/web/client/src/app/api/models/local/route.ts)
- **Type:** bug
- **Impact:** user-facing
- **Risk:** low
- **Summary:** `${baseUrl.replace(/\/$/, '')}/api` always appends `/api`. If a user pastes `http://localhost:11434/api`, the SDK will be configured with `http://localhost:11434/api/api`. Mirror issue in the probe route.
- **Suggested approach:** Normalize once: strip a single trailing `/api` segment if present before appending. Extract a small util in `@weblab/models` and reuse in both places.

## CR-020 — `ChatModel` type widened; route forwards arbitrary `ollama/<anything>`

- **Area:** [packages/models/src/llm/index.ts](packages/models/src/llm/index.ts), [packages/ai/src/agents/root.ts](packages/ai/src/agents/root.ts), [api/chat/route.ts](apps/web/client/src/app/api/chat/route.ts)
- **Type:** hardening
- **Impact:** internal
- **Risk:** low
- **Summary:** `ChatModel = OPENROUTER_MODELS | OllamaModelId` (where `OllamaModelId = \`ollama/${string}\``) means any string of that shape is type-valid. The chat route forwards it to `initModel` without validation. Garbage like `ollama/../foo` only fails because the upstream Ollama HTTP API rejects unknown names — we shouldn't rely on that.
- **Suggested approach:** Validate the part after `ollama/` against a name regex (e.g. `^[a-z0-9._:-]+$`) before forwarding. Reject otherwise with a 400.

## CR-021 — `getOllamaProvider` casts via `as unknown as LanguageModel`

- **Area:** [packages/ai/src/chat/providers.ts](packages/ai/src/chat/providers.ts)
- **Type:** DX / type safety
- **Impact:** internal
- **Risk:** low
- **Summary:** Forced double-cast through `unknown` papers over a type mismatch between `ollama-ai-provider-v2` and the `ai` SDK's `LanguageModel`. If either SDK shifts, TS won't catch a regression.
- **Suggested approach:** Track the real incompatibility (likely v1 vs v2 of `LanguageModel`); pin matching versions and remove the cast.

## CR-022 — `useImportLocalProject` drops the import intent on unauthed entry

- **Area:** [hooks/use-import-local-project.ts](apps/web/client/src/hooks/use-import-local-project.ts)
- **Type:** UX
- **Impact:** user-facing
- **Risk:** low
- **Summary:** When the user clicks "Open local folder" while signed out, the auth modal opens and the return URL is saved — but the folder picker isn't reopened after sign-in. User has to remember to click the button again.
- **Suggested approach:** Set a "resume intent" localforage flag before opening auth. After successful auth, the `projects` page reads it and re-triggers the picker once.

## CR-023 — DB schema changes (`default_model`, `ollama_base_url`) require `bun db:push`

- **Area:** [packages/db/src/schema/user/settings.ts](packages/db/src/schema/user/settings.ts) and mappers/defaults
- **Type:** ops note
- **Impact:** infra
- **Risk:** medium (forgotten = runtime failure on first save)
- **Summary:** Two new nullable text columns added to `user_settings`. RLS-enabled. No migration file is committed (the project uses `db:push`, not generated SQL), so columns won't exist in any environment until someone runs it.
- **Suggested approach:** Run `bun db:push` against staging/prod (maintainer-only per CLAUDE.md). Confirm the existing `user_settings` RLS policies cover the new columns.

# Review pass 2026-05-04

Scope: 14 modified files + 2 new files (comment helpers, coderabbit artifact).
Changes: CR-007/010/011 fixes, settings data layer expansion (13 new DB columns,
4 new interface namespaces), light-mode color token migration, preload script update.

## CR-025 — `DefaultSettings.AI_SETTINGS.defaultModel` hardcodes a model string

- **Area:** [packages/constants/src/editor.ts](packages/constants/src/editor.ts)
- **Type:** maintainability
- **Impact:** user-facing
- **Risk:** low
- **Summary:** `AI_SETTINGS.defaultModel` is set to `'moonshotai/kimi-k2'` — same anti-pattern as the old CR-008 (`KIMI_K2_6` hardcode). The canonical default model lives in `CHAT_MODEL_OPTIONS[0].model` in `@weblab/models`, but `packages/constants` cannot import from `packages/models` without risking a circular dependency. Instead the string drifts independently.
- **Suggested approach:** Either (a) move `AI_SETTINGS.defaultModel` to `packages/models` where `CHAT_MODEL_OPTIONS` is defined, or (b) define a shared `DEFAULT_CHAT_MODEL` constant in `packages/models` and import it from both constants and models. Remove the raw string.

## CR-026 — `ChatSettings` and `AISettings` are overlapping interfaces; `toDbUserSettings` is inconsistent

- **Area:** [packages/models/src/user/settings.ts](packages/models/src/user/settings.ts), [packages/db/src/mappers/user/settings.ts](packages/db/src/mappers/user/settings.ts)
- **Type:** maintainability / design debt
- **Impact:** internal
- **Risk:** low (no runtime bug — upsert is a direct partial column update)
- **Summary:** `AISettings` duplicates `autoApplyCode`, `expandCodeBlocks`, `showSuggestions`, `showMiniChat` from `ChatSettings`. `fromDbUserSettings` populates both namespaces from the same DB columns, so reads are consistent. `toDbUserSettings` now reads chat fields from `settings.ai.*` instead of `settings.chat.*`, but this function is not on the upsert hot path (the tRPC upsert does `db.update(userSettings).set(partialInput)` directly). Still, the dual namespace means future contributors must keep both in sync, and `toDbUserSettings` would produce wrong output if ever used for a full-object write.
- **Suggested approach:** Deprecate the overlapping fields in `ChatSettings` and migrate all consumers to `settings.ai.*`. Or collapse `AISettings` into `ChatSettings` and remove the duplication.

## CR-027 — 13 new `user_settings` columns require `bun db:push` *(extends CR-023)*

- **Area:** [packages/db/src/schema/user/settings.ts](packages/db/src/schema/user/settings.ts)
- **Type:** ops note
- **Impact:** infra
- **Risk:** medium (columns absent → upsert query fails on first write of any new field)
- **Summary:** `maxImages`, `enableBunReplace`, `buildFlags`, `theme`, `accentColor`, `fontFamily`, `fontSize`, `uiDensity`, `locale`, `autoCommit`, `autoPush`, `commitMessageFormat`, `defaultBranchPattern`, `customShortcuts` added in this diff. Like CR-023, no migration file is committed. All new columns have `.notNull().default(…)` so existing rows get defaults on first query, but the columns must exist first.
- **Suggested approach:** Run `bun db:push` against staging/prod before deploying. Check RLS policies cover the new columns.

# Review pass 2026-05-03 (this session)

Scope: 3 latest commits + untracked `.claude/` directory.
Changes: /download page (new), hero download-button simplification, color token
migrations across brand-tab, editor-bar inputs, select-folder, settings-modal,
preload script rebuild, .gitignore + backlog maintenance.

## CR-029 — `ExternalRoutes.DOWNLOAD_IOS` is a placeholder URL; iOS users land on a broken TestFlight page

- **Area:** [apps/web/client/src/utils/constants/index.ts](apps/web/client/src/utils/constants/index.ts), [apps/web/client/src/app/download/page.tsx](apps/web/client/src/app/download/page.tsx)
- **Type:** bug
- **Impact:** user-facing
- **Risk:** medium (iPadOS users are auto-detected and presented the iOS card as "Recommended")
- **Summary:** `DOWNLOAD_IOS` is set to `'https://testflight.apple.com/join/PLACEHOLDER'`. The new `/download` page exposes this as a live CTA and highlights it for any iPadOS or iPhone visitor. Clicking "Get on TestFlight" goes to a non-existent TestFlight page.
- **Suggested approach:** Until a real URL exists, either (a) hide the iOS card entirely when `DOWNLOAD_IOS` contains `PLACEHOLDER`, or (b) replace the `<a>` with a "Coming soon" `<span>` and a disabled `Button` for iOS, or (c) get a real TestFlight/App Store URL committed before shipping the page.

## CR-030 — `download/page.tsx` hardcoded "Download Weblab" instead of `APP_NAME` *(auto-fixed)*

- **Area:** [apps/web/client/src/app/download/page.tsx](apps/web/client/src/app/download/page.tsx)
- **Type:** brand compliance (CLAUDE.md rule)
- **Impact:** user-facing
- **Risk:** low
- **Summary:** The H1 rendered the brand name as a raw string literal `"Download Weblab"`, violating the CLAUDE.md rule "never hardcode the name — always import `APP_NAME`."
- **Fix applied:** Added `import { APP_NAME } from '@weblab/constants'` and changed the H1 to `Download {APP_NAME}`.
- **Status:** auto-fixed (2026-05-03 review)

## CR-031 — Duplicate `rounded-lg` class in `select-folder.tsx` drag-zone div *(auto-fixed)*

- **Area:** [apps/web/client/src/app/projects/import/local/_components/select-folder.tsx](apps/web/client/src/app/projects/import/local/_components/select-folder.tsx)
- **Type:** DX / cleanup
- **Impact:** internal
- **Risk:** low (harmless — Tailwind dedups)
- **Summary:** The token-migration commit converted `rounded-lg bg-gray-900 border border-gray rounded-lg` to `rounded-lg border rounded-lg`, preserving the doubled class.
- **Fix applied:** Removed the trailing duplicate `rounded-lg` from the className string.
- **Status:** auto-fixed (2026-05-03 review)

## CR-032 — `select-folder.tsx` missing `'use client'` directive (pre-existing)

- **Area:** [apps/web/client/src/app/projects/import/local/_components/select-folder.tsx](apps/web/client/src/app/projects/import/local/_components/select-folder.tsx)
- **Type:** style / Next.js correctness
- **Impact:** internal (no runtime bug — verified)
- **Risk:** low (verified: both consumers — `import-local-project.tsx` and `local/page.tsx` — declare `'use client'`, so the bundler treats this file as client by inheritance and the React hooks resolve)
- **Suggested approach:** Add `'use client'` at line 1 anyway for self-documentation and to prevent regressions if the file is ever imported from a Server Component.

## CR-033 — Second hardcoded "Weblab" in `download/page.tsx` body copy *(auto-fixed)*

- **Area:** [apps/web/client/src/app/download/page.tsx](apps/web/client/src/app/download/page.tsx)
- **Type:** brand compliance (CLAUDE.md rule)
- **Impact:** user-facing
- **Risk:** low
- **Summary:** Sibling to CR-030. The hero `<p>` underneath the H1 still hardcoded "The same Weblab, wrapped natively for your device." The previous review pass only swept the H1.
- **Fix applied:** Replaced the literal with `{APP_NAME}` (the import was already added in CR-030). Sentence reflowed to keep the line break visually consistent.
- **Status:** auto-fixed (2026-05-03 review)
- **Note:** The Linux note string `"chmod +x Weblab.AppImage  ·  ./Weblab.AppImage"` and Mac `.dmg` references were left as-is — those reflect actual on-disk file names of the GitHub release artifacts, not brand prose. Worth re-checking if the Apple Silicon installer is ever renamed.

## CR-024 — `/api/transcribe` 90s `AbortController` flagged for Workflow *(discussion-only)*

- **Area:** [api/transcribe/route.ts](apps/web/client/src/app/api/transcribe/route.ts)
- **Type:** discussion
- **Impact:** infra
- **Risk:** low
- **Summary:** Vercel best-practice hook flagged the 90s timeout as "long-running serverless logic, consider Workflow." For a single request/response upstream call this isn't a Workflow fit — Workflow targets durable, pausable, multi-step flows. Vercel's 300s default function timeout already accommodates 90s.
- **Suggested approach:** No action. Logged here so the team has the trace if/when transcription becomes a multi-step or streaming flow.

---

## CR-038 — Auth regression: `api.forward.components.listProjectComponents` is `publicProcedure`, not `protectedProcedure`  *(auto-fixed)*

- **Area:** [apps/web/client/src/server/api/routers/forward/editor.ts](apps/web/client/src/server/api/routers/forward/editor.ts) (lines 43–55), consumer [components-tab/index.tsx](apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/components-tab/index.tsx) (line 24)
- **Type:** security / bug
- **Impact:** user-facing (component-listing endpoint exposed without authentication)
- **Risk:** high
- **Summary:** The components-tab UI was migrated from `api.components.listProjectComponents` (`protectedProcedure`, see [components.ts](apps/web/client/src/server/api/routers/components.ts) line 45) to `api.forward.components.listProjectComponents` (`publicProcedure`). The new path proxies through the editor server, which performs a recursive filesystem scan of `SANDBOX_BASE_DIR`. Result: any unauthenticated client can hit `/api/trpc/forward.components.listProjectComponents` and read project-component names + relative file paths — a strict downgrade from the prior protected behavior. The other procedures in `editorForwardRouter` (`sandbox.create/start/stop/status`) are also `publicProcedure`, so this likely follows the existing forward-router convention, but the existing convention itself merits a security review independent of this change.
- **Fix applied:** Replaced the import `publicProcedure` with `protectedProcedure` in `forward/editor.ts` and converted **every** procedure in `editorForwardRouter` (the new `components.listProjectComponents` plus the pre-existing `sandbox.create/start/stop/status`) to `protectedProcedure`. Verified zero callers of `api.forward.sandbox.*` and `api.forward.components.*` exist anywhere in the client other than the components-tab (which already runs inside an authenticated project route), so no UI behavior changes — only the auth posture tightens. The session check from tRPC context now applies before any forward call hits the editor server.

---

## CR-039 — Behavior regression: editor-server component scanner misses `observer()`/HOC-wrapped components  *(auto-fixed)*

- **Area:** [apps/web/server/src/router/routes/components.ts](apps/web/server/src/router/routes/components.ts) (regex set at lines 25–37) vs. [apps/web/client/src/server/api/routers/components.utils.ts](apps/web/client/src/server/api/routers/components.utils.ts) (HOC_WRAPPED_RE)
- **Type:** bug (behavior regression)
- **Impact:** user-facing (My Components panel will show fewer components after the migration)
- **Risk:** medium
- **Summary:** The editor server's `extractReactComponents` has 4 patterns: `NAMED_FUNCTION_RE`, `NAMED_ARROW_RE`, `DEFAULT_FUNCTION_RE`, `DEFAULT_IDENTIFIER_RE`. The client's `extractComponents` (the now-orphaned implementation that used to back `api.components.listProjectComponents`) has those same 4 plus a 5th: `HOC_WRAPPED_RE = /^\s*export\s+const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*[a-z][A-Za-z0-9_]*\s*\(/gm`. This catches `export const Foo = observer(() => …)` and other HOC-wrapped exports. The existing test `__tests__/components.test.ts` ('detects observer-wrapped component via HOC_WRAPPED_RE') asserts this contract.
- **Fix applied:** Added `HOC_WRAPPED_RE` plus a matching loop in `apps/web/server/src/router/routes/components.ts` between the named-arrow and default-function passes. Loop order is deliberate: HOC runs **after** `NAMED_ARROW_RE` so a bare arrow body wins when both patterns happen to match (the `seen` set then de-dupes). Test coverage added to `apps/web/server/src/router/routes/__tests__/components.test.ts`: `extracts observer-wrapped components via HOC_WRAPPED_RE` and `extracts withRouter-wrapped components via HOC_WRAPPED_RE` (mirroring the now-deleted client-side test cases).

---

## CR-040 — Orphaned client-side `componentsRouter` (and its test) after switch to forward route  *(auto-fixed)*

- **Area:** [root.ts](apps/web/client/src/server/api/root.ts) line 32, [components.ts](apps/web/client/src/server/api/routers/components.ts), [components.utils.ts](apps/web/client/src/server/api/routers/components.utils.ts), [__tests__/components.test.ts](apps/web/client/src/server/api/routers/__tests__/components.test.ts)
- **Type:** dead code / DX
- **Impact:** internal
- **Risk:** medium (decision dependency: see CR-038, CR-039)
- **Summary:** `grep -rn "api\.components\."` in the client returns zero hits — the only consumer (`components-tab/index.tsx`) now uses `api.forward.components.*`. The old `componentsRouter` is still imported and registered at `components: componentsRouter` in `root.ts`. It's still wired but unreachable from any UI surface. The unit test file targets `extractComponents` (the utility), so the test's value depends on whether the utility stays.
- **Fix applied:** With CR-038 and CR-039 resolved, picked the editor server as the canonical scanner. Removed the orphan `componentsRouter` import and `components: componentsRouter` registration from `apps/web/client/src/server/api/root.ts`; removed the `./components` re-export from `apps/web/client/src/server/api/routers/index.ts`; deleted `apps/web/client/src/server/api/routers/components.ts`, `apps/web/client/src/server/api/routers/components.utils.ts`, and `apps/web/client/src/server/api/routers/__tests__/components.test.ts` (`git rm`). All test coverage previously in the deleted client test (HOC, withRouter, multi-line, comment stripping, dedup, multi-component) was ported to `apps/web/server/src/router/routes/__tests__/components.test.ts` so no coverage was lost.

---

## CR-041 — Stale untracked `apps/web/client/public/onlook-preload-script.js` (481 KB) shipped at the public URL  *(auto-fixed)*

- **Area:** untracked file `apps/web/client/public/onlook-preload-script.js`
- **Type:** brand compliance / repo hygiene
- **Impact:** user-facing (file is served at `/onlook-preload-script.js` on dev server)
- **Risk:** low (no app code references it; only legacy entries in `DEPRECATED_PRELOAD_SCRIPT_SRCS`, parser test fixtures, and `CODERABBIT_REVIEWS.md` historical notes)
- **Summary:** Cherry-pick commit `49f22efc` explicitly states this file was "Excluded from cherry-pick (already deleted on main)." It re-appeared in the working tree (likely from a worktree cleanup) but nothing imports it — the active preload is `weblab-preload-script.js` (see `WEBLAB_PRELOAD_SCRIPT_FILE` in `packages/constants/src/files.ts`). CLAUDE.md mandates that any "Onlook" reference outside the explicit allowlist is a bug; the file's presence in `public/` makes it both a brand-compliance violation and a 481 KB asset served on every public deploy.
- **Fix applied:** Removed via `git clean -f apps/web/client/public/onlook-preload-script.js` after explicit user authorization in this review session. Pre-flight `grep` confirmed no live references — only allowlisted legacy CDN URLs in `DEPRECATED_PRELOAD_SCRIPT_SRCS`, parser test fixtures, and `CODERABBIT_REVIEWS.md` historical notes (all of which are explicitly allowed per CLAUDE.md).

---

## CR-042 — Untracked `branches.diff` scratch file at repo root  *(auto-fixed)*

- **Area:** untracked file `branches.diff` (repo root)
- **Type:** repo hygiene
- **Impact:** internal
- **Risk:** low
- **Summary:** 18-byte file containing only `===== main =====` — clearly a leftover from an interactive `git diff` redirect. Should not be committed; not in `.gitignore` so it will keep showing up in `git status`.
- **Fix applied:** Removed via `git clean -f branches.diff` (same `git clean` invocation as CR-041). No content worth preserving — verified the file held only the literal `===== main =====` divider.

---

## CR-043 — Duplicate React component-extraction logic between client and editor server  *(auto-fixed)*

- **Area:** [apps/web/server/src/router/routes/components.ts](apps/web/server/src/router/routes/components.ts) (`extractReactComponents`, regex set, `scanDirectory`, `SKIP_DIRS`) vs. [apps/web/client/src/server/api/routers/components.utils.ts](apps/web/client/src/server/api/routers/components.utils.ts) (`extractComponents`, regex set, etc.)
- **Type:** refactor / DX
- **Impact:** internal (drift risk — see CR-039 for an existing drift)
- **Risk:** low–medium
- **Summary:** Two near-identical implementations of "scan a project and extract React components" now coexist: one in `apps/web/server` (used by the new forward path), one in `apps/web/client` (the now-orphan `componentsRouter`). The patterns differ (CR-039), the field names differ (`name` vs. `componentName`, hence the `forward/editor.ts` remap), and the directory walker is duplicated.
- **Fix applied:** Consolidated to a single canonical scanner on the editor server (`apps/web/server/src/router/routes/components.ts`). (1) Renamed `DiscoveredComponent.name` → `componentName` in the editor server so its wire-shape matches `ComponentInsertData` from `@weblab/models/element`. (2) Dropped the `.map(({ name, ...rest }) => ({ ...rest, componentName: name }))` remap in `apps/web/client/src/server/api/routers/forward/editor.ts` — the forward route now `return`s the editor-server response directly. (3) Deleted the orphan client-side scanner (CR-040). The only remaining gap to a fully shared package (e.g. `@weblab/parser`) is that the regex set still lives in `apps/web/server`; pulling it into a workspace package is now a pure refactor with no behavior implications and can land separately.

---

## 2026-05-04 review — local changes on `main`

Review window: full local working tree (111 modified files, 8 untracked paths) plus the three latest commits (`5e52b8d8 feat: rewrite hero copy`, `68a5115b chore: comment out Discord/X social refs`, `18a53026 fix: GitHub repo URLs`). Net assessment: SAFE to ship modulo CR-044 (real billing bug) and CR-045 (PII logging regression). No quick-win fixes were applied — every candidate touched payments, error semantics, exported APIs, or design intent and falls outside the 99%-safe auto-fix bar.

---

## CR-044 — Stripe `paused` / `resumed` webhook handlers unreachable  *(open)*

- **Area:** [pause.ts](apps/web/client/src/app/webhook/stripe/subscription/pause.ts) (new file, both `handleSubscriptionPaused` + `handleSubscriptionResumed`); [subscription/index.ts](apps/web/client/src/app/webhook/stripe/subscription/index.ts) (barrel); [route.ts:36-41](apps/web/client/src/app/webhook/stripe/route.ts)
- **Type:** bug (silent payments regression)
- **Impact:** user-facing (paid users)
- **Risk:** **high**
- **Summary:** A new `pause.ts` was added that mutates the `subscriptions` table on `customer.subscription.paused` (sets `CANCELED`) and `.resumed` (restores `ACTIVE`). But (a) the `subscription/index.ts` barrel only re-exports `./create`, `./delete`, `./update` — it does **not** re-export `./pause`, so the handlers are never imported, and (b) the parent webhook `route.ts:37-38` still falls through both event types to `default → 200`. Result: paused subscribers continue to enjoy pro entitlements, and resumed subscribers don't get reactivated. The bug is fully invisible because the webhook still ACKs 200, so Stripe never retries.
- **Suggested approach:** (1) Add `export * from './pause';` to [subscription/index.ts](apps/web/client/src/app/webhook/stripe/subscription/index.ts). (2) In [route.ts](apps/web/client/src/app/webhook/stripe/route.ts), replace the fall-through cases with `case 'customer.subscription.paused': return handleSubscriptionPaused(event);` and `case 'customer.subscription.resumed': return handleSubscriptionResumed(event);`, importing both alongside the existing handlers on line 4. (3) Add a test covering each event type (mock Stripe event → assert `subscriptions.status` is mutated). (4) Once landed, replay any paused/resumed events from the Stripe dashboard for the launch window so DB state matches reality. Not auto-fixed because enabling new payments behavior exceeds the 99%-safe auto-fix bar — a human should sign off on the entitlement-flip semantics in `pause.ts` first (especially the `SubscriptionStatus.CANCELED` mapping, which is harsher than Stripe's own `paused` semantics).
- **Status:** open — needs manual testing and human sign-off on billing semantics before changing entitlement behavior. The status table intentionally reflects this as open.

---

## CR-045 — Email-capture endpoint logs raw PII when the n8n integration is missing  *(resolved)*

- **Area:** [api/email-capture/route.ts:43-58](apps/web/client/src/app/api/email-capture/route.ts) (the "fix #48" branch)
- **Type:** bug (privacy / logging regression)
- **Impact:** user-facing (privacy of marketing-form submitters)
- **Risk:** medium
- **Summary:** When `N8N_LANDING_FORM_URL` is unset, the route used to 500. The new soft-success branch returns 200 — good — but it also calls `console.info('[email-capture] ...', { email, name, utm_source, utm_medium, utm_campaign })`, writing the raw email and full name into Vercel/cloud server logs that are routinely ingested into observability tools (Datadog, Logflare, etc.). Marketing landing-page consent covers receiving emails, not log persistence; this is a regression vs. the prior code which logged no user data.
- **Suggested approach:** Either (a) drop the `email`/`name` fields from the log line entirely, keeping only the UTM metadata for analytics intent, or (b) hash the email (`sha256`) before logging if a unique-but-non-reversible identifier is needed for deduplication. Audit any other `console.*` lines in this route or its callers for the same pattern. Consider also removing the `console.warn` of `validatedData` from any sibling debug paths if present.
- **Fix applied:** PII removed from the missing-n8n fallback log in [api/email-capture/route.ts](apps/web/client/src/app/api/email-capture/route.ts); the log now keeps only UTM fields and no longer records raw email or name. The fallback response was also aligned to `{ success: true, stored: false }`.
- **Status:** resolved.

---

## CR-046 — Blog `getAllPosts` ships every `.mdx` with no draft / publish gate *(fixed)*

- **Area:** [lib/blog.ts:65-82](apps/web/client/src/lib/blog.ts) (`getAllPosts`); content lives in `apps/web/client/content/blog/*.mdx` (untracked)
- **Type:** bug / DX
- **Impact:** user-facing (potential premature publish)
- **Risk:** low (today — only 3 hand-curated posts in `content/`)
- **Summary:** The MDX loader treats every `.mdx` file in `content/blog/` as published. There is no convention for hiding work-in-progress posts via a frontmatter `draft: true` or a `published: false` flag. The moment a contributor stages an unfinished post in the same directory, it ships to production at `/blog/<slug>` and gets enumerated in `generateStaticParams()`.
- **Suggested approach:** In `getAllPosts` and `getPostBySlug`, treat `data.draft === true` as a 404 in production (gate on `process.env.NODE_ENV === 'production'`) so writers can preview drafts in dev. Add a one-line type field for the flag in `BlogPostFrontmatter`. Ideally also add a build-time check that fails CI if any post is missing the required fields (`title`, `description`, `date`, `coverImage`).
- **Fix applied:** Added optional `draft?: boolean` frontmatter support and filtered draft posts out of `getAllPosts` / `getPostBySlug` in production.

---

## CR-047 — Blog `slugify` strips non-ASCII; multiple non-ASCII headings collapse to empty TOC IDs *(fixed)*

- **Area:** [lib/blog.ts:40-47, 49-59](apps/web/client/src/lib/blog.ts) (`slugify` and `extractToc`)
- **Type:** bug
- **Impact:** user-facing (broken anchor links + broken TOC scroll-into-view for non-Latin headings)
- **Risk:** low
- **Summary:** `slugify` does `.replace(/[^\w\s-]/g, '')`. JS `\w` is `[A-Za-z0-9_]`, so any heading written in CJK, Cyrillic, Arabic, Greek, or with emoji collapses to `''` after the first replace. With two such headings, both TOC entries get `id: ''` — the in-document `rehypeSlug` plugin will only emit one `id=""` element, so `[TableOfContents](apps/web/client/src/app/blog/_components/table-of-contents.tsx)`'s `document.getElementById(item.id)` returns `null` (or the wrong element) and clicks scroll nowhere. Also breaks `IntersectionObserver` highlighting.
- **Suggested approach:** Adopt [`github-slugger`](https://github.com/Flet/github-slugger) (already a transitive dep through `rehype-slug`) so server-side TOC slugs match the IDs `rehypeSlug` injects into the DOM. As a side effect this also handles uniqueness via internal counter (`heading-2`, `heading-3` ...), so identical heading text doesn't collide.
- **Fix applied:** Added `github-slugger` as a direct web-client dependency and now derives TOC IDs with the same slugger used by `rehype-slug`, including Unicode and duplicate heading handling.

---

## CR-048 — Blog `[slug]` route lacks defensive slug validation *(fixed)*

- **Area:** [app/blog/[slug]/page.tsx](apps/web/client/src/app/blog/[slug]/page.tsx) and [lib/blog.ts:84-96](apps/web/client/src/lib/blog.ts) (`getPostBySlug`)
- **Type:** refactor (defense-in-depth)
- **Impact:** internal
- **Risk:** low (no current arbitrary-read since the `.mdx` suffix is forced and `fs.existsSync` gates it)
- **Summary:** `getPostBySlug` does `path.join(CONTENT_DIR, '${slug}.mdx')` with `slug` coming from the Next.js dynamic route segment. URL-decoded segments can include `/` (`%2F`), `..`, NUL bytes, and other surprises. `path.join` resolves the traversal to a path that is no longer inside `CONTENT_DIR`; the only thing standing between an attacker and reading any `*.mdx` on disk is that the suffix is forced to `.mdx`. There aren't (today) any sensitive `.mdx` files outside `content/blog/`, but this is brittle and Next.js could change segment-decoding semantics in a future major.
- **Suggested approach:** Reject any slug that doesn't match `/^[a-z0-9-]+$/` and return `notFound()`. Alternatively, set `export const dynamicParams = false;` on the page so anything outside the `generateStaticParams()` set 404s before reaching the loader. Either change is one line and zero behaviour drift for the 3 current posts.
- **Fix applied:** Added `isValidBlogSlug()` (`/^[a-z0-9-]+$/`) to the blog loader and `dynamicParams = false` to the `[slug]` route.

---

## CR-049 — `code-tab.handleFileTreeSelect` no longer threads `searchTerm`; FileTree still passes it

- **Area:** [code-panel/code-tab/index.tsx:199-204](apps/web/client/src/app/project/[id]/_components/left-panel/code-panel/code-tab/index.tsx) (signature changed); [code-panel/code-tab/sidebar/file-tree.tsx:13,164,173](apps/web/client/src/app/project/[id]/_components/left-panel/code-panel/code-tab/sidebar/file-tree.tsx) and [file-tree-node.tsx:31,53-54](apps/web/client/src/app/project/[id]/_components/left-panel/code-panel/code-tab/sidebar/file-tree-node.tsx) (still call with `(filePath, searchTerm?)`)
- **Type:** bug (UX regression)
- **Impact:** user-facing (Code panel search-result clicks no longer scroll to / highlight the match)
- **Risk:** low
- **Summary:** This commit deliberately dropped the `searchTerm` second arg from `handleFileTreeSelect` and added a TODO comment: *"FileTree.onFileSelect can be threaded through to the editor view."* The `FileTree`/`FileTreeNode` API still calls `onFileSelect(filePath, hasSearchTerm ? searchQuery : undefined)`, but JS silently discards the extra arg, so opening a file from a search hit no longer focuses the matching line. The TODO and the existing `// Reimplement search-term scroll` comment in the file's body confirm this is known but the work was deferred.
- **Suggested approach:** Pipe the `searchTerm` through `editorEngine.ide.openFile(filePath, { highlight: searchTerm })` (or whatever the IDE store exposes for go-to-line / decoration). If the IDE store doesn't expose that yet, add it as a prerequisite. Lower priority than CR-044/CR-045 but visible to anyone using search.

---

## CR-050 — Editor canvas store not invalidated on collaborator mutations

- **Area:** [components/store/editor/engine.ts:103-110](apps/web/client/src/components/store/editor/engine.ts) (TODO added in this commit)
- **Type:** bug / collaboration debt
- **Impact:** user-facing (collaborators see stale canvas state)
- **Risk:** medium (severity scales with collaboration usage)
- **Summary:** A TODO was committed acknowledging that `applyCanvas(...)` is run once at engine init and never re-run. Any tRPC mutation that updates the canvas row from another client is invisible to the local engine until full reload. With the new project-collaboration code paths (members router, invitation flow), this is more likely to bite users now than before. Tracking here so the TODO doesn't get lost in `git blame`.
- **Suggested approach:** Add a tRPC subscription (or polling fallback) on `canvas.byProjectId` that invokes `editorEngine.canvas.applyCanvas(...)` when the row changes. As a stop-gap, surface a manual "Refresh canvas" affordance in the canvas top-bar so users can recover without a hard reload.

---

## 2026-05-06 review — local changes on `main`

Review window: full local working tree (114 tracked changed files plus untracked blog/auth/Stripe/image assets) and latest local commit `5e52b8d8 feat: rewrite hero copy to appeal to designers`. One quick-win compile fix was applied in the Stripe webhook helper. Larger issues were logged below rather than behavior-changed during review.

---

## CR-051 — Stripe paused/resumed handlers called helper with excluded event types *(auto-fixed)*

- **Area:** [helpers.ts](apps/web/client/src/app/webhook/stripe/subscription/helpers.ts), [pause.ts](apps/web/client/src/app/webhook/stripe/subscription/pause.ts)
- **Type:** bug
- **Impact:** infra / user-facing billing
- **Risk:** low
- **Summary:** `handleSubscriptionPaused` and `handleSubscriptionResumed` call `extractIdsFromEvent(receivedEvent)`, but the helper type union only accepted created/updated/deleted Stripe subscription events. That leaves the new handlers vulnerable to TypeScript failures even though all five event variants expose the same `event.data.object` subscription shape.
- **Fix applied:** Extended the helper event union to include `Stripe.CustomerSubscriptionPausedEvent` and `Stripe.CustomerSubscriptionResumedEvent`. Also switched customer ID extraction away from `.toString()` so expanded Stripe customer objects resolve via `.id` instead of risking `[object Object]`.
- **Status:** auto-fixed

---

## CR-052 — Blog route imports undeclared runtime dependencies *(fixed)*

- **Area:** [lib/blog.ts](apps/web/client/src/lib/blog.ts), [blog/[slug]/page.tsx](apps/web/client/src/app/blog/[slug]/page.tsx), [apps/web/client/package.json](apps/web/client/package.json)
- **Type:** bug / DX
- **Impact:** infra / user-facing
- **Risk:** medium
- **Summary:** The new blog implementation imports `gray-matter`, `next-mdx-remote/rsc`, `rehype-slug`, and `rehype-autolink-headings`, but those packages are not declared in `apps/web/client/package.json` and are not present in `bun.lock` under those package names. A clean install/build can fail module resolution before `/blog` ever renders.
- **Suggested approach:** Add the missing dependencies with Bun and commit the resulting lockfile change in a dedicated dependency commit, or switch to the repo's existing MDX/content tooling if one is preferred. Do not rely on transitive packages for direct imports.
- **Fix applied:** Verified the current worktree now declares all four direct dependencies in `apps/web/client/package.json` and `bun.lock`.
- **Status:** fixed

---

## CR-053 — Import cancellation uses `AbortController` locally but does not abort network work  *(deferred — needs server endpoint)*

- **Area:** [projects/import/local/_context/index.tsx](apps/web/client/src/app/projects/import/local/_context/index.tsx), [projects/import/figma/_context/index.tsx](apps/web/client/src/app/projects/import/figma/_context/index.tsx), [projects/import/github/_context/index.tsx](apps/web/client/src/app/projects/import/github/_context/index.tsx), [projects/import/github/_hooks/use-repo-import.ts](apps/web/client/src/app/projects/import/github/_hooks/use-repo-import.ts)
- **Type:** bug / reliability
- **Impact:** user-facing
- **Risk:** medium
- **Summary:** The new cancel paths create/abort local `AbortController` instances and check `signal.aborted` between awaited steps, but the signal is not passed into tRPC mutations, sandbox upload/setup calls, or the GitHub repository import hook. Cancelling during a long `forkSandbox`, `uploadToSandbox`, `provider.setup`, or `createProject` call still allows that request to finish server-side, so orphan sandbox/project cleanup remains best-effort and timing-dependent.
- **Decision (2026-05-06):** The right fix is a server-side cancel endpoint that atomically tears down the sandbox + draft project for the abandoned import job. Threading abort signals into the existing tRPC mutations alone leaves the server-side state orphaned even when the browser disconnects mid-flight. Deferring until that endpoint is designed; the current best-effort cleanup is acceptable for the small number of users hitting this. When picking this up: scope the endpoint as `import.cancel(jobId)` with idempotent cleanup of `sandboxes` + `projects` rows; expose a `jobId` from the `import.start*` mutations; have the cancel button call it without waiting on the local stack.
- **Status:** open — explicitly deferred pending server cleanup endpoint

---

## CR-054 — New public env toggles bypass the validated env schema *(fixed)*

- **Area:** [login/page.tsx](apps/web/client/src/app/login/page.tsx), [settings-modal/with-project.tsx](apps/web/client/src/components/ui/settings-modal/with-project.tsx), [env.ts](apps/web/client/src/env.ts)
- **Type:** DX / maintainability
- **Impact:** internal
- **Risk:** low
- **Summary:** `NEXT_PUBLIC_AUTH_PROVIDERS` and `NEXT_PUBLIC_PROJECT_FILESYSTEM_ENABLED` are read directly from `process.env` in client components and are not declared in `env.ts`. Project rules say browser vars should be exposed with `NEXT_PUBLIC_*` and declared in the client schema; bypassing that removes validation/defaults and makes deployments harder to audit.
- **Suggested approach:** Add both vars to `env.ts` with explicit defaults and import `env` in the client components, or consolidate these flags into an existing feature-flag config.
- **Fix applied:** Added the new public feature flags to `env.ts` (`NEXT_PUBLIC_AUTH_PROVIDERS`, `NEXT_PUBLIC_PROJECT_FILESYSTEM_ENABLED`, and the neighboring `NEXT_PUBLIC_MULTI_FRAMEWORK_ENABLED`) and switched the client components to read through the validated `env` export.
- **Status:** fixed

---

## CR-055 — New Figma OAuth callback referenced a nonexistent tRPC mutation *(auto-fixed)*

- **Area:** [callback/figma/page.tsx](apps/web/client/src/app/callback/figma/page.tsx), [routers/figma.ts](apps/web/client/src/server/api/routers/figma.ts)
- **Type:** bug
- **Impact:** user-facing / build
- **Risk:** low
- **Summary:** The new callback page called `api.figma.handleOAuthCallback.useMutation()`, but the figma router only exposes `fetchFile`. Typecheck failed immediately and the page could never complete OAuth at runtime.
- **Fix applied:** Removed the nonexistent mutation call and made the callback page show a clear error directing users back to the existing personal-access-token import flow. This preserves a route-level fallback without pretending OAuth is implemented.
- **Status:** auto-fixed

## CR-056 — Duplicate identifiers in `editor/state/index.ts` import block *(auto-fixed)*

- **Area:** [editor/state/index.ts](apps/web/client/src/components/store/editor/state/index.ts)
- **Type:** bug / build break
- **Impact:** internal — `bun typecheck` fails
- **Risk:** low
- **Summary:** A formatting/import-organizer pass introduced duplicate identifiers (`InsertMode` listed twice in the type-only block; `ChatType` and `EditorMode` listed twice in the value block). TypeScript rejects with TS2300 "Duplicate identifier" — branch will not compile.
- **Fix applied:** Deduplicated each identifier. `InsertMode` is only used as a type annotation in this file, so leaving it in the type-only import block is correct.
- **Status:** auto-fixed

---

## CR-057 — Figma plugin UI hygiene: listener leak, stale timeout, no memoization *(auto-fixed)*

- **Area:** [packages/figma-plugin/src/ui/App.tsx](packages/figma-plugin/src/ui/App.tsx)
- **Type:** bug / DX
- **Impact:** user-facing (HMR leaks during plugin dev) + perf (codegen ran every render)
- **Risk:** low
- **Summary:** New plugin UI used `window.onmessage = ...` (overrides any other handler, never cleans up across HMR/StrictMode), let `setTimeout` for the "Copied\!" reset escape unmount/re-render, and recomputed the generated code string on every render even when inputs were unchanged.
- **Fix applied:** Switched to `addEventListener('message', ...)` with a cleanup function; tracked the copied-state timeout in a ref and cleared it on unmount and on re-trigger; wrapped `generateReact` / `generateHTML` in `useMemo([nodes, framework, styleMode])`.
- **Status:** auto-fixed

---

## CR-058 — Migrations 0022 and 0023 are not registered in the Drizzle journal

- **Area:** [supabase/migrations/0022_user_settings_preferences.sql](apps/backend/supabase/migrations/0022_user_settings_preferences.sql), [supabase/migrations/0023_project_runtime_modes.sql](apps/backend/supabase/migrations/0023_project_runtime_modes.sql), [supabase/migrations/meta/_journal.json](apps/backend/supabase/migrations/meta/_journal.json)
- **Type:** bug / data-correctness
- **Impact:** user-facing (broken DB schema in any env that runs `bun db:migrate` via Drizzle)
- **Risk:** high
- **Summary:** `_journal.json` contains entries through `0021_large_sunset_bain` only. The repository contains physical migration files `0022_user_settings_preferences.sql` and `0023_project_runtime_modes.sql`, plus a `0021_snapshot.json`, but no `0022_snapshot.json` / `0023_snapshot.json` and no journal entries for them. Drizzle's migrator reads `_journal.json` to determine which files to apply — these two will be silently skipped. The Drizzle schema in `packages/db/src/schema/user/settings.ts` already references columns 0022 introduces, so any environment that runs migrations via Drizzle (rather than `supabase migration up`) will still expose those Drizzle types but the underlying columns won't exist → runtime errors on read/write.
- **Fix applied:** Appended `idx: 22` and `idx: 23` entries to `_journal.json` so the Drizzle migrator now picks them up. Created `0022_snapshot.json` and `0023_snapshot.json` as placeholders by copying `0021_snapshot.json` and re-chaining the `id`/`prevId` UUIDs — this unblocks `bun db:migrate` immediately.
- **Remaining work for maintainer:** The two new snapshots do not yet reflect the schema columns added by 0022/0023, so the next `bun db:gen` will produce a large diff. Run `bun db:gen` (maintainer-only per repo rules) to regenerate clean canonical snapshots before the next schema change ships.
- **Status:** partially fixed — Drizzle migrator unblocked; snapshots need maintainer regeneration

---

## CR-059 — Runtime mode columns added in 0023 are not in Drizzle schema or mappers

- **Area:** [packages/db/src/schema/project/project.ts](packages/db/src/schema/project/project.ts), [packages/db/src/schema/project/branch.ts](packages/db/src/schema/project/branch.ts), [packages/db/src/mappers/project/project.ts](packages/db/src/mappers/project/project.ts), [packages/db/src/mappers/project/branch.ts](packages/db/src/mappers/project/branch.ts), [packages/db/src/defaults/project.ts](packages/db/src/defaults/project.ts), [packages/db/src/defaults/branch.ts](packages/db/src/defaults/branch.ts)
- **Type:** refactor / data-model drift
- **Impact:** internal — silent feature half-implementation
- **Risk:** medium
- **Summary:** Migration 0023 adds `projects.storage_mode`, `projects.runtime_metadata`, `branches.runtime_type`, `branches.runtime_metadata`. None of these are declared in the Drizzle table definitions, so `$inferSelect`/`$inferInsert` will not include them. Mappers infer `storageMode` from `tags.includes('local')` and `runtime` from `sandboxId.startsWith('local:')` — heuristics that will silently disagree with the new authoritative columns once anything writes them.
- **Fix applied:** Added `storageMode` (varchar, default `'cloud'`) and `runtimeMetadata` (jsonb, default `{}`) to `projects`. Added `runtimeType` (varchar, default `'cloud'`) and `runtimeMetadata` (jsonb, default `{}`) to `branches`. Refined `projectInsertSchema` / `branchInsertSchema` (and `Update` variants) to use `z.enum([...])` for the storage/runtime type fields so the inserted rows narrow correctly. Updated `fromDbProject` / `fromDbBranch` mappers to prefer the authoritative columns and fall back to the legacy tag/sandbox-prefix inference only when those columns are empty (so no behavior change for existing rows). Updated `toDbProject` / `toDbBranch` and the `createDefaultProject` / `createDefaultBranch` defaults to write the new columns. Patched the two hand-rolled `newBranch` literals in `routers/project/branch.ts` (`fork`, `createBlank`) so they include the new fields. `bun typecheck` passes.
- **Status:** fixed

---

## CR-060 — `subscription.update` and `releaseSubscriptionSchedule` accept Stripe IDs without ownership scoping

- **Area:** [routers/subscription/subscription.ts](apps/web/client/src/server/api/routers/subscription/subscription.ts)
- **Type:** bug / security
- **Impact:** user-facing — privilege escalation against Stripe
- **Risk:** high
- **Summary:** `update` accepts `stripeSubscriptionId` from the client and calls `stripe.subscriptions.update` directly without first checking that `subscriptions.userId === ctx.user.id` for that ID. Any authenticated user who guesses or learns another user's `sub_…` ID can mutate that subscription (downgrade, change price, attach schedule). `releaseSubscriptionSchedule` has the same shape (`stripeSubscriptionScheduleId`, no ownership check). Existing patterns in the same file (`getCurrentBaseSubscription`, `cancel`) lookup by `userId` first — these mutations diverge.
- **Fix applied:** Added `eq(subscriptions.userId, ctx.user.id)` to the lookup `WHERE` in both procedures, and replaced the `Error` throws with `TRPCError({code:'NOT_FOUND'})` so callers can't infer ID existence by error type. `releaseSubscriptionSchedule` now performs an ownership lookup before any Stripe call.
- **Recommended follow-up:** Add a regression test that a second user cannot mutate the first user's sub (currently no such test in `apps/web/client/test/`).
- **Status:** fixed

---

## CR-061 — `chat/message` and `domain/verify` mutations missing project-access checks

- **Area:** [routers/chat/message.ts](apps/web/client/src/server/api/routers/chat/message.ts), [routers/chat/conversation.ts](apps/web/client/src/server/api/routers/chat/conversation.ts), [routers/domain/verify/index.ts](apps/web/client/src/server/api/routers/domain/verify/index.ts)
- **Type:** bug / security
- **Impact:** user-facing — IDOR
- **Risk:** medium
- **Summary:** Several mutations (message `update`/`delete`/`upsert`, `replaceConversationMessages`; domain `getActive`/`create`/`verify`/`verifyOwnedDomain`) operate on rows scoped by an input ID but never verify the caller is a member of the parent project. Any authed user with a valid ID can mutate.
- **Fix applied:** Reused the existing `verifyProjectAccess(db, userId, projectId)` helper from `routers/project/helper.ts`:
  - `chat/conversation`: `getAll`, `get`, `upsert`, `update`, `delete`, `generateTitle` now resolve `projectId` (via `loadConversationProjectId` for the cases where only `conversationId` is in scope) and call `verifyProjectAccess` before any read/mutation. `Error` throws were upgraded to `TRPCError`.
  - `chat/message`: every procedure (`getAll`, `upsert`, `upsertMany`, `update`, `updateCheckpoints`, `delete`, `replaceConversationMessages`) resolves `projectId` from the message → conversation chain and verifies access. `delete` and `upsertMany` deduplicate distinct projects so we only call the helper once per project, not once per row.
  - `domain/verify`: `getActive`, `create`, `verify`, `verifyOwnedDomain`, and `remove` now check project access; `remove` previously wasn't even loading the row by id, so it now does a lookup first.
- **Status:** fixed

---

## CR-062 — Codesandbox `createProjectFromGit` subpath setup uses bash-only features

- **Area:** [packages/code-provider/src/providers/codesandbox/index.ts](packages/code-provider/src/providers/codesandbox/index.ts)
- **Type:** bug / portability
- **Impact:** user-facing — git-import-from-subpath fails on sandboxes whose default shell is `dash`/`sh`
- **Risk:** medium
- **Summary:** New `setup(session)` block runs a script that uses `set -euo pipefail` and `shopt -s dotglob nullglob`. `pipefail` and `shopt` are bash-only; running under POSIX `sh` will fail the entire setup. Codesandbox's default shell is not guaranteed to be bash. The whitelist `case` for the path is also overly aggressive (`*..*` rejects any filename containing `..` like `lib..min.js`), which is acceptable defense-in-depth but worth documenting.
- **Fix applied:** Wrapped the entire body in `bash -c '…'` so the script always runs under bash regardless of the sandbox's default shell. The single-quoted form keeps JS-side template-literal interpolation off, and `WEBLAB_TEMPLATE_SUBPATH` continues to flow through `env` (no shell-interpolated user input).
- **Status:** fixed

---

## CR-063 — `invitation.create` can leave orphan rows when email send fails

- **Area:** [routers/project/invitation.ts](apps/web/client/src/server/api/routers/project/invitation.ts)
- **Type:** bug / reliability
- **Impact:** user-facing — orphan invite, recipient never notified
- **Risk:** low
- **Summary:** The new code surfaces email send failures as `INTERNAL_SERVER_ERROR` (good) but the throw happens after the invitation row is committed. The user sees an error and assumes nothing happened, but the DB row persists. Re-trying creates duplicates.
- **Fix applied:** Wrapped the email send in a `try`/`catch` and treat both thrown exceptions and `result.error` as failure. On failure, delete the just-inserted invitation row before throwing the `INTERNAL_SERVER_ERROR`, so retries don't accumulate orphan invites. Also rolls back the row when `RESEND_API_KEY` is missing (we previously inserted then immediately threw without cleaning up).
- **Recommended follow-up:** A persistent "email_failed" status with a manual resend UX would still be more user-friendly than blind delete-and-retry, but that requires a schema change and was out of scope for this fix.
- **Status:** fixed

---

## CR-064 — `repairToolCall` now uses GPT-5.5 instead of the prior "nano" tier

- **Area:** [packages/ai/src/agents/root.ts](packages/ai/src/agents/root.ts)
- **Type:** perf / cost
- **Impact:** internal — repair tool calls run on the heavy default chat model
- **Risk:** low
- **Summary:** `repairToolCall` switched from `OPEN_AI_GPT_5_NANO` (which was removed from `OPENROUTER_MODELS` in the same diff) to `OPEN_AI_GPT_5_5`. Repair is a cheap structured-output operation; using the most expensive chat model burns tokens and wall-clock latency on every malformed tool call. There's no visible follow-up to introduce a cheaper repair-tier model.
- **Why deferred (2026-05-07):** Routing to `CLAUDE_3_5_HAIKU` is the obvious cheap option, but the comment in `packages/models/src/llm/index.ts:11` is explicit that `generateObject` does not work with Anthropic models on OpenRouter — so Haiku won't actually fix the problem. Picking a real cheap, non-Anthropic, structured-output-capable model ID requires checking the live OpenRouter catalog and is a product decision (cost / quality trade-off) rather than something to fabricate from training data. Leaving the runtime on `OPEN_AI_GPT_5_5` for now since that's what shipped; the cost concern is tracked here.
- **Suggested approach when picked up:** Verify a current cheap structured-output OpenRouter model (e.g. an `openai/gpt-5.5-mini` if it exists, GLM-5.1, Kimi K2.6 mini), add it to `OPENROUTER_MODELS`, route `repairToolCall` to it, and update `MODEL_MAX_TOKENS`.
- **Status:** deferred — needs product/model decision

---

## CR-065 — `text-smallall` typo in `terminal-area.tsx` *(auto-fixed)*

- **Area:** `apps/web/client/src/app/project/[id]/_components/bottom-bar/terminal-area.tsx:95`
- **Type:** bug / visual
- **Impact:** user-facing — "Terminal" label rendered without any size class (browser default)
- **Risk:** negligible
- **Summary:** `text-smallall` is not a valid Tailwind class. The label falls back to browser default font size, making it visually inconsistent with the rest of the bottom bar.
- **Fix applied:** Changed `text-smallall` → `text-small`.
- **Status:** auto-fixed

---

## CR-066 — Dead `ButtonLink` import in `about/page.tsx` *(auto-fixed)*

- **Area:** `apps/web/client/src/app/about/page.tsx:9`
- **Type:** DX / lint
- **Impact:** internal — unused import; will trigger ESLint `no-unused-vars` warning
- **Risk:** negligible
- **Summary:** The Substack `ButtonLink` was removed from the about page but the import statement remained.
- **Fix applied:** Removed `import { ButtonLink } from '../_components/button-link';`.
- **Status:** auto-fixed

---

## CR-067 — `Permissions-Policy: microphone=()` blocks transcription in production

- **Area:** `apps/web/client/next.config.ts` — new `headers()` block
- **Type:** bug / functionality
- **Impact:** user-facing — mic button silently broken on hosted web
- **Risk:** medium
- **Summary:** The CSP `Permissions-Policy` header added in the SEO commit sets `microphone=()`, which instructs browsers to deny `navigator.mediaDevices.getUserMedia({ audio: true })` for all origins including `self`. The app's transcription feature (`use-transcribe.ts`) uses `getUserMedia` — this will throw a `NotAllowedError` in Chrome/Firefox and the mic button will fail silently.
- **Suggested approach:** Change `microphone=()` to `microphone=(self)` to allow the same-origin app to request mic access while still blocking cross-origin iframes from doing so.
- **Status:** fixed — changed `microphone=()` to `microphone=(self)` in `next.config.ts`

---

## CR-068 — `isComposing` declared in `AiPromptComposerProps` but never read

- **Area:** `apps/web/client/src/components/ai-prompt-composer/index.tsx:44`
- **Type:** DX / dead API surface
- **Impact:** internal — misleads callers; `onCompositionStart`/`onCompositionEnd` are wired, but `isComposing` state is ignored
- **Risk:** low
- **Summary:** The component accepts `isComposing?: boolean` in its props interface and destructures `onCompositionStart` / `onCompositionEnd`, but never destructures or reads `isComposing`. Callers tracking their own composition state and passing it in will see no effect.
- **Suggested approach:** Either remove the prop from the interface if it's not needed, or wire it into the textarea/logic (e.g., to prevent submit on IME composition-end key events).
- **Status:** fixed — removed `isComposing` from `AiPromptComposerProps` interface in `index.tsx`

---

## CR-069 — Unnecessary DB query in `chat/route.ts` CLI-provider guard

- **Area:** `apps/web/client/src/app/api/chat/route.ts` — `streamResponse`
- **Type:** performance / design
- **Impact:** internal — one extra DB round-trip per non-openrouter/non-ollama request, all of which still return 501
- **Risk:** low
- **Summary:** When `provider` is not `openrouter`/`ollama`, the code queries `userProviderConnections` to distinguish 412 ("not connected") from 501 ("routing not implemented"). Both cases result in an error response — even if the row exists the 501 is unconditional. The DB query is only used to vary the error message, adding latency to every rejected request. The comment correctly explains routing is not yet implemented, so the 501 branch is always hit when a connection exists.
- **Suggested approach:** Remove the DB query and return 501 unconditionally for non-openrouter/non-ollama providers. Re-introduce the connection check once actual routing is implemented and the 412 path serves a real retry flow.
- **Status:** fixed — removed DB query; 501 returned directly. Unused imports (`and`, `eq`, `userProviderConnections`, `db`) cleaned up.

---

## CR-070 — Inverted prune logic in `runSourceSync` when adapter returns zero items

- **Area:** `apps/web/client/src/server/api/routers/cms/sync.ts` — prune branch
- **Type:** bug / data correctness
- **Impact:** internal — `prune=true` on an empty adapter response was a no-op when the intent was "remove every remote-sourced item"
- **Risk:** medium
- **Summary:** The code used `inArray(remoteId, [])` as the "drop everything" branch, which actually matches nothing. AND with `isNotNull(remoteId)` is therefore always false → 0 deletes. Comment said "drop every remote-sourced item" — opposite of behavior.
- **Suggested approach:** When `remoteIds.length === 0`, omit the `notInArray` clause so the AND is `(collectionId AND isNotNull(remoteId))` and every remote-sourced row is removed.
- **Status:** auto-fixed — branch now omits the `notInArray` clause when adapter returned zero items; unused `inArray` import removed.

---

## CR-071 — URL injection via unencoded remote-collection refs in CMS adapters

- **Area:** `apps/web/client/src/server/api/routers/cms/adapters/{payload,strapi}.ts`
- **Type:** security (low/medium)
- **Impact:** server-side — user-controlled `remoteCollectionRef` interpolated raw into adapter URLs
- **Risk:** low (server only calls user's own configured base URL; cross-tenant only if a collaborator sets a malicious `remoteRef` on a shared project)
- **Summary:** `fetchItems(creds, remoteCollectionRef)` and the schema-discovery path built URLs as `${baseUrl}/api/${remoteRef}`. Unencoded slashes/?# in `remoteRef` could inject query params or path segments. `remoteRef` reaches these helpers from the encoded `remote:` prefix on `cms_collection.description`, which is not strictly validated.
- **Suggested approach:** `encodeURIComponent` the slug in URL building.
- **Status:** auto-fixed — Payload and Strapi adapters now `encodeURIComponent` the remote ref / plural name.

---

## CR-072 — Stale selection state in items-table when switching collections

- **Area:** `apps/web/client/src/app/project/[id]/_components/cms-workspace/items-table.tsx`
- **Type:** bug / UX
- **Impact:** user-facing — bulk-delete bar would show "Delete N" with stale ids from the previous collection
- **Risk:** low
- **Summary:** `selectedIds` was a local `Set<string>` that never reset between collection switches. Search input had the same issue.
- **Suggested approach:** Reset both via `useEffect` keyed on `collection.id`.
- **Status:** auto-fixed — added reset effect on `collection.id` change.

---

## CR-073 — SSRF risk in CMS source adapters (no private-IP / loopback guard)

- **Area:** `apps/web/client/src/server/api/routers/cms/adapters/{payload,strapi,rest}.ts`
- **Type:** security (high)
- **Impact:** server-side — server-side request forgery vector
- **Risk:** high
- **Summary:** Adapters accept arbitrary `baseUrl` from user-supplied credentials and `fetch()` it server-side. A malicious project owner could enter `http://169.254.169.254/...` (cloud metadata), `http://localhost:6379` (internal Redis), or other private network addresses. Responses are parsed for items only (so direct data exfiltration is limited), but the SSRF reach itself is the concern.
- **Suggested approach:** Add a URL allowlist/denylist:
  - block `localhost`, `127.0.0.1`, `0.0.0.0`
  - block RFC1918 ranges (10/8, 172.16/12, 192.168/16)
  - block link-local (169.254/16, fe80::/10) and IPv6 loopback (`::1`)
  Resolve the host once before fetch and refuse if it lands in any banned range. Mind DNS rebinding: re-resolve on each request and refuse if the resolved IP doesn't match the originally-validated set.
- **Status:** open — high priority; not auto-fixed (correct SSRF protection warrants careful review).

---

## CR-074 — `cms.source.mapCollections` allows duplicate collection slugs

- **Area:** `apps/web/client/src/server/api/routers/cms/source.ts` — `mapCollections.create` mode
- **Type:** bug / data integrity
- **Impact:** internal — `cms.collection.create` enforces app-level slug uniqueness; `mapCollections` does not
- **Risk:** low
- **Summary:** When the wizard maps multiple remote collections to "Create new" mode, it inserts collections without checking that the slug isn't already taken in the project. Two remotes with the same humanized name would silently land as duplicates.
- **Suggested approach:** Mirror the duplication check from `cms.collection.create` inside the transaction — query existing slugs once, throw on conflict — or add a real DB unique constraint on `(project_id, slug)`.
- **Status:** open.

---

## CR-075 — REPEAT clones inherit original template's `data-oid`

- **Area:** `apps/web/preload/script/api/cms.ts` — pass 2 cloning
- **Type:** design debt / UX
- **Impact:** user-facing — selecting a cloned list-descendant in the canvas always picks the first clone
- **Risk:** low
- **Summary:** Pass 2 clones the saved template HTML once per item without rewriting `data-oid`/`data-weblab-dom-id`. Multiple DOM nodes share the same `data-oid`.
- **Suggested approach:** Either suffix per-clone ids (`oid-iN`) and teach the selection layer to strip the suffix, or tag clones with `data-weblab-clone="true"` and have the selection layer ignore them in favor of the original template node.
- **Status:** open — known limitation, documented in `cms.ts` header comment.

---

## CR-076 — Editor undo/redo does not cover CMS binding mutations

- **Area:** CMS workspace + `apps/web/client/src/components/store/editor/history`
- **Type:** UX / design debt
- **Impact:** user-facing — Cmd-Z does not undo bind/unbind/sort/limit/filter/routing changes
- **Risk:** medium for power users
- **Summary:** Binding mutations go directly through tRPC and don't dispatch through the editor's `Action` system. Documented as accepted limitation; mirrors Webflow/Framer behavior.
- **Suggested approach:** Either add a `BindCmsAction` variant to `packages/models/src/actions/action.ts` plus dispatch+revert handlers, or build a separate `CmsHistoryManager` keyed on oid that takes Cmd-Z while the workspace has focus.
- **Status:** open — documented in `docs/agent-context/cms-architecture.md`.

---

## CR-077 — XSS / CSS-injection surface via `backgroundImage` for image-shaped CMS values

- **Area:** `apps/web/preload/script/api/cms.ts` — `applyValueToNode` image branch
- **Type:** security (low)
- **Impact:** preview iframe only (sandboxed user code)
- **Risk:** low
- **Summary:** When the bound value is `{ url: string }` and the target node is not an `<img>`, the URL is interpolated into `style.backgroundImage = url("...")` via `JSON.stringify`. `JSON.stringify` escapes `"` and `\`, but other CSS tokens aren't validated; non-http(s) schemes (`javascript:`, etc.) aren't blocked.
- **Suggested approach:** Validate via `new URL(value.url)`; reject anything other than `http`, `https`, or restricted `data:image/*` schemes.
- **Status:** open — low priority; preview is already sandboxed.

---

## CR-078 — Defense-in-depth: project-scope filter in CMS update/delete WHEREs

- **Area:** `apps/web/client/src/server/api/routers/cms/{source,binding,collection,collection-page}.ts`
- **Type:** security / defense-in-depth
- **Impact:** internal
- **Risk:** very low (existing pre-checks fetch with project scope; no current procedure mutates `projectId`)
- **Summary:** Several update/delete mutations fetch the row scoped to the project, throw if not found, then run the actual update/delete with `eq(table.id, input.id)` only — without a redundant `eq(table.projectId, …)` filter.
- **Suggested approach:** Add `eq(table.projectId, input.projectId)` to every CMS update/delete WHERE clause as belt-and-suspenders.
- **Status:** open.

---

## CR-079 — `cms.source.testConnection` accepts plaintext credentials in payload

- **Area:** `apps/web/client/src/server/api/routers/cms/source.ts` — `testConnection` mutation input
- **Type:** security (low) / observability
- **Impact:** internal — credentials traverse tRPC payloads
- **Risk:** low (HTTPS in transit; concern is request-body capture in logs)
- **Summary:** `testConnection` accepts `{ credentials: Record<string, unknown> }`. If any middleware or Sentry-style request-body capture is enabled, those logs contain plaintext API keys / bearer tokens.
- **Suggested approach:** Audit the project's logging middleware and add a scrubber for `cms.source.testConnection` payloads. Longer-term, swap to a short-lived signed-token flow if request capture is needed.
- **Status:** open — needs an audit of the project's logging middleware.

---

# Review of 2026-05-09 — local changes (uncommitted + 7 unpushed commits)

Scope: ~131 working-tree files (3,708 +/1,683 −) plus 7 commits ahead of `origin/main` (33 files, 1,078 +/309 −) including auth fix, framework auto-detect, AI prompt split, HTML pipeline GROUP/UNGROUP, hero polish. Heaviest new surface: CMS workspace, breakpoints/responsive system, framework picker.

## CR-070 — `NEXT_PUBLIC_SITE_URL` defaults to `http://localhost:3000` even in production

- **Area:** [apps/web/client/src/env.ts:99](apps/web/client/src/env.ts) (schema default), [apps/web/client/src/env.ts:152](apps/web/client/src/env.ts) (runtimeEnv fallback)
- **Type:** security / configuration trap
- **Impact:** user-facing — OAuth redirects, sign-out target, and any other URL built from `env.NEXT_PUBLIC_SITE_URL` will point at `http://localhost:3000` if Railway's `NEXT_PUBLIC_SITE_URL` is missing or misnamed at build time
- **Risk:** **critical**
- **Summary:** Commit 21fe3674 made `NEXT_PUBLIC_SITE_URL` the single source of truth for redirects (login server action and auth callback both build URLs from it), but the env schema declares `z.url().default('http://localhost:3000')` and the `runtimeEnv` block falls back to the same string. If the prod env var is unset the build does not fail — it ships with a localhost URL inlined into the client bundle, so OAuth `redirectTo` will send users to localhost. The pattern in the same file for Supabase URLs is the correct one: default only when `NODE_ENV === 'development'`, otherwise leave undefined so `@t3-oss/env-nextjs` validation fails the build.
- **Suggested approach:** Mirror the Supabase pattern. In `runtimeEnv`: `NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : undefined)`. Drop `.default(...)` from the schema, keeping `z.url()`. Confirm Railway has `NEXT_PUBLIC_SITE_URL=https://weblab.build` (or current prod URL) before merging — failing the build is the desired posture.
- **Status:** open

---

## CR-071 — CMS `field.update` did not verify the field belongs to the input project  *(auto-fixed)*

- **Area:** [apps/web/client/src/server/api/routers/cms/field.ts](apps/web/client/src/server/api/routers/cms/field.ts) — `update` mutation
- **Type:** security (broken access control / IDOR)
- **Impact:** cross-tenant — a user with access to **any** project they own could pass an arbitrary `fieldId` from another user's project and the patch would apply
- **Risk:** **high** (mitigated by UUIDs being non-enumerable, but real)
- **Summary:** The update procedure called `verifyProjectAccess(input.projectId)` but then ran `update(cmsFields).where(eq(cmsFields.id, input.fieldId))` with no scoping to `input.projectId` — `projectId` was effectively cosmetic. The companion `item.ts` already has the right pattern: load the row with the parent collection joined and reject if `existing.collection.projectId !== input.projectId`.
- **Fix applied:** Added the same `findFirst({ where: eq(cmsFields.id, input.fieldId), with: { collection: true } })` lookup and `existing.collection.projectId !== input.projectId` check before the update, throwing `'Field not found'` (intentionally indistinguishable from the not-found case so we don't leak existence).
- **Status:** auto-fixed.

---

## CR-072 — CMS `field.delete` had the same unscoped delete  *(auto-fixed)*

- **Area:** [apps/web/client/src/server/api/routers/cms/field.ts](apps/web/client/src/server/api/routers/cms/field.ts) — `delete` mutation
- **Type:** security (broken access control / cross-tenant deletion)
- **Impact:** cross-tenant — same shape as CR-071 but with `db.delete(cmsFields).where(eq(cmsFields.id, input.fieldId))`; data loss path
- **Risk:** **high**
- **Summary:** Identical pattern to CR-071: `verifyProjectAccess` was called but the actual `delete` didn't scope to the project. An authenticated user with access to any project could delete any field whose UUID they knew.
- **Fix applied:** Added the parent-collection lookup + `projectId` match check before `db.delete`. Mirrors `item.ts:delete`.
- **Status:** auto-fixed.

---

## CR-073 — CMS external-source credentials stored as plaintext JSONB

- **Area:** [packages/db/src/schema/cms/source.ts](packages/db/src/schema/cms/source.ts) `credentials` column
- **Type:** security (secrets at rest)
- **Impact:** any DB read (backup, replica, ops console) exposes user-supplied API keys/secrets for Payload, Strapi, REST sources
- **Risk:** **high**
- **Summary:** `credentials` is a `jsonb` column with no encryption layer. Adapter code validates shape but not at-rest encryption. Compare with `user_provider_connections.access_token_encrypted` which uses an envelope-encrypted approach.
- **Suggested approach:** Encrypt at the application boundary using the same KMS / `nacl.secretbox` helper used for provider connections. Decrypt only inside adapter calls. Add a one-time migration to encrypt existing rows when the feature ships. Confirm the column never lands in tRPC responses (currently it does — see `source.list`).
- **Status:** open

---

## CR-074 — CMS collection slug + item slug not unique at the DB layer

- **Area:** [packages/db/src/schema/cms/collection.ts](packages/db/src/schema/cms/collection.ts), [packages/db/src/schema/cms/item.ts](packages/db/src/schema/cms/item.ts)
- **Type:** data integrity
- **Impact:** internal — duplicate slugs break routing assumptions; item updates/lookups pick whichever row Postgres returns first
- **Risk:** medium
- **Summary:** Schema comments declare slug must be unique per project (collection) and per collection (item), but no `uniqueIndex` enforces it. A racing pair of `create` calls with the same slug both succeed.
- **Suggested approach:** Add composite unique indexes:
  - `uniqueIndex('cms_collection_project_slug_idx').on(t.projectId, t.slug)`
  - `uniqueIndex('cms_item_collection_slug_idx').on(t.collectionId, t.slug)` (with a partial index `WHERE slug IS NOT NULL` if NULLs are valid).
  Backfill: deduplicate first via a one-shot SQL `UPDATE … SET slug = slug || '-' || id` for the loser rows, then `CREATE UNIQUE INDEX`.
- **Status:** open

---

## CR-075 — Supabase session refresh runs on `/api/*` (incl. streaming chat) — adds 5s timeout window per request

- **Area:** [apps/web/client/middleware.ts:9-13](apps/web/client/middleware.ts), [apps/web/client/src/utils/supabase/middleware.ts:36-48](apps/web/client/src/utils/supabase/middleware.ts)
- **Type:** performance / latency
- **Impact:** user-facing — chat streaming and any other API route pays a `supabase.auth.getUser()` round-trip (capped at 5s) before the route handler runs
- **Risk:** medium
- **Summary:** The matcher excludes `_next/static`, `_next/image`, image assets, and `favicon.ico` but NOT `/api/*`. Every API call (chat stream, tRPC, GitHub callback POST) triggers an auth refresh. The supabase Next.js SSR template explicitly excludes `/api` for this reason — API routes that need session use `createServerClient` directly. Worse, the helper wraps `getUser()` in a 5s `Promise.race` timeout, so a degraded auth provider stalls every API request for 5s before the route runs.
- **Suggested approach:** Tighten the matcher to skip API and auth routes:
  `matcher: ['/((?!api|auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)']`.
  Auth callback already mints its own session via `exchangeCodeForSession`; tRPC procedures use the server supabase client directly. Verify protected pages still get the refresh.
- **Status:** open

---

## CR-076 — Frame breakpoint columns left nullable after backfill

- **Area:** [packages/db/src/schema/canvas/frame.ts:26-29](packages/db/src/schema/canvas/frame.ts), [apps/backend/supabase/migrations/0029_frame_breakpoints.sql:9-25](apps/backend/supabase/migrations/0029_frame_breakpoints.sql)
- **Type:** data integrity
- **Impact:** internal — any new insert that bypasses the app default (raw SQL, replica with replication lag, code path that forgets to provide breakpoint fields) yields NULL group_id/breakpoint_id, which app readers fall back to — inconsistent state across branches
- **Risk:** medium
- **Summary:** Migration adds `group_id`, `breakpoint_id`, `breakpoint_name`, `breakpoint_order` as nullable, backfills NULLs to defaults, and does not add a `NOT NULL` constraint. Drizzle schema mirrors that nullability. Future inserts can produce NULLs again, which the mapper masks via `DEFAULT_BREAKPOINT` — papered-over drift.
- **Suggested approach:** Add a follow-on migration that, after the backfill, runs `ALTER TABLE frames ALTER COLUMN <col> SET NOT NULL` for all four columns and pairs each with a `DEFAULT` matching `defaults/frame.ts`. Update the Drizzle schema `.notNull()`. Also align `breakpoint_order` type — schema declares `numeric` but app code reads with `Number(...)`; switch to `integer` to make the type explicit.
- **Status:** open

---

## CR-077 — `ensureBreakpointSiblings` returns synthesized list before parallel creates confirm

- **Area:** [apps/web/client/src/components/store/editor/frames/migration.ts](apps/web/client/src/components/store/editor/frames/migration.ts)
- **Type:** data integrity / correctness
- **Impact:** internal — duplicate frames on retry after a partial network failure
- **Risk:** medium
- **Summary:** The migration helper fires sibling-creates via `Promise.allSettled(...)` but uses an in-memory `presentIds.has(...)` check (computed before the awaits) to decide what to create. If, e.g., Tablet's create fails and Phone's succeeds, the function returns three frames synthesized from in-memory state including the failed Tablet — but Tablet was never persisted. On the next project load `presentIds` again lacks Tablet, so it tries to create it again, succeeding this time. So far so good — UNTIL the first run's failed call was partially applied (server got the row, client never saw the response), in which case the second run produces a duplicate.
- **Suggested approach:** Either (a) only return the persisted subset (filter to `result.status === 'fulfilled'`) and re-derive the list from a single read after the writes settle, or (b) write a migration-version flag to project metadata so the code only ever runs once per project. The latter is more robust and matches the editor-engine pattern of one-shot client migrations.
- **Status:** open

---

## CR-078 — N+1 query in CMS `collection.list` item-count loop

- **Area:** [apps/web/client/src/server/api/routers/cms/collection.ts:28-35](apps/web/client/src/server/api/routers/cms/collection.ts)
- **Type:** performance
- **Impact:** internal — collections page does N+1 queries per visit; not user-facing critical until a workspace has many collections
- **Risk:** low
- **Summary:** `list` walks each collection and issues a `SELECT count(*) FROM cms_item WHERE collection_id = ?`. With 10 collections that's 11 queries.
- **Suggested approach:** Replace the loop with a single grouped count: `SELECT collection_id, COUNT(*) FROM cms_item WHERE collection_id IN (?) GROUP BY collection_id`, then merge into the collection list. Or use a Drizzle `leftJoin` + `count(cmsItems.id)` + `groupBy(cmsCollections.id)`.
- **Status:** open

---

## CR-079 — Orphan `hero/create.legacy.tsx` (24KB, no imports)

- **Area:** [apps/web/client/src/app/_components/hero/create.legacy.tsx](apps/web/client/src/app/_components/hero/create.legacy.tsx)
- **Type:** dead code
- **Impact:** internal — bundles ~530 lines of unused TSX into source-tree searches and review surface; confuses future readers about which `create.tsx` is canonical
- **Risk:** low
- **Summary:** `ripgrep create\\.legacy` returns zero hits. The file is a snapshot of the pre-refactor `create.tsx` and not referenced anywhere.
- **Suggested approach:** Delete the file. Same goes for any `*.legacy.tsx` siblings (see CR-080). If the intent is "keep around as documentation", move it under `docs/agent-context/` so it's clearly historical.
- **Status:** open

---

## CR-080 — Orphan `chat-input/index.legacy.tsx` (22KB, no imports)

- **Area:** [apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-input/index.legacy.tsx](apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-input/index.legacy.tsx)
- **Type:** dead code
- **Impact:** internal
- **Risk:** low
- **Summary:** Same pattern as CR-079 — no callers; the canonical chat input lives at `index.tsx` and ModelSelectorV2 is referenced directly.
- **Suggested approach:** Delete.
- **Status:** open

---

## CR-081 — `ActionsGroup` `groupKey` prop declared and documented but never read

- **Area:** [apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-messages/message-content/actions-group.tsx:13-41](apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-messages/message-content/actions-group.tsx)
- **Type:** dead code / misleading API
- **Impact:** internal
- **Risk:** low
- **Summary:** The `groupKey` prop is included in `ActionsGroupProps` with a JSDoc claiming it's "used so finished elapsed state survives re-renders within a session", but the destructure on line 39 omits it and nothing in the component body references it. Caller passes `${messageId}-${groupCounter}` (index.tsx:212) which is therefore ignored. State already survives re-renders correctly via the React `key` (`actions-${groupStart}`) on the JSX element.
- **Suggested approach:** Either implement the persistence (e.g. write `frozenElapsed` to `sessionStorage` keyed by `groupKey`) or drop the prop and the JSDoc. The persistence isn't worth shipping — the streaming is short-lived enough that re-render-survival isn't a real UX win.
- **Status:** open

---

## CR-082 — `select-folder.tsx` import header still says "only works with NextJS + React + Tailwind"

- **Area:** [apps/web/client/src/app/projects/import/local/_components/select-folder.tsx:381](apps/web/client/src/app/projects/import/local/_components/select-folder.tsx)
- **Type:** UX copy / bug
- **Impact:** user-facing — users dropping a static-HTML folder into the import flow see a banner contradicting the multi-framework picker that now supports them
- **Risk:** low
- **Summary:** Static-HTML adapter shipped in commit 9ac7136f, picker auto-detects (68f7470c), but the import-folder header still hardcodes the NextJS-only message.
- **Suggested approach:** Replace with a framework-aware string driven by the picked adapter's `displayName`, or simply remove the header — the picker UI already communicates supported frameworks.
- **Status:** open

---

## CR-083 — html-pipeline INSERT_IMAGE / REMOVE_IMAGE error path not covered by tests

- **Area:** [packages/parser/test/html-pipeline.test.ts](packages/parser/test/html-pipeline.test.ts), [packages/parser/src/pipelines/html/index.ts:340-352](packages/parser/src/pipelines/html/index.ts)
- **Type:** test coverage
- **Impact:** internal — commit 25bca604 deliberately switched these from "silent warn" to "actionable throw"; without a test the throw is one rename away from regressing back to a silent failure
- **Risk:** low
- **Summary:** Tests cover GROUP/UNGROUP positive cases and dedupe but not the new image-action throws.
- **Suggested approach:** Add `await expect(applyHtmlPipeline(input, [insertImageAction])).rejects.toThrow(/static.html/i)`-style assertions for both action types.
- **Status:** open

---

## CR-084 — GitHub install callback history scrubbing only fires on success/error of the in-flight mutation

- **Area:** [apps/web/client/src/app/callback/github/install/page.tsx:24-73](apps/web/client/src/app/callback/github/install/page.tsx)
- **Type:** bug / sensitive-data hygiene
- **Impact:** user-facing — `installation_id` and `state` linger in history if the user closes the tab or navigates away mid-mutation
- **Risk:** low
- **Summary:** The scrub was moved into the mutation's `onSuccess` / `onError` callbacks. If the user closes the tab before either fires, the URL with installation params remains in history.
- **Suggested approach:** Run `window.history.replaceState({}, '', window.location.pathname)` synchronously at the top of the `useEffect` (before kicking off the mutation), in addition to the post-mutation cleanup. The downside (Next router race) the comment cites can be addressed by also calling `router.replace` instead of `router.push` after success.
- **Status:** open

---

## CR-085 — Sign-out hard-navigates even if `supabase.auth.signOut()` throws

- **Area:** [apps/web/client/src/components/ui/avatar-dropdown/index.tsx:42-46](apps/web/client/src/components/ui/avatar-dropdown/index.tsx)
- **Type:** bug (auth state)
- **Impact:** user-facing — if signOut errors (network blip, Supabase outage), the user is sent to /login but the server-side cookie may still be valid. Next protected-page hit would re-auth them silently.
- **Risk:** low
- **Summary:** No try/catch around `signOut()` and no error-aware branching before `window.location.assign(Routes.LOGIN)`.
- **Suggested approach:** Wrap the await in try/catch, log on failure, navigate to LOGIN regardless (the hard nav is what guarantees React Query cache reset). Optionally surface a toast on failure so the user knows to retry.
- **Status:** open

---

## CR-086 — Responsive parser tests miss `!important`, arbitrary values, pseudo-classes, negative classes

- **Area:** [packages/parser/test/responsive-classes.test.ts](packages/parser/test/responsive-classes.test.ts), [packages/parser/test/responsive-rebase.test.ts](packages/parser/test/responsive-rebase.test.ts)
- **Type:** test coverage
- **Impact:** internal — the new responsive system is the foundation for breakpoint authoring; a regression in any of these would corrupt user code on save
- **Risk:** low
- **Summary:** Existing tests cover the happy path (cascade-down, mobile-first emission, dedup). Missing cases: `md:!text-lg` / `md:hover:text-lg` / `md:[padding:17px]` / `md:-mt-4` / `md:dark:bg-blue-500`. Each is a real Tailwind syntax users write.
- **Suggested approach:** Add a test table with the above as inputs, asserting round-trip integrity (`rebase(parse(input)) === expected`). Property-based testing with fast-check is overkill but worth flagging.
- **Status:** open

---

## CR-087 — Inline edit upstream call lacks abort propagation

- **Area:** [packages/ai/src/agents/inline-edit.ts](packages/ai/src/agents/inline-edit.ts), [apps/web/client/src/app/api/ai/inline-edit/route.ts](apps/web/client/src/app/api/ai/inline-edit/route.ts)
- **Type:** bug (cost/correctness)
- **Impact:** internal — when a client closes the inline-edit prompt mid-stream, the upstream OpenRouter request kept running and billing tokens.
- **Risk:** low
- **Summary:** `createInlineEditStream` did not accept `abortSignal`; the route handler did not pass `req.signal` through.
- **Suggested approach:** Thread `abortSignal` from the route to `streamText({ abortSignal })`.
- **Status:** auto-fixed

---

## CR-088 — Designer Cmd+K hotkey fires globally, not just in canvas

- **Area:** [apps/web/client/src/app/project/[id]/_components/canvas/hotkeys/index.tsx](apps/web/client/src/app/project/[id]/_components/canvas/hotkeys/index.tsx)
- **Type:** UX bug
- **Impact:** user-facing — pressing Cmd+K when no canvas element is selected (e.g., focus in chat, or while in code editor with no in-editor handler intercepting) shows a toast `Select an element first to use Cmd+K`. The code editor's own Mod-k inline-edit keymap competes in the global handler order.
- **Risk:** medium
- **Summary:** `useHotkeys('mod+k', ...)` registers globally with `preventDefault: true`. Should be scoped to the canvas's editor mode (`EditorMode.DESIGN`) and skipped when focus is in a code editor or text input.
- **Suggested approach:** Guard with `if (editorEngine.state.editorMode !== EditorMode.DESIGN) return;` and use `enableOnFormTags: false` semantics. Alternatively let CodeMirror's keymap win when focus is inside the editor.
- **Status:** open

---

## CR-089 — Tab autocomplete has no separate metering or rate limit

- **Area:** [apps/web/client/src/app/api/ai/tab-complete/route.ts](apps/web/client/src/app/api/ai/tab-complete/route.ts)
- **Type:** cost / abuse
- **Impact:** infra — Tab fires on every debounced keystroke in a code file. Today the route shares the chat `checkMessageLimit` for gating, but does not increment any usage counter. A user with a misbehaving extension or pathological typing pattern can issue thousands of completion calls without a separate budget.
- **Risk:** medium
- **Summary:** No `incrementUsage` for tab; no separate rate-limit bucket distinct from chat.
- **Suggested approach:** Add a `tabUsage` counter (separate from `messageUsage`) with its own daily/monthly limits. Increment on each tab request; skip when the model is local/Ollama.
- **Status:** open

---

## CR-090 — Ghost-text widget does not survive editor scroll/resize

- **Area:** [apps/web/client/src/app/project/[id]/_components/left-panel/code-panel/code-tab/file-content/inline-edit/prompt.tsx](apps/web/client/src/app/project/[id]/_components/left-panel/code-panel/code-tab/file-content/inline-edit/prompt.tsx)
- **Type:** UX bug
- **Impact:** user-facing — the floating inline-edit prompt is positioned with `editor.coordsAtPos(session.from)` and re-computes only on React re-render. If the user scrolls the editor while the prompt is open, the prompt stays at the old screen position.
- **Risk:** low
- **Summary:** Missing scroll/resize listener on the editor DOM that triggers a re-render of the prompt.
- **Suggested approach:** Subscribe to `editor.scrollDOM`'s `scroll` event and a `ResizeObserver` on `editor.dom`; call a setter to bump local state on each fire.
- **Status:** open

---

## CR-091 — Tab autocomplete settings flag is browser-local, not persisted to user account

- **Area:** [apps/web/client/src/app/project/[id]/_components/left-panel/code-panel/code-tab/file-content/use-ai-feature-flags.ts](apps/web/client/src/app/project/[id]/_components/left-panel/code-panel/code-tab/file-content/use-ai-feature-flags.ts)
- **Type:** DX / persistence
- **Impact:** internal — the four AI feature flags (inline edit, tab autocomplete, error fix, designer Cmd+K) live in `localStorage` because the proper home (`AISettings` in the DB) requires a Drizzle migration which CLAUDE.md reserves for the maintainer. As a result, settings don't sync across devices, are reset by privacy tools, and the AI tab in Settings can't surface them.
- **Risk:** low
- **Summary:** Designed shortcut to avoid running `bun db:gen`. The fields are already declared on `AISettings` (optional) in `packages/models/src/user/settings.ts` for forward compatibility.
- **Suggested approach:** When a maintainer is available, add columns `enable_inline_edit`, `enable_tab_autocomplete`, `enable_error_fix`, `enable_designer_inline_edit`, `inline_edit_model`, `tab_complete_model` to `userSettings`; update `fromDbUserSettings` mapper; replace the localStorage hook with `api.user.settings.get`.
- **Status:** open

---

## CR-092 — Error parser only matches western paths and a handful of error formats

- **Area:** [apps/web/client/src/app/project/[id]/_components/left-panel/code-panel/code-tab/file-content/error-fix/parse.ts](apps/web/client/src/app/project/[id]/_components/left-panel/code-panel/code-tab/file-content/error-fix/parse.ts)
- **Type:** test coverage / robustness
- **Impact:** internal — error-fix gutter markers are only placed when `parseErrorLocation` extracts file/line. Webpack/Babel/Rollup/Vite often emit different shapes (e.g. `Error: blah\n    at /full/path/foo.ts:12:3`, ESLint's `1:5  error  ...`, browser stack traces). Parser falls back to null which means no marker — chat panel still works.
- **Risk:** low
- **Summary:** 3 location patterns, no support for ESLint pretty output or stack traces with `at ` prefix and parens.
- **Suggested approach:** Add patterns for `at .* (path:line:col)`, `at path:line:col`, ESLint `\d+:\d+\s+error`, and add tests for each. Today 10/10 tests pass for the supported set.
- **Status:** open

---

## CR-093 — InlineEditPrompt and tab-complete extension have no integration tests

- **Area:** [apps/web/client/src/app/project/[id]/_components/left-panel/code-panel/code-tab/file-content/inline-edit/](apps/web/client/src/app/project/[id]/_components/left-panel/code-panel/code-tab/file-content/inline-edit/), [apps/web/client/src/app/project/[id]/_components/left-panel/code-panel/code-tab/file-content/tab-complete/](apps/web/client/src/app/project/[id]/_components/left-panel/code-panel/code-tab/file-content/tab-complete/)
- **Type:** test coverage
- **Impact:** internal — only the parser has unit coverage. The CodeMirror extensions, prompt UI, and route handlers are untested.
- **Risk:** medium
- **Summary:** Possible regressions in: state transitions inside `inlineEditField`, ghost-widget rendering, debounce/cancel logic in `tab-complete/extension.ts`, route auth gating.
- **Suggested approach:** Add unit tests for the CodeMirror state fields (in-process, no DOM needed for the field logic). Mock `fetch` for the prompt's `submit` flow. Use `@codemirror/view`'s test harness for ghost-widget render.
- **Status:** open

---

# Review of 2026-05-09 (afternoon) — full-repo code review

Scope: 25 modified-tracked files + 70+ untracked files (new CMS feature, AI inline-edit / tab-complete / error-fix, breakpoints, command-palette, file-finder, project-search, profile-setup, auth-form) + 3 new migrations + last 3 commits (desktop CLI hardening). HEAD is on `main` with no unpushed commits.

Auto-fixed during this pass:
- Unresolved git merge conflict markers in `apps/web/client/src/components/store/editor/state/index.ts`, `apps/web/client/src/app/project/[id]/_hooks/use-chat/cli-transport.ts`, and `CODE_REVIEW_BACKLOG.md` (resolved to the newer / logically-correct side; would have broken `bun typecheck` and `bun build`).

## CR-087 — Drizzle migration journal out of sync; 0024 / 0025 prefix collisions

- **Area:** [apps/backend/supabase/migrations/](apps/backend/supabase/migrations/), [meta/_journal.json](apps/backend/supabase/migrations/meta/_journal.json)
- **Type:** bug / data integrity (database tooling)
- **Impact:** internal — `bun db:migrate` will fail or silently apply migrations in the wrong order
- **Risk:** **high**
- **Summary:** `_journal.json` last entry is `idx: 23` (`0023_project_runtime_modes`), but the on-disk migration set runs through `0029_frame_breakpoints.sql`. Worse, three files share prefix `0024` (`_absurd_kat_farrell`, `_fix_subscription_cascade`, `_woozy_firebrand`) and two share prefix `0025` (`_auth_user_trigger`, `_stale_earthquake`). Drizzle's manifest assumes one tag per idx; running migrate against a fresh DB will pick one arbitrarily and skip the others, leaving schema drift between dev/staging/prod. The new untracked `0024_absurd_kat_farrell.sql` (cms_*) and `0025_stale_earthquake.sql` (extra cms FKs) are not registered in `_journal.json` at all.
- **Suggested approach:** (1) Decide which 0024 / 0025 are canonical, rename the remainder to fresh prefixes (`0030_*`, `0031_*`, `0032_*`). (2) Regenerate `_journal.json` via a one-time maintainer-only `bun db:gen` so all on-disk migrations are tracked. (3) Add a CI check that fails when `ls migrations/*.sql | wc -l` ≠ journal entry count, or when prefixes collide. (4) Verify against the live database what's actually been applied — do not blindly run migrate before reconciling.
- **Status:** open — **blocking for any DB schema work**

---

## CR-088 — `Cmd+K` hotkey is registered twice (inline-edit vs command palette)

- **Area:** [apps/web/client/src/app/project/[id]/_components/canvas/hotkeys/index.tsx:60](apps/web/client/src/app/project/[id]/_components/canvas/hotkeys/index.tsx) (literal `'mod+k'`) and line 313 via `Hotkey.OPEN_COMMAND_PALETTE.command` (also `mod+k`).
- **Type:** bug / UX (hotkey collision)
- **Impact:** user-facing — both handlers fire on Cmd+K. Whichever react-hotkeys-hook registers last wins, but both run `preventDefault` and may toast simultaneously.
- **Risk:** medium
- **Summary:** The new inline-edit-from-canvas binding (line ~60) and the command-palette dispatch (line ~313) both bind `mod+k`. Behavior is non-deterministic; opening the palette ALSO triggers the "Select an element first" toast.
- **Suggested approach:** Pick one chord per command. Suggest Cmd+K → command palette (matches every IDE/Linear/Slack), Cmd+E → inline-edit (or Cmd+I), and update the `Hotkey` constants + this file together. Add an integration test that asserts no two `Hotkey` entries share a `command` string.
- **Status:** open

---

## CR-089 — Tab-complete extension never forwards the user-selected model

- **Area:** [apps/web/client/src/app/project/[id]/_components/left-panel/code-panel/code-tab/file-content/tab-complete/extension.ts](apps/web/client/src/app/project/[id]/_components/left-panel/code-panel/code-tab/file-content/tab-complete/extension.ts) (~line 201)
- **Type:** bug / UX
- **Impact:** user-facing — model picker selection is silently ignored for tab-complete
- **Risk:** low
- **Summary:** The extension POSTs to `/api/ai/tab-complete` without a `model` field. The route falls back to its server-side default. The user's choice in the model dropdown therefore has no effect on completions.
- **Suggested approach:** Plumb the active model id through `setTabCompleteContext()` (already used to seed file/project context), include it in the POST body, and let the route validate against the allowlist.
- **Status:** open

---

## CR-090 — Tab-complete returns HTTP 200 with empty body on usage-limit

- **Area:** [apps/web/client/src/app/api/ai/tab-complete/route.ts](apps/web/client/src/app/api/ai/tab-complete/route.ts) (~line 45)
- **Type:** bug / DX
- **Impact:** internal — clients can't distinguish "no completion suggested" from "rate-limited / over quota"
- **Risk:** low
- **Summary:** When the user hits a usage cap, the route returns `200 OK` with `{ completion: '' }`. The CodeMirror extension treats that as "no suggestion" and silently retries on next keystroke, masking the real reason and burning budget pings.
- **Suggested approach:** Return `429` (rate-limited) or `402` (payment required) with a structured `{ error: 'usage_limit', resetAt }` body. Have the extension cache the failure for ~30s before re-trying, and surface a one-time toast.
- **Status:** open

---

## CR-091 — `cms_*` tables enable RLS but ship with no policies

- **Area:** [apps/backend/supabase/migrations/0024_absurd_kat_farrell.sql](apps/backend/supabase/migrations/0024_absurd_kat_farrell.sql) (lines 10, 23, 38, 50, 62)
- **Type:** security (defense-in-depth)
- **Impact:** internal — works today because the tRPC server uses service-role bypass, but the moment any direct anon-key query (Supabase JS in client, realtime subscription, edge function under user JWT) touches `cms_*`, it returns 0 rows with no error.
- **Risk:** medium
- **Summary:** `ENABLE ROW LEVEL SECURITY` is set on `cms_binding`, `cms_collection`, `cms_field`, `cms_item`, `cms_source` without a corresponding `CREATE POLICY`. Default-deny policy semantics mean the tables are effectively empty for anything outside the service-role.
- **Suggested approach:** Add project-scoped policies in a follow-up migration: `USING (project_id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid()))` (and the same for collection-scoped tables via a join). Also add a Supabase-realtime test that subscribes as an anon user and confirms it can see its own project's CMS rows.
- **Status:** open

---

## CR-092 — Profile-setup redirect can self-loop

- **Area:** [apps/web/client/src/app/profile-setup/page.tsx](apps/web/client/src/app/profile-setup/page.tsx) (~line 73)
- **Type:** bug / UX
- **Impact:** user-facing — if `?returnUrl=/profile-setup` lands here (e.g. middleware fallback writes its own current path), the page redirects to itself after save → infinite loop.
- **Risk:** low
- **Summary:** `finalRedirect = returnUrl ?? Routes.HOME` does not exclude the current route. Combined with the displayName-looks-like-email auto-redirect, two failure modes can self-loop until the user closes the tab.
- **Suggested approach:** `if (returnUrl === Routes.PROFILE_SETUP) finalRedirect = Routes.HOME;` plus a hard cap (e.g. session-storage counter that bails to HOME after 2 redirects).
- **Status:** open

---

## CR-093 — `auth-form` does not trim whitespace before sending OTP

- **Area:** [apps/web/client/src/app/_components/auth-form.tsx](apps/web/client/src/app/_components/auth-form.tsx) (~line 71)
- **Type:** bug / UX
- **Impact:** user-facing — pasting an email with trailing space sends OTP to one address and the verify page checks against the trimmed string, so the verify page reports "code not found".
- **Risk:** low
- **Summary:** `sendEmailOtp(email)` runs on the raw input; the verify-page lookup uses `email.trim().toLowerCase()`.
- **Suggested approach:** Normalize once at the entry point (`const normalized = email.trim().toLowerCase()`) and use the same value for the OTP send and the verify-page query string.
- **Status:** open

---

## CR-094 — Code-editor `useEffect` deps include unstable MobX/computed refs

- **Area:** [apps/web/client/src/app/project/[id]/_components/left-panel/code-panel/code-tab/file-content/code-editor.tsx](apps/web/client/src/app/project/[id]/_components/left-panel/code-panel/code-tab/file-content/code-editor.tsx) (~lines 173 & 184); [apps/web/client/src/app/project/[id]/_components/canvas/frame/view.tsx](apps/web/client/src/app/project/[id]/_components/canvas/frame/view.tsx) (~line 384)
- **Type:** performance / risk
- **Impact:** internal — superfluous effect re-runs; potential stale-closure on rapid mutations
- **Risk:** low/medium
- **Summary:** Effects depend on `editorViewsRef` (a stable React ref — should not be in deps) and on `allErrors` (recomputed on every render via getter). `view.tsx` depends on `editorEngine.frames` (a MobX manager — reference is stable but observable mutation can blur the difference; the effect re-fires on every frame change in the manager).
- **Suggested approach:** Drop refs from deps; memoize `allErrors` via `useMemo` keyed on a stable signature; depend on `frame.id` instead of `editorEngine.frames`. Add an eslint `react-hooks/exhaustive-deps` review pass.
- **Status:** open

---

## CR-095 — Breakpoint-frames migration fires `frame.create.mutate(...)` without conflict handling

- **Area:** [apps/web/client/src/components/store/editor/frames/migration.ts](apps/web/client/src/components/store/editor/frames/migration.ts) (~lines 65 & 74)
- **Type:** bug / data integrity
- **Impact:** user-facing — re-opening a project on two devices simultaneously can race the synthesis, leaving partial sibling frames on the canvas
- **Risk:** medium
- **Summary:** `Promise.allSettled([create, create, create])` is fire-and-forget. The local synthesized frame is appended regardless of whether the server insert succeeded. A 409 (e.g. another tab already synthesized) is logged silently and the local view diverges from the server.
- **Suggested approach:** (1) Treat `Promise.allSettled` rejections as authoritative — drop local synthesis on failure and reload from server. (2) On 409, refetch frames and merge by id instead of inserting the local copy. (3) Toast `Synced N of M breakpoints` if any rejected.
- **Status:** open

---

## CR-096 — `override-affordance` does not guard against undefined `breakpointId`

- **Area:** [apps/web/client/src/app/project/[id]/_components/editor-bar/inputs/override-affordance.tsx](apps/web/client/src/app/project/[id]/_components/editor-bar/inputs/override-affordance.tsx) (~line 32)
- **Type:** bug
- **Impact:** internal — first paint after route change can pass `undefined` to `editorEngine.style.isOverriddenAt(oid, property, undefined)`; the manager probably treats undefined as "no breakpoint" and returns false, but the call signature gives no type-level guarantee.
- **Risk:** low
- **Summary:** `breakpoints.activeId` can be undefined while the store hydrates. The component renders the override pill anyway.
- **Suggested approach:** `if (!breakpointId) return <>{children}</>;` early-return. Update the type of `isOverriddenAt`'s third arg to non-optional and adjust callers.
- **Status:** open

---

## CR-097 — `cms.item.update` shallow-merges `values`, persisting deleted fields

- **Area:** [apps/web/client/src/server/api/routers/cms/item.ts](apps/web/client/src/server/api/routers/cms/item.ts) (~line 122)
- **Type:** bug / data integrity
- **Impact:** user-facing — removing a field from a collection schema does not strip the orphan key from existing items; subsequent renders may see ghost data
- **Risk:** low/medium
- **Summary:** `{ ...existing.values, ...input.values }` then `schema.parse()` — but if the parse uses `.passthrough()` (likely, since field schemas are dynamic), unknown keys survive.
- **Suggested approach:** Build the merged object from the *current* field set, not from the union: `for (const f of fields) merged[f.key] = input.values[f.key] ?? existing.values[f.key]`. Drop everything else. Add a unit test that proves a removed field key disappears after one update cycle.
- **Status:** open

---

## CR-098 — App-level slug / key uniqueness in CMS routers — race window

- **Area:** [apps/web/client/src/server/api/routers/cms/collection.ts](apps/web/client/src/server/api/routers/cms/collection.ts) (~line 93); [apps/web/client/src/server/api/routers/cms/field.ts](apps/web/client/src/server/api/routers/cms/field.ts) (~line 71)
- **Type:** bug / data integrity (extends CR-074)
- **Impact:** internal — two concurrent creates with the same slug both pass the existence check and both insert
- **Risk:** low
- **Summary:** Existence check is performed with `ctx.db.query.cmsCollections.findFirst(...)` then `INSERT`. Without a DB-level `UNIQUE (project_id, slug)` constraint, the window between SELECT and INSERT is race-prone.
- **Suggested approach:** Add `UNIQUE (project_id, slug)` on `cms_collection` and `UNIQUE (collection_id, key)` on `cms_field` in a follow-up migration. Catch the unique-violation error code in the router and surface a clean message.
- **Status:** open

---

## CR-099 — `pull-model-dialog` (web) sends model name without format validation

- **Area:** [apps/web/client/src/components/ai-prompt-composer/model-picker/pull-model-dialog.tsx](apps/web/client/src/components/ai-prompt-composer/model-picker/pull-model-dialog.tsx) (~line 143)
- **Type:** security (defense-in-depth)
- **Impact:** internal — desktop bridge already validates with `SAFE_OLLAMA_MODEL` (commit `0d1c7087`), so this is a belt-and-braces ask
- **Risk:** low
- **Summary:** The web dialog only `.trim()`s before passing the model name to the bridge. Any malformed string is rejected by the desktop validator, but the user feedback is generic ("invalid_model_name") with no clue about the format.
- **Suggested approach:** Mirror the regex on the web side and disable the "Pull" button until it matches; surface a precise error ("must match `^[A-Za-z0-9][A-Za-z0-9._:/@-]*$`").
- **Status:** open

---

## CR-100 — Recent CLI-hardening commits look correct; no regressions found

- **Area:** [apps/desktop/cli/claude.js](apps/desktop/cli/claude.js), [apps/desktop/weblab-cli.js](apps/desktop/weblab-cli.js), [apps/web/client/src/app/project/[id]/_hooks/use-chat/cli-transport.ts](apps/web/client/src/app/project/[id]/_hooks/use-chat/cli-transport.ts)
- **Type:** review note (no change requested)
- **Impact:** —
- **Risk:** —
- **Summary:** The last 3 commits (`0d1c7087`, `e1c9384e`, `ccb4e390`) move the desktop adapters from `shell:true` to `shell:false`, validate model ids against `SAFE_MODEL_ID` / `SAFE_OLLAMA_MODEL`, resolve binaries on `PATH` ourselves to avoid Windows shell-interpolation, and add a single-fire terminal guard for double-error/close. The transport wrapper mirrors the same guard. Review found no obvious gaps; flag for follow-up only if Windows path resolution fails on `\` separators (PATHEXT split is correct for `;`).
- **Status:** noted (no action)

