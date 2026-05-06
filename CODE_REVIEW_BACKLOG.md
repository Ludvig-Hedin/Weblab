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
