# Weblab — Database & API Reference

## tRPC (21 routers)

All registered in `apps/web/client/src/server/api/root.ts`.

### By category

**Auth / Identity**
- `user` — auth, profile, user settings; nested at `routers/user/`
- `userCanvas` — viewport/zoom state; `routers/user/user-canvas.ts`
- `invitation` — team invite lifecycle; `routers/project/invitation.ts`
- `member` — project membership + roles; `routers/project/member.ts`

**Project lifecycle**
- `project` — CRUD, list, ownership; `routers/project/`
- `branch` — versions, history; `routers/project/branch.ts`
- `settings` — project + user settings; `routers/project/settings.ts`
- `frame` — iframe frames, **NEW: breakpoints**; `routers/project/frame.ts`
- `sandbox` — CodeSandbox runtime lifecycle; `routers/project/sandbox.ts`

**AI & Chat**
- `chat` — conversations, messages, suggestions; `routers/chat/`

**Collaboration**
- `comment` — canvas annotations + replies; `routers/comment/`

**CMS (NEW)**
- `cms` — sources, collections, items, bindings, sync, snapshot; `routers/cms/`

**Integrations**
- `figma` — design import; `routers/figma.ts`
- `github` — repo import/sync/commits; `routers/github.ts`
- `provider` — OAuth token management; `routers/provider.ts`
- `image` — image upload/processing; `routers/image.ts` *(exported but NOT yet in root.ts)*

**Runtime / Hosting**
- `domain` — custom domain attach/verify; `routers/domain/`
- `publish` — deploy to Freestyle; `routers/publish/`

**Billing**
- `subscription` — Stripe tier/status; `routers/subscription/`
- `usage` — token usage + rate limits; `routers/usage/`

**Misc**
- `utils` — misc utilities; exported as `utilsRouter` from `routers/code.ts`
- `forward` — proxy editor requests to external APIs; `routers/forward/`

### Add a new router
1. Create `routers/<name>/index.ts`
2. Export from `routers/index.ts`
3. **Register in `root.ts`** (most common omission)
4. For project-scoped sub-routers: place in `routers/project/`, import by full path in `root.ts`

### Procedure rules
- `publicProcedure` — unauthenticated only
- `protectedProcedure` — requires Supabase session (`ctx.user`)
- **Always check project membership** inside project-data procedures
- Validate inputs with Zod. Return plain serializable objects.

---

## Database schema

Source: `packages/db/src/schema/**`
Migrations: `apps/backend/supabase/migrations/` (latest: `0029_frame_breakpoints.sql`)

### Core tables

| Table | Purpose |
|-------|---------|
| `users` | User accounts (mirrors Supabase auth) |
| `projects` | Projects |
| `user_projects` | Project membership (user ↔ project, with role) |
| `branches` | Project branches/versions + runtime mode |
| `canvases` | Design canvas metadata |
| `frames` | iframe preview frames + **NEW: breakpoint metadata** |
| `project_settings` | Per-project config |
| `user_settings` | Per-user preferences |

### AI / Content

| Table | Purpose |
|-------|---------|
| `conversations` | AI chat history per project/branch |
| `messages` | Chat messages (user + assistant turns) |

### Collaboration

| Table | Purpose |
|-------|---------|
| `project_comments` | Canvas annotations (X/Y coords, element selector, author) |
| `comment_replies` | Nested reply threads |

### CMS (NEW)

| Table | Purpose |
|-------|---------|
| `cms_source` | External source connection (Payload, Strapi, REST, etc.) |
| `cms_collection` | Content collection per source |
| `cms_item` | Individual content items |
| `cms_binding` | Canvas element ↔ CMS field binding |

### Billing

| Table | Purpose |
|-------|---------|
| `subscriptions` | Stripe subscription state |
| `products` + `prices` | Stripe catalog |
| `rate_limits` | AI token usage per user/plan |

### Auth

| Table | Purpose |
|-------|---------|
| `user_provider_connections` | Encrypted OAuth tokens (GitHub, Figma, etc.) |

All tables have **RLS policies** enforcing user/project membership.

---

## Drizzle / migration workflow

When persisted shape changes, update ALL of these in order:

1. `packages/db/src/schema/` — Drizzle schema
2. `apps/backend/supabase/migrations/` — SQL migration file (match Supabase format)
3. `packages/db/src/mappers/` — mapper functions
4. `packages/db/src/defaults/` — default factory functions
5. `packages/models/src/` — shared model TypeScript types
6. tRPC router input/output
7. UI consumers
8. `bun db:push` — apply to local dev DB
9. Document in `docs/agent-context/development-setup.md` if the migration is notable

---

## Supabase clients

| Context | Import |
|---------|--------|
| Server components, actions, route handlers | `src/utils/supabase/server.ts` |
| Client components | `src/utils/supabase/client/index.ts` |
| Server-only admin ops | `src/utils/supabase/admin.ts` |
| Middleware | `src/utils/supabase/middleware.ts` |

Never import server-only clients into client components.

---

## Environment variables

Schema: `apps/web/client/src/env.ts`

**Required for full functionality:**
- `CSB_API_KEY` — CodeSandbox
- `OPENROUTER_API_KEY` — AI routing
- `SUPABASE_URL`, `SUPABASE_DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SITE_URL` — OAuth redirects

**Optional (features degrade gracefully):**
- Stripe: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- Freestyle: `FREESTYLE_API_KEY`
- GitHub App: `GITHUB_APP_*`
- Figma: `FIGMA_CLIENT_ID/SECRET`
- AI extras: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `MORPH_API_KEY`, `RELACE_API_KEY`
- Analytics: `NEXT_PUBLIC_POSTHOG_KEY`, `LANGFUSE_*`, `GLEAP_API_KEY`
- CMS: `CMS_SOURCE_ENCRYPTION_KEY` (base64 32-byte AES key)
- Search: `FIRECRAWL_API_KEY`, `EXA_API_KEY`
