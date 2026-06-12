# Weblab Agent API Map & External-Agent Exposure Plan

> **Status:** Analysis / proposal only — **nothing implemented yet**.
> **Date:** 2026-06-12
> **Author:** Agent investigation (read-only sweep of repo).
> **Goal:** Map Weblab's API surface, auth model, and data model; decide the safest
> way to expose Weblab to external AI agents via an MCP server and/or a typed
> internal connector; propose a minimal secure v1.

Brand note: this product is **Weblab**. Any code written from this plan must import
`APP_NAME` from `@weblab/constants` — never hardcode the brand string.

---

## 0. TL;DR

- **Backend reality (2026-06-12):** Convex is the primary backend. The old
  `apps/web/client/src/server/api/` tRPC tree **no longer exists**. Live surfaces are:
  Convex `query`/`mutation`/`action` modules, a handful of Next.js REST route handlers
  under `src/app/api/`, and a **vestigial Fastify+tRPC `sandbox` router** on port 8080.
- **Auth reality:** Clerk is the sole identity provider. **Every** inbound call is gated
  by a Clerk JWT (template `convex`). There is **no API-key / personal-access-token /
  service-account / `x-api-key`** path anywhere. Supabase auth/storage is dead-stub.
- **File reality:** Project source files live in the **Vercel Sandbox filesystem**, not
  in Convex. Convex only stores references + render metadata. The browser keeps a ZenFS
  IndexedDB cache; that cache is **browser-only** and not server-callable.
- **Existing `@weblab/mcp`:** a **local, stdio, unauthenticated** dev-tool MCP that reads
  the *host* filesystem scoped to `WEBLAB_PROJECT_ROOT`. It is **not** wired to Convex,
  the sandbox, or any user/project identity, and is **not** used by the in-app AI. It is
  the wrong shape to expose to remote external agents — do not bolt remote auth onto it.
- **Decision:** Build **both**, layered. A new **typed internal connector**
  (`@weblab/agent-api`) is the single trust boundary that translates an **API key → Clerk
  identity → existing Convex `requireCap` calls**. A new **remote MCP server**
  (`@weblab/mcp-remote`) is a thin wrapper over that connector. This keeps Convex's
  Clerk-JWT trust boundary 100% intact (no `auth.config.ts` change) and reuses every
  existing capability gate — minimal blast radius, zero change to browser flows.
- **v1 tool set:** read-heavy + two low-risk writes (`create_project` blank-only,
  `send_chat_message`). Destructive/expensive tools (`write_file`, `bash`, `publish`,
  `delete_project`) are **gated behind an explicit opt-in scope** on the API key and are
  out of the default v1 grant.

---

## 1. Current API Map

### 1.1 Convex functions (primary backend) — `apps/web/client/convex/`

Auth: each function resolves `ctx.auth.getUserIdentity()` → `identity.subject` (Clerk
user id) → `users` row via `by_clerk_user_id`, then enforces a capability via
`convex/lib/permissions.ts` (`requireCap` / `requireProjectUpdateCap`). Functions
prefixed `_` are `internal*` and **not client-callable**.

#### Capability: create a project

| Function | Type | File:line | Key args | Cap |
|---|---|---|---|---|
| `projectActions.createBlank` | action | `convex/projectActions.ts:401` | `framework?`, `workspaceId?` | auth + `project.create` |
| `projectActions.createFromPrompt` | action | `convex/projectActions.ts:621` | `prompt`, `images?`, `framework?`, `workspaceId?` | auth + `project.create` |
| `projectActions.createFromGit` | action | `convex/projectActions.ts:501` | `repoUrl`, `branch?`, `subpath?`, `name?`, `framework?` | auth + `project.create` |
| `projectActions.createFromWebsiteClone` | action | `convex/projectActions.ts:793` | `url?`, `notes?`, `scrapeContent?`, `screenshot?`, `framework?` | auth + `project.create` |
| `projectActions.fork` | action | `convex/projectActions.ts:1212` | `projectId`, `name?`, `workspaceId?` | `project.view` + `project.create` (disabled on Vercel — `TODO(sandbox-fork)`) |
| `projects.create` | mutation | `convex/projects.ts:441` | `name`, `sandboxId`, `sandboxUrl`, `sandboxRuntime?`, … | `project.create` |

