# QA loop — UX audit + CMS/publish polish (2026-06-20 iter-5, /loop dynamic, Workflow: 7 UX auditors + 3 verifiers) — 3 FIXED, full UX audit delivered

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
