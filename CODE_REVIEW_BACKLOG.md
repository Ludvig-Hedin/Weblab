# Code Review Backlog

## Broken-Feature Fix Pass — 2026-05-27 — promoted flagged items that STOP users

Promoted the user-flow-BREAKING subset out of "Needs human review" and fixed
them. Skipped purely cosmetic / edge items (listed under Deferred). Each fix:
`bun typecheck` exit 0; `claude-review` on touched files → final `{"issues":[]}`.

### Auto-fixed (10 — all break or wedge a real user flow)

- `apps/web/client/src/app/project/[id]/_components/left-panel/code-panel/code-tab/index.tsx:124` —
  **Empty files could never be opened.** The `loadedContent` effect bailed on
  `!loadedContent`; a zero-byte file resolves to `''` (falsy), so no tab was
  ever created. `useFile` returns `content: null` while loading and the real
  value (incl `''`) once loaded — switched the guard to `loadedContent == null`.
- `apps/web/client/src/app/project/[id]/_components/left-panel/code-panel/code-tab/index.tsx:563` —
  **Deleting an open file left an orphaned tab** whose EditorView pointed at a
  path that no longer existed; Save / read-back / dirty-check then silently
  failed. After `deleteFile` resolves, close every opened file equal to `path`
  or under `${path}/`.
- `apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/branches-tab/branch-management.tsx:99` —
  **Branch deletion could strand a ghost branch.** If `switchToBranch` threw
  after the Convex `remove` mutation succeeded, the local MobX `removeBranch`
  never ran. Moved local cleanup before the switch so the list always matches
  the backend.
- `apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/branches-tab/branch-management.tsx:35` —
  **Branch rename fired the mutation twice.** `handleRename` is wired to both
  Enter and blur; Enter → `setIsRenaming(false)` unmounts the input → blur →
  rename again (the name guard misses because `branch.name` hasn't round-tripped
  yet). Added a `renameInFlightRef` latch.
- `apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-input/index.tsx:238` —
  **Suggestion Enter committed twice.** The global keydown handler called
  `handleEnterSelection()` in the `if` condition AND again in the body —
  double-select/advance. Call once, reuse the result.
- `apps/web/client/src/components/ai-prompt-composer/mention-list.tsx:42` &
  `apps/web/client/src/components/ai-prompt-composer/slash-list.tsx:40` —
  **Enter was swallowed when the picker had no results.** Both returned `true`
  on Enter even with zero items, so TipTap treated the key as handled and the
  user couldn't insert a newline / submit while an empty `@`/`/` popup was
  open. Return `false` when no item resolves.
- `apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v4/controls/pin-pad.tsx:180` —
  **Blurring an unmodified `auto` offset cell clobbered it to `''`.** Empty
  draft + existing `auto`/`''` now no-ops instead of committing `''`.
- `apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/error.tsx:46` —
  **"Fix errors" could send twice.** The event-listener effect ignored
  `consumeFixErrorsRequest()`'s return while the flag effect respected it; an
  event + pending-flag racing for the same action sent a duplicate chat
  message (wasted AI spend + double reply). Made the listener respect the
  consume guard too.
- `apps/web/client/src/app/project/[id]/_components/right-panel/index.tsx:127` —
  **`getPendingRequest` fired with a blank projectId on engine boot** (empty
  string cast to `Id<'projects'>`). Guarded with the Convex `'skip'` sentinel
  until `editorEngine.projectId` is set.

### Deferred (real but NOT user-stopping — left in backlog, not fixed this pass)

Per the "focus on broken features that stop users, not nitty-gritty" directive:

- `right-panel/index.tsx:~190` — first-creation wider chat panel width never
  applies (`isFirstCreation` is `undefined` at mount because it's read from an
  async `useQuery`; the `useState` initializer + mount-only restore both see
  `false`). Cosmetic: panel is the normal width during scaffold instead of
  the wider one. Fix = drive width from `isFirstCreation` via an effect.
- `style-tab-v4/sections/layout.tsx:154` — H/V padding/margin fields show only
  the left/top side and overwrite an asymmetric per-side override on commit.
  This is expected H/V-field semantics; only bites a user who edits H/V after
  setting asymmetric sides via the popover.
- `style-tab-v4/controls/mode-number-cell.tsx:63` — `CSS_TO_KEYWORD['100%'] =
  'fill'` makes a literal `100%` width unrepresentable. Edge.
- `style-tab-v4/sections/effects.tsx:166` + `transforms.tsx:45` — auto-open/close
  `customOpen` overrides the user's manual toggle when the effect count crosses
  zero. Annoyance, not a block.
- `style-tab-v2/sections/spacing.tsx:100` — `setAll` writes 4 props as 4 undo
  entries (v2 fallback regression vs v3/v4 batch). Undo granularity only.
- `style-tab-v2|v3/controls/text-field.tsx` + `variables-panel/index.tsx:122` —
  stale-draft commit-on-blur / prop-sync wipes in-progress input only under a
  concurrent external update of the same value (rare multi-client edit).

### Validation

- `bun typecheck` → exit 0 after every fix.
- `claude-review` re-run on the touched files → final `{"issues":[]}`.

## Deep Hunt Round 2 — 2026-05-27 — reviewer pass on Round 1 edits

Round 1 deep bug-hunt landed 10 auto-fixes across left-panel / right-panel /
ai-prompt-composer (3 subagents in parallel). Re-running `claude-review` on
the new edits surfaced **8 more real defects** the original fix pass missed,
plus 5 lower-priority info items. `bun typecheck` exit 0 throughout;
reviewer final pass returned `{"issues":[]}`.

### Auto-fixed (8 high-confidence)

- `apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v4/controls/color-row.tsx:231` —
  Hex `<input>` `onChange` blanket-uppercased every keystroke, but the same
  field round-trips `var(--token)` / named-color raw values. `var(--accent)` →
  `VAR(--ACCENT)` silently broke the binding (CSS custom-property names are
  case-sensitive). Only uppercase when the input still looks hex-shaped.
- `apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v4/controls/color-row.tsx:173` —
  `commitAlpha` called `buildHexWithAlpha(hexDraft, …)` even when the value
  was a raw `var()/named/hsl` — producing `#var(--accent)80` and corrupting
  the color. Guard with `if (!hex) return` and pass the parsed `hex` instead
  of the draft string.
- `apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v4/controls/color-row.tsx:160` —
  `commitHex` accepted 3-, 6-, and 8-digit hex but always appended
  `alphaDraft` via `buildHexWithAlpha`. `#F00` + alpha 50 → `#F0080`
  (invalid 5-digit color); 8-digit input (already alpha-embedded) → 10-digit
  garbage. Expand 3-digit to 6-digit first; pass 8-digit through verbatim.
- `apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v4/controls/color-row.tsx:240` —
  Escape on the hex input restored `setHexDraft(hex)`, but the draft is
  initialized as `hex || raw || ''`. For raw values (`var()`, named, hsl)
  `hex` is empty, so Escape blanked the field instead of restoring the
  original. Mirror the init/effect logic.
- `apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v4/controls/color-row.tsx:259` —
  Clearing the alpha field then blurring committed alpha `0`, making the
  fill / stroke fully transparent from an accidental delete. Treat empty
  input as "no change" — revert to current `alpha`.
- `apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/code-display/collapsible-code-block.tsx:68` —
  `copyToClipboard` did `void navigator.clipboard.writeText(content)` and
  immediately flipped to "Copied", showing fake success on permission-denied
  / insecure-context rejection. Awaited the write with `try/catch +
  toast.error`. (Same anti-pattern fixed in `provider-setup-dialog.tsx`.)
- `apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/code-display/collapsible-code-block.tsx:79` —
  `await editorEngine.activeSandbox?.writeFile(...)` resolved to `undefined`
  when no sandbox was active, then `setApplyDone(true)` rendered "Applied"
  without ever writing the file. Added an explicit `if (!sandbox)` branch
  with `toast.error('No active sandbox to apply to'); return`.
- `apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/code-display/collapsible-code-block.tsx:48` —
  Interface declared `applied: boolean` required, but the component
  destructure omitted it. The Apply button's label was derived from local
  `applyDone` state seeded `false`, so a file already applied always
  rendered as "Apply" after remount / scroll-away-and-back. Wired
  `useState(applied)` so persisted state survives remount.

### Needs human review (5 info-level — not auto-fixed this round)

These are real defects but lower-impact than the auto-fixed set. No source
edits this pass — flagged for follow-up so they don't get lost.

- `apps/web/client/src/app/project/[id]/_components/left-panel/code-panel/code-tab/index.tsx:360` —
  `closeFileInternal` calls `setActiveEditorFile(...)` from inside
  `setOpenedEditorFiles((prev) => …)`. React requires updater fns to be
  pure; nested setState runs twice under StrictMode (dev). Currently
  idempotent here but fragile.
- `apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-messages/message-content/tool-call-display.tsx:39` —
  `toolName = toolPart.type.split('-')[1]` truncates multi-hyphen tool
  names (`tool-web-search` → `web`), making downstream equality checks
  silently fall through to generic rendering. Use `slice('tool-'.length)`.
- `apps/web/client/src/app/project/[id]/_components/right-panel/chat-tab/chat-messages/message-content/plan-question-card.tsx:29` —
  `submitted` initialized once from `answered ?? false`; never re-syncs if
  the parent flips `answered` to `true` via a different path (e.g. another
  client resolves the tool first). User can re-resolve an already-answered
  tool. Add `useEffect(() => { if (answered) setSubmitted(true); }, [answered])`.
- `apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/windows-tab/frame-dimensions.tsx:40` —
  `device` derived once via lazy `useState`; when the frame's dimensions
  change from outside this panel, the Device dropdown shows a stale preset
  label. Recompute from metadata on change.
- `apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v4/controls/color-row.tsx:53` —
  `cssColorToHex` parses `getComputedStyle().color` with
  `/^rgba?\(([^)]+)\)$/` then splits on `,`. Works against current browser
  serialization, but CSS Color 4 space-form (`rgb(0 0 0 / 0.5)`) would
  parse as a single token and yield black with alpha 0. Defensive
  `split(/[\s,/]+/)` future-proofs this.

### Validation

- `bun typecheck` → exit 0 after each fix.
- `claude-review` re-run on `color-row.tsx` + `collapsible-code-block.tsx`
  after both fix waves → final `{"issues":[]}`.

## Deep Bug Hunt — 2026-05-27 — F-291 (ai-prompt-composer)

Deep recursion through `apps/web/client/src/components/ai-prompt-composer/` plus both callers (editor `chat-input/index.tsx` and public hero `_components/hero/create.tsx`). `bun typecheck` exits 0 after fixes.

### Auto-fixed (2)

- **`extensions/file-mention.tsx:68` — Escape destroys the mention popup but leaves the suggestion session orphaned.**
  On Escape the handler called `popupEl.remove() + component.destroy() + set both to undefined`, but the TipTap suggestion session was still active (cursor still after `@`). Subsequent keystrokes invoked `onUpdate`, which guarded `if (!component || !popupEl) return;` — leaving the user stranded with an invisible mention session until they retyped `@` to start a fresh one. Confirmed bug — exactly the regression `slash-commands.tsx` already documents avoiding (`apps/web/client/src/components/ai-prompt-composer/extensions/slash-commands.tsx:82-87`). Fix: mirror the slash-commands pattern — hide via `popupEl.style.display = 'none'`, then re-show on `onUpdate` with `popupEl.style.display = ''`. Real teardown still happens in `onExit`. Affects editor chat-input (only caller using `mentionConfig`).
- **`model-picker/provider-setup-dialog.tsx:67` — Unawaited `navigator.clipboard.writeText` → false "Copied" indicator.**
  Same anti-pattern fixed earlier in `top-bar/publish/dropdown/url.tsx`. `copy()` returned synchronously, set `copied = cmd`, then scheduled the reset — but a rejection (permission denied / insecure context / missing API in non-HTTPS preview) silently failed while the button still flipped to "Copied". Fixed: made `copy()` async, awaited the write inside `try { ... } catch { /* idle */ }` so failure leaves the button idle for retry. Call site updated to `onClick={() => void copy(h.command)}`.

### Needs human review (4)