Recommended agent path: `createBlank({ framework: 'nextjs' })` → `{ projectId }`; sandbox
provisions async. Poll `projects.getEditorBootstrap` until
`branches[0].runtimeMetadata.cloud.previewUrl` is non-empty and `creationRequest` is null.

#### Capability: read project + metadata + list

| Function | Type | File:line | Args | Cap |
|---|---|---|---|---|
| `projects.list` | query | `convex/projects.ts:106` | `limit?`, `excludeProjectId?`, `workspaceId?` | auth (`[]` if anon) |
| `projects.get` | query | `convex/projects.ts:179` | `projectId` | `project.view` |
| `projects.getEditorBootstrap` | query | `convex/projects.ts:192` | `projectId` | `project.view` — bundles project+branches+frames+canvas+conversations+creationRequest |
| `projects.hasAccess` | query | `convex/projects.ts:90` | `projectId` | none (bool) |
| `projects.listAccess` | query | `convex/projects.ts:335` | `projectId` | `project.view` |
| `projectSettings.get` | query | `convex/projectSettings.ts:8` | `projectId` | `project.view` |

#### Capability: read pages / frames (a "page" == a frame URL path)

| Function | Type | File:line | Args | Cap |
|---|---|---|---|---|
| `branches.getByProjectId` | query | `convex/branches.ts:18` | `projectId`, `onlyDefault?` | `project.view` — branches each with nested `frames[]` |
| `frames.getByCanvas` | query | `convex/frames.ts:58` | `canvasId` | `project.view` |
| `frames.get` | query | `convex/frames.ts:40` | `frameId` | `project.view` |

#### Capability: AI generation / chat persistence

The **actual generation runs over HTTP** at `POST /api/chat` (below). Convex stores the
conversation around the round-trip:

| Function | Type | File:line | Args | Cap |
|---|---|---|---|---|
| `conversations.upsert` | mutation | `convex/conversations.ts:47` | `id?`, `projectId`, `agentType?`, … | `project.use_ai` |
| `conversations.list` | query | `convex/conversations.ts:21` | `projectId` | `project.view` |
| `messages.listByConversation` | query | `convex/messages.ts:71` | `conversationId` | `project.view` |
| `messages.upsert` | mutation | `convex/messages.ts:84` | `message{...}` | `project.use_ai` |
| `chatActions.generateTitle` | action | `convex/chatActions.ts:63` | `conversationId`, `content` | auth |

#### Capability: status / errors / usage / deploy

| Function | Type | File:line | Args | Cap |
|---|---|---|---|---|
| `projectActions.checkSandboxLiveness` | action | `convex/projectActions.ts:1031` | `branchId`, `previewUrl` | resolves owner — returns `{state:'alive'\|'gone'\|'notFound'\|'error'}` |
| `projectActions.restoreSandbox` | action | `convex/projectActions.ts:1068` | `projectId`, `branchId` | wakes sleeping sandbox from snapshot |
| `deployments.list` | query | `convex/deployments.ts:32` | `projectId`, `limit?` | `project.view` |
| `deployments.getByType` | query | `convex/deployments.ts:15` | `projectId`, `type` | `project.view` |
| `publishActions.run` | action | `convex/publishActions.ts:52` | `deploymentId` | `project.publish` (disabled on Vercel — `TODO(publish-vercel)`) |
| `usage.get` | query | `convex/usage.ts:139` | — | caller's daily+monthly usage |
| `usage.tier` | query | `convex/usage.ts:165` | — | `free`/`free-heavy`/`pro`/`pro-heavy` |
| `aiUsageEvents.conversationTotals` | query | `convex/aiUsageEvents.ts:235` | `conversationId` | token/cost totals |

Capability gates (`convex/lib/permissions.ts:169`): `project.view`, `project.update`,
`project.use_ai`, `project.publish`, `project.deploy`, `project.create`, `project.delete`,
`project.invite`, `project.manage_access_mode`, `project.manage_settings`. Admin functions
(`aiUsageEvents.listAdmin/aggregateAdmin`) gate on `WEBLAB_ADMIN_EMAILS`.

### 1.2 REST route handlers — `apps/web/client/src/app/api/`

