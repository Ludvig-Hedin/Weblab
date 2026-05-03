# Code Review Backlog — 2026-04-29

Review of all local changes (uncommitted + last 3 commits) at HEAD `5d364cf1`.
Scope: ~2.5k diff lines + 11 new files spanning UI library, editor canvas/hotkeys,
chat input, comments, projects/select, stores, tRPC, desktop release workflow.

| ID | Status |
|----|--------|
| CR-001 | auto-fixed |
| CR-002 | open |
| CR-003 | fixed (2026-05-04) |
| CR-004 | fixed (2026-05-04) |
| CR-005 | fixed (2026-05-04) |
| CR-006 | fixed (2026-05-03) |
| CR-007 | partial (2026-05-04) |
| CR-008 | done (fixed in feature/settings-overhaul working tree) |
| CR-009 | fixed (2026-05-04) |
| CR-010 | fixed (2026-05-04) |
| CR-011 | fixed (2026-05-04) |
| CR-012 | n/a — yml already uses bun install |
| CR-013 | fixed (2026-05-03) |
| CR-014 | fixed (2026-05-03) |
| CR-015 | auto-fixed (2026-05-03 review) |
| CR-016 | fixed (2026-05-03) |
| CR-017 | open (2026-05-03 review) |
| CR-018 | fixed (2026-05-03) |
| CR-019 | fixed (2026-05-03) |
| CR-020 | fixed (2026-05-03) |
| CR-021 | documented (2026-05-04) — TODO comment added; needs pkg version alignment |
| CR-022 | fixed (2026-05-04) |
| CR-023 | open (2026-05-03 review) |
| CR-024 | discussion-only (2026-05-03 review) |
| CR-025 | open (2026-05-04 review) |
| CR-026 | open (2026-05-04 review) |
| CR-027 | open (2026-05-04 review) |
| CR-028 | open (2026-05-04 review) |
| CR-029 | open (2026-05-03 review) |
| CR-030 | auto-fixed (2026-05-03 review) |
| CR-031 | auto-fixed (2026-05-03 review) |
| CR-032 | open (2026-05-03 review) |
| CR-033 | auto-fixed (2026-05-03 review) |
| CR-034 | open (2026-05-03 review) |
| CR-035 | auto-fixed (2026-05-03 review) |
| CR-036 | auto-fixed (2026-05-03 review) |
| CR-037 | open (2026-05-03 review) |
| CR-038 | open (2026-05-03 review) |
| CR-039 | open (2026-05-03 review) |
| CR-040 | open (2026-05-03 review) |
| CR-041 | open (2026-05-03 review) |
| CR-042 | open (2026-05-03 review) |
| CR-043 | open (2026-05-03 review) |

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

## CR-034 — Brand rename still has non-allowed `Onlook`/`onlook` references in infra and lock metadata

- **Area/Scope:** `Dockerfile`, `docker-compose.yml`, `bun.lock`, docs/deploy files
- **Type:** bug / DX
- **Impact:** infra / internal
- **Risk:** medium
- **Summary:** The Phase 2 brand commits update many package scopes and UI strings, but `rg` still finds non-allowed references such as `Dockerfile:1` (`Build Onlook web client`), `docker-compose.yml` service/network names, and root `bun.lock` workspace metadata with `@onlook/repo`. The lockfile/package mismatch is the most concrete risk because install tooling can still see stale workspace metadata.
- **Suggested approach:** Regenerate/update the lockfile with Bun after package metadata is finalized, then audit remaining infra names and either rename them to Weblab or document why they are intentionally stable internal identifiers.
- **Status:** open

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

## CR-038 — Auth regression: `api.forward.components.listProjectComponents` is `publicProcedure`, not `protectedProcedure`