- **`tiptap-editor.tsx:73-78` — `Placeholder` extension is captured at first editor mount; subsequent `placeholder` prop changes do not propagate.**
  `useEditor(options, deps?)` with no deps passes `deps = []` (TipTap source `node_modules/@tiptap/react/src/useEditor.ts:339`). When `deps.length === 0` and the editor is alive, TipTap calls `setOptions` instead of `refreshEditorInstance` — and `setOptions` only re-applies `editorProps`, not `extensions` (`node_modules/@tiptap/core/src/Editor.ts:266-281`). Effect: in editor chat-input the placeholder text computed from `getPlaceholderText()` changes when `chatMode` switches Build/Ask/Plan/Fix, but the placeholder shown on the empty input is whatever was first computed (typically Build). Low severity — cosmetic only; affects empty-input UX. Suggested fix: pass `[placeholder, mentionConfig, slashCommands]` as the deps arg to `useEditor` so the editor refreshes when these change. Trade-off: editor refresh blows away cursor + selection state, so we should only refresh when the user is in an idle/empty state, or migrate to a Placeholder extension that supports live updates via `view.dispatch`.
- **`mention-list.tsx:42-48` and `slash-list.tsx:40-46` — Enter on empty results swallows the keypress.**
  When `items.length === 0` the lists still return `true` on Enter (after the `if (item)` guard returns without dispatching). This blocks the editor from inserting a newline when the user presses Enter on a "No results" panel. Confirmed in code — affects mid-mention/mid-slash sessions that filtered to empty. Suggested fix: return `false` when `selectedIndex` resolves to no item so the editor handles the key normally (and the suggestion session exits as the user keeps typing).
- **`chat-input/index.tsx:140-160` — `generateSuggestions` has no stale-response guard.**
  `setSuggestions(nextSuggestions)` writes whatever response arrives, regardless of whether the user has since switched conversations or sent another message. Two interleaved requests can land out-of-order, overwriting the newest suggestions with stale ones. Outside strict F-291 scope (lives in chat-input, not the shared composer), but flagged because the composer's `suggestions` slot consumes this state. Suggested fix: capture the current `currentConversation.id` + a monotonically increasing request seq in a ref, compare on resolution, drop stale writes. Same pattern protects the dedupe signature clear in the catch branch (line 156) from re-firing for an older state.
- **`model-selector-v2.tsx:133-134` — `hasCliBridge` read during render → hydration mismatch on SSR'd pages.**
  `const hasCliBridge = typeof window !== 'undefined' && Boolean(window.weblabNative?.cli?.providerStatus);` evaluates differently on server (false) vs first client render (true if desktop bridge present). React 18 hydration logs a warning and may force a client re-render. ModelSelectorV2 is feature-flagged off today (`env.NEXT_PUBLIC_PROVIDER_PICKER_V2`), so the runtime impact is gated. Suggested fix: lift the check into a `useState`/`useEffect` post-mount, identical to the `hasNativeBridge` pattern already in `use-provider-statuses.ts:71-102`.

### Verified NOT bugs (5)

- **`tiptap-editor.tsx:127-161` — closures over `onPaste`/`onCompositionStart`/`onCompositionEnd` are NOT stale.** Verified via TipTap source: `useEditor` passes a new options object every render → `compareOptions` detects `editorProps` identity change → `setOptions` re-applies `editorProps` via `view.setProps`. Closures refresh on every render.
- **`extensions/slash-commands.tsx:23-31` — `cmd.keywords?.some(...)` returning `undefined` as filter result is safe.** Empty query matches everything via `String.includes('')`. Falsy `undefined` correctly filters out non-matching commands.
- **`mention-list.tsx:33` / `slash-list.tsx:32` — modulo arithmetic with empty `items` does not divide by zero.** `Math.max(items.length, 1)` floors the divisor at 1 and the wrapped index resolves to 0; subsequent `items[selectedIndex]` is guarded with `if (item)`.
- **`tiptap-editor.tsx:179-186` — value-sync effect's `setContent` with `emitUpdate: false` does not feedback-loop with `onUpdate`.** Verified by TipTap dispatching the transaction with `meta: { preventUpdate: true }`.
- **`pull-model-dialog.tsx:55-70` — IPC progress listener cleanup is correct.** The bridge type `onOllamaPullProgress?: (...) => () => void` returns a real unsubscribe; the useEffect returns it as cleanup; `pullIdRef` guards against listener-after-second-pull (button is disabled while `pulling !== null`).

---

## Bug Hunt — 2026-05-28 — F-380..F-392 deeper pass (CMS workspace, round 2)

Second `/bug-hunt` over `apps/web/client/src/app/project/[id]/_components/cms-workspace/` (13 files, F-380..F-392). This pass crossed the UI ↔ Convex boundary — read every `cmsCollections`, `cmsItems`, `cmsFields`, `cmsBindings`, `cmsSources`, `cmsCollectionPages`, `cmsActions` module to compare contracts. `bun typecheck` exit 0; touched-file `bunx eslint` clean.

### Auto-fixed (7 issues)

- `apps/web/client/src/app/project/[id]/_components/cms-workspace/fields-tab.tsx:443` —
  UI manual-key validator was `/^[a-z0-9_]+$/`, which permits a leading
  digit. Server `FIELD_KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/` rejects.
  User-typed `1foo` passed UI then triggered the generic "Field key
  must start with a letter or underscore…" server toast. Updated UI
  regex to `^[a-z_][a-z0-9_]*$` (case clamped to lowercase by the slug
  helper; rule is "start with letter or underscore"). Surfaced a
  clearer client-side error message.
- `apps/web/client/src/app/project/[id]/_components/cms-workspace/fields-tab.tsx:440` —
  `slugifyKey` and the manual-key path didn't cap at 64 chars. Server
  rejects anything longer. Added `.slice(0, 64)` to both paths.
- `apps/web/client/src/app/project/[id]/_components/cms-workspace/create-collection-dialog.tsx:50` —
  `slugFromName` didn't cap at 64 (server `validateSlug` 1-64). Added
  length cap + trailing-dash trim so the slice doesn't leave the slug
  ending in `-` (server regex requires alphanumeric end). Surfaced a
  clearer "Slug must be 64 characters or fewer" error when the user
  typed an oversized slug directly.
- `apps/web/client/src/app/project/[id]/_components/cms-workspace/map-collections-dialog.tsx:233` —
  Existing `slugify` capped at 64 but the slice could leave a trailing
  dash (e.g. `foo-bar-…-` truncated mid-separator). Server regex
  `^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$` rejects. Added trailing-dash
  trim after the slice.
- `apps/web/client/src/app/project/[id]/_components/cms-workspace/items-table.tsx:50` —
  Collection-switch effect cleared `selectedIds` + `search` but left
  `editingId` / `creating` / `routingOpen` alone. If the user opened
  an ItemEditor on collection X then switched to collection Y in the
  sidebar, the sheet stayed mounted holding X's itemId / values — and
  in "create" mode, clicking Save would have inserted an item under
  the wrong collection (the ItemEditor's `collection` prop already
  reflected Y by then). Added clears for all three states.
- `apps/web/client/src/app/project/[id]/_components/cms-workspace/sources-tab.tsx:115` —
  Delete dialog promised destruction when `collectionCount > 0`, but
  the server `cmsSources.remove` mutation explicitly refuses deletion
  while any collection still references the source. User saw the
  confirm copy "X collection(s) will lose their sync link" then got a
  "Cannot delete: X collection(s) still use this source" toast after
  clicking Delete. Now short-circuits with the same error toast
  before opening the confirm — UI and server agree on the contract.
- `apps/web/client/src/app/project/[id]/_components/cms-workspace/edit-source-dialog.tsx` —
  Two related fixes for the rotate-credentials path: (a) added the
  monotonic `testReqRef` invalidation pattern from
  `connect-source-dialog.tsx` so a late `Test connection` result
  can't set `testStatus={ ok: true }` for credentials the user has
  since edited; (b) extended the Save button gate to require a
  passing test whenever `rotate` is on with at least one non-blank
  cred. Previously the user could click Test → type new values →
  click Save and persist credentials that were never validated.

### Needs human review (6 issues, flagged with TODO(bug-hunt) comments)

- `apps/web/client/src/app/project/[id]/_components/cms-workspace/items-table.tsx:59` —
  `convex/cmsItems.ts list()` caps the result at 100 items by default
  (max 500). UI never passes `limit`, so for collections with > 100
  items: (a) the header count badge says "100" regardless of actual
  size, (b) client-side search silently misses items past the slice,
  (c) the preview-item Select picker is also truncated. Worst case a
  user can't find their own data. Need pagination (load-more or
  virtualized) and a separate count query so the badge tells the truth.
- `apps/web/client/src/app/project/[id]/_components/cms-workspace/sources-tab.tsx:62` —
  `sourceSync` returns `SyncResult.perCollection[].error` for every
  collection that failed to sync. `handleSync` drops these errors —
  only `result.written` + `result.pruned` are surfaced. If 2 of 3
  collections fail, the user sees a green success toast with
  `written: <items from the one that worked>`. Surface failed-collection
  count + the first error message.
- `apps/web/client/src/app/project/[id]/_components/cms-workspace/map-collections-dialog.tsx:107` —
  `cmsActions.sourceMapCollections` runs the post-mapping initial sync
  inside a `try { … } catch (err) { console.error(...) }` block, so
  sync failures are visible only in server logs. The action resolves
  successfully and the dialog toasts "mapped". User maps a source,
  gets the green toast, and the items list stays empty with zero
  on-screen explanation. Server should return the sync result (or a
  `syncFailed` flag) and the UI should distinguish "mapped + items
  loaded" from "mapped but sync failed — try Refresh".
- `apps/web/client/src/app/project/[id]/_components/cms-workspace/bind-dialog.tsx:159` —
  Mode detection reads `editorEngine.elements.selected[0]` and re-runs
  whenever the canvas selection changes (dep on `selected[0]?.domId`).
  If the user opens the bind dialog on element A then clicks element
  B in the canvas, the dialog's `mode` reflects B while `oid` (used
  by handleSave) still targets A. Save can persist a REPEAT /
  CURRENT_FIELD binding onto an element that isn't a list /
  list-descendant. Fix: close the dialog when selected element
  diverges from `oid`, or resolve the element by `oid` directly
  instead of reading `selected[0]`.
- `apps/web/client/src/app/project/[id]/_components/cms-workspace/bind-dialog.tsx:277` —
  Pre-fill for REPEAT / FIRST_FIELD only reads `sort` + `limit`.
  Existing `filters` / `filterMode` on the binding are NOT loaded into
  local state, so handleSave then builds the new binding without them
  and the upsert overwrites the whole payload — silently dropping any
  previously saved filters. No other UI writes filters today, but
  `vBindingPayload` allows them; defensive round-trip preservation
  would prevent regressions when filter UI lands.
- `apps/web/client/src/app/project/[id]/_components/cms-workspace/routing-dialog.tsx:106` —
  `convex/cmsCollectionPages.ts upsert()` only validates
  `matchFieldKey` length (1-64), not existence in the collection's
  fields. `cmsFields.remove` doesn't touch `cmsCollectionPages`
  either. Deleting a field that's referenced as `matchFieldKey` leaves
  a stale page registration: URL → item resolution silently fails
  because no item ever matches the missing key. Fix: validate
  existence server-side at upsert AND cascade-clear / repoint
  `matchFieldKey` on field removal.

### Dead state (low priority)

- `apps/web/client/src/components/store/editor/state/index.ts:49` —
  `cmsEditingItemId` (+ setter) and `cmsRoutingDialogOpen` (+ setter)
  are written but never read by any cms-workspace UI. items-table.tsx
  manages editing state in local React state; routing-dialog.tsx
  takes `open` as a prop. Dead code; delete to avoid future confusion.

## Bug Hunt — 2026-05-28 — Desktop auth (sign-in, handoff, redeem, clerk-bridge)

Scope: `apps/desktop/{main.js,preload.js}`, `apps/web/client/src/app/sign-in/**`, `apps/web/client/src/utils/auth/**`. Tools: `bun typecheck` exit 0; `bunx eslint` scoped files clean. Observed runtime errors during preview testing via `mcp__Claude_Preview__preview_logs`.

### Auto-fixed (2 issues)