| Route | Method | File:line | Auth | Purpose |
|---|---|---|---|---|
| `/api/chat` | POST | `chat/route.ts:182` | Clerk → Convex `project.view`; usage-metered | **Streaming AI generation** (edit/plan/chat) |
| `/api/chat/summarize` | POST | `chat/summarize/route.ts:68` | Clerk → Convex | Background conversation summary |
| `/api/ai/inline-edit` | POST | `ai/inline-edit/route.ts:91` | Clerk → Convex `project.view` | Streaming inline code edit |
| `/api/ai/tab-complete` | POST | `ai/tab-complete/route.ts:75` | Clerk → Convex | Tab completion (429 on limit) |
| `/api/ai/terminal-command` | POST | `ai/terminal-command/route.ts:37` | Clerk → Convex | NL → shell command |
| `/api/chat-images/[id]` | GET | `chat-images/[id]/route.ts:16` | Clerk; per-user isolation | Serve AI images (30-min cache) |
| `/api/transcribe` | POST | `transcribe/route.ts:22` | Clerk; 10 req/min/user | Audio → text (Whisper) |
| `/api/models/local` | GET | `models/local/route.ts:44` | Clerk; SSRF guard (loopback only) | List local Ollama models |
| `/api/promo-resume` | GET | `promo-resume/route.ts:23` | Clerk | Post-login Stripe checkout |
| `/api/download/[platform]` | GET | `download/[platform]/route.ts:26` | **public** | Redirect to desktop release |
| `/api/email-capture` | POST | `email-capture/route.ts:5` | **public** | Forward landing form to n8n |
| `/api/health` | GET | `health/route.ts:3` | **public** | Liveness |

Middleware (`src/middleware.ts`) runs `clerkMiddleware` globally and **bypasses**
`/api/trpc`, `/api/chat`, `/api/ai`, `/api/chat-images`, `/api/health` (each self-auths).
Catalog cross-ref: F-470…F-480.

### 1.3 Vestigial tRPC — Fastify, port 8080 — `apps/web/server/src/router/`

Only the `sandbox` router remains (`components` router deleted 2026-06-12 / F-501). Client:
`apps/web/client/src/lib/sandbox-server-client.ts:82`. Auth: Clerk JWT from WS
`connectionParams.token` via JWKS → `requireUserId(ctx)` (`router/context.ts:140`).

| Procedure | Type | Input | Auth | Notes |
|---|---|---|---|---|
| `sandbox.create/start/stop/status` | — | `string` | none | **inert stubs** |
| `sandbox.fileList/fileRead/fileStat` | query | `{sandboxId, path}` | `requireUserId` | sandbox FS read |
| `sandbox.fileWrite/fileDelete/fileMkdir` | mutation | `{sandboxId, path, …}` | `requireUserId` | sandbox FS write |
| `sandbox.commandRun` | mutation | `{sandboxId, command}` | `requireUserId` | `bash -lc` in `/vercel/sandbox` |
| `sandbox.setup` | mutation | `{sandboxId, port?, devCommand?}` | `requireUserId` | install + spawn dev server + 90s port poll |

Source: `apps/web/server/src/router/routes/sandbox.ts:17`. **Do not extend this tree** —
it is a deprecated proxy onto the Vercel Sandbox SDK. Catalog: F-500.

### 1.4 Auth / session / identity model

- **Clerk = sole IdP.** Client: `ClerkProvider` → `ConvexProviderWithClerk`
  (`src/components/clerk-convex-providers.tsx`) auto-attaches Clerk JWT to every Convex
  WS call. Server: `auth()` → `getToken({ template: 'convex' })`
  (`src/utils/auth/clerk-bridge.ts:40`) → passed as `{ token }` to `convex/nextjs`
  `fetchQuery/fetchMutation/fetchAction`.
- **Convex trust boundary:** `convex/auth.config.ts` verifies Clerk JWTs via
  `CLERK_JWT_ISSUER_DOMAIN` (a **Convex deployment** env var, not Next.js `.env.local`).
  Template must be named `convex`.
- **Webhooks** (`convex/http.ts:17`): `POST /clerk-webhook` (Svix `CLERK_WEBHOOK_SECRET`)
  and `POST /webhooks/stripe` (HMAC `STRIPE_WEBHOOK_SECRET`). Handlers are
  `internalMutation` (`convex/clerkWebhooks.ts:15`).
- **Supabase:** dead-stub (`src/utils/supabase/client/index.ts` throws). `SUPABASE_*` vars
  retained optional for emergency rollback only.