- **Area:** [apps/web/client/src/server/api/routers/forward/editor.ts](apps/web/client/src/server/api/routers/forward/editor.ts) (lines 43–55), consumer [components-tab/index.tsx](apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/components-tab/index.tsx) (line 24)
- **Type:** security / bug
- **Impact:** user-facing (component-listing endpoint exposed without authentication)
- **Risk:** high
- **Summary:** The components-tab UI was migrated from `api.components.listProjectComponents` (`protectedProcedure`, see [components.ts](apps/web/client/src/server/api/routers/components.ts) line 45) to `api.forward.components.listProjectComponents` (`publicProcedure`). The new path proxies through the editor server, which performs a recursive filesystem scan of `SANDBOX_BASE_DIR`. Result: any unauthenticated client can hit `/api/trpc/forward.components.listProjectComponents` and read project-component names + relative file paths — a strict downgrade from the prior protected behavior. The other procedures in `editorForwardRouter` (`sandbox.create/start/stop/status`) are also `publicProcedure`, so this likely follows the existing forward-router convention, but the existing convention itself merits a security review independent of this change.
- **Suggested approach:** (1) Change `listProjectComponents` (and ideally all `editorForwardRouter` procedures) to `protectedProcedure` so the session check from tRPC context applies before any forward call hits the editor server. (2) If protected auth is incompatible with the editor-server forwarding pattern (e.g. the editor server is itself behind network ACLs / VPN), document why public is acceptable and add a server-side rate limit. (3) Consider using `protectedProcedure` plus an explicit `projectId` argument so the listing is scoped to projects the user owns.

---

## CR-039 — Behavior regression: editor-server component scanner misses `observer()`/HOC-wrapped components

- **Area:** [apps/web/server/src/router/routes/components.ts](apps/web/server/src/router/routes/components.ts) (regex set at lines 25–37) vs. [apps/web/client/src/server/api/routers/components.utils.ts](apps/web/client/src/server/api/routers/components.utils.ts) (HOC_WRAPPED_RE)
- **Type:** bug (behavior regression)
- **Impact:** user-facing (My Components panel will show fewer components after the migration)
- **Risk:** medium
- **Summary:** The editor server's `extractReactComponents` has 4 patterns: `NAMED_FUNCTION_RE`, `NAMED_ARROW_RE`, `DEFAULT_FUNCTION_RE`, `DEFAULT_IDENTIFIER_RE`. The client's `extractComponents` (the now-orphaned implementation that used to back `api.components.listProjectComponents`) has those same 4 plus a 5th: `HOC_WRAPPED_RE = /^\s*export\s+const\s+([A-Z][A-Za-z0-9_]*)\s*=\s*[a-z][A-Za-z0-9_]*\s*\(/gm`. This catches `export const Foo = observer(() => …)` and other HOC-wrapped exports. The existing test `__tests__/components.test.ts` ('detects observer-wrapped component via HOC_WRAPPED_RE') asserts this contract.
- **Suggested approach:** Port `HOC_WRAPPED_RE` to `apps/web/server/src/router/routes/components.ts` (or, better, dedupe — see CR-043). Once consolidated, ensure the test file targets the canonical extractor. This codebase uses `mobx-react-lite`'s `observer()` pervasively, so the gap is meaningful.

---

## CR-040 — Orphaned client-side `componentsRouter` (and its test) after switch to forward route

- **Area:** [root.ts](apps/web/client/src/server/api/root.ts) line 32, [components.ts](apps/web/client/src/server/api/routers/components.ts), [components.utils.ts](apps/web/client/src/server/api/routers/components.utils.ts), [__tests__/components.test.ts](apps/web/client/src/server/api/routers/__tests__/components.test.ts)
- **Type:** dead code / DX
- **Impact:** internal
- **Risk:** medium (decision dependency: see CR-038, CR-039)
- **Summary:** `grep -rn "api\.components\."` in the client returns zero hits — the only consumer (`components-tab/index.tsx`) now uses `api.forward.components.*`. The old `componentsRouter` is still imported and registered at `components: componentsRouter` in `root.ts`. It's still wired but unreachable from any UI surface. The unit test file targets `extractComponents` (the utility), so the test's value depends on whether the utility stays.
- **Suggested approach:** Decide whether the canonical scanner lives on the editor server (then drop `routers/components.ts`, `components.utils.ts`, the `components: componentsRouter` registration, and the test once `HOC_WRAPPED_RE` is ported per CR-039) OR on the client tRPC server (then revert the forward migration). Do not auto-remove right now — depends on the auth resolution in CR-038 and the scanner consolidation in CR-043.

