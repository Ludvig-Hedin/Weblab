# Current Progress Snapshot

Last updated: 2026-05-09.

## Product Direction

Weblab is an open-source visual-first code editor for building and editing
projects (Next.js, Vite, Remix, Astro, TanStack Start, static HTML) with AI.
The current web product focuses on:

- project creation from prompt, templates, images, Figma, GitHub, or local
  folders, with **automatic framework detection**
- visual editing on an iframe canvas with code-backed style and structure
  edits, including **per-frame responsive breakpoints**
- AI chat for project generation and edits via a **shared TipTap composer**
  with `@` mentions and `/` slash commands
- project branches, checkpoints, comments, members, domains, publishing, and
  subscription/usage plumbing
- **CMS workspace** for binding canvas elements to external content sources
- a public marketing/docs surface for `weblab.build` and `docs.weblab.build`

## In-Flight Work Visible In This Worktree

The worktree contains many changes that may have been made by other agents or
the project owner. Do not assume they are yours. Work with them, and stage
only files you intentionally edited.

Observed active areas:

- **AI chat composer (TipTap rich-text editor)** — `@` file/folder mentions
  via popup, `/` slash command palette, image attachments, structured context
  pills. Shared component lives at `apps/web/client/src/components/ai-prompt-composer/`.
  See `ai-chat-architecture.md`.
- **CMS workspace** — new `cms-workspace/` editor panel, `cms-pill.tsx`
  canvas indicator, `block-preview.tsx`, and `cms` tRPC router. See
  `cms-architecture.md`.
- **Responsive frame breakpoints** — DB shape landed in
  `0029_frame_breakpoints.sql`; editor manager and parser rebase logic
  in-flight. See `breakpoints-architecture.md`.
- **Framework auto-detection** — project creation now detects framework via
  `@weblab/framework` and templates the AI system prompt accordingly. New
  `framework-select-dialog.tsx` allows manual override.
- **Preview overlay surface** — `preview-overlay.tsx` and
  `preview-theme-toggle.tsx` coordinate design vs. content preview modes
  (related to CMS).
- **Project chooser cards** — `project-chooser-cards.tsx` and
  `project-creation-loader.tsx` add a card-based create flow with loading
  state.
- **Desktop CLI bridge for local AI providers** — `@weblab/ai-cli` adapters
  for Codex, Claude Code, Gemini, OpenCode, Cursor.
- **Auth flow hardening** — `NEXT_PUBLIC_SITE_URL` for proper redirect
  handling, sign-out and provider integration fixes.
- **Marketing / SEO expansion** — blog redesign, comparison pages, structured
  data, sitemap improvements.
- **Weblab brand migration and cleanup** across app routes, metadata, copy,
  constants, package metadata, docs, and public assets (ongoing).
- **AI prompt composer unification** — homepage, create-project,
  empty-projects, and canvas chat. Legacy snapshots kept beside previous
  create/editor implementations.
- **Project runtime mode plumbing** for `cloud`, `local`, and future
  `hybrid` projects.
- **User settings preference migration** to align local Supabase schemas
  with the Drizzle `user_settings` shape.
- **Dev log cleanup for `/project/[id]`** — DB repair/sync for missing
  comment tables, settings columns, comment polling backoff, tRPC error
  dedupe, optional telemetry warning suppression.
- **Telemetry provider client runtime fix** — PostHog missing-key handling
  must not read server-only env values from the client component.
- **UI package/component changes** for shared primitives and settings/modal
  flows.

Useful progress notes already exist in:

- `docs/notes/2026-05-06-project-runtime-modes.md`
- `docs/notes/2026-05-06-user-settings-migration.md`
- `docs/notes/2026-05-07-dev-log-debug.md`
- `docs/notes/2026-05-06-ai-chat-input-unification.md`
- `docs/notes/2026-05-06-editor-project-flow-fixes.md`
- `docs/notes/2026-05-06-project-card-interactions.md`
- `docs/notes/2026-04-29-projects-page-previews-and-folders.md`
- `docs/notes/2026-04-29-ux-qa-audit.md`
- `docs/notes/2026-04-29-ux-qa-fixes.md`
- `docs/notes/2026-05-08-seo-growth-plan.md`

## Safety Rules For Current Work

- The current branch is allowed to be dirty. Before editing, inspect the
  target file and the existing diff for that file.
- Never revert unrelated changes. If a file already has unrelated edits, make
  a surgical patch that preserves them.
- Do not create a new branch unless the project owner explicitly asks.
- Commit only edited repo files for your task, and only after validation
  passes.
- Global files outside this repository, such as `/Users/ludvighedin/.codex` or
  `/Users/ludvighedin/CLAUDE.md`, cannot be part of a repo commit.

## Completion Bar

For code changes, a task is not done until:

- relevant tests/typecheck/lint/build or targeted validation has run
- migrations/config/env changes have been run or clearly handed off
- documentation is updated with durable progress or architecture context
- a code review of the session's changed code has been performed
- if the change is significant, an entry has been appended to
  `docs/agent-memory/feature-log.md` (and
  `docs/agent-memory/architecture-decisions.md` if architectural)
- the final answer lists files changed, validation, manual steps, and
  confidence
