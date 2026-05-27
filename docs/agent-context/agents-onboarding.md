# Agents — 5-Minute Onboarding

Everything a fresh agent needs to know before planning work in Weblab.
Last refreshed: 2026-05-27.

> If you only read one doc, read this. Then dive into the area-specific
> reference docs in this folder.

## What is Weblab?

Weblab is an **open-source visual-first AI code editor**. Users describe an
app (or import one), and the editor renders the running site in an iframe
canvas with element-level visual editing, chat-driven code generation,
branches, checkpoints, comments, CMS bindings, animation interactions,
publishing, multi-workspace billing, and a desktop shell. Domain:
[weblab.build](https://weblab.build). Repo: `github.com/Ludvig-Hedin/Weblab`
(local folder still named `onlook/` from the original fork).

**Brand constant:** `APP_NAME = 'Weblab'` from `@weblab/constants`. Never
hardcode the brand name. Allowed remaining "Onlook" references are listed
in [`/CLAUDE.md`](../../CLAUDE.md).

## Stack (current, 2026-05)

| Concern | What |
|---|---|
| Frontend | Next.js 15 App Router · React 19 · TailwindCSS v4 · TypeScript · MobX (editor state) · TipTap (chat composer) · `@weblab/ui` (Radix + shadcn) |
| Backend | **Convex** (`apps/web/client/convex/`) — `query` / `mutation` / `action` per-domain module |
| Auth | **Clerk** (Convex JWT template `convex`, custom sign-in UI) |
| Sandbox runtime | **Vercel Sandbox** only (CodeSandbox archived 2026-05-24) |
| Hosting | **Railway** (`weblab.build`, `docs.weblab.build`) |
| Package manager | **Bun only** (`bun@1.3.1`, Node ≥ 20.16.0) |
| AI | OpenRouter primary, OpenAI/Anthropic/Ollama/Firecrawl/Exa/Mem0 routed via `@weblab/ai` |

**Vestigial:** two tRPC routers at `apps/web/server/src/router/` (`sandbox`,
`components`) only — do not extend. Supabase clients in
`src/utils/supabase/*` are type-only stubs.

## Where things live

```
apps/
├── web/client/          ← primary Next.js app
│   ├── convex/          ← Convex backend (schema, queries, mutations, actions, http.ts)
│   ├── src/app/         ← Next.js App Router (pages, /api routes, /project/[id] editor)
│   ├── src/components/  ← UI + MobX editor stores (store/editor, store/create, store/hosting)
│   └── src/utils/       ← clerk-bridge, supabase stubs, helpers
├── web/server/          ← Fastify + 2 vestigial tRPC routers
├── web/preload/         ← preload scripts injected into preview iframes
├── backend/             ← read-only Supabase migrations archive
├── desktop/             ← Electron shell (v0.2.0)
├── ios/                 ← iOS shell
├── docs/                ← Fumadocs site (docs.weblab.build)
└── admin/, video/

packages/                ← 26 @weblab/* packages
├── ui, constants, models, types, utility, rpc, auth   ← core
├── ai, ai-cli, parser                                  ← AI + AST
├── framework, code-provider, file-system, mcp          ← runtime
├── github, figma, figma-plugin, git, stripe, email     ← integrations
├── fonts, image-server, penpal, growth, scripts, db    ← support
```

## Critical commands (Bun only)

```bash
bun install
bun dev               # Next.js client at :3000
bun typecheck         # @weblab/web-client
bun lint              # all workspaces, max-warnings 0
bun test              # all workspaces
bun format            # auto-fix lint
bun docs              # Fumadocs site

bunx convex dev       # apply Convex schema + watch functions
bunx convex env list  # see deployment env vars
bunx convex deploy    # production deploy
```

**Do not** run `bun db:gen` (maintainer-only). **Do not** use `npm` / `yarn`
/ `pnpm`. **Do not** start a dev server in automation contexts.

## Where to start for common tasks

| Task | Read first | Then |
|---|---|---|
| Add a feature to the editor | `editor-architecture.md` | `current-progress.md` + feature catalog section 2 (editor) |
| Touch AI chat | `ai-chat-architecture.md` | `packages/ai/src/chat/*` + `convex/chatActions.ts` |
| Add a Convex query / mutation | `convex/_generated/ai/guidelines.md` (**mandatory**) | `data-api-architecture.md` + `convex/lib/permissions.ts` |
| Add a new REST route | `data-api-architecture.md` → "REST route handlers" | mirror an existing `app/api/*/route.ts` |
| Touch CMS | `cms-architecture.md` | `convex/cms*.ts` |
| Touch a frame / breakpoint | `breakpoints-architecture.md` | `convex/frames.ts` + `packages/parser/src/code-edit/` |
| Add a UI component | `button-enforcement.md` + `audit-*.md` | `/design-system` page |
| Touch billing / Stripe | `convex/subscriptionActions.ts` + `lib/stripeWebhook.ts` | `@weblab/stripe` |
| Touch publish / hosting | `convex/publishActions.ts` + `hostingConnections*.ts` | `packages/code-provider/src/providers/vercel-sandbox/index.ts` |
| Touch sandbox / preview | `editor-architecture.md` | `notes/2026-05-13-vercel-sandbox-provider.md` |

## Mandatory reading per session

1. [`/CLAUDE.md`](../../CLAUDE.md) — project-specific rules.
2. [`/AGENTS.md`](../../AGENTS.md) — agent rules.
3. [`agent-memory/user-preferences.md`](../agent-memory/user-preferences.md)
   — the project owner's preferences.
4. [`current-progress.md`](./current-progress.md) — what's in-flight.
5. [`/BACKLOG.md`](../../BACKLOG.md) — open bugs / deferred TODOs. Fix any
   entry that intersects your task instead of duplicating it.

For non-trivial work, also: [`/docs/feature-catalog.md`](../feature-catalog.md)
(scan the relevant section).

## Security / safety musts

- **Capability gates first.** Every Convex mutation/action that does paid
  external work, writes user data, or accesses cross-tenant resources must
  call `requireCap` / `requireProjectCreateCap` / `requireProjectUpdateCap`
  from `convex/lib/permissions.ts` **before** the side effect. Three audit
  passes (`docs/agent-memory/backend-migration-audit.md`) closed CRITICAL
  IDORs caused by missing gates.
- **No `.unique()` on `users by_clerk_user_id`.** Use `requireUserJIT` or
  `getUserByClerkIdSafe` (Clerk webhook can race).
- **No new tRPC routers.** Backend work goes into Convex.
- **No new Supabase migrations.** Schema lives in `convex/schema.ts`.
- **No `@codesandbox/sdk` calls in new code.** Vercel Sandbox only.
- **No secrets / tokens in code.** Add to `src/env.ts`; validate via
  `@t3-oss/env-nextjs`.
- **No `any` unless necessary.**

## "Done" bar

A task is not done until:

- relevant `bun typecheck` / `bun lint` / `bun test` / targeted validation
  has run
- migrations / config / env changes have been run OR clearly handed off in
  a `⚠️ MANUAL STEP REQUIRED` block
- docs updated when architecture or contracts shift
  ([`feature-catalog.md`](../feature-catalog.md) +
  [`test-plan.md`](../test-plan.md) for new feature surfaces, the matching
  `agent-context/*.md` for architectural shifts)
- code review of the session's changes performed (`/caveman-review` or
  equivalent), blocking issues fixed
