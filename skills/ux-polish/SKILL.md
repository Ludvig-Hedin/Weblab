---
name: ux-polish
description: >-
  Hunts for small UX wins — missing states, rough edges, and polish gaps that
  a user would notice but a developer might overlook. Covers missing loading
  states, unhandled empty/error states, tooltips on truncated text, missing
  disabled states during async ops, keyboard/accessibility gaps, and
  inconsistent micro-interactions. Reports as a prioritized table with quick
  before/after diffs. No big features — only small, self-contained improvements.
  Use this skill whenever the user says "ux polish", "polish check", "small ux
  wins", "missing states", "rough edges", "ux audit", "what needs polish",
  "quick ux fixes", "feels unfinished", or asks what could be improved in a
  surface without wanting a full redesign. Also trigger for "what's missing",
  "needs polishing", or "small improvements".
---

# UX Polish Audit

You are a detail-oriented product engineer hunting for small, self-contained UX improvements. Your job is to find real rough edges that users hit — not design philosophy, not architectural changes — and surface the ones that take minutes to fix.

**Scope:** Small wins only. Each finding must be fixable in ≤ ~30 lines without touching other surfaces. If something requires a new component, a new API, or a design decision, put it in Open Questions, not Findings.

## Step 1: Identify the target surface

User will specify an area (e.g. "the canvas toolbar", "settings modal", "onboarding flow"). Find the relevant files:

```bash
# Locate the component tree for the area
find apps/web/client/src -path "*[area]*" -name "*.tsx" | head -20
```

Read the component tree. Follow imports one level deep for the target area. Don't read the whole repo.

## Step 2: Hunt for polish gaps

For each file in scope, look for these patterns:

### Missing states
- **Loading** — async operations (`isLoading`, `isPending`, `isFetching`) that don't show a spinner, skeleton, or disabled state on the triggering button
- **Empty** — lists, grids, or containers that render nothing (or `null`) when data is empty, with no empty-state message or illustration
- **Error** — catch blocks or error boundaries that show a raw error string, nothing at all, or a generic "Something went wrong" with no recovery action
- **Disabled during async** — buttons that remain clickable while a mutation is in-flight (missing `disabled={isPending}` or similar)

### Missing affordances
- **Truncated text without tooltip** — any `truncate` or `overflow-hidden` on user-generated or dynamic text without a `title` attribute or `<Tooltip>` wrapper
- **Icon-only buttons without tooltip** — `<Button>` or `<button>` containing only an icon, missing an `aria-label` and/or a tooltip on hover
- **No hover/focus ring** — interactive elements missing `:hover` or `:focus-visible` styles (check for `outline-none` without a replacement focus style)
- **Clickable area too small** — interactive targets under ~32px in either dimension (look for `h-4 w-4` or `p-0` on buttons without padding)

### Inconsistent micro-interactions
- **Some but not all items** have a transition (e.g. some sidebar items use `transition-colors`, siblings don't)
- **Mixed cursor** — some interactive divs have `cursor-pointer`, siblings don't
- **Inconsistent close behavior** — some modals/popovers close on Escape/backdrop-click, others don't (look for `onInteractOutside`, `onEscapeKeyDown`, `onOpenChange`)

### Feedback gaps
- **No success feedback** — mutations that succeed silently (no toast, no optimistic update, no visual confirmation)
- **No confirmation on destructive actions** — delete/remove actions that fire immediately with no `AlertDialog` or confirmation step
- **Stale data shown** — data that isn't invalidated/refetched after a mutation (look for missing `queryClient.invalidateQueries` after a successful mutation)

### Accessibility quick wins
- **Missing `aria-label`** on icon-only buttons or inputs with no visible label
- **`role` missing** on interactive non-button divs (`onClick` on a `<div>` without `role="button"` and `tabIndex={0}`)
- **Images without `alt`** (or `alt=""` on non-decorative images)

### Copy / string quality
- **Placeholder text that just echoes the label** (e.g. `placeholder="Name"` on a field labeled "Name") — should be an example value or hint
- **All-caps labels** that should be sentence case
- **Hardcoded strings** not routed through `next-intl` messages

## Step 3: Produce the report

Cap the report at ~500 words excluding the table.

---

### 1. Inventory
One paragraph: files reviewed, what the surface does, approximate scope. No design-system recap.

### 2. Findings table — ordered by impact

| # | Impact | File:line | What's missing | Quick fix | Effort |
|---|---|---|---|---|---|
| 1 | 🔴 High | `path/to/file.tsx:42` | Button stays enabled during delete mutation | Add `disabled={isPending}` | 1 line |

Impact scale:
- 🔴 **High** — user can trigger a bug or gets no feedback on an action
- 🟡 **Medium** — rough edge, noticeable but not blocking
- 🟢 **Low** — micro-polish, subtle improvement

Effort column: "1 line", "~5 lines", "~15 lines", "new component needed" (flag as out of scope).

### 3. Top 3 quick wins (before/after diffs)

Pick the 3 highest-impact findings that are fixable in ≤ 15 lines each. Show real diffs:

```diff
// apps/web/client/src/app/.../delete-button.tsx
- <Button onClick={handleDelete}>Delete</Button>
+ <Button onClick={handleDelete} disabled={isPending}>
+   {isPending ? <Spinner className="h-4 w-4" /> : 'Delete'}
+ </Button>
```

Only show the diff — no surrounding explanation unless necessary for clarity.

### 4. Open questions

Bullets only — things that need a product decision (e.g. "Should the empty state have a CTA or just an illustration?"). Not recommendations.

---

## Rules

- **No file edits.** Report only, unless user explicitly asks to apply fixes.
- **No new components, no new API calls, no new routes.** If a fix requires these, flag in Open Questions.
- **Don't invent problems.** If the surface handles states well, say so. A clean audit is a valid result.
- **Real file paths and real line numbers.** No approximations.
- **Skip vendor / 3rd-party markup** — note it and move on.
- **One finding per issue.** Don't pad the table.
