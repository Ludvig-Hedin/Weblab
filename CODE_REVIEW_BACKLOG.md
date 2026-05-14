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