- **No machine auth exists.** grep for `apiKey`/`x-api-key`/`personalAccessToken`/`Bearer`
  surfaced only: `providerConnections` (users' *outbound* OAuth tokens, encrypted),
  Figma PAT pass-through, CMS source credentials, and the n8n outbound secret. **None** is
  an inbound credential for calling Weblab itself.

### 1.5 Data model (the parts an agent reads) — `apps/web/client/convex/schema.ts`

```
users ─┬─ userSettings
       ├─ workspaces ─ workspaceMembers
       └─ projects ─┬─ projectMembers
                    ├─ projectSettings (run/build/install commands)
                    ├─ projectCreateRequests (replay prompt on first open)
                    ├─ canvases ─ frames   ← "pages" (frame.url = sandbox path)
                    ├─ branches (runtimeMetadata.cloud.{sandboxId,previewUrl,snapshotId,port})
                    ├─ conversations ─ messages   ← chat turns only, no file content
                    ├─ deployments (status,urls,buildLog,error)
                    └─ pageAccess (per-URL public/password)
usageRecords / rateLimits / aiUsageEvents   ← metering (counts/cost, no prompt text)
```

**Critical:** no table stores file/component source. Source is in the Vercel Sandbox FS;
`branches.runtimeMetadata.cloud.sandboxId` is the handle. "Components" are discovered by
an AST pass over sandbox files (F-788), not stored relationally.

### 1.6 Existing `@weblab/mcp` — `packages/mcp/`

- stdio transport only (`src/server.ts:141`); MCP SDK `^1.29.0`; bin `weblab-mcp`.
- Tools (8): `read_file`, `list_files`, `grep`, `glob`, `typecheck`, `write_file`,
  `search_replace`, `bash`. Resource (1): `weblab://project` (package.json name + git
  branch + top-level file tree).
- Reads the **host** filesystem under `WEBLAB_PROJECT_ROOT` via `fs/promises`. **No**
  Convex, **no** sandbox SDK, **no** identity — only a path-containment check. Whoever
  spawns the process owns the whole root.
- Registered once, in this repo's `.claude/settings.json`, for **dev-time coding agents**.
  Not consumed by the in-app AI (that pipeline has its own tool classes in
  `packages/ai/src/tools/classes/`). Catalog: F-693.

→ This is a *local IDE helper*, not a multi-tenant product API. Reuse its tool *shapes*
and path-guard helper, but **not** its process/auth model, for remote exposure.

---

## 2. What an external agent needs (capability checklist)

| Need | Available today? | Path |
|---|---|---|
| Create project | Yes | `projectActions.createBlank` / `createFromPrompt` (Convex action) |
| Read project metadata | Yes | `projects.get` / `getEditorBootstrap` (Convex query) |
| List user's projects | Yes | `projects.list` (Convex query) |
| Inspect pages | Yes | `branches.getByProjectId` → frames (Convex query) |
| Inspect components | Partial | AST pass over sandbox files (no stored relation); needs sandbox FS read |
| Inspect files | Yes (server) | `sandbox.fileRead/fileList` tRPC, **or** `@weblab/code-provider` `VercelSandboxProvider.readFile` directly server-side |
| Trigger generation | Yes | `POST /api/chat` (HTTP, SSE stream) |
| Observe generation | Yes (stream) | `/api/chat` SSE; persisted to `messages` |
| Read build/run errors | Partial | `checkSandboxLiveness` (action); dev log tail via `sandbox.commandRun('tail /tmp/weblab-dev.log')`. **Structured** error overlay (`ErrorManager`) is browser-only MobX — not server-callable |
| Read status/usage | Yes | `deployments.list`, `usage.get`, `aiUsageEvents.conversationTotals` |

Gaps for a clean agent API: (a) no server-callable **structured** error feed (only log
tail), (b) component inspection requires a sandbox FS read + AST parse, (c) **no inbound
auth that isn't a Clerk user session.**

---

## 3. Architecture decision: connector + MCP wrapper (both)

**Chosen:** a typed internal connector as the trust boundary, with a thin remote MCP
server on top.

```
External agent (Claude Desktop / Cursor / custom)
        │  MCP over Streamable HTTP, header: Authorization: Bearer wlk_…
        ▼
@weblab/mcp-remote      ← thin: declares tools, validates inputs (zod), maps to connector
        │  in-process function calls
        ▼
@weblab/agent-api       ← TRUST BOUNDARY: apiKey → Clerk identity → scope check
        │                  (hash-lookup key in Convex; mint Clerk token for owner)
        ├── Convex (fetchQuery/fetchMutation/fetchAction with minted `convex` JWT)
        └── Vercel Sandbox (VercelSandboxProvider, server creds) for file/exec ops
```

**Why both, not one:**

- A **typed connector** is needed regardless — it centralizes API-key validation, scope
  enforcement, rate limiting, audit logging, and the API-key → Clerk-identity exchange in
  one place. Without it, every transport (MCP, future REST, future webhook) re-implements
  auth and drifts.
- The **MCP server** is then trivial and stateless — it only declares tools and forwards
  to the connector. We can later add a REST facade or a second transport over the *same*
  connector with no auth duplication.

**Why not reuse `@weblab/mcp`:** wrong process model (host fs, stdio, no identity). Bolting
multi-tenant auth + Convex + sandbox onto it would fork it badly and risk the dev-tool
flow. Keep it as the local IDE helper; build the remote one fresh.

**Why not a new Convex auth provider for API keys:** that touches `auth.config.ts` and the
Convex JWT trust boundary — high blast radius, risks every browser session. Translating
the key to a Clerk identity *outside* Convex keeps the existing gate untouched and reuses
every `requireCap` for free.

**Hosting:** `@weblab/mcp-remote` runs as a route handler inside the existing Next.js app
on Railway (e.g. `src/app/api/mcp/[transport]/route.ts` using the MCP SDK's Streamable-HTTP
server transport). No new deployable. It is added to the middleware bypass list and
self-authenticates via the connector.

---

## 4. Minimal secure v1 tool set

Default grant = **read + two low-risk writes**. Everything destructive/expensive requires
an explicit scope flag on the key and is **off by default**.

| Tool | Scope | Connector → backend | Risk |
|---|---|---|---|
| `list_projects` | `projects:read` | `projects.list` | low |
| `get_project` | `projects:read` | `projects.getEditorBootstrap` | low |
| `list_pages` | `projects:read` | `branches.getByProjectId` → frames | low |
| `read_file` | `files:read` | `VercelSandboxProvider.readFile` (path-guarded) | low |
| `list_files` | `files:read` | `VercelSandboxProvider.listFiles` | low |
| `get_status` | `projects:read` | `checkSandboxLiveness` + `deployments.getByType` | low |
| `get_usage` | `projects:read` | `usage.get` / `aiUsageEvents.conversationTotals` | low |
| `create_project` | `projects:write` | `projectActions.createBlank` (blank only; prompt variant behind same scope) | medium (quota) |
| `send_chat_message` | `ai:generate` | `POST /api/chat` proxied with minted token | medium (cost/quota) |
| **`write_file`** | `files:write` *(opt-in)* | sandbox write | **high** — off by default |
| **`run_command`** | `exec` *(opt-in, confirm)* | `sandbox.commandRun` | **high** — off by default |
| **`publish`** | `deploy` *(opt-in, confirm)* | `publishActions.run` | **high** + currently disabled on Vercel |
| **`delete_project`** | `projects:delete` *(opt-in, confirm)* | `projects.remove` | **high** — off by default |

Guards baked into the connector for every tool: caller scope ∈ key scopes; project
ownership via existing `requireCap`; path-containment for file tools (reuse `_path.ts`
shape from `@weblab/mcp`); per-key rate limit; usage metering reuses `usage.increment`.

---

## 5. Auth approach

Principle: **never use a personal browser session cookie.** A dedicated agent identity +
scoped, revocable API keys, exchanged server-side for a Clerk identity.

1. **Dedicated agent test account.** Create a real Clerk user `agent-tests@weblab.build`
   (or a `weblab.build` alias) with its own workspace. All v1 integration/e2e agent calls
   run as this user — no human's session is ever used. (Contact-email rule applies to
   published metadata, not this internal test identity.)

