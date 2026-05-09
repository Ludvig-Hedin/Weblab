# tRPC Routers Reference

Complete map of every tRPC router currently exported from
`apps/web/client/src/server/api/root.ts`. Read this before adding API endpoints
to avoid duplicating an existing router or namespace collision.

> **Total: 21 routers** registered in `appRouter`. All routers must be added to
> `root.ts` or they are unreachable from the client.

## Registration

Source of truth: `apps/web/client/src/server/api/root.ts`

```ts
export const appRouter = createTRPCRouter({
    sandbox, user, invitation, project, provider, branch, settings,
    chat, cms, comment, figma, frame, userCanvas, utils, member,
    domain, github, subscription, usage, publish, forward,
});
```

The barrel `routers/index.ts` re-exports the file-level routers; the
`project/*` and `user/*` sub-routers are imported directly by their full path
in `root.ts`.

## Router Catalog

### Core Auth / Identity

| Router | File | Purpose |
|--------|------|---------|
| `user` | `routers/user/` | Auth, profile, user settings (nested) |
| `userCanvas` | `routers/user/user-canvas.ts` | User canvas defaults (zoom, pan, viewport) |
| `invitation` | `routers/project/invitation.ts` | Team invitation lifecycle |
| `member` | `routers/project/member.ts` | Project membership, roles, removal |

### Project Lifecycle

| Router | File | Purpose |
|--------|------|---------|
| `project` | `routers/project/` | Project CRUD, list, ownership |
| `branch` | `routers/project/branch.ts` | Branch versions and history |
| `settings` | `routers/project/settings.ts` | Project + user settings |
| `frame` | `routers/project/frame.ts` | Iframe-based preview frames; **includes new `breakpoints` field (migration 0029)** |

### AI & Chat

| Router | File | Purpose |
|--------|------|---------|
| `chat` | `routers/chat/` | AI conversation root with nested: `conversation`, `message`, `suggestion` |

### Collaboration

| Router | File | Purpose |
|--------|------|---------|
| `comment` | `routers/comment/` | Inline canvas annotations (X/Y, element selector, author); nested `reply` |

### Code & CMS

| Router | File | Purpose |
|--------|------|---------|
| `utils` | `routers/code.ts` | Utility/code endpoints (note: exported as `utilsRouter` from this file) |
| `cms` | `routers/cms/` | **NEW** — CMS adapters (content sources, block bindings, preview) |

### Integrations

| Router | File | Purpose |
|--------|------|---------|
| `figma` | `routers/figma.ts` | Figma import + selection sync |
| `github` | `routers/github.ts` | Repo import, sync, commits, OAuth |
| `provider` | `routers/provider.ts` | OAuth provider connection management (GitHub, Figma, Google, etc.) |
| `image` | `routers/image.ts` | Image upload, processing, OG generation |

> Note: `image` is exported in `routers/index.ts` but **not currently
> registered in `root.ts`**. If client code needs image endpoints, add it to
> `root.ts`.

### Runtime / Hosting

| Router | File | Purpose |
|--------|------|---------|
| `sandbox` | `routers/project/sandbox.ts` | CodeSandbox / runtime provider lifecycle |
| `domain` | `routers/domain/` | Custom domain attach, verify, DNS |
| `publish` | `routers/publish/` | Deployment to hosting (Freestyle), publish history |

### Billing / Usage

| Router | File | Purpose |
|--------|------|---------|
| `subscription` | `routers/subscription/` | Stripe subscription tier, status, portal URL |
| `usage` | `routers/usage/` | AI token usage, rate limits, plan caps |

### Editor / Misc

| Router | File | Purpose |
|--------|------|---------|
| `forward` | `routers/forward/` (`editorForwardRouter`) | Forwards editor-initiated requests to external APIs (avoids CORS / hides keys) |

## Adding a New Router

1. Create `routers/<name>/index.ts` (or `routers/<name>.ts` for a single
   file). For project-scoped sub-routers, place under `routers/project/` or
   `routers/user/`.
2. Export the router with `createTRPCRouter` from `~/server/api/trpc`.
3. Add the export to `routers/index.ts` if it's a top-level file router.
4. **Add it to `root.ts` under `createTRPCRouter({ ... })`** — this is the
   most common omission. Sub-routers in `project/` or `user/` need to be
   imported by full path in `root.ts`.
5. Use `protectedProcedure` for anything that requires auth; `publicProcedure`
   only for genuinely public endpoints (health, auth callbacks).
6. Validate inputs with `zod`. Never trust client-side filtering of project
   ownership — always check membership in the procedure body.
7. Return plain serializable objects/arrays. SuperJSON handles the wire
   format.

## Procedures: `protectedProcedure` vs `publicProcedure`

- `publicProcedure`: anyone can call. Use only for unauthenticated endpoints.
- `protectedProcedure`: requires Supabase session. Resolves `ctx.user`.
- **Always** add a project-membership check inside any procedure that touches
  project data. The auth check alone is not enough — a logged-in user may not
  be a member of the project they're querying.

## Common Pitfalls

- Forgetting to add the router to `root.ts` (endpoint silently missing).
- Returning a Drizzle row containing non-serializable values (`Date` is fine
  via SuperJSON, but custom class instances are not).
- Performing auth in a Higher-Order helper instead of close to the procedure —
  makes future audits hard.
- Creating a new router that duplicates an existing concept (e.g. a new
  `comments-v2` instead of extending `comment`).
- Confusing `code.ts` (which exports `utilsRouter`) with a `code` router —
  there is no top-level `code` router currently.
