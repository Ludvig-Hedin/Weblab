# Current Progress Snapshot

Last updated: 2026-05-07.

## Product Direction

Weblab is an open-source visual-first code editor for building and editing
Next.js/Tailwind projects with AI. The current web product focuses on:

- project creation from prompt, templates, images, Figma, GitHub, or local
  folders
- visual editing on an iframe canvas with code-backed style and structure edits
- AI chat for project generation and edits
- project branches, checkpoints, comments, members, domains, publishing, and
  subscription/usage plumbing
- a public marketing/docs surface for `weblab.build` and `docs.weblab.build`

## In-Flight Work Visible In This Worktree

The worktree contains many changes that may have been made by other agents or
the project owner. Do not assume they are yours. Work with them, and stage only
files you intentionally edited.

Observed active areas:

- Weblab brand migration and cleanup across app routes, metadata, copy,
  constants, package metadata, docs, and public assets.
- Marketing site expansion: blog, changelog, feature pages, workflow pages,
  hero/landing sections, OG/public assets, and shared marketing components.
- Editor project-flow fixes around sandbox startup/restart, chat suggestions,
  mobile fallback states, auth redirects, GitHub imports, page forms, and local
  runtime branch startup.
- AI prompt composer unification between homepage, create-project, empty-projects, and canvas chat.
  The shared component lives in `apps/web/client/src/components/ai-prompt-composer/`, with legacy
  snapshots kept beside the previous create/editor implementations.
- Project runtime mode plumbing for `cloud`, `local`, and future `hybrid`
  projects.
- User settings preference migration to align local Supabase schemas with the
  Drizzle `user_settings` shape.
- Dev log cleanup for `/project/[id]`: configured DB repair/sync for missing
  comment tables, settings columns, later hand-written DB edits, comment
  polling backoff, tRPC error dedupe, and optional telemetry warning
  suppression.
- Telemetry provider client runtime fix: PostHog missing-key handling must not
  read server-only env values from the client component.
- UI package/component changes for shared primitives and settings/modal flows.

Useful progress notes already exist in:

- `docs/project-runtime-modes.md`
- `docs/user-settings-migration-2026-05-06.md`
- `docs/dev-log-debug-2026-05-07.md`
- `docs/ai-chat-input-unification-2026-05-06.md`
- `docs/editor-project-flow-fixes-2026-05-06.md`
- `docs/project-card-interactions-2026-05-06.md`
- `docs/projects-page-previews-and-folders-2026-04-29.md`
- `docs/ux-qa-audit-2026-04-29.md`
- `docs/ux-qa-fixes-2026-04-29.md`

## Safety Rules For Current Work

- The current branch is allowed to be dirty. Before editing, inspect the target
  file and the existing diff for that file.
- Never revert unrelated changes. If a file already has unrelated edits, make a
  surgical patch that preserves them.
- Do not create a new branch unless the project owner explicitly asks.
- Commit only edited repo files for your task, and only after validation passes.
- Global files outside this repository, such as `/Users/ludvighedin/.codex` or
  `/Users/ludvighedin/CLAUDE.md`, cannot be part of a repo commit.

## Completion Bar

For code changes, a task is not done until:

- relevant tests/typecheck/lint/build or targeted validation has run
- migrations/config/env changes have been run or clearly handed off
- documentation is updated with durable progress or architecture context
- a code review of the session's changed code has been performed
- the final answer lists files changed, validation, manual steps, and confidence
