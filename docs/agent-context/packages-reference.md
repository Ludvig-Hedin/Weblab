# Packages Reference

Comprehensive reference for every package in `packages/*`. Read the relevant
section before importing from a package or adding a new one. Last refreshed:
2026-05-27.

> **Total: 26 packages.** All published under the `@weblab/*` scope.
> Changes ripple into dependent packages — scope changes narrowly.
> Verify with `ls packages/`.

## Quick Index

| Group | Packages |
|-------|----------|
| Core / Infra | `constants`, `models`, `types`, `db`, `utility`, `rpc`, `auth` |
| AI & LLM | `ai`, `ai-cli`, `parser` |
| Framework / Runtime | `framework`, `code-provider`, `file-system`, `mcp` |
| Integrations | `github`, `figma`, `figma-plugin`, `git`, `stripe`, `email` |
| UI & Assets | `ui`, `fonts`, `image-server` |
| Communication | `penpal` |
| Ops | `growth`, `scripts` |

## Core / Infrastructure

### `@weblab/constants`
Brand constants and shared editor constants. **Always import `APP_NAME`** —
never hardcode the brand name. Also exports DOM attribute prefixes,
deprecated preload-script URLs (`DEPRECATED_PRELOAD_SCRIPT_SRCS`), shadcn block
metadata, color tokens, and editor settings.
- Source: `packages/constants/src/`
- Key files: `editor.ts` (APP_NAME), `files.ts` (deprecated URLs)

### `@weblab/models`
Shared model types used across the app, DB mappers, API contracts, and editor
stores. Source of truth for cross-boundary type shapes.
- Source: `packages/models/src/`

### `@weblab/types`
Lower-level TypeScript types and utility types used across the codebase.
Prefer importing from here over redeclaring locally.

### `@weblab/db`
Drizzle ORM schema, database client, mappers, defaults, seed scripts, and
migration helpers. **Legacy** — live schema is now in
`apps/web/client/convex/schema.ts`. This package lingers for type sharing,
seed scripts, and migration archaeology.
- Schema: `packages/db/src/schema/**`
- Mappers: `packages/db/src/mappers/**`
- Defaults: `packages/db/src/defaults/**`
- Drizzle config: `packages/db/drizzle.config.ts`
- Legacy migrations archived under `apps/backend/supabase/migrations/` (do
  not add new ones)

### `@weblab/auth`
Central authorization layer — capability identifiers, role → capability
matrices, and a `can()` resolver. Pure types + helpers; no Clerk or Convex
runtime deps. Used by both the Next.js client (via `convex/lib/permissions.ts`)
and the Fastify server.
- Source: `packages/auth/src/`

### `@weblab/utility`
General-purpose utility functions (string helpers, math, async helpers, etc.).

### `@weblab/rpc`
Shared tRPC contract definitions used between client and Fastify server.

## AI & LLM

### `@weblab/ai`
Primary AI SDK / OpenRouter / provider integration and agent orchestration.
Routes models, manages streaming, handles tool calls, summarizes long chats,
and exposes provider abstractions for OpenAI, OpenRouter, Anthropic, Ollama,
Firecrawl, Exa, and Mem0. Highlights:

- `src/chat/model-router.ts` — model selection rules.
- `src/chat/request-builder.ts` — assembles the streaming request.
- `src/chat/providers.ts` — provider clients.
- `src/chat/summarizer.ts` + `summarizer-utils.ts` — long-context
  summarization.
- `src/prompt/cache-blocks.ts` — Anthropic cache-block markers.
- `src/observability/index.ts` — observability events (Langfuse / PostHog).
- `src/agents/root.ts` + `inline-edit.ts` — root + inline-edit agents.
- `src/tools/` — tool surface (file ops, web search, fast-apply via
  Morph/Relace, Firecrawl screenshot/crawl, Exa search, Mem0 memory).
- `src/skills/embedded.ts` — embedded skills manifest (regenerated via
  `bun --filter @weblab/ai regen-skills`).

### `@weblab/ai-cli`
CLI adapters that bridge to local AI tools: Codex, Claude Code, Gemini,
OpenCode, Cursor. Used by the desktop app for local provider support.

