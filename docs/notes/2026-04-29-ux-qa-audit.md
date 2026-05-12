# UX + QA Audit - 2026-04-29

Scope: code-based review of the main user flows in `apps/web/client`.

## Flows Reviewed

### New user

- Goal: understand the product, sign up, and get to a first win quickly.
- Outcome: partially achievable, but the path is indirect and fragile.

### Returning user

- Goal: get back to an existing project and continue work.
- Outcome: not reliable. Core navigation paths appear broken.

### Power user

- Goal: move fast, use shortcuts, and customize the workspace.
- Outcome: mixed. There are many shortcuts, but key discoverability and customization surfaces are missing or incomplete.

## Key Findings

### Existing-project navigation is wired incorrectly in client code

- Files:
  - `apps/web/client/src/app/projects/_components/edit-app.tsx`
  - `apps/web/client/src/app/project/[id]/_components/top-bar/project-breadcrumb.tsx`
- Both flows call `redirect()` from client event handlers instead of client navigation.
- Impact: users can click the main "Edit app" action or "Go to all projects" and hit broken navigation instead of moving forward.

### Projects page hides template-only accounts

- File: `apps/web/client/src/app/projects/_components/select/index.tsx`
- The empty-state early return checks only non-template projects.
- Impact: a user who only has template projects sees "No projects found" and cannot access the templates that actually exist.

### Local import validation overpromises and underchecks

- Files:
  - `apps/web/client/src/app/projects/import/local/_context/index.tsx`
  - `apps/web/client/src/app/projects/import/local/_components/select-folder.tsx`
- UI says Weblab only works with `NextJS + React + Tailwind`, but validation only checks for Next.js, React, and router structure.
- Impact: unsupported projects can be accepted, then fail later after the user has already invested time uploading and waiting.

### Local import errors are not explained in the UI

- File: `apps/web/client/src/app/projects/import/local/_components/select-folder.tsx`
- The component stores `error`, but does not render it anywhere.
- Impact: when upload or parsing fails, the user gets stalled with no visible reason or recovery guidance.

### Shortcut discoverability is incomplete

- Files:
  - `apps/web/client/src/components/hotkey.ts`
  - `apps/web/client/src/app/project/[id]/_components/canvas/hotkeys/index.tsx`
  - `apps/web/client/src/components/store/editor/state/index.ts`
- `mod+k` toggles `hotkeysOpen`, but no visible consumer for that state exists in the code reviewed.
- Impact: power users only benefit if they already know the shortcuts. New and active users have no real shortcut reference.

### Settings do not offer meaningful preferences yet

- File: `apps/web/client/src/components/ui/settings-modal/preferences-tab.tsx`
- The "Preferences" tab currently only contains account deletion.
- Impact: power users have no obvious place to customize behavior, despite a settings surface that implies they can.

### Import screen advertises GitHub import but disables it without a clear fallback

- File: `apps/web/client/src/app/projects/import/page.tsx`
- The GitHub card is present, styled as an option, and hard-disabled with a code comment.
- Impact: advanced users looking for the fastest repo-based path are teased with a dead option instead of being told when or why it is unavailable.

### Current branch does not typecheck

- File:
  - `apps/web/client/src/app/project/[id]/_components/right-panel/style-tab-v2/sections/element-header.tsx`
- `bun run typecheck` fails with syntax errors around duplicated JSX near lines 218-233.
- Impact: confidence in the audited flows is lower because the current branch is already in a broken compile state.

## Recommendation Order

1. Fix client-side navigation in project open and project-exit flows.
2. Restore access to template-only states on the projects page.
3. Make local import validation honest and user-visible.
4. Either ship a real shortcuts modal and preferences panel or remove the implied affordances.
