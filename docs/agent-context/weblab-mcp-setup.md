# Weblab Agent MCP — Setup & Usage

> v1 read-first agent API + MCP server. Lets Claude Code (and any MCP client)
> inspect Weblab projects **without a browser session**. Design rationale:
> [weblab-agent-api-map.md](weblab-agent-api-map.md).

## What it is

Two pieces:

1. **Convex agent API** — token-authenticated HTTP endpoints on the Convex HTTP
   router (`https://<deployment>.convex.site/agent/*`). Source:
   [apps/web/client/convex/agentApi.ts](../../apps/web/client/convex/agentApi.ts),
   routes registered in [convex/http.ts](../../apps/web/client/convex/http.ts).
   Bypasses Next.js + Clerk entirely — the browser auth path is untouched.
2. **MCP server** — a local stdio process Claude Code spawns. It calls the
   Convex agent API with a Bearer token. Source:
   [packages/mcp/src/agent/](../../packages/mcp/src/agent/). Bin:
   `weblab-agent-mcp` (`bun packages/mcp/src/agent/server.ts`).

```
Claude Code ──stdio──▶ weblab-agent-mcp ──HTTPS (Bearer)──▶ <deployment>.convex.site/agent/*
                          (connector)                          (httpActions → internal queries)
```

## Auth model (read this)

- **One shared secret** `WEBLAB_AGENT_API_TOKEN`. The MCP process sends it as
  `Authorization: Bearer <token>`; the Convex endpoint constant-time compares it
  against its own deployment env var. No Clerk JWT, no user cookies.
- **All data is scoped to one dedicated agent account** identified by the
  `WEBLAB_AGENT_USER_ID` deployment env var (a Clerk user id). The agent can
  only ever see projects **it created** — so it touches **test data only**,
  never production users' data.
- **Closed by default.** If `WEBLAB_AGENT_API_TOKEN` is unset on the deployment,
  every endpoint returns `500` and nothing is accessible. If
  `WEBLAB_AGENT_USER_ID` is unset, data endpoints return `500` (health still
  reports `agentUserResolved: false` so you can debug setup).

## Required environment variables

| Var | Where it lives | Purpose |
|---|---|---|
| `WEBLAB_AGENT_API_TOKEN` | **Convex deployment** (`convex env set`) **and** the MCP process | Shared Bearer secret. Must match on both sides. |
| `WEBLAB_AGENT_USER_ID` | **Convex deployment** | Clerk user id of the dedicated agent account. Scopes all reads to that account. |
| `WEBLAB_AGENT_API_URL` | **MCP process** | Convex HTTP base, e.g. `https://<deployment>.convex.site` (note: `.convex.site`, not `.convex.cloud`). |

> **Secrets stay out of git.** Never commit the token. Set it via `convex env`
> on the backend and via shell env / a git-ignored MCP config on the client.

## Setup steps

### 1. Create the dedicated agent account (manual — one time)

Sign up a dedicated Clerk user (e.g. an `agent-tests@…` address you control) in
the target environment, sign into Weblab once so the `users` row is created,
then copy its **Clerk user id** (`user_…`) from the Clerk dashboard. This is the
only step that cannot be automated (Clerk dashboard / OAuth).

> ⚠️ Use a throwaway/test identity. This account's projects are the agent's
> entire visible surface — keep production work out of it.

### 2. Generate a strong shared token

```bash
openssl rand -hex 32        # → use as WEBLAB_AGENT_API_TOKEN
```

### 3. Configure the Convex deployment

```bash
cd apps/web/client
bunx convex env set WEBLAB_AGENT_API_TOKEN <token-from-step-2>
bunx convex env set WEBLAB_AGENT_USER_ID  user_xxxxxxxxxxxxxxxx
# repeat with `--prod` to configure the production deployment
```

The agent functions deploy with the rest of Convex (`bunx convex deploy`, or
they are already pushed to dev after `bunx convex codegen` / `convex dev`).

### 4. Wire the MCP server into Claude Code

Add to a **git-ignored** `.mcp.json` (project root) or your user MCP config.
Use `${VAR}` interpolation so the token comes from your shell, not the file:

```json
{
  "mcpServers": {
    "weblab-agent": {
      "command": "bun",
      "args": ["run", "packages/mcp/src/agent/server.ts"],
      "env": {
        "WEBLAB_AGENT_API_URL": "https://<deployment>.convex.site",
        "WEBLAB_AGENT_API_TOKEN": "${WEBLAB_AGENT_API_TOKEN}"
      }
    }
  }
}
```

