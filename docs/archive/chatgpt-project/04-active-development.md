# Weblab — Active Development (as of 2026-05-09)

What's currently being built or recently shipped. Know this to avoid suggesting work that's already done or conflicting with in-flight work.

## 🔵 In active development

### TipTap AI Chat Composer
Replacing `<textarea>` inputs across all chat surfaces with a TipTap rich-text editor.

- **Where**: `apps/web/client/src/components/ai-prompt-composer/`
- **Features**: `@` file/folder mention popup, `/` slash command palette, image attachments, context pills, structured payload serialization
- **Status**: 7 recent commits. Core working; extensions being refined.
- **Surfaces using it**: homepage hero, create-project dialog, empty-projects state, in-canvas chat tab
- **Legacy snapshots kept**: `hero/create.legacy.tsx` and similar — don't delete without checking fallback usage

### CMS Workspace
New editor panel for binding canvas elements to external content sources.

- **Where**: `apps/web/client/src/app/project/[id]/_components/cms-workspace/`
- **tRPC router**: `src/server/api/routers/cms/` (cms, collection, item, binding, source, sync)
- **DB**: `cms_source`, `cms_collection`, `cms_item`, `cms_binding` tables
- **Features**: external sources (Payload, Strapi, REST), canvas element binding, preview with real content
- **CMS pill**: `cms-pill.tsx` indicator on bound elements
- **Status**: Router mature; UI still in development
- **Credential encryption**: AES-256-GCM via `CMS_SOURCE_ENCRYPTION_KEY` env var

### Responsive Frame Breakpoints
Per-frame viewport breakpoints for designing at multiple screen sizes.

- **DB**: `0029_frame_breakpoints.sql` — `frames` table carries breakpoint metadata
- **Router**: `src/server/api/routers/project/frame.ts` (includes `breakpoints` field)
- **Parser**: `@weblab/parser` responsive class rebase (Tailwind `md:`, `lg:` prefix handling)
- **Editor manager**: `src/components/store/editor/breakpoints/`
- **Status**: DB done; editor manager + UI in progress

### Framework Auto-Detection
Project creation detects the framework from repo files and templates the AI system prompt.

- **Package**: `@weblab/framework` (Next.js, Vite, Remix, Astro, TanStack Start, static HTML)
- **UI**: `framework-select-dialog.tsx` for manual override
- **Status**: Core detection working; system prompt templating in progress

### Desktop CLI Bridge
Local AI providers (Claude Code, Codex, Gemini, Cursor) available in desktop app via CLI.

- **Package**: `@weblab/ai-cli`
- **Status**: Package exists; desktop wiring in progress

### Preview Surface Controls
New overlay for switching between design/content preview modes.

- **Files**: `preview-overlay.tsx`, `preview-theme-toggle.tsx`
- **Status**: Components exist; wiring to CMS preview state in progress

### Project Chooser Cards
New card-based create flow with loading states.

- **Files**: `project-chooser-cards.tsx`, `project-creation-loader.tsx`
- **Status**: Components created, integration ongoing

## 🟢 Recently shipped (stable)

- **AI Component Generation (v1.5)** — natural language → typed, styled, inserted component
- **GitHub Sync (v1.4)** — auto-commit + pull without leaving editor
- **Component Library (v1.3)** — shadcn/Radix/design-system sidebar browser
- **Live Collaboration (v1.2)** — multi-user real-time editing
- **Semantic status tokens** — CSS vars for success/warning states across editor chrome
- **Auth flow hardening** — `NEXT_PUBLIC_SITE_URL` for proper OAuth redirects
- **Marketing expansion** — blog redesign, comparison pages, structured data/SEO
- **User settings migration** — `user_settings` schema aligned with Drizzle (`0022`)
- **Runtime mode plumbing** — `cloud` / `local` / `hybrid` project modes (`0023`)
- **AI prompt composer unification** — all chat surfaces share one component

## 🔴 Known technical debt / issues

- **Sandbox startup** — needs cleaner error/retry states (crash on cold start common)
- **Local mode** — plumbing exists but desktop provider isn't complete yet
- **Comment polling** — backoff needed to avoid hammering DB on inactive projects
- **Telemetry** — PostHog key must not be read from server-only env on client components
- **`image` tRPC router** — exported in `routers/index.ts` but not registered in `root.ts` (unused)
- **CMS undo** — CMS binding mutations don't participate in editor Cmd-Z history (intentional design decision, ticket open for future)

## Pending migrations (must be run by owner)

After any schema work, owner must run:
```bash
bun db:push
```
Recent migrations through `0029_frame_breakpoints.sql` should be applied to all environments.