2. **Scoped API keys (`wlk_…`).** New Convex table `apiKeys`:
   `{ userId, name, hashedKey (sha-256), prefix, scopes: string[], projectId?: Id<'projects'>,
   expiresAt?, lastUsedAt?, revokedAt? }`. The raw key is shown **once** at creation; only
   the hash is stored. Optional `projectId` pins a key to a single project (recommended for
   external agents). Scopes are the v1 list in §4.

3. **Key → identity exchange (the trust translation).** On each MCP request the connector:
   (a) parses `Authorization: Bearer wlk_…`, (b) hashes and looks the key up via a Convex
   `internalQuery` reachable only through a server-side shared-secret HTTP action (so the
   key table is never client-exposed), (c) checks `revokedAt`/`expiresAt`/scope, (d) resolves
   the owning Clerk user and **mints a short-lived `convex`-template token for that user via
   the Clerk Backend API** (`CLERK_SECRET_KEY`), (e) calls Convex with that token so every
   existing `requireCap` runs unchanged. Sandbox file/exec ops use the server Vercel creds
   scoped to the resolved project's `sandboxId`.

4. **No Convex `auth.config.ts` change.** The Clerk-JWT boundary is preserved; the API key
   is purely an *outer* credential the connector unwraps into the existing identity.

5. **Defense in depth:** keys are hashed-at-rest, prefixed for display, revocable instantly,
   scoped, optionally project-pinned, expiry-capped, rate-limited per key, and every call is
   audit-logged (key prefix, tool, project, outcome). Destructive scopes require explicit
   grant; `run_command`/`publish`/`delete_project` additionally require a per-call
   `confirm: true` argument.