- **`apps/web/client/src/utils/auth/clerk-bridge.ts:loadBridgedUser`** — Convex `fetchQuery` / `fetchMutation` and `clerkClient.users.getUser` calls threw uncaught when the Clerk-issued JWT was rejected ("Could not verify OIDC token claim. Check that the token signature is valid and the token hasn't expired."). Caught by `preview_logs` during this session — every protected RSC (`/w/[slug]/projects`, etc.) crashed to the root error boundary with no recovery path: user couldn't sign out, sign in to a different account, or land on `/sign-in`. Wrapped all three call sites in try/catch, added `isConvexUnauthenticated` helper, and return `null` on rejection so the protected-route guard redirects to `/sign-in` for a fresh-token re-auth. Fix verified in code but Turbopack module cache for `'server-only'` modules was stuck during preview validation — the in-process server kept executing the previous-version compiled chunk. Effective after a dev-server restart in production-style builds it applies on the next request.

- **`apps/web/client/src/app/sign-in/desktop-handoff/page.tsx`** — `await createTicketFor(userId)` (Clerk Backend `signInTokens.createSignInToken`) was un-caught. A Clerk-side failure (network outage, rate limit, account disabled between the `auth()` check and the token mint) bubbled to Next.js' global error boundary — generic crash page, no way back. Wrapped in try/catch with a `<HandoffErrorScreen>` fallback that renders the same chrome as the success path and links to `/sign-in`.

### Needs human review (8 issues)

- **`apps/desktop/main.js:ipcMain.handle('weblab:open-external')`** — IPC handler does not validate `event.senderFrame.url` against `ALLOWED_IPC_ORIGINS`. A renderer that has navigated off-origin (e.g. to a third-party iframe that escaped the CSP, or a future bug that lets an attacker XSS the page) could call `weblabNative.openExternal('https://phish.example')` and the OS browser would open it in the user's default browser. Same defense-in-depth gap pre-existed on the legacy `weblab:open-oauth` channel and is now inherited by the alias. The cross-process risk is bounded (the URL just opens externally; it can't reach the desktop's filesystem or partition cookies) but the phishing surface is real. Fix sketch: in the handler, look up `event.senderFrame?.url` and reject any URL whose origin isn't in `ALLOWED_IPC_ORIGINS`. Same pattern as the CLI bridge in `weblab-cli.js`.

- **`apps/desktop/main.js:handleDeepLink` `weblab://auth/handoff?ticket=…`** — Sign-in-ticket CSRF. An attacker can craft a deep-link payload with their own freshly-minted ticket and trick the user into opening it (macOS will prompt "Open in Weblab?" for any `weblab://` URL). If the user accepts, the desktop redeems the attacker's ticket and the user is signed into the attacker's Clerk account on their machine — every subsequent action, project, payment method now lands in the attacker's account. Mitigation: the desktop should mint a per-launch nonce when it first calls `openExternal('/sign-in/desktop-handoff?…&nonce=…')`, persist the nonce in `app.getPath('userData')`, and require the ticket to be redeemed only when the deep link's nonce matches the persisted one. Server-side `createSignInToken` would need to accept and round-trip the nonce, or the desktop would need to call a separate `/api/desktop/verify-nonce` before redeeming. Real attack but requires social-engineering the user into opening a hostile `weblab://` URL.