Export the token in your shell before launching Claude Code:

```bash
export WEBLAB_AGENT_API_TOKEN=<token-from-step-2>
```

The server fails fast with a clear `CONFIG_MISSING` message if either
`WEBLAB_AGENT_API_URL` or `WEBLAB_AGENT_API_TOKEN` is absent.

### 5. Verify

Run the `weblab_health_check` tool from the MCP client. A healthy response:

```json
{ "app": "Weblab", "ok": true, "service": "weblab-agent-api",
  "version": "1", "authenticated": true, "agentUserResolved": true, "time": 1234567890 }
```

- `agentUserResolved: false` → `WEBLAB_AGENT_USER_ID` is unset or points at a
  user with no `users` row yet (sign into Weblab once with that account).
- `[AUTH_FAILED]` → token mismatch between the MCP env and the Convex deployment.
- `[BACKEND_UNAVAILABLE]` → wrong `WEBLAB_AGENT_API_URL` or the deployment is down.

## Tools (v1)

| Tool | Kind | Description |
|---|---|---|
| `weblab_health_check` | read | Backend reachable + token valid + agent account configured. |
| `weblab_list_projects` | read | Projects owned by the agent account (test data only), newest first. |
| `weblab_get_project` | read | Metadata for one agent-owned project (name, tags, framework, workspace, default branch, preview URL, sandbox id). |
| `weblab_get_project_status` | read | Non-destructive status: provisioning state, preview URL, sandbox id, provisioning error, latest deployment. |
| `weblab_create_test_project` | write | **UNSUPPORTED in v1** (honest stub). Requires `confirm: true`. Real creation needs the authenticated sandbox-provisioning action the service token can't invoke. |
| `weblab_read_logs` | read | **UNSUPPORTED in v1** (honest stub). Structured errors are browser-only; sandbox log tail needs a per-session sandbox token. Use `weblab_get_project_status`. |

All write/destructive capabilities are **off by default** and gated behind
explicit confirmation in the input schema — per the project's read-first,
non-destructive policy.

## Error codes

Every failure surfaces as `[CODE] message`:

| Code | Meaning |
|---|---|
| `CONFIG_MISSING` | MCP process env var not set (process won't start). |
| `AUTH_FAILED` | Bad/missing agent token (HTTP 401). |
| `PERMISSION_DENIED` | Project exists but isn't the agent's (HTTP 403). |
| `NOT_FOUND` | Project doesn't exist / bad id (HTTP 404). |
| `INVALID_INPUT` | Caller-side validation or bad request (HTTP 400/422). |
| `BACKEND_UNAVAILABLE` | Network failure, 5xx, or unexpected response shape. |
| `UNSUPPORTED` | Capability intentionally not available in this version. |

## Extending past v1

- **Real project creation**: add an agent-scoped provisioning path (an internal
  action that runs the Vercel Sandbox scaffold as the agent user) and replace
  the `weblab_create_test_project` stub. Keep the `confirm` gate.
- **Logs**: expose a read-only internal action that tails the sandbox dev log
  for an agent-owned project, then replace the `weblab_read_logs` stub.
- **Scoped API keys** (multi-agent, per-project) instead of a single shared
  token: see the `apiKeys` design in the API map doc §5.

## Files

| Path | Role |
|---|---|
| [apps/web/client/convex/agentApi.ts](../../apps/web/client/convex/agentApi.ts) | httpActions + internal queries + token auth |
| [apps/web/client/convex/http.ts](../../apps/web/client/convex/http.ts) | route registration (`/agent/*`) |
| [packages/mcp/src/agent/config.ts](../../packages/mcp/src/agent/config.ts) | env loading |
| [packages/mcp/src/agent/connector.ts](../../packages/mcp/src/agent/connector.ts) | typed HTTP client |
| [packages/mcp/src/agent/schemas.ts](../../packages/mcp/src/agent/schemas.ts) | zod tool inputs + response validators |
| [packages/mcp/src/agent/tools.ts](../../packages/mcp/src/agent/tools.ts) | tool definitions |
| [packages/mcp/src/agent/server.ts](../../packages/mcp/src/agent/server.ts) | MCP stdio entry (`weblab-agent-mcp`) |
| `packages/mcp/src/agent/*.test.ts` | schema/auth/connector/tool tests (`bun test`) |
