# UX + QA Fixes - 2026-04-29

This note tracks the implementation work completed from the UX + QA audit.

## Completed

- Replaced broken client-side `redirect()` usage in project open and project-exit flows with client navigation.
- Restored access to template-only accounts on the projects page by removing the false empty-state dead end.
- Added a clearer first-run path from the landing hero into the product and re-enabled the GitHub import entry point.
- Tightened local import validation so the supported stack claim matches the actual checks more closely.
- Added visible inline import error feedback and a direct folder-selection recovery action.
- Shipped a real keyboard shortcuts modal for the editor and connected it to the existing `Cmd/Ctrl + K` shortcut.
- Turned Preferences into an actual settings surface by exposing chat visibility controls and a shortcuts entry point.
- Repaired the branch so `bun run typecheck` passes again.
- Hardened project exit and code-download actions so they no longer crash when branch or screenshot state is still settling.
- Fixed comment mode so new pins are only placed from empty-canvas clicks instead of hijacking popover interactions.
- Gated folder creation/rename and page-tree drag-and-drop to App Router projects, preventing dead-end actions in legacy Pages Router sandboxes.
- Restored visible keyboard focus styles across the shared UI primitives and removed the global CSS rules that were suppressing focus indicators.
- Hardened diff, git-action, and comment-popover flows against missing sandbox state and failed async calls so the editor no longer crashes or gets stuck in silent loading states.
- Added mobile tab ARIA roles/states and prevented duplicate submissions from static template cards while a project is already being created.
- Fixed the new commit modal so the "Include unstaged" toggle no longer stages tracked edits behind the user's back, and made design search recompute against live layer/frame state instead of stale memoized results.
- Kept project live previews visible after successful iframe load instead of timing them out into the fallback state, and wired static template cards to the real template-project flow with an honest unavailable fallback when no matching template exists.
- Aligned the bottom-bar zoom controls with the canvas zoom ceiling, blocked empty staged-only commits, and upgraded the new PR action from placeholder UI to a real GitHub pull-request flow.
- Removed the projects empty-state prompt textarea's inner focus border, padding shift, and native resize handle so only the surrounding prompt box carries the visual frame.

## Verification

- `bun run typecheck`
- `bun test apps/web/client/test/pages/helper.test.ts`
- Targeted ESLint run on the changed files completed without errors. Remaining output was formatting-only warnings in files that already carry broader in-progress edits.