### `@weblab/parser`
Babel-based JSX/TSX AST parsing and code transformation. Powers AI code edits,
component insertion, group/ungroup operations, and responsive class rebasing.
- Test fixtures intentionally retain "Onlook" references for parser regression
  testing — do not strip them.

## Framework / Runtime

### `@weblab/framework`
Framework adapter abstraction. Detects and configures Next.js, Vite, Remix,
Astro, TanStack Start, and static HTML projects. New: framework auto-detection
flow used by the project creation dialog and AI system prompts.

### `@weblab/code-provider`
Code sandbox provider abstraction. **Vercel Sandbox is the sole production
provider** since 2026-05-24; the CodeSandbox provider files
(`providers/codesandbox/`) and `@codesandbox/sdk` dep are retained as
`@deprecated` dead code so legacy DB rows still type-check. Do not
re-introduce CSB or suggest the multi-provider abstraction for new code.

- Active provider: `src/providers/vercel-sandbox/index.ts`. Exports
  `scaffoldNextProject` (Next.js 15 + Tailwind v4 + Turbopack) and
  `scaffoldStaticHtmlProject` (single index.html + `serve`). Vite, Remix,
  Astro, TanStack Start are gated upstream in `@weblab/framework` until
  their scaffolders land.
- Required env: `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID`, `VERCEL_TOKEN`.
  Optional: `VERCEL_SANDBOX_TIMEOUT_MS`, `VERCEL_BLANK_SNAPSHOT_ID`,
  `WEBLAB_VERCEL_VCPUS`, `WEBLAB_VERCEL_WARM_POOL_SIZE`.
- Disabled until snapshot-fork lands: `project.fork`, `branch.fork`,
  `publish` — track as `TODO(sandbox-fork)` / `TODO(publish-vercel)`. See
  `docs/notes/2026-05-13-vercel-sandbox-provider.md` and ADR `2026-05-24`.

### `@weblab/file-system`
Browser-compatible file-system abstraction used by editor providers and
preview frames.

### `@weblab/mcp`
Model Context Protocol server. Exposes file, bash, and project tools to AI
agents (Claude, Cursor, etc.) so they can interact with a Weblab project from
outside the editor.

## Integrations

### `@weblab/github`
Octokit-based GitHub API client. Handles OAuth, REST, and GitHub App
integrations for repo import, sync, commits, and PRs.

### `@weblab/figma`
Figma REST API integration for design import.

### `@weblab/figma-plugin`
The Figma plugin source itself — design-to-code workflow that pushes Figma
selections into a Weblab project.

### `@weblab/git`
Local git operations (used primarily by desktop and local-mode runtimes).

### `@weblab/stripe`
Stripe configuration, product/price helpers, and webhook handlers for the
subscription/usage flow.

### `@weblab/email`
Email-sending library wrapping the transactional provider.

## UI & Assets

### `@weblab/ui`
Radix UI + TailwindCSS + shadcn/ui component library. **Prefer this over
custom components.** All components are reflected in the `/design-system` page.

### `@weblab/fonts`
Curated font catalog supported by the editor's font picker.

### `@weblab/image-server`
Server-side image processing utilities (resize, format conversion, OG image
generation).

## Communication

### `@weblab/penpal`
Cross-frame/iframe RPC built on Penpal. Enables typed communication between the
editor and sandboxed preview iframes via the preload bridge.

## Ops

### `@weblab/growth`
Growth and analytics helpers (referrals, attribution, share links).

### `@weblab/scripts`
Internal build and setup scripts run via `bun run`.

## Adding a New Package

1. Create `packages/<name>/` with `package.json`, `tsconfig.json`,
   `src/index.ts`.
2. Set name to `@weblab/<name>`. In `tsconfig.json`, extend
   `@weblab/typescript/base.json` (use `react-library.json` for React
   packages). See `packages/utility/tsconfig.json` as a reference.
3. Add to root `package.json` workspaces if not already covered by the glob.
4. Run `bun install` from the repo root.
5. Add an entry to this file under the right group.
6. If consumers depend on the package, add `"@weblab/<name>": "workspace:*"` to
   their `package.json`.

## Cross-Cutting Notes

- Bun workspaces use `workspace:*` protocol for internal deps. Do not pin
  versions across packages.
- Most packages are pure TypeScript; check the package's `package.json`
  `scripts` for any custom build step.
- Test files for any package live alongside source as `*.test.ts`.