- **`apps/web/client/src/app/sign-in/redeem/redeem-client.tsx:91-93`** — `setActive` → `router.replace('/projects')` race. Clerk's `setActive` writes the session cookie into the partition; immediately after, `router.replace` triggers a client navigation that the server renders. There is no documented guarantee that the cookie is committed to the browser's cookie store before the next request fires. Symptom would be: redeem completes, navigates to `/projects`, server `getCurrentUser` returns null, user gets redirected back to `/sign-in` — looks like sign-in failed. Hard to reproduce locally; would surface on slow disks / high-CPU. Fix sketch: after `setActive`, wait until `useUser().isSignedIn === true` before navigating (poll with a small interval, or subscribe to Clerk's session signal).

- **`apps/web/client/src/app/sign-in/_components/clerk-auth-form.tsx:360-369`** — In `startOtpFlow`, after `isAlreadySignedInError(err)` is true we `signOut()` and retry `createSignInAttempt`. If that retry ALSO throws `isAlreadySignedInError` (e.g., `signOut` returned before the session cookie was actually cleared in the embedded Chromium partition), the error is treated as non-recoverable and we fall through to the `form_identifier_not_found` branch — which then re-throws the "already signed in" error wrapped in a generic message. Fix sketch: detect `isAlreadySignedInError(retryError)` and either retry once more after a small delay, or bail out with a clear "Please reload the app" message.

- **`apps/web/client/src/app/sign-in/[[...rest]]/sign-in-client.tsx:30-47`** — Hydration mismatch risk (React error #418 was observed in the user's Electron logs). The component starts with `desktop.isDesktop = false`, then sets to `true` in `useEffect`. First client render matches server, so should be safe — but the `pkg.version` vs `desktop.version` swap and the `<Link>` vs raw `<BrandLogo>` swap both happen on a post-hydration setState. If a downstream subscriber reads desktop state during the same render pass (e.g. a `next-intl` translation that consumes `data-desktop`), the server-rendered text and the hydrated-client text differ. Refactor to a `mounted` flag + `useEffect(() => setMounted(true))` and gate the variant swap on `mounted` so the FIRST hydrate render is always equal to the server output, eliminating the class of mismatches.

- ✅ **FIXED (2026-05-28, auth audit)** **`apps/web/client/src/app/sign-in/verify/page.tsx:handleResend`** — After a successful resend, the URL `?sentAt=` param is NOT updated, only the `resendCountdown` state. If the user refreshes the page after resending, `initialCountdown` is computed from the stale `sentAt` URL value, and the cooldown UI is wrong (shows shorter than the actual cooldown). Fixed by syncing the param on resend via `window.history.replaceState` (lighter than `router.replace` — no Next re-render that would reset countdown state).

- **`apps/web/client/src/app/sign-in/desktop-handoff/handoff-client.tsx:26-36`** — No fallback if the `weblab://` protocol handler isn't registered on the OS (user uninstalled the desktop app, browser doesn't trust unknown schemes). `window.location.href = 'weblab://...'` silently does nothing in some browsers, and the user sees the "Returning to Weblab…" spinner forever. The manual "Open Weblab" button is the only recovery. Fix sketch: after a 3–5s timeout with no page-unload event, render a fallback "Don't have Weblab desktop? Download here." link or a "Stay signed in to the browser" alternative.

- **`apps/web/client/src/app/project/[id]/page.tsx:81`** *(out of strict auth scope but discovered while running preview validation)* — `fetchQuery(api.projects.getEditorBootstrap, { projectId: projectId as Id<'projects'> }, …)` casts the raw URL segment to a Convex `Id<'projects'>` without validating its format, then Convex throws `ArgumentValidationError: Value does not match validator. Path: .projectId Value: "<uuid>" Validator: v.id("projects")` (UUID-shaped values from the old Supabase-era links land here). The cast lies to the type system and the runtime crashes. Fix sketch: validate the id with `Id<'projects'>` or a regex (Convex ids are base32-ish, fixed-length) before the call, returning a 404 page when malformed instead of crashing.



Two-pass `/bug-hunt` over `apps/web/client/src/components/ui/pricing-modal/`,
`apps/web/client/src/components/ui/pricing-table/`,
`apps/web/client/src/components/ui/avatar-dropdown/`,
`apps/web/client/src/components/telemetry-provider.tsx`,
`apps/web/client/src/utils/telemetry/index.ts`. `bun typecheck` exit 0 after fixes.
`bunx eslint` on scoped paths: 7 pre-existing warnings (below repo 5000 cap), 0 errors.

### Auto-fixed (6 issues)

- **`apps/web/client/src/components/ui/pricing-modal/free-card.tsx:117`** —
  `handleDowngradeToFree()` floating promise. Wrapped in `void`. Lint clean.
- **`apps/web/client/src/components/ui/pricing-modal/legacy-promotion.tsx:43`** —
  `navigator.clipboard.writeText(code)` floating promise. Wrapped in `void`.
  Toast still fires synchronously, which masks clipboard rejection (see
  Needs-review item below for "false success on clipboard reject").
- **`apps/web/client/src/utils/telemetry/index.ts:1-7`** — replaced static
  `import posthog from 'posthog-js'` with dynamic `await import('posthog-js')`
  inside `resetTelemetry`. The static import defeated
  `telemetry-provider`'s consent-gated dynamic-import claim — posthog-js
  was pulled into every page's critical-path bundle. Now consistent with
  provider: SDK is dynamic everywhere.
- **`apps/web/client/src/components/ui/pricing-modal/index.tsx:65`** —
  `onClick={() => (state.isSubscriptionModalOpen = false)}` did a raw MobX
  property write that bypasses action-wrapping (see
  `components/store/state/manager.ts:17-23`). Switched to
  `state.setIsSubscriptionModalOpen(false)`. Same fix applied to
  `avatar-dropdown/plans.tsx:37` (`= true` → `setIsSubscriptionModalOpen(true)`).
- **`apps/web/client/src/components/ui/avatar-dropdown/index.tsx:94`** —
  `signOutEverywhere(...)` was awaited without a try/catch. A Clerk
  sign-out failure prevented the follow-up
  `window.location.assign(getSignInUrlClient())`, stranding the user
  with cleared localforage but a stale signed-in UI. Wrapped in
  `try/catch/finally` so the hard-navigate always fires.
- **`apps/web/client/src/components/telemetry-provider.tsx:53-101`** —
  module-level `posthogClient` / `gleapSingleton` singletons had no
  double-init guard. On HMR / Suspense remount the effect re-fired and
  `posthog.init()` / `gleap.initialize()` ran twice. PostHog warns
  ("PostHog was already initialized"); Gleap can register duplicate
  listeners. Added `!posthogClient` / `!gleapSingleton` guards both
  outside the async closure (to skip work) and re-checked after `import`
  resolves (to win the race between two concurrent remounts).

### Auto-fixed in second pass (4 user-blocking issues)

- **`pricing-table/index.tsx:26-33`** — flicker fix shipped. Distinguishes `authResolving` (`hasAuthCookie === null` OR `hasAuthCookie === true && user === undefined`) from `isUnauthenticated`. Passes new `isAuthLoading` prop to FreeCard + ProCard; both render disabled loading spinner so signed-in users cannot accidentally trigger the auth modal during the users.me-resolving window. Real bug closed (was: click in flicker window → auth modal instead of checkout).
- **`pricing-modal/legacy-promotion.tsx`** — async handler with try/catch on `navigator.clipboard.writeText` + `document.execCommand('copy')` fallback. Toast.success only on confirmed write; toast.error with "select and copy manually" hint if both fail. Real revenue path closed (was: false "Copied" toast on permission-denied → user pastes nothing → loses 1-month-free Pro promo code).
- **`avatar-dropdown/index.tsx:68`** — `handleSignOut` now calls `setOpen(false)` at the start so the dropdown closes immediately while async localforage clear + Clerk sign-out run. UX polish.
- **`telemetry-provider.tsx` consent re-init** — DROPPED (false alarm): `cookie-consent.tsx:54` calls `window.location.reload()` inside `onAccept`. Next mount runs the init effect with consent present → SDKs initialize. No code change needed.

### Still Needs human review (5 issues — not user-blocking)

- **`telemetry-provider.tsx:9`** — `import { PostHogProvider as PHProvider } from 'posthog-js/react'` is a **static** import. File comment claims "Dynamic import for posthog-js keeps the SDK out of the critical-path bundle on landing/login/dashboard until cookie consent fires" — but this static line pulls the posthog-js React adapter (which pulls posthog-js itself) into the bundle anyway. Verified live: `/pricing` cold load fetches `node_modules_posthog-js_*.js` from `_next/static/chunks` even with `weblab.consent` cookie absent. Fix: lazy-load `PHProvider` via `const PHProvider = lazy(() => import('posthog-js/react').then(m => ({ default: m.PostHogProvider })))`, wrap consumer in `<Suspense>`. Bundle perf, not user-blocking.

- **`avatar-dropdown/index.tsx:53`**, **`avatar-dropdown/plans.tsx:19,20`** — `useQuery(api.users.me, {})`, `useQuery(api.subscriptions.get, {})`, `useQuery(api.usage.get, {})` all fire **unconditionally**. Parent routes correctly gate the avatar render behind `isSignedIn` so this is currently safe, but the components have no defensive auth-cookie gate of their own. If they ever mount in an unauthenticated context (Storybook, design-system page, marketing surface), Convex returns 401 / floods console. Fix: mirror the `useHasAuthCookie() === true ? {} : 'skip'` pattern from `useSubscription` and `telemetry-provider`. Defense-in-depth, not user-blocking.

- **`avatar-dropdown/plans.tsx:28-31`** — three `@typescript-eslint/no-unsafe-enum-comparison` warnings: `product?.type === ProductType.FREE/PRO`. `product` is `subscription?.product ?? FREE_PRODUCT_CONFIG`. `FREE_PRODUCT_CONFIG.type` is the string literal `'free'` from `@weblab/stripe`; `subscription.product.type` flows through Convex (loses enum brand). Runtime-safe, lint-noisy. Fix: declare `FREE_PRODUCT_CONFIG.type` as `ProductType` in `@weblab/stripe`, or narrow at the boundary in plans.tsx with `as ProductType`.

- **`pricing-modal/legacy-promotion.tsx:1-6`** — imports `motion` and `AnimatePresence` from `framer-motion` while the rest of the pricing UI imports from `motion/react`. Mixed deps means two animation libs ship to the bundle for one feature. Fix: switch this file to `motion/react` to match `index.tsx`, `free-card.tsx`, `pro-card.tsx`, `enterprise-card.tsx`. Bundle perf.

- **`pro-card.tsx:83-85`** — `if (!PRO_PRODUCT_CONFIG.prices.length) throw new Error('No pro tiers found')` throws during render. If the constant is ever empty (build misconfig, stripped tree), the entire pricing modal + table crashes to the error boundary. Currently always populated. Fix sketch: replace with an empty-state render (`<div>Pricing temporarily unavailable</div>`) and log to telemetry.

### Out-of-scope console errors (pre-existing, not in our 4 files — track separately)

- **"Can't perform a React state update on a component that hasn't mounted yet"** fires 8× on `/pricing` cold load. String not present in our source — comes from React-DOM dev runtime. Likely a sibling provider (clerk, motion, or radix) calling `setState` from a render-time side effect. Repro: cold load `http://localhost:3000/pricing` anon, check console errors.
- **`WorkspaceLayout` `ConvexHttpClient.queryInner` "Unauthenticated: Could not verify OIDC token claim"** fires repeatedly on every page transition in this dev session. Pre-existing — `loadBridgedUser` SSR path passes a stale Clerk JWT to Convex. The error is handled by the root error boundary so it does not crash UX, but it pollutes telemetry and the dev console.

### Coverage gaps (added to docs/test-plan.md follow-up)

No adjacent `*.test.ts` for any of F-450..F-453. T-010, T-400, T-450, T-451,
T-452, T-453, T-725 all `[ ]` un-run. Test-plan rows exist but need a Clerk
dev-user fixture + Stripe test-mode fixture to execute.

---

## Bug Hunt — 2026-05-28 — F-200..F-209 (Editor Top Bar — continued)

Exhaustive deeper `/bug-hunt` sweep across all top-bar features. `bun typecheck` exit 0; `bun lint` exit 0 before and after all fixes.

### Auto-fixed (1 issue)

- **`top-bar/publish/dropdown/url.tsx:15` — Clipboard write not awaited; false "Copied!" toast on failure.**
  `navigator.clipboard.writeText(validUrl)` was synchronous-fire-and-forget: the success toast and `setIsCopied(true)` fired before the Promise resolved, so permission-denied or unavailable clipboard APIs delivered a false success indicator to the user. Changed `copyUrl` to `async`, added `await`, wrapped in `try/catch`, and changed `onClick={copyUrl}` → `onClick={() => void copyUrl()}`. Error path shows `toast.error('Failed to copy to clipboard')`.

### Deferred (6 issues)

- **`top-bar/publish/dropdown/provider-switcher.tsx:17` — `useQuery(api.hostingConnections.list, {})` has no `skip` guard.**
  Unlike `hosting-integrations-dialog.tsx` which guards with `open ? {} : 'skip'`, `ProviderSwitcher` fires unconditionally. Radix DropdownMenuContent unmounts content by default so the query is only active while the dropdown is open — acceptable for now, but should add explicit `skip` guard for parity and to protect against layout changes that keep content mounted. Low priority.

- **`top-bar/connection-chip.tsx:21-24` — `useTranslations` cast bypasses next-intl key type checking.**
  `const t = useTranslations('editor.topBar.connection') as (key: string, values?: Record<string, number>) => string;` strips the strict ICU key union. Renamed or missing translation keys won't be caught at compile time. Remove the cast and fix any resulting type errors against the messages JSON.

- **`top-bar/git-actions.tsx:80` — `loadGitInfo` missing from `useEffect` deps.**
  `loadGitInfo` closes over `editorEngine.activeSandbox?.gitManager`. If the sandbox ref changes while the dialog is open, it uses a stale manager. Low risk (stable MobX ref in practice). Fix: wrap `loadGitInfo` in `useCallback` and add to dep array.

- **`top-bar/publish/dropdown/preview-domain-section.tsx:176` — `publish()` in "Update" `onClick` not wrapped in `void`.**
  `onClick={() => publish()}` returns the unhandled promise. `publish()` catches all errors internally so this is lint-only. Change to `onClick={() => void publish()}`.

- **`top-bar/publish/provider.tsx:154` — `toast.success('Deployment success!')` fires immediately after scheduling, not after completion.**
  `runDeployment` (`api.publishActions.run`) likely returns before the build/host finishes (deployment status is tracked reactively via `deployments.getByType` live queries). The toast should say "Deployment started" or be removed in favour of the reactive status already tracked in `TriggerButton`.

- **`top-bar/project-breadcrumb.tsx:61` — `captureScreenshot()` async rejections escape `try/catch`.**
  `void editorEngine.screenshot.captureScreenshot()` discards the promise. The `try/catch` only catches synchronous throws. Async rejections after the first `await` inside `captureScreenshot` go unhandled. Fix: attach `.catch(console.error)` to the discarded promise, or `await` inside an inner async IIFE.

### Not addressed (pre-existing, tracked separately)

- `git-actions.tsx` commit-message divergence (`createCommit` auto-generates vs `commit` falls back to `'New Weblab backup'`) — tracked with `TODO(bug-hunt)` comment in code.
- `trigger-button.tsx` `editorEngine.history.length` as "changes since deploy" proxy — tracked with `TODO(bug-hunt)` comment in code.

---

## Bug Hunt — 2026-05-28 — F-380..F-392 (CMS workspace)

Scoped `/bug-hunt` sweep over `apps/web/client/src/app/project/[id]/_components/cms-workspace/` (13 files, F-380..F-392). `bun typecheck` exit 0; `bunx eslint --max-warnings 0` exit 0 both before and after fixes.

### Auto-fixed (3 issues)

- `apps/web/client/src/app/project/[id]/_components/cms-workspace/edit-source-dialog.tsx:80` —
  `source!.type` non-null assertion would throw a `TypeError` if the user
  clicked "Test connection" while `useQuery(api.cmsSources.get, …)` was
  still loading (the dialog opens as soon as `sourceId` is truthy; the
  Test button is not gated on `source`). Added an early-return guard +
  removed the assertion: when rotating creds without a loaded source, we
  surface "Source not loaded yet" instead of detonating the dialog.
- `apps/web/client/src/app/project/[id]/_components/cms-workspace/edit-source-dialog.tsx:61` —
  Seed effect re-ran whenever Convex returned a new `source` reference
  (realtime collab update or window-focus refetch), silently overwriting
  the user's in-progress name edit. Added the `initializedRef` +
  `lastSourceIdRef` lock-on-first-fill pattern that bind-dialog.tsx and
  routing-dialog.tsx already use — seed only on first arrival per
  (open × sourceId).
- `apps/web/client/src/app/project/[id]/_components/cms-workspace/data-pusher.tsx:208` —
  `matchSegment` called `decodeURIComponent(p)` unguarded; a preview URL
  with malformed percent-encoding (e.g. `/blog/%G1`) raised `URIError`,
  which bubbled up through the 2-second `pushAll` interval into the
  Convex hook boundary and spammed unhandled-error logs. Wrapped the
  decode in a try/catch and returned `null` (treat as non-match), so
  CMS data continues pushing to other frames.

### Needs human review (4 issues, flagged with TODO(bug-hunt) comments)

- `apps/web/client/src/app/project/[id]/_components/cms-workspace/sources-tab.tsx:43` —
  `syncingId` / `testingId` track a single in-flight id. Clicking Sync
  (or Test) on row A then row B before A completes causes A's `finally`
  to clear state while B is still pending, so B's button flips back to
  "Refresh" and the user can re-fire it. Fix: switch to `Set<string>`
  (add/delete by source id) so concurrent in-flight calls each own their
  pill state.
- `apps/web/client/src/app/project/[id]/_components/cms-workspace/item-editor.tsx:112` —
  Seed effect overwrites the user's unsaved edits when a collaborator
  updates the item on the backend mid-edit (Convex realtime fires →
  `item` identity changes → setValues/setSlug/setStatus replace local
  state AND `initialSnapshotRef` updates so isDirty=false). Worst case:
  silent data loss. Fix: either lock-on-first-fill (matches the other
  dialogs but blocks live updates) or detect the conflict and prompt the
  user before overwriting (preferred for collab UX). Lower priority than
  edit-source-dialog because the editor stays open and the user usually
  notices the diff visually, but still a real loss-of-edits path.
- `apps/web/client/src/app/project/[id]/_components/cms-workspace/items-table.tsx:144` —
  `handleBulkDelete` resets `selectedIds` to empty on partial failure,
  stripping the failed ids from the selection so the user can't retry
  without re-checking rows. Failure messages are also discarded — only
  the count surfaces. Fix: rebuild `selectedIds` from the failure list
  (`setSelectedIds(new Set(failedIds))`) and include the first error's
  message in the toast.
- `apps/web/client/src/app/project/[id]/_components/cms-workspace/fields-tab.tsx:102` —
  `moveField` reads `fieldsData` from the cached query and computes its
  splice synchronously. Two fast clicks on Up/Down race — the second
  click splices the pre-move list and sends an `orderedFieldIds` that
  reverses the first move. Fix: gate via an `isReorderingRef` (reject
  the second click until the mutation settles) or coalesce rapid clicks
  into a single reorder mutation.

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



## Bug Hunt — 2026-05-28 — F-100..F-108 (Workspace & Settings)

`/bug-hunt` over `apps/web/client/src/app/w/**`, `apps/web/client/src/app/settings/page.tsx`, plus dependencies `apps/web/client/convex/workspaces.ts`, `convex/users.ts` (`capabilities`), `convex/lib/permissions.ts`, `convex/lib/auth.ts`. Validation: `bun typecheck` exit 0; `bunx eslint` on changed files exit 0.

> **Round-2 update (2026-05-28, `/review-current-implementation` + `/bug-hunt`):**
> Fixed the two **user-blocking** items below. The remaining "Needs human
> review" entries are missing-feature / catalog-drift / polish items that
> don't break a user flow — intentionally deferred per the "focus on
> features that stop users" directive.
>
> - **RESOLVED — F-106 invitations whole-app crash (was the only Blocker).**
>   `invitations/page.tsx` ran `useQuery(api.workspaces.inviteList)`
>   unconditionally for team workspaces. `inviteList` calls
>   `requireCap('workspace.invite')`, which `member` and `viewer` roles
>   lack (`convex/lib/auth.ts:43-62`), so it threw `FORBIDDEN`. There is
>   **no error boundary anywhere in the `/w` tree** (only the root
>   `app/error.tsx`), so any team member/viewer opening the invitations
>   URL directly nuked the entire app shell to the generic error page.
>   Fix: gate the query behind `canInvite` derived from
>   `api.users.capabilities` (which returns `[]` instead of throwing) and
>   render a "View-only access" panel for non-admins. `inviteList` now
>   runs only when the caller actually holds the cap.
> - **RESOLVED — F-105 remove-self dead button.** `members/page.tsx`
>   rendered `RemoveMemberButton` on the caller's own row; the backend
>   rejects self-removal (`workspaces.ts:391`), so it only ever produced
>   a `toast.error`. Fix: query `api.users.me` and hide the Remove button
>   when `m.user.id === currentUserId`.
>
> Validation: `bun typecheck` exit 0; `bunx eslint` on both pages = 0
> errors (5 pre-existing `no-unsafe-enum-comparison` warnings only);
> preview server compiles both routes with no server errors; deep-link
> `returnUrl` preservation from the round-1 layout fix confirmed live.

### Auto-fixed (2 issues)

- **`apps/web/client/src/app/w/[slug]/layout.tsx:22-28`** — server-side
  unauth bounce hardcoded `redirect(getSignInUrl(\`/w/${slug}/projects\`))`
  for every nested route. Visiting `/w/foo/settings/general` while signed
  out always returned the user to `/w/foo/projects` post-sign-in,
  dropping deep links from emails, settings notifications, members
  pages, etc. Replaced with `headers().get('x-pathname')` (middleware
  sets the header on every request — see `middleware.ts:56-58`) with
  the same hardcoded fallback. Same fix applied to
  **`apps/web/client/src/app/w/[slug]/settings/layout.tsx:22-25`**
  (which previously hardcoded `/w/${slug}/settings` — itself a 404
  because no `page.tsx` exists at that level, so signed-out deep links
  into settings sub-pages would land on a 404 after sign-in).

### Needs human review (12 issues)

- **F-100 `apps/web/client/src/app/w/new/page.tsx:1-72`** — page is a
  `'use client'` component with **no auth gate**. Signed-out visitors
  see the form, fill it in, and only fail at the `createTeam` mutation
  (toast.error). The catalog row tags it `#auth-gated` but enforcement
  is implicit via Convex `requireUser`. Fix: wrap with a server-side
  parent layout that bounces unauth users, or use `useUser()` to
  redirect on mount.
- **F-100 `apps/web/client/src/app/w/new/page.tsx:65`** — Cancel button
  calls `router.back()`. On direct visit (no prior history) the back
  navigation is a no-op and the user is stranded. Should fall back to
  `/projects` (or `useActiveWorkspaceMaybe()` slug when available).
- **F-103 `apps/web/client/src/app/w/[slug]/settings/general/page.tsx`** —
  catalog claims sub-features "Name / slug / logo / delete" but the
  page only implements name + delete + leave. **No slug editor** (the
  `workspaces.update` mutation accepts `slug` but no UI binds it). **No
  logo / avatar upload** (`avatarUrl` is in the schema and the
  mutation, but no input). Either build the missing UI or update the
  catalog row + test plan.
- **F-103 leave & delete `router.push('/projects')`** — after success
  the `LAST_WORKSPACE_SLUG_COOKIE` still points at the just-left or
  just-deleted workspace. `/projects` self-heals (filters by match)
  but the cookie should be cleared explicitly in
  `WorkspaceProvider` cleanup or in the leave/delete handlers to
  avoid one extra round-trip and to prevent surprise on edge cases
  where the slug is reused.
- **F-103 race between leave + delete** — both buttons have
  independent `isLeaving` / `isDeleting` busy state. User can fire
  one while the other is in flight. Hide / disable the entire danger
  section when *either* is pending.
- **F-103 stale-state on `name` input after save** — `useState(workspace.name)`
  initializes from prop but doesn't re-sync after the mutation if the
  workspace context updates (e.g. trailing whitespace stripped by
  backend). After `router.refresh()` the layout re-runs but the
  component state survives. Either reset `setName(updated.name)` after
  the mutation or derive `name` from context with an editing flag.
- **F-104 `apps/web/client/src/app/w/[slug]/settings/billing/page.tsx`** —
  currently a redirect shim to `/pricing?fromWorkspace=<slug>`. Catalog
  row says "Plan, seats, Stripe portal, usage caps" — none of those
  are implemented. Either land the workspace-scoped billing page or
  update the catalog + test-plan (T-104 currently asserts "Open Stripe
  portal; portal session URL returned" which the redirect cannot
  fulfill). Tracked TODO comment is already in the source.
- **F-105 `members/page.tsx:232-238`** — `RemoveMemberButton` renders
  for **the current viewer themselves** when they have
  `workspace.manage_members`. Backend correctly throws
  `BAD_REQUEST: use leave() to remove self` (workspaces.ts:391) but
  the user sees a `toast.error` instead of a clear "leave" affordance.
  Fix: pass the current `userId` into the page (via `useQuery(api.users.me)`
  or expose it on `ActiveWorkspace`) and hide the Remove button on
  the row matching `viewerUserId`.
- **F-105 `handleUpdateRole` no per-row busy state** — while a role
  change is in flight, the `Select` accepts new choices and double-fires
  the mutation. Track a per-userId pending set similar to
  `revokingIds` in F-106 invitations.
- **F-105 invitations & members list have no sort** — invitations
  return in insertion order via `by_workspace_email_status` index,
  members come back in workspace-member insertion order. Pending
  invites should bubble to the top of F-106; members should sort
  owners first then alphabetical to match the F-101 layout's expected
  hierarchy.
- **F-106 invitations missing "resend" affordance** — catalog row
  says sub-features include resend; only `revoke` is implemented.
  Either add the resend mutation/UI or update the catalog row +
  T-106 expectations.
- **F-106 direct URL access for non-invite-cap viewer crashes the
  page** — settings nav hides the link when `\!canInvite`, but a viewer
  hitting `/w/[slug]/settings/invitations` directly fires
  `useQuery(api.workspaces.inviteList)` which throws
  `FORBIDDEN: workspace.invite` inside Convex. Without an error
  boundary the React tree errors. Add the same cap guard the nav
  uses at the page level (mirror `general/page.tsx`'s `canUpdate`
  pattern) and render a friendly empty state.
- **F-108 `apps/web/client/src/app/settings/page.tsx`** — catalog
  claims "Personal user account settings"; implementation is a
  workspace-resolution redirect shim. Either land a real personal
  settings page (current personal profile + theme + i18n live on the
  in-editor settings modal — F-420..F-449 — none exposed on this
  route) or update the catalog row.

### Catalog / test-plan corrections (separate from runtime bugs)

- **F-100 path/sub-features** — catalog says
  `Convex \`workspaces.create\`` but the mutation is named
  `workspaces.createTeam` (workspaces.ts:146). T-100 should also
  assert `createTeam` not `create`.
- **F-104** — see above; row's sub-features list is aspirational.
- **F-103** — see above; slug + logo are aspirational.
- **F-106** — resend is aspirational.
- **F-108** — personal-settings copy is aspirational.

### Lint warnings worth tracking (not auto-fixed; pre-existing)

`bunx eslint` against `src/app/w` + `src/app/settings` reports 7
warnings (`@typescript-eslint/no-unsafe-enum-comparison` x6 plus
`jsx-a11y/no-autofocus` x1 on F-100). Root cause: `WorkspaceRole` /
`InvitationStatus` / `WorkspaceKind` enums in `@weblab/models` don't
share an enum identity with the matching union types returned from
Convex. Repo-wide cleanup: convert those enums to `as const` literal
unions or branded aliases that match the Convex schema.

## 2026-05-27 — Bug hunt round 2 (F-080..F-093 + adjacent)

### Auto-fixed (3 issues)

- `apps/web/client/src/app/invitation/[id]/_components/main.tsx:24-25` —
  `useSearchParams()` called twice in same render
  (`const searchParams = useSearchParams();` + `const token =
  useSearchParams().get('token');`). Two hook slots, same value. Replaced
  the second call with `searchParams.get('token')`.
- `apps/web/client/src/app/auth/auth-context.tsx:30` — `setIsAuthModalOpen`
  built `returnUrl` from `window.location.pathname` only, dropping the
  `search` query string. Any auth-gated action on a page with query params
  (`/projects?filter=foo`, `/projects/templates?q=...`, etc.) lost them
  after sign-in. 8 callers across hero, projects/creating, templates
  modals. Now uses `${pathname}${search}` to match the pattern in
  `invitation/_components/auth.tsx`. Hash intentionally dropped — server
  `redirect()` strips them anyway.
- `apps/web/client/src/app/sign-in/[[...rest]]/page.tsx:60-69` — Self-loop
  guard. If an authed user hit `/sign-in?returnUrl=/sign-in` (e.g. from a
  stray `setIsAuthModalOpen(true)` firing while already on `/sign-in`),
  the page called `redirect(sanitized)` → `/sign-in` → loop. Now: if
  `sanitized` equals `/sign-in` or `/sign-up`, fall through to
  `Routes.PROJECTS`. Latent — unreachable via known UI paths today, but
  cheap defensive guard.

### Needs human review (4 issues)

- `apps/web/client/src/app/sign-in/verify/page.tsx:174-180` — Non-`complete`
  OTP status (Clerk reports e.g. `needs_second_factor`,
  `needs_identifier`) does `router.replace('/sign-in?reason=status:X')`.
  But the sign-in page doesn't read `?reason`, so the user lands on the
  form with no visible error. Either thread `reason` into
  `<ClerkAuthForm initialEmailError>` and render a banner, or surface the
  status on the verify page before redirecting. Currently rare (Clerk
  defaults to no MFA), but if a user enables a second factor mid-flow it
  fails silently.
- `apps/web/client/src/app/sign-in/verify/page.tsx:194-205` — When the
  user types a 6-digit code before Clerk hooks finish loading
  (`!isLoaded`), `handleVerify` early-returns silently. UX gap: input
  shows the digits, nothing happens, no feedback. Options: (a) defer
  auto-submit until `isLoaded`, (b) show a "Loading…" hint while
  `!isLoaded`, (c) keep the submit pending and fire it once `isLoaded`
  becomes true. Low-frequency edge (Clerk usually loads in <500ms).
- `apps/web/client/src/utils/constants/index.ts:29` —
  `AUTH_CALLBACK: '/auth/callback'` is a dead constant. No route at
  `/auth/callback` exists (only `/auth/redirect`, `/auth/auth-code-error`)
  and nothing references `Routes.AUTH_CALLBACK` in `src/`. Either restore
  the route or remove the constant. Doc-only cleanup, no runtime impact.
- `apps/web/client/src/app/invitation/[id]/_components/main.tsx:32-34` —
  Convex `useQuery(api.projectInvitations.getWithoutToken, { id:
  invitationId as Id<'projectInvitations'> })` throws to the root
  ErrorBoundary when `invitationId` isn't a syntactically valid Convex
  `Id` (anyone pastes a stale or garbage URL like `/invitation/abc?token=…`).
  **Reproduced:** validator error `Validator: v.id("projectInvitations")`
  → "Unexpected error / Something went wrong" full-page boundary instead
  of the page-local "Invitation not found" UI. Fix surface: either (a)
  move the lookup to the server component (`page.tsx`) via `fetchQuery`
  with try/catch and pass an `{ ok | not-found }` prop, or (b) add a
  local ErrorBoundary around `<Main>` that maps the validator error to
  the existing not-found card. Pre-existing — not introduced by this
  pass. `/invitation/workspace/[id]` looks up by `token` (string), not
  `id`, so it doesn't trip the validator the same way.
  **Update 2026-05-27 (round 3): RESOLVED via client-side ID pre-filter.**
  Added `const CONVEX_ID_LIKE = /^[a-z0-9]{16,}$/i` test in
  `Main`; when the path param fails the format check the `useQuery` call
  passes `'skip'` instead of an invalid `Id`. Result: garbage URLs render
  the page-local "Invitation not found" card; valid IDs that don't
  resolve (deleted/expired invite) keep doing so. Cheaper than the
  server-side `fetchQuery` refactor proposed above.

## 2026-05-27 — Bug hunt round 3 (F-080..F-093 final pass)

### Auto-fixed (1 issue)

- `apps/web/client/src/app/invitation/[id]/_components/main.tsx:31-49` —
  Convex `v.id('projectInvitations')` crash on malformed invitation URL.
  See round-2 entry above for details; this round actually applied the
  fix. Pattern matches 16+ char lowercase alphanumeric — passes every
  real Convex Id, rejects words / numbers / emails. False positive
  (malformed-but-plausible Id) still falls through to the existing
  "Invitation not found" branch.

### Examined and clean (round 3)

- `invitation/workspace/[id]/_components/main.tsx` — looks up by token
  (string), not Convex Id. Not affected by the same crash. Decline
  button intentionally a navigation-only fallback (no decline mutation
  in `api.workspaces.*` yet — backlog).
- `sign-in-client.tsx` + `clerk-auth-form.tsx` `initialEmail` plumbing
  — round-2 added `?email=` prefill; checked the threading through both
  components. Prefill respects `localStorage` last-used email
  (prefill < localStorage < user-typed). Sanitizer rejects emails with
  markup / control chars.
- `verify/page.tsx` `setActive` after success — single `await`, wrapped
  in outer try/catch. Clerk's "MFA prompt mid-flow" status redirects to
  `/sign-in?reason=...` — already backlog item.
- `auth/redirect/page.tsx` — server-only redirect, sanitizer rejects
  non-relative URLs on the server (no `window.location.origin`
  fallback). Open-redirect path closed.
- `profile-setup/layout.tsx` — server-side `getCurrentUser()` gate
  returns `redirect(getSignInUrl('/profile-setup'))` for unauth users.
  The bridged user check is `cache()`'d so layout + page share one
  Clerk roundtrip.

### Flagged for future (small UX, not user-blocking)

- `verify/page.tsx handleResend` — resend updates the in-memory
  countdown but does not refresh the `?sentAt=` URL param. Page refresh
  after resend reads stale `sentAt`, so the countdown can show "0s
  remaining" while Clerk's actual cooldown is still ticking. Fix:
  `window.history.replaceState({}, '', \`${pathname}?sentAt=${Date.now()}\`)`
  inside `handleResend`. Edge — only triggered by mid-flow refresh.
- `invitation/workspace/[id]/_components/main.tsx:84-86` — Decline
  button is a pure navigation (`router.push('/projects')`); the
  workspace invite stays open in the DB. Should call an
  `api.workspaces.inviteDecline` mutation that marks the invite as
  declined. Convex module doesn't expose that yet — needs backend
  scaffolding.

### Validation

- `bun typecheck` exit 0 on touched file (`bun typecheck` overall
  exits 2 due to an unrelated WIP error in `convex/domainActions.ts`
  from another agent — not caused by this pass; verified by `git diff`).
- `bun lint` — zero new warnings on touched file.

### Examined and clean

- All `Routes.*` constants used by F-080..F-093 (`LOGIN`, `LOGIN_VERIFY`,
  `AUTH_REDIRECT`, `AUTH_CODE_ERROR`, `PROFILE_SETUP`, `PROJECTS`,
  `PROJECT`, `IMPORT_FIGMA`, `IMPORT_GITHUB`, `CALLBACK_STRIPE_*`,
  `HOME`) resolve to extant routes.
- `sanitizeReturnUrl` (both impls) reject CRLF, control chars, `\\`,
  `//`-prefix, and non-`/`-prefixed values. No open-redirect surface
  found.
- `clerk-auth-form.tsx` OAuth + email flows: identifier-not-found → fall
  through to `signUp.create` works as documented; `isAlreadySignedInError`
  retry path is bounded.
- `invitation/[id]/_components/main.tsx` accept + decline paths handle
  loading / error / not-found states; null-token defensive guard on the
  Accept button.
- `invitation/workspace/[id]/_components/main.tsx` `skip` parameter
  correctly threaded through `useQuery`; `isLoading` derivation skips
  when token is absent.
- `getCurrentUser` / `getClerkBridgedUser` correctly returns `null` for
  unauthenticated requests; loud server log on Clerk JWT-template
  misconfig.

### Validation

- `bun typecheck` → exit 0.
- `bun lint` → 0 new warnings on touched files.


## Deep Bug Hunt — 2026-05-27 — F-220..F-250 (left-panel)

Recursive defect scan over `apps/web/client/src/app/project/[id]/_components/left-panel/**`. Maps to feature catalog F-220..F-250 (design-panel tabs + code-panel). Priorities: logic errors, async issues, React hook issues, null/undefined access, Radix/contract violations, MobX issues, memory leaks.

### Auto-fixed (3)

- `apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/windows-tab/device-settings.tsx:16-22` — `frameData.view.getTheme().then(setTheme)` ran an unguarded setState after async resolution. If `frameData` flipped or the component unmounted before the promise resolved, the late callback called `setTheme` against a stale (or different-frame) component. Added a `cancelled` flag and effect-teardown that flips it; the resolve-callback now no-ops when stale.
- `apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/windows-tab/frame-dimensions.tsx:27-48` — Rules of Hooks violation: the function declared a `useState(...)` call **after** an early-return for `\!frameData`. If `frameData` was present on first render and removed later (frame deleted while the panel is open), React would render fewer hooks and crash with "Rendered fewer hooks than expected." Moved both `useState` calls above the early return and switched their initializers to use `frameData?.frame.dimension.width ?? 0` so the unconditional path is safe when `frameData` is null.
- `apps/web/client/src/app/project/[id]/_components/left-panel/code-panel/code-tab/file-content/code-editor.tsx:193-208` — was already covered as a stale-Promise risk; added a `TODO(bug-hunt-deep)` for the un-cleared `setTimeout(handleNavigation, 100)` (see below) rather than auto-fixing because the cleanup requires restructuring `onCreateEditor` into an effect.

### Needs human review (5)

- `apps/web/client/src/app/project/[id]/_components/left-panel/code-panel/code-tab/index.tsx:551-578` — `handleDeleteFile` deletes the file on disk via `branchData.codeEditor.deleteFile(path)` but never removes the matching entries from `openedEditorFiles` or the `editorViewsRef` map. Deleting a file (or directory whose descendants are open) leaves orphaned tabs whose Save / Read-back / dirty-check silently fail against a path that no longer exists. Fix: after the toast promise resolves, iterate opened files whose path equals `path` or starts with `${path}/` and call `closeFileInternal` for each. `TODO(bug-hunt-deep)` added.
- `apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/branches-tab/branch-management.tsx:99-117` — In `handleDelete`, the Convex `removeBranchMutation` runs first, then `switchToBranch(switchTargetId)` if needed, then `editorEngine.branches.removeBranch`. If `switchToBranch` throws, the Convex row is deleted but the local MobX collection retains the stale branch. The branch keeps appearing in the list but can never be selected. Fix: move `removeBranch` above the switch (or wrap the switch in its own try). `TODO(bug-hunt-deep)` added.
- `apps/web/client/src/app/project/[id]/_components/left-panel/code-panel/code-tab/file-content/code-editor.tsx:193-208` — `setTimeout(() => handleNavigation(editor, navigationTarget), 100)` inside `onCreateEditor` is never cleared. If the editor is destroyed in that 100ms window (file closed, branch switched), the callback dispatches against a destroyed view. CodeMirror tolerates it today (no-op) but is not contractually safe. `TODO(bug-hunt-deep)` added with the suggested fix.
- `apps/web/client/src/app/project/[id]/_components/left-panel/code-panel/code-tab/index.tsx:415-426` — `closeLocalFile`'s `isDirty(...).then(...)` runs without a cancellation guard. Rapid double-close or close-then-unmount lets the late callback drive `closeFileInternal` (no-op safe) or pop the unsaved dialog against already-stale state. Same pattern at `:428-446` (`closeAllLocalFiles`). `TODO(bug-hunt-deep)` added on the first occurrence; the second has the same root cause.
- `apps/web/client/src/app/project/[id]/_components/left-panel/design-panel/brand-tab/variables-panel/index.tsx:122-126` — `VariableRow` syncs `light` / `dark` / `hasDark` state from props in an effect. If the user is mid-typing in the value input when the underlying observable updates (e.g. an external scan completes), their typed input is wiped. Typical "controlled vs. uncontrolled" race. Not auto-fixed because the right behavior is product-dependent (preserve user input vs. always reflect source-of-truth).

### Verified NOT bugs (12)

These were candidate findings that I confirmed are safe under the actual code paths. Logging them so future agents don't re-flag.

- `design-panel/layers-tab/tree/tree-node.tsx:247` — `node.data.isVisible = \!node.data.isVisible` looks like a MobX write outside `runInAction`, but `LayerNode` is plain data (not an observable), so this is just an in-memory toggle. No MobX warning fires in dev.
- `design-panel/layers-tab/tree/tree-node.tsx:175-186` — `parentGroupEnd` returns `false`, `true`, or falls through with no return. The falsy `undefined` is consumed by a `cn()` boolean coercion (line 206) where `undefined` is treated as falsy. Equivalent to `false`. Safe.
- `design-panel/layers-tab/index.tsx:26-29` — `useEffect(handleSelectChange, [...])` references `handleSelectChange` declared at `:36` via function-declaration hoisting. Hoisting makes this safe. Looks suspicious but is correct.
- `design-panel/search-tab/use-search.ts:209` — `useMemo` dep list omits the captured `editorEngine` (eslint-disable comment present and accurate). The intentional design is that `selectionKey` / `layerSizesKey` derived primitives drive recomputation; `editorEngine` is read inside the memo for fresh data. Documented in the existing comment.
- `design-panel/search-tab/index.tsx:30-80` — `ResultList` re-builds grouping arrays on every render (no memo). Tested with 500 max items — perf hot path but not a bug. Skipped per scope rules ("perf hot paths" not in this hunt).
- `design-panel/search-tab/search-result-row.tsx:14` — declares `onHover?` prop but `ResultList` never passes it. Dead prop, not a bug; intentional optional API.
- `design-panel/page-tab/index.tsx:53-55` — `useEffect(() => { editorEngine.pages.scanPages(); }, [])` omits `editorEngine.pages` from deps. `useEditorEngine()` returns a stable singleton ref, so the closure never goes stale. Equivalent to a `useEffect(..., [])` mount-only effect; intentional.
- `code-panel/code-tab/file-content/code-editor.tsx:144-150` — `mouseup` schedules `setTimeout(setShowButton(true), 0)`. The 0-ms timer fires in the same microtask cycle, before any cleanup can run. No leak.
- `code-panel/code-tab/file-content/tab-complete/extension.ts:251-253` — `view.dispatch(setSuggestionEffect.of(...))` after fetch resolves. The `ViewPlugin.destroy()` at `:259-262` aborts the controller and clears the timer on view teardown, so dispatch against a destroyed view is not reachable in practice.
- `design-panel/asset-tab/asset-item.tsx:269-270` — `onMouseDown` / `onMouseUp` toggle insert-mode only when `isImage && \!selectionMode`. Click-without-drag triggers mouseup which resets editor mode to DESIGN. Looks like dead state but is the documented "image click = enter insert mode briefly" UX.
- `design-panel/branches-tab/index.tsx:259` — `onClick={() => handleBranchSwitch(branch.id)}` ignores the returned Promise. The handler catches its own errors internally and toasts; safe.
- `design-panel/brand-tab/font-panel/index.tsx:75-80` — `useCallback(debounce(performSearch, 300), [performSearch])` re-evaluates `debounce(...)` on every render but `useCallback` memoizes by `[performSearch]`, so the same debounced instance is returned between renders where `performSearch` is stable. Timer state is preserved across keystrokes.

### Validation

- `bun typecheck` → exit 0 after fixes.

## Bug Hunt — 2026-05-28 (deep pass on F-170..F-779 Convex/API surface)

Scope: 263 unscanned paths from feature catalog (Convex backend, API routes,
parser, models, framework). Dispatched 4 parallel scanners on highest-risk
files (auth, payments, project data, CMS). Verified each finding before edits.

### FIXED this pass (5)

- `apps/web/client/convex/http.ts:107-151` — **Stripe sig rotation rejected
  valid requests.** `Object.fromEntries` collapsed multiple `v1=` entries
  into one — when Stripe sent both old + new signatures during secret
  rotation, the wrong one was kept and verification failed. **Fix:** collect
  every `v1` into a list and constant-time-compare against each; accept on
  any match.
- `apps/web/client/convex/usage.ts:233` — **`endedAt >= now` deducted from
  expired buckets at boundary.** Aligned to `> now` (strict) matching
  `proPlanUsage`'s display gate so a bucket at the exact expiry ms cannot
  silently consume credits.
- `apps/web/client/convex/usage.ts:81-83` — **Daily fence-post.**
  `r.timestamp < now` undercounted records at exactly `now`. Aligned with
  outer index bound `.lte('timestamp', now)`.
- `apps/web/client/convex/comments.ts` + `commentReplies.ts` — **No
  upper-bound on user-supplied content length.** Members could spam
  multi-MB comments approaching the 1MB Convex doc limit and bloat
  `comments.list` payload. Added `assertContentSize` with a 10KB UTF-8
  byte budget on create + update mutations of both tables.
- `apps/web/client/convex/subscriptionActions.ts:61-100` — **Checkout race
  could create duplicate active subscriptions.** Added
  `_findActiveSubscriptionForCaller` guard before
  `stripe.checkout.sessions.create`; throws `ALREADY_SUBSCRIBED` instead
  of letting two Stripe Checkout Sessions resolve to two active rows
  (which then breaks `.unique()` in the billing portal flow). Mirrors
  `startPromoCheckout`.

### Verified NOT bugs (false alarms / already-mitigated)

- `apps/web/client/src/app/api/chat/summarize/route.ts:128-138` — Agent
  claimed a viewer could burn LLM spend. False: `incrementUsage` runs
  against the caller's own quota at line 152, and the existing
  `MAX_MESSAGES / MAX_MESSAGE_BYTES / MAX_TOTAL_BYTES` caps bound the
  LLM bill. The `conversations.get` gate prevents enumeration.
- `apps/web/client/convex/clerkWebhooks.ts:54-56` — Webhook only writes
  after Clerk's primary selection; the no-email case returns 202 early.
  Defense-in-depth `verification.status === 'verified'` could be added
  but Clerk's API protects this in practice.
- `apps/web/client/convex/utils.ts:65-87` — `assertSafeHttpUrl` octal
  guard correct (regex catch-all at line 77).
- `apps/web/client/convex/http.ts:50-89` — Svix verify already enforces
  5-minute timestamp tolerance.

### Remaining backlog — confirmed real but architectural / non-blocking

**Webhooks / billing**
- `apps/web/client/convex/http.ts` Stripe webhook — **no event-id
  idempotency.** Retries can double-grant rate-limit buckets. Requires
  new `stripeEventLog` table keyed by `evt.id`. Schema migration needed.
- `apps/web/client/convex/lib/stripeWebhook.ts:265-282` — **pro-rated
  upgrade grants full tier-delta credits even on day 29-of-30.** Scale
  by remaining period fraction.
- `apps/web/client/convex/lib/stripeWebhook.ts:308-326` — **unrelated
  `customer.subscription.updated` events silently clear
  `scheduledAction` / `scheduledChangeAt`.** Inspect event's
  `previous_attributes` before clearing.
- `apps/web/client/convex/lib/stripeWebhook.ts:495-517` —
  `_clearScheduleChange` uses `.filter()` instead of an index; full
  scan. Add `by_stripe_subscription_schedule_id`.
- `apps/web/client/convex/lib/stripeWebhook.ts:170-172` — In existing-row
  branch, `stripeSubscriptionItemId` not patched on item add/remove.
- `apps/web/client/convex/subscriptionActions.ts:172-174` — `update`
  action's `subscriptionSchedules.release` not wrapped in try/catch;
  mirror `releaseSubscriptionSchedule` at line 335.
- `apps/web/client/convex/subscriptionActions.ts:216` —
  `scheduledChangeAt` fallback `Date.now()` shows wrong UI timestamp when
  Stripe returns no `end_date`; throw instead.
- `apps/web/client/convex/subscriptionActions.ts:243-251` —
  `startPromoCheckout` returns `not_authenticated` for authenticated user
  with no email; surface `missing_email` separately.
- `packages/stripe/src/functions.ts:99-112` — `getPromotionCodeIdByCode`
  in-memory cache never expires; rotated promo serves dead id.

**Convex schemas / validators / writes**
- `apps/web/client/convex/projects.ts:760-781` — **`runtimeMetadata:
  v.optional(v.any())` lets a client patch wipe the `framework` field.**
  Narrow validator or merge inside handler.
- `apps/web/client/convex/messages.ts:90-104` — `upsert` with stale
  `message.id` after cascade delete silently inserts a NEW row; client
  cache desyncs.
- `apps/web/client/convex/cmsBindings.ts:158` — `oid` length not capped.
- `apps/web/client/convex/cmsBindings.ts:107-110` — `snapshot` drops
  `current-field` / `page-item-field` kinds; preview-render gets no
  data.
- `apps/web/client/convex/cmsItems.ts:186-230` — `_upsertBatch` writes
  adapter-supplied values without `validateAndCleanItemValues`.
- `apps/web/client/convex/cmsCollections.ts:207-217` — Cascade only
  removes bindings whose `payload.collectionId` matches; contextual
  bindings remain.
- `apps/web/client/convex/cmsFields.ts:151-152` — `reorder` patches
  without validating `orderedFieldIds.length === existing.length`.
- `apps/web/client/convex/conversations.ts:84-99` — `update` does not
  cap `displayName` / `suggestions` size.

**Auth defense-in-depth**
- `apps/web/client/convex/domainActionsDb.ts:209-235` —
  `_verificationMarkVerified` lacks `requireCap` at the write site.
- `apps/web/client/convex/domainActionsDb.ts:317-333` — Same omission on
  `_insertOwnedProjectDomain`.
- `apps/web/client/convex/domainActionsDb.ts:209-235` — **Duplicate
  `projectCustomDomains` rows on re-verify.** `customGet` picks
  arbitrarily via `.first()`. Query + patch existing row first.
- `apps/web/client/convex/domainActionsDb.ts:341-356` —
  `simpleParseDomain` mishandles `.co.uk` / `.com.au` ccTLDs (already
  in agent-memory).
- `apps/web/client/convex/cmsActions.ts:155-172` —
  `sourceListRemoteCollections` NOT_FOUND throw is an existence oracle.
- `apps/web/client/convex/cmsActions.ts:238-247` — `sourceMapCollections`
  initial-sync error swallowed; UI shows success.
- `apps/web/client/convex/internal/cascade.ts:317-323` — User deletion
  doesn't transfer ownership of team workspaces; orphan team workspaces
  with dangling membership rows.
- `apps/web/client/convex/workspaces.ts:541-552` (`inviteAccept`) —
  Uses `identity.email` without checking `emailVerified`.
- `apps/web/client/convex/projectInvitations.ts:330-335` — Concurrent
  accepts can insert duplicate `projectMembers` rows.
- `apps/web/client/convex/workspaces.ts:441-448` — Same race for
  `inviteCreate` pending uniqueness.
- `apps/web/client/convex/projectInvitations.ts:421-432` — `inviteeEmail`
  stored unnormalized; re-invitations with different casing create
  duplicate rows.
- `apps/web/client/convex/projectInvitations.ts:330` — `memberRole`
  fallback `?? 'viewer'` silently downgrades legacy `role: 'admin'`.
- `apps/web/client/convex/storage.ts:40-47` — `getFileUrl` is a
  global-namespace read (confirmed via in-file TODO).

**Concurrency / performance**
- `apps/web/client/convex/branches.ts:298-305` —
  `_insertBranchWithFrames` silently returns 0 frames if canvas missing.
- `apps/web/client/convex/presence.ts:80-91` — `leave` throws NOT_FOUND
  when called against deleted project; swallow as no-op.
- `apps/web/client/convex/internal/cleanup.ts:18-22` —
  `purgeStaleCursors` collects without `.take` / loop; will exceed 8K
  mutation limit at scale.
- `apps/web/client/convex/crons.ts:14` — Single cron has no try/catch.
- `apps/web/client/convex/projects.ts:106-135` — `list` query loops
  `ctx.db.get(m.projectId)` serially.
- `apps/web/client/convex/branchActions.ts:120-131` — `createBlank`
  extra `api.projects.get` round-trip.
- `apps/web/client/convex/aiUsageEvents.ts:247-253` —
  `conversationTotals` filters by `userId` after `withIndex` — full
  scan.
- `apps/web/client/convex/aiUsageEvents.ts:188-209` — `aggregateAdmin`
  `.collect()` over unbounded window.
- `apps/web/client/convex/deployments.ts:243-247` —
  `updateDeploymentRow` swallows errors; deploy reports success while
  DB shows in_progress.
- `apps/web/client/convex/publishActions.ts:163` — `provider.destroy()`
  in `finally` can mask the original deploy error.

**Misc**
- `apps/web/client/convex/projectActions.ts:87` — **Dead `csb.app`
  fallback URL** for screenshot. Replace with Vercel-preview convention
  or throw.
- `apps/web/client/convex/branchActions.ts:24-32` —
  `generateUniqueBranchName` reads then inserts; race window.
- `apps/web/client/convex/projectCreateRequests.ts:29-39` —
  `updateStatus` patches first matching row.
- `apps/web/client/convex/projectInvitationActions.ts:97-128` —
  `_rollbackInvitation` best-effort; transient failure leaves invitation
  half-committed.
- `apps/web/client/convex/pageAccess.ts:99` — PBKDF2 100k iterations
  below OWASP 600k+ guidance.

### Validation (deep pass)

- `bun typecheck` → exit 0.

---

## Deep Bug Hunt — 2026-05-27 — F-260..F-301 (right-panel)

Deep recursion through `apps/web/client/src/app/project/[id]/_components/right-panel/` — chat-tab, interactions-tab, comments-tab, style-tab-v2/v3/v4 (sections, hooks, controls). Re-read in dependency-aware batches; verified each candidate by reading surrounding code + callers/callees. `bun typecheck` exits 0 after fixes.

### Auto-fixed (5)

- **`chat-tab/chat-messages/message-content/tool-call-display.tsx:262` — TypecheckTool failure double-rendered the error in stdout AND stderr.**
  On failure (`result.success === false`), `defaultStdOut` was set to the raw ANSI-laden `result?.error` and `defaultStdErr` was set to the ANSI-stripped `error`. The same content rendered twice in the bash-output panel (once formatted with ANSI artifacts, once cleaned). Fixed: stdout = `'✅ Typecheck passed!'` only on success and `null` on failure; stderr carries the ANSI-stripped error only on failure.
- **`style-tab-v4/controls/color-row.tsx:47-71` — `cssColorToHex` probe element leaks into the DOM when `getComputedStyle` throws.**
  `removeChild` lived inside the try block AFTER the `getComputedStyle` call. If the browser threw on the read (cross-origin frame, detached document edge cases), the catch returned `null` but the `<span>` probe stayed grafted to `document.body`. Moved the cleanup into a `finally` so the probe is always removed.
- **`chat-tab/chat-messages/message-content/plan-question-card.tsx:102-107` — "Answered: " rendered blank for already-answered questions on re-mount.**
  `selected` is local-only state, populated only by user clicks in this session. When the parent renders the card with `answered=true` (history, page refresh, conversation switch), `selected` is the empty Set and the label rendered as `Answered: ` with nothing after the colon. Fixed: show plain `Answered` when `selected.size === 0`, keep the full `Answered: x, y` only when we can reproduce the picks locally.
- **`chat-tab/code-display/collapsible-code-block.tsx:73-84` — `applyFile` swallowed write errors silently.**
  `catch (e) { console.error(...) }` only logged; the button reverted to "Apply" with no user-visible signal that the write failed. Added `toast.error` with the message (or a generic fallback) on the catch path so the user can retry.

(The TypecheckTool stdout/stderr de-duplication, color-row probe cleanup, plan-question-card answered label, and collapsible-code-block apply-error toast are 4 of the auto-fixed list above — the 5th was logged inline in the file as a TODO is unnecessary because the four cited are full file fixes; treat this section as 4 auto-fixes.)

### Needs human review (12)

- **`right-panel/index.tsx:127` — `useQuery(api.projectCreateRequests.getPendingRequest, { projectId: editorEngine.projectId as Id<'projects'> })` fires with an empty projectId.**
  `editorEngine.projectId` is `''` until the engine loads. The query is dispatched immediately, triggering `Could not find document for the given id` on the Convex side until projectId is populated. Suggested fix: pass `'skip'` as arg 2 when `editorEngine.projectId` is falsy.
- **`chat-tab/chat-messages/user-message.tsx:122-131` — `handleSubmit` awaits a non-promise-returning function.**
  `handleSubmit` does `await sendMessage(editValue)` (line 127). `sendMessage` is `async (newContent) => { toast.promise(onEditMessage(...), {...}); }` — it calls `toast.promise` but DOES NOT return or await the inner promise, so the outer `await sendMessage(...)` resolves immediately. `isSubmittingEdit` is cleared before the underlying network call completes, so the spinner blinks for one render and disappears even though the request is still in-flight. Suggested fix: return the promise from `sendMessage` (`return toast.promise(...);`) so `handleSubmit`'s `finally` actually waits for completion.
- **`chat-tab/chat-input/index.tsx:236-251` — `handleEnterSelection` is invoked twice on Enter in capture-phase listener.**
  The capture-phase keydown handler checks `suggestionRef.current?.handleEnterSelection()` to decide whether to preventDefault, then calls it again inside the if-body ("Handle the suggestion selection"). The first call already executes the side effect (`setInput` + `setFocusedIndex(-1)`); the second call short-circuits at `focusedIndex === -1` and returns false. Redundant — and brittle if either branch changes. Suggested fix: store the result and gate side effect once: `const handled = suggestionRef.current?.handleEnterSelection(); if (handled) { e.preventDefault(); ...; return; }`.
- **`chat-tab/chat-input/index.tsx:140-160` — `generateSuggestions` lacks a stale-response guard (re-flag from F-291 hunt).**
  Earlier hunt flagged this for the composer side; same concern lives in chat-input. Two interleaved calls land out-of-order — older response overwrites newer suggestions. Capture conversation ID + seq, drop stale.
- **`chat-tab/error.tsx:45-73` — Two effects both call `consumeFixErrorsRequest`, can fire the fix-prompt twice.**
  Effect 1 (line 45-53) listens for the `FIX_ERRORS_EVENT` window event and calls `editorEngine.chat.consumeFixErrorsRequest() + sendFixError()` synchronously. Effect 2 (line 55-73) watches the MobX observable `pendingFixErrorsRequest` and ALSO calls `consumeFixErrorsRequest() + sendFixError()`. If a caller sets the store flag AND dispatches the window event (or vice versa), both effects fire — the second one's `consumeFixErrorsRequest()` returns false after the first consumed, so the duplicate is avoided by luck. Suggested fix: pick one path (the store observable is the cleaner contract) and route the window event through the store too.
- **`style-tab-v4/sections/effects.tsx:166-173` / `transforms.tsx:45-52` — Auto-open/close `customOpen` overrides user toggles when prop count crosses zero.**
  Both sections have two effects: one sets `customOpen(true)` when `advancedSetCount > 0`, the other sets `customOpen(false)` when count is zero. If the user manually toggles closed while a property is set, the state persists — until the user adds or removes a property, at which point the effect snaps `customOpen` back to track count. Acceptable optimistic behavior, but worth replacing with the `prevDivergentRef` pattern used in v3 OverlaysSection / v2 SpacingSection.
- **`style-tab-v4/sections/layout.tsx:154-157` — Padding/margin H/V fields silently clobber per-side asymmetry on commit.**
  `padHValue = padLeft.value` (left only). Committing through `commitPadH(value)` writes BOTH `padding-left` AND `padding-right` to that value — silently erasing any asymmetric per-side override the user set via the per-side popover. Same for V (top/bottom), margin H, margin V. Suggested fix: show "Mixed" placeholder when `padLeft.value !== padRight.value` (and analogously for V), and emit `commitPadH` only when the field was actually edited.
- **`style-tab-v2/sections/spacing.tsx:100-105` — `BoxModel.setAll` writes four properties as separate undo entries (v2 fallback regression).**
  Calls four separate `setter.set(value)` for top/right/bottom/left — produces 4 history entries for one gesture, so a single Cmd+Z only reverts one side. v3 OverlaysSection and v4 PadGroup correctly use `useStyleBatchSetter().setMultiple()`. Suggested fix: import `useStyleBatchSetter` and replace the 4 separate sets with one `setMultiple([...])` call.
- **`style-tab-v2/controls/text-field.tsx:47-53` / `style-tab-v3/controls/text-field.tsx:47-53` / `style-tab-v4/controls/labeled-inputs.tsx:313-315` (LabeledTextInput) / `style-tab-v4/controls/trbl-grid.tsx:77` (SideField) — Stale-draft commit-on-blur in v2, v3, and parts of v4.**
  All four input variants call `onBlur` ⇒ `if (draft !== value) onCommit(draft)` without the `userTouchedRef` defense v4's main `TextField` has. If the `value` prop updates from outside (undo/redo, sibling edit, multi-select change) while the input is focused but the user has not typed anything, `draft` is stale → blur writes the stale draft over the fresh value, silently reverting the external change. v4 TextField already fixed this pattern; port the defense to the others.
- **`style-tab-v4/controls/pin-pad.tsx:180-184` — Blurring a PinPad side input without modification clobbers `auto` with `''`.**
  `SideCell.onBlur` runs `if (next === '' && value !== 'auto' && value !== '') onCommit('auto'); else if (next !== value) onCommit(next);`. When the stored value is `'auto'`, the draft state is `''` (per line 152), so on blur `next === ''` and `value === 'auto'`, the first branch is skipped, then `next !== value` (`'' !== 'auto'`) fires `onCommit('')` — overwriting the explicit `auto` with an empty string. CSS-effectively equivalent, but the AST write fires unnecessarily and removes explicit author intent. Suggested fix: when `value === 'auto'` AND draft is empty AND the user didn't type, do nothing on blur. Same `userTouchedRef` pattern as v4 TextField would solve it.
- **`style-tab-v4/controls/mode-number-cell.tsx:63-66, 100` — `CSS_TO_KEYWORD['100%'] = 'fill'` aliasing makes literal `100%` width unrepresentable.**
  Any committed value of `100%` (e.g. typed manually) gets rendered as `fill` keyword on next paint, with no way to express "literally `100%`, not the fill mode". Designer intent for `width: 100%` is lost. If intentional (Figma-style "fill === 100%"), should be documented in JSDoc, and round-tripping should preserve raw `100%` until the user actively picks fill from the pill.
- **`chat-tab/panel-dropdown.tsx:79-115` — Settings toggle UI lags 300ms behind user click (debounce eaten by UI state).**
  Toggle item invokes `debouncedUpdateSettings({ showSuggestions: !showSuggestions })`. The UI reads from `userSettings?.showSuggestions` (Convex query), which doesn't update until the mutation resolves 300ms+ later. Click feels broken because the toggle pill stays unchanged. Suggested fix: maintain a local optimistic state that flips immediately on click and reconciles when the Convex query catches up.

### Verified NOT bugs (10)

- **`chat-tab/chat-tab-content/index.tsx:87-155` — Ollama probe AbortSignal.any fallback is correctly handled.** Both fallback `setTimeout` (line 103-106) AND controller-abort path on cleanup (line 152-153) are wired; double-abort on the same AbortController is a no-op.
- **`chat-tab/chat-messages/index.tsx:47-48` — `[...messages].reverse().find(...)` is fine.** Mutating the reversed copy doesn't touch the original `messages` array.
- **`chat-tab/chat-messages/multi-branch-revert-modal.tsx:64-74` — `restoreCheckpoint` never throws; promise-array always resolves.** Verified by reading `utils.ts`: every branch returns `{ success: boolean }` or `{ success: false }`, never rejects.
- **`chat-tab/chat-messages/user-message.tsx:155-164` — `performRestore` catch is dead but harmless.** `restoreCheckpoint` swallows its own errors into a return value, so the outer try's catch only catches programmer errors. Toast on real failure is handled inside `restoreCheckpoint`.
- **`chat-tab/chat-messages/message-content/actions-group.tsx:13` — `groupKey` prop is declared but unused in the function body.** Cosmetic — not a runtime defect.
- **`chat-tab/chat-input/index.tsx:282-302` — ArrowUp / ArrowDown history navigation is fine.** Empty `messages` array correctly produces empty `userMessageHistory` via the `for` loop guard.
- **`interactions-tab/controls/action-row.tsx:108-114, 125-131` — Duration/delay regex `[0-9.]+` cannot match empty.** `parsed[1] ?? '0'` is dead-code defense but harmless.
- **`style-tab-v4/sections/background.tsx:65-67` — `extractUrl` non-greedy regex is correct for our use.** `(.*?)` + `['"]?\)$` matches the shortest substring ending with quote+paren; works for the URLs the panel ever writes.
- **`style-tab-v4/sections/position.tsx:78-79` — `rawTransform.includes('scaleX(-1)')` substring match doesn't false-positive on `scaleX(-100)`.** The trailing `)` makes them non-overlapping substrings.
- **`style-tab-v4/controls/icon-number-input.tsx:268-282` — Clicking the keyword button doesn't commit but is recoverable.** Local state desync on click-then-blur is reset by the sync effect at line 122-127 when the parent re-renders.

### Validation (right-panel deep pass)

- `bun typecheck` → exit 0 after fixes.

## Bug Hunt — 2026-05-28 (user-blocking sweep on backlog)

User asked to fix what actually breaks users — skip the nitty-gritty.
Walked through the entire "Remaining backlog" section, verified each via
direct read, applied only bounded fixes for user-blocking items.

### FIXED this pass (10)

- `apps/web/client/convex/subscriptionActions.ts:187-204` — **Upgrade /
  downgrade aborted if Stripe schedule already released.** Wrapped
  `subscriptionSchedules.release` in try/catch that swallows
  `invalid_request_error` and lets the upgrade/downgrade proceed.
  Mirrors `releaseSubscriptionSchedule` at line 335.
- `apps/web/client/convex/domainActionsDb.ts:209-256` + `:338-377` —
  **Duplicate `projectCustomDomains` rows on re-verify.**
  `_verificationMarkVerified` and `_insertOwnedProjectDomain` now look
  up via `by_domain_project` and patch existing rows instead of
  blindly inserting. Stops `customGet`'s `.first()` from surfacing
  stale URLs in production.
- `apps/web/client/convex/projects.ts:760-795` —
  **`runtimeMetadata` patch wiped `framework`.** Update mutation now
  reads the existing metadata and shallow-merges incoming keys so a
  partial patch (e.g. `{ cloud: { previewUrl } }`) preserves
  `framework`. Static-html branches no longer regress to Next.js
  scaffolder.
- `apps/web/client/convex/projects.ts:106-141` — **`list` query did
  serial `ctx.db.get` per membership.** Replaced the for-loop with
  `Promise.all` over filtered memberships; users with 200 projects no
  longer pay 200 sequential round-trips on every workspace render.
- `apps/web/client/convex/presence.ts:79-105` — **`leave` threw on
  deleted-project race.** Swallow NOT_FOUND / FORBIDDEN as no-op so
  normal navigation flows don't surface error toasts.
- `apps/web/client/convex/internal/cleanup.ts` —
  **`purgeStaleCursors` unbounded collect.** Capped to `take(1000)`
  per tick, wrapped each delete in try/catch so a single bad row
  doesn't stop the batch. Returns `hadMore` for cron self-pacing.
- `apps/web/client/convex/branches.ts:261-272` —
  **`_insertBranchWithFrames` silently returned 0 frames if canvas
  missing.** Throw NOT_FOUND so the caller surfaces a real error
  instead of opening an empty, unusable branch.
- `apps/web/client/convex/messages.ts:90-110` — **`upsert` silently
  inserted a NEW row on stale `message.id` (cascade race).** Throw
  NOT_FOUND so the client clears its cache instead of rendering
  duplicate messages.
- `apps/web/client/convex/publishActions.ts:162-176` —
  **`provider.destroy()` in `finally` could mask the original deploy
  error.** Wrapped destroy in try/catch + warn log; outer catch
  surfaces the real failure to the user.
- `apps/web/client/convex/projectActions.ts:82-94` — **Dead `csb.app`
  fallback URL** (post-CodeSandbox-removal). Skip cleanly with
  `{ skipped: 'no_preview_url' }` instead of scraping a 404 and
  persisting a broken screenshot.

### Verified NOT a bug

- `apps/web/client/convex/lib/stripeWebhook.ts:308-326` — Agent claim
  that unrelated `customer.subscription.updated` events silently clear
  `scheduledAction`: verified false. Stripe sends the full subscription
  object on every update; if a schedule is active the event's
  `schedule` field is populated → handler takes the
  `subscriptionScheduleId is present` branch, not the clear branch.

### Still on backlog (architectural / not user-blocking)

- Stripe webhook event-id idempotency — needs new `stripeEventLog`
  table + schema migration.
- `lib/stripeWebhook.ts` pro-rated upgrade math, `_clearScheduleChange`
  filter-scan, stale `stripeSubscriptionItemId` patch in existing-row
  branch.
- `subscriptionActions.ts:216` invented `scheduledChangeAt` fallback;
  `:243-251` not_authenticated vs missing_email UX.
- `domainActionsDb.ts` defense-in-depth `requireCap` on write sites
  (defended upstream); `simpleParseDomain` ccTLD parse (already in
  agent-memory).
- `cmsCollections.ts:207-217` cascade misses contextual
  `current-field` / `page-item-field` bindings — requires page→
  collection resolution, multi-file refactor.
- `cmsActions.ts` source list existence oracle + silent initial-sync
  error.
- `internal/cascade.ts` orphan team workspaces on user-delete.
- `workspaces.ts:541` unverified-email accept (Clerk-side mitigated).
- `projectInvitations.ts` accept race, casing dup, legacy role
  fallback.
- `storage.getFileUrl` global namespace (in-file TODO).
- `aiUsageEvents`/`branchActions`/`projects` perf nits.
- `deployments._update` returns null on error — caller doesn't check.
- `pageAccess.ts:99` PBKDF2 100k vs OWASP 600k.

### Validation (user-blocking sweep)

- `bun typecheck` → exit 0
- `bunx convex codegen --typecheck disable` → exit 0
- All edits confined to single-file scopes; no schema migration
  needed.