- significant ship → entry appended to
  [`agent-memory/feature-log.md`](../agent-memory/feature-log.md), and to
  [`agent-memory/architecture-decisions.md`](../agent-memory/architecture-decisions.md)
  if architectural
- user-facing change → entry in `apps/web/client/src/lib/changelog-entries.ts`,
  and a blog post under `apps/web/client/content/blog/` if "very major"
- final answer lists files changed, validation status, manual steps, and a
  confidence note

## Currently disabled paths (do not "fix" without coordination)

- `project.fork`, `branch.fork`, `publish` — throw clear errors. Tracked
  as `TODO(sandbox-fork)` and `TODO(publish-vercel)`. Need a Vercel
  snapshot-based fork to land.
- Prompt-based create (hero AI input) — toasts `UNAVAILABLE_MESSAGE`.
  Tracked as `TODO(sandbox-port)`.
- GitHub-template imports — same `TODO(sandbox-port)`.

**Working create paths:** "Start blank" CTA (hero + dashboard) →
`api.projectActions.createBlank` → `scaffoldNextProject` /
`scaffoldStaticHtmlProject`.

## Sandbox runtime quick-ref

- Required env on Railway / locally: `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID`,
  `VERCEL_TOKEN`.
- Optional: `VERCEL_SANDBOX_TIMEOUT_MS`, `VERCEL_BLANK_SNAPSHOT_ID`,
  `WEBLAB_VERCEL_VCPUS`, `WEBLAB_VERCEL_WARM_POOL_SIZE`.
- Provider entry: `packages/code-provider/src/providers/vercel-sandbox/index.ts`.

## Convex deployment env vars (set on Convex, not `.env.local`)

- `CLERK_JWT_ISSUER_DOMAIN` — required, fails loud on `auth.config.ts` load.
- Stripe webhook secret + price IDs for billing.
- See `bunx convex env list` for current values; never log them.

## When something feels off

- **Convex looks broken** → check `bunx convex dev` is running locally and
  `auth.config.ts` env var is set on the deployment.
- **Clerk session loops** → look at `src/utils/auth/clerk-bridge.ts`
  console.error path; it loud-logs JWT-template misconfig.
- **Sandbox fails to provision** → check the Vercel env trio is set; the
  error toast usually quotes the missing variable.
- **Stuck redeployments** → `_createRedeployment` now respects a stale TTL
  in `convex/publishActionsDb.ts`; check `crons.ts` cleanup.

## Reference cheat sheet

- [Docs hub](../README.md)
- [Feature catalog](../feature-catalog.md) (source of truth on conflict)
- [Test plan](../test-plan.md)
- [Validate-feature prompt](../prompts/validate-feature.md)
- [Backlog](../../BACKLOG.md)
- [Agent memory](../agent-memory/)
- [Working notes](../notes/)
- [Convex AI guidelines](../../apps/web/client/convex/_generated/ai/guidelines.md)
- [Design system](../../apps/web/client/src/app/design-system/page.tsx) (run `/design-system` page)