---

## 6. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Clerk Backend token minting** may not support a frictionless M2M→`convex`-JWT path; could need Clerk M2M/actor-token feature. | Spike this first (§7 step 0). Fallback: dedicated Convex HTTP action that accepts the shared secret + resolved `userId` and runs the work as that user via `internal*` mutations — bypasses JWT minting entirely while keeping the cap checks. |
| R2 | **API-key leakage** = full account access within scope. | Hash-at-rest, one-time reveal, project-pinning, short expiry, instant revoke, per-key rate limit, audit log. Default scopes are read-only. |
| R3 | **`bash`/`run_command` RCE** in the sandbox. | Off by default (`exec` scope), per-call `confirm`, cwd path-guard, output caps, timeout. Sandbox is already an isolated Firecracker VM (blast radius bounded to the user's own project). |
| R4 | **Quota/cost abuse** via `send_chat_message`/`create_project`. | Reuse `usage.increment`/`checkMessageLimit`; per-key rate limit; agent test account on a capped tier. |
| R5 | **IDOR** if the connector forgets a cap check. | Always route through Convex `requireCap`; never query tables directly from the connector. Add a connector-level test asserting every tool calls a gated function. |
| R6 | **Sandbox-disabled features** (`fork`, `publish`) error today on Vercel (`TODO(sandbox-fork)`, `TODO(publish-vercel)`). | Exclude `publish`/`fork` tools from v1; surface the existing clear error if invoked. |
| R7 | **No structured server-side error feed** — only dev-log tail. | v1 `get_status` returns liveness + deployment status + log tail. A structured error endpoint is a follow-up (see §7 / BACKLOG). |
| R8 | **Breaking browser flows.** | Connector and MCP are *additive*; no change to `auth.config.ts`, middleware (only a bypass *addition* for `/api/mcp`), or existing routes. Existing Clerk/Convex path untouched. |
| R9 | **MCP SDK version drift** vs `@weblab/mcp` (`^1.29.0`). | Pin `@weblab/mcp-remote` to the same SDK major; share zod schemas where possible. |

---

## 7. Implementation plan (do **not** implement yet)

> Bun only (`bun add`, `bun test`). No `any` — type every connector boundary with shared
> types from `@weblab/types`/`@weblab/models`. Import `APP_NAME` from `@weblab/constants`
> for any server identity/UA string. Validate all tool inputs with zod.

**Step 0 — Auth spike (blocking).** Confirm the Clerk-Backend → `convex`-JWT minting path
(R1). If unviable, adopt the shared-secret Convex HTTP-action fallback. Output: a 1-page
note appended here. *No app code yet.*

**Step 1 — API-key data layer (Convex).**
- `apps/web/client/convex/schema.ts` — add `apiKeys` table + `by_hashed_key`,
  `by_user` indexes.
- `apps/web/client/convex/apiKeys.ts` — `create` (mutation, returns raw key once),
  `list`, `revoke` (mutations, `requireUser`), and `_resolveByHash` (`internalQuery`).
- `apps/web/client/convex/http.ts` — add an `httpAction` `POST /agent/resolve-key` gated by
  a server shared secret that calls `_resolveByHash` (keeps the key table off the client).
- Validation: `bun --filter @weblab/web-client typecheck`; add
  `convex/apiKeys.test.ts` (first unit test in `convex/` — see memory
  `project_convex_validation_2026_05_28`).

**Step 2 — Typed connector package `@weblab/agent-api`.**
- `packages/agent-api/package.json` (private, deps: `@weblab/types`, `@weblab/models`,
  `@weblab/code-provider`, `convex`, `zod`, Clerk backend SDK).
- `packages/agent-api/src/auth.ts` — `resolveApiKey(rawKey) → { user, scopes, projectId }`
  and `mintConvexToken(user)` (or fallback).
- `packages/agent-api/src/client.ts` — `WeblabAgentConnector` exposing typed methods:
  `listProjects`, `getProject`, `listPages`, `readFile`, `listFiles`, `getStatus`,
  `getUsage`, `createProject`, `sendChatMessage`, plus scope-gated `writeFile`,
  `runCommand`. Each enforces scope, then calls Convex (gated) or the sandbox provider.
- `packages/agent-api/src/paths.ts` — port the path-containment guard from
  `packages/mcp/src/tools/_path.ts`.
- Validation: `bun --filter @weblab/agent-api test` (unit tests per method with a mocked
  Convex client; assert scope rejection + cap routing).

**Step 3 — Remote MCP server `@weblab/mcp-remote`.**
- `packages/mcp-remote/package.json` (`@modelcontextprotocol/sdk@^1.29.0`, `zod`,
  `@weblab/agent-api`).
- `packages/mcp-remote/src/server.ts` — declare the §4 tools (zod input schemas), each
  forwarding to one connector method. No business logic here.
- `apps/web/client/src/app/api/mcp/[transport]/route.ts` — Next.js route handler hosting the
  SDK Streamable-HTTP transport; reads `Authorization` header → connector.
- `apps/web/client/src/middleware.ts` — add `/api/mcp` to the bypass list (self-auths).
- Validation: `bun --filter @weblab/web-client typecheck`; manual MCP client smoke as the
  agent test account (documented, not in CI for v1).

**Step 4 — Agent test account + scoped key.**
- Create Clerk user + workspace (manual, document the steps — Clerk dashboard is an
  external-credential blocker per CLAUDE.md).
- Mint a read-only project-pinned key for e2e; store in CI secrets, never in repo.

**Step 5 — Docs / catalog discipline.**
- `docs/feature-catalog.md` — add F-IDs: `apiKeys` table + module, `@weblab/agent-api`,
  `@weblab/mcp-remote`, `/api/mcp` route; Change Log entry.
- `docs/test-plan.md` — `T-XXX` rows for key lifecycle, scope rejection, tool→cap routing.
- `docs/agent-memory/feature-log.md` + `architecture-decisions.md` — record the
  connector-as-trust-boundary decision.
- `BACKLOG.md` — log follow-ups: structured server-side error feed (R7), `publish`/`fork`
  tools once `TODO(sandbox-fork)`/`TODO(publish-vercel)` land (R6), key-rotation UI.
- Changelog entry (`apps/web/client/src/lib/changelog-entries.ts`) when v1 ships.

**Exact files to create/change (summary):**

| Action | Path |
|---|---|
| Edit | `apps/web/client/convex/schema.ts` (add `apiKeys`) |
| Create | `apps/web/client/convex/apiKeys.ts` |
| Edit | `apps/web/client/convex/http.ts` (resolve-key action) |
| Create | `apps/web/client/convex/apiKeys.test.ts` |
| Create | `packages/agent-api/{package.json,tsconfig.json,src/{auth,client,paths,index}.ts,test/*}` |
| Create | `packages/mcp-remote/{package.json,tsconfig.json,src/server.ts}` |
| Create | `apps/web/client/src/app/api/mcp/[transport]/route.ts` |
| Edit | `apps/web/client/src/middleware.ts` (bypass `/api/mcp`) |
| Edit | `docs/feature-catalog.md`, `docs/test-plan.md`, `docs/agent-memory/*`, `BACKLOG.md` |

---

## 8. Open questions for the owner

1. **v1 surface:** read-only + `create_project` + `send_chat_message` (recommended), or
   include `write_file`/`run_command` behind opt-in scopes from day one?
2. **Hosting:** in-app Next.js route on Railway (recommended, no new deploy) vs a standalone
   MCP service?
3. **Audience:** internal automation/test agents only (v1) vs public "Connect Weblab to your
   agent" for end users (changes the key-management UX surface)?
4. **Clerk plan:** does the current Clerk plan support Backend token minting / M2M (R1)? If
   not, we take the shared-secret Convex-action fallback.