---

## CR-041 — Stale untracked `apps/web/client/public/onlook-preload-script.js` (481 KB) shipped at the public URL

- **Area:** untracked file `apps/web/client/public/onlook-preload-script.js`
- **Type:** brand compliance / repo hygiene
- **Impact:** user-facing (file is served at `/onlook-preload-script.js` on dev server)
- **Risk:** low (no app code references it; only legacy entries in `DEPRECATED_PRELOAD_SCRIPT_SRCS`, parser test fixtures, and `CODERABBIT_REVIEWS.md` historical notes)
- **Summary:** Cherry-pick commit `49f22efc` explicitly states this file was "Excluded from cherry-pick (already deleted on main)." It re-appeared in the working tree (likely from a worktree cleanup) but nothing imports it — the active preload is `weblab-preload-script.js` (see `WEBLAB_PRELOAD_SCRIPT_FILE` in `packages/constants/src/files.ts`). CLAUDE.md mandates that any "Onlook" reference outside the explicit allowlist is a bug; the file's presence in `public/` makes it both a brand-compliance violation and a 481 KB asset served on every public deploy.
- **Suggested approach:** Delete the working-copy file (`rm apps/web/client/public/onlook-preload-script.js`). Verified safe: the only string matches are (a) the URL constants in `DEPRECATED_PRELOAD_SCRIPT_SRCS` that point at the upstream `cdn.jsdelivr.net/gh/onlook-dev/...` (different host, intentionally legacy) and (b) test fixtures + review notes (allowed per CLAUDE.md). Not auto-fixed because deleting an untracked file is destructive — flagging for explicit human approval.

---

## CR-042 — Untracked `branches.diff` scratch file at repo root

- **Area:** untracked file `branches.diff` (repo root)
- **Type:** repo hygiene
- **Impact:** internal
- **Risk:** low
- **Summary:** 18-byte file containing only `===== main =====` — clearly a leftover from an interactive `git diff` redirect. Should not be committed; not in `.gitignore` so it will keep showing up in `git status`.
- **Suggested approach:** Delete the file (`rm branches.diff`) or add `*.diff` (or specifically `branches.diff`) to `.gitignore`. Not auto-fixed for the same reason as CR-041.

---

## CR-043 — Duplicate React component-extraction logic between client and editor server

- **Area:** [apps/web/server/src/router/routes/components.ts](apps/web/server/src/router/routes/components.ts) (`extractReactComponents`, regex set, `scanDirectory`, `SKIP_DIRS`) vs. [apps/web/client/src/server/api/routers/components.utils.ts](apps/web/client/src/server/api/routers/components.utils.ts) (`extractComponents`, regex set, etc.)
- **Type:** refactor / DX
- **Impact:** internal (drift risk — see CR-039 for an existing drift)
- **Risk:** low–medium
- **Summary:** Two near-identical implementations of "scan a project and extract React components" now coexist: one in `apps/web/server` (used by the new forward path), one in `apps/web/client` (the now-orphan `componentsRouter`). The patterns differ (CR-039), the field names differ (`name` vs. `componentName`, hence the `forward/editor.ts` remap), and the directory walker is duplicated.
- **Suggested approach:** Extract the scanner + regex set into a shared package (probably `@weblab/parser` or a new `@weblab/component-scanner`) so both surfaces import the same logic. Pick one canonical field name to drop the remap in `forward/editor.ts`. Until that consolidation, treat `apps/web/server/.../components.ts` as the source of truth and add the `HOC_WRAPPED_RE` pattern there (CR-039).
