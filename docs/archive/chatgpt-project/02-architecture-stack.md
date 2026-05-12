# Weblab — Architecture & Stack

## Monorepo structure

```
onlook/                         # repo root (product name: Weblab)
├── apps/
│   ├── web/client/             # PRIMARY — Next.js App Router (Railway)
│   ├── web/server/             # Fastify + tRPC WebSocket (real-time)
│   ├── web/preload/            # iframe preload/instrumentation scripts
│   ├── backend/                # Supabase CLI, migrations, edge fns
│   ├── desktop/                # Electron desktop app
│   ├── ios/                    # iOS app
│   └── admin/                  # Admin dashboard
├── packages/                   # 25 shared @weblab/* libraries
├── docs/                       # Fumadocs docs site + agent context
└── tooling/                    # Shared ESLint/TS/Prettier configs
```

## Key packages (25 total, under @weblab/*)

| Package | Role |
|---------|------|
| `constants` | `APP_NAME`, DOM attr prefixes, editor settings, shadcn block metadata |
| `models` | Cross-boundary TypeScript types (app ↔ DB ↔ API ↔ editor) |
| `types` | Low-level TS utility types |
| `db` | Drizzle schema, mappers, defaults, seed scripts |
| `utility` | General helpers |
| `rpc` | Shared tRPC contracts (client ↔ Fastify server) |
| `ai` | OpenRouter/OpenAI/Anthropic/Ollama routing, streaming, tool calls |
| `ai-cli` | CLI adapters: Codex, Claude Code, Gemini, OpenCode, Cursor |
| `parser` | Babel JSX/TSX AST parsing + responsive class rebase |
| `framework` | Framework adapter: Next.js, Vite, Remix, Astro, TanStack, static HTML |
| `code-provider` | Code sandbox provider abstraction (CSB vs local) |
| `file-system` | Browser file-system abstraction |
| `mcp` | Model Context Protocol server (file/bash/project tools for external AI) |
| `ui` | Radix + TailwindCSS + shadcn component library |
| `fonts` | Supported font catalog |
| `image-server` | Server-side image processing, OG generation |
| `penpal` | Typed cross-frame iframe RPC |
| `github` | Octokit: OAuth, REST, GitHub App |
| `figma` | Figma REST API |
| `figma-plugin` | Figma plugin (design-to-code) |
| `git` | Local git operations (desktop/local mode) |
| `stripe` | Stripe subscription + webhook helpers |
| `email` | Transactional email |
| `growth` | Referrals, attribution, share links |
| `scripts` | Build/setup scripts |

## Web client internals (`apps/web/client/src/`)

```
src/
├── app/                    # Next.js routes (see routes list)
├── server/api/             # tRPC setup + 21 routers
├── components/
│   ├── store/editor/       # MobX EditorEngine + ~20 managers
│   ├── store/create/       # Project creation state
│   ├── store/hosting/      # Domain/hosting state
│   ├── ai-prompt-composer/ # Shared TipTap chat input (all surfaces)
│   └── ui/                 # App-local modals, feature components
├── trpc/                   # Client + React Query + server helpers
├── utils/supabase/         # browser / server / admin / middleware clients
├── i18n/ + messages/       # next-intl localization
├── lib/
│   └── changelog-entries.ts  # Public changelog data
└── env.ts                  # Typed env schema (@t3-oss/env-nextjs)
```

## tRPC routers (21 total in `root.ts`)

`sandbox`, `user`, `invitation`, `project`, `provider`, `branch`, `settings`, `chat`, `cms`, `comment`, `figma`, `frame`, `userCanvas`, `utils`, `member`, `domain`, `github`, `subscription`, `usage`, `publish`, `forward`

Router files live under `src/server/api/routers/`. Sub-routers for project scope live in `routers/project/` (branch, frame, sandbox, settings, invitation, member). `userCanvas` lives in `routers/user/`.

New routers must be added to `routers/index.ts` AND `root.ts`.

## Database

- **ORM**: Drizzle
- **Host**: Supabase (PostgreSQL + Auth + Storage + Realtime)
- **Schema**: `packages/db/src/schema/**`
- **Migrations**: `apps/backend/supabase/migrations/` (latest: `0029_frame_breakpoints.sql`)
- **Apply locally**: `bun db:push`
- **Never run**: `bun db:gen` (maintainer only)

Key tables: `users`, `projects`, `branches`, `canvases`, `frames`, `conversations`, `messages`, `project_comments`, `comment_replies`, `deployments`, `project_settings`, `user_projects`, `subscriptions`, `rate_limits`, `user_provider_connections`, `cms_source`, `cms_collection`, `cms_item`, `cms_binding`

## Auth

- Supabase-backed. OAuth via GitHub and Google.
- Server client: `src/utils/supabase/server.ts`
- Browser client: `src/utils/supabase/client/index.ts`
- Admin (server-only): `src/utils/supabase/admin.ts`
- **Always** check project membership in tRPC procedures — auth alone isn't enough.

## Editor state (MobX)

`EditorEngine` at `src/components/store/editor/engine.ts` composes ~20 managers:

`branches`, `canvas`, `frames`, `frameEvent`, `elements`, `overlay`, `move`, `insert`, `snap`, `group`, `copy`, `ast`, `style`, `text`, `code`, `pages`, `font`, `theme`, `image`, `chat`, `comment`, `presence`, `screenshot`, `api`, `ide`, `action`, `state`

Pattern: `useState(() => new EditorEngine(...))` — never `useMemo`. Async cleanup on unmount/project-change.

## Deployment

- **Web app**: Railway. Not Vercel.
- **User projects**: Freestyle (hosting/domain publishing).
- **Docs site**: Railway (separate).
- **CI**: GitHub Actions on `Ludvig-Hedin/Weblab`.

## Important constraints (always enforce)

- Bun only (`bun install`, `bun run`, etc.). Never npm/yarn/pnpm.
- Never run the dev server in automation.
- Never hardcode "Weblab" — import `APP_NAME` from `@weblab/constants`.
- Never `any` type unless absolutely necessary.
- Never `bun db:gen`.
- Server Components by default. `use client` only when needed.
- MobX stores: `useState(() => new Store())`, never `useMemo`.
- i18n: strings in `messages/*.json`, never hardcoded in UI.
