# F-361 — `forkBranch` / `createBlankSandbox` swallow errors to console, no user feedback

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Resolved:** 2026-07-07 (found already fixed while triaging backlog) — `branch-controls.tsx`'s `handleForkBranch`/`handleCreateBlankSandbox` both `toast.error(...)` on failure (falling back to i18n `forkNotAvailable`/`createBlankFailed`), alongside the `console.error`. No longer silent.
- **Tags:** `#bug` `#editor` `#branch` `#disabled-contract`
