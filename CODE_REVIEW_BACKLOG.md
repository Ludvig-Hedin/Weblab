# Code Review Backlog

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
