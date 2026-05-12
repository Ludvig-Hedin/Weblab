# Weblab — Coding Rules & Conventions

Every Claude Code prompt must enforce these. Non-negotiable.

## Brand

- Product name: **Weblab**. Never "Onlook" except in: `LICENSE.md`, `CODE_REVIEW_BACKLOG.md`, `DEPRECATED_PRELOAD_SCRIPT_SRCS` constant, and parser test fixtures.
- Import: `import { APP_NAME } from '@weblab/constants'`
- JSX: `{APP_NAME}` not `"Weblab"`
- Template literal: `${APP_NAME}` not `"Weblab"`
- Package scope: `@weblab/*`
- DOM attributes: `data-weblab-*`
- URL protocol: `weblab://`
- Cache dir: `.weblab`

## Tooling

- **Bun only.** `bun install`, `bun run`, `bun test`. Never npm, yarn, pnpm.
- **Never run the dev server** in automation (`bun dev` blocks).
- **Never run `bun db:gen`** — maintainer only.
- Path aliases: `@/*` and `~/*` → `apps/web/client/src/*`

## TypeScript

- `any` only when genuinely impossible to type. Always add a comment explaining why.
- Prefer `@weblab/types` and `@weblab/models` over local re-declarations.
- Validate all tRPC inputs with Zod.
- `src/env.ts` is the source of truth for env vars — add new vars there.
- Expose client vars with `NEXT_PUBLIC_*` prefix and declare in the `client` schema.
- Never `process.env` in client code. Guard shared code with `typeof window === 'undefined'`.

## Next.js App Router

- **Server Components by default.** Add `use client` only for: event handlers, `useState`/`useEffect`, browser APIs, client-only libraries.
- One `use client` boundary at the feature entry point. Child components don't need it.
- `observer` from `mobx-react-lite` → must be `use client`.
- App structure: `src/app/**` using `page.tsx`, `layout.tsx`, `route.ts`.
- Client providers live behind a client boundary: see `src/trpc/react.tsx`.

## tRPC

- Add new routers to `routers/index.ts` AND `root.ts` (both required).
- `publicProcedure` for unauthenticated. `protectedProcedure` for anything requiring auth.
- Always check project membership inside procedures that touch project data.
- Return plain objects/arrays. No class instances (SuperJSON handles Date, etc.).
- Keep auth close to the procedure, not in HOFs.

## Auth & Supabase clients

| Context | Client |
|---------|--------|
| Server components, actions, routes | `src/utils/supabase/server.ts` |
| Client components | `src/utils/supabase/client/index.ts` |
| Admin / server-only ops | `src/utils/supabase/admin.ts` |
| Middleware | `src/utils/supabase/middleware.ts` |

Never pass server clients into client code.

## Database

- Schema source of truth: `packages/db/src/schema/**`
- Migrations: `apps/backend/supabase/migrations/`
- After schema change: `bun db:push` against local dev DB
- When schema changes, also update: Drizzle schema → migration SQL → mapper → model type → tRPC input/output → UI consumers
- Run `bun db:push` or document the command to run manually

## MobX stores

```tsx
// ✅ Correct
const [engine] = useState(() => new EditorEngine(...));

// ❌ Wrong
const engine = useMemo(() => new EditorEngine(...), []);
```

- Keep active store in `useRef`.
- Async cleanup: `setTimeout(() => storeRef.current?.clear(), 0)` on unmount.
- Never put store instance in effect deps if it causes loops — split concerns.

## UI & styling

- `@weblab/ui` and app-local patterns first. No one-off UI frameworks.
- TailwindCSS 4. Global styles in `src/app/globals.css`.
- Design tokens (not raw palette values) for semantic colors. Check `/design-system` route.
- Dark theme via `ThemeProvider` in layout — preserve it.
- Marketing pages: richer, more expressive. Editor: dense, calm, no decorative gradients.
- No marketing-style cards inside the editor workspace.

## i18n

- User-facing strings → `messages/*.json` via `next-intl`.
- Never hardcode UI text.
- Keys must be stable — prefer additions over renames.

## Editor patterns

- Don't mark editor ready until runtime provider is connected and sandbox started.
- Sandbox restart must clear loading/error states and attempt reconnection.
- Local/hybrid modes: never silently overwrite user's local repo changes.
- Changing canvas behavior: check frame components, overlay components, frame managers, preload scripts.

## File organization

- New feature in editor → put state in the narrowest manager that owns the concept.
- New marketing page → `apps/web/client/src/app/<route>/page.tsx`. Update sitemap.
- New tRPC router → router file + `routers/index.ts` + `root.ts` + `trpc-routers-reference.md`.
- New package → `packages/<name>/`, name `@weblab/<name>`, add to workspaces, add to `packages-reference.md`.

## Validation (always run before declaring done)

```bash
# TypeScript changes
bun --filter @weblab/web-client typecheck

# Style/lint changes
bun lint   # or: bun --filter @weblab/web-client lint

# Logic with tests
bun test

# DB schema change
bun db:push

# Docs only
git diff --check
```

## Documentation (always do on significant changes)

1. Update the relevant `docs/agent-context/*.md` if architecture changed.
2. Append to `docs/agent-memory/feature-log.md`.
3. Append to `docs/agent-memory/architecture-decisions.md` if a pattern was established.
4. Add changelog entry to `apps/web/client/src/lib/changelog-entries.ts` if user-facing.
5. Update `docs/agent-context/current-progress.md` if worktree state shifted.
