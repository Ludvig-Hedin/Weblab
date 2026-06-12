# Agent API — API-First QA Report

> Date: 2026-06-12 · Environment: Convex **dev** (`avid-gnat-539`) · Surface under
> test: the read-first agent API (`convex/agentApi.ts`) + the `weblab-agent` MCP
> server (`packages/mcp/src/agent/`). **No browser, no visual inspection** — every
> result below is asserted from connector/MCP tool output.

## TL;DR

- **15/15 API checks pass** against the live dev deployment (see `qa-runner.ts`).
- **1 critical setup gap found and fixed:** the agent API was committed but never
  pushed to the dev deployment, and its env vars were unset → `/agent/*` returned
  `404 No matching routes`. Pushed + configured; now live.
- **Reproducible from now on:** a dedicated synthetic agent account, an idempotent
  Convex seed (`agentTestSeed.ts`), and a runnable harness (`qa-runner.ts`).
- **Zero code bugs** in `agentApi.ts` / the MCP connector — auth scoping, IDOR
  guard, error mapping, and the honest UNSUPPORTED stubs all behave as specified.

## What was set up (so future sessions skip the wiring)

| Step | Action | Result |
|---|---|---|
| Push | `bunx convex dev --once` (from `apps/web/client`) | Deployed `agentApi.ts` + `http.ts` agent routes + `agentTestSeed.ts` to dev. |
| Agent account | `bunx convex run agentTestSeed:seed` | Synthetic user `clerkUserId = user_agent_qa_fixture` (no real Clerk login; the read API only string-matches `users.clerkUserId`, so it can never collide with a real signed-in user — guarantees test-data isolation). |
| Token | `openssl rand -hex 32` → `bunx convex env set WEBLAB_AGENT_API_TOKEN <tok>` | Shared Bearer secret set on dev. |
| Scope | `bunx convex env set WEBLAB_AGENT_USER_ID user_agent_qa_fixture` | All `/agent/*` reads scoped to the fixture account. |
| MCP config | `.mcp.json` (git-ignored) with `${WEBLAB_AGENT_API_TOKEN}` interpolation | Wires `weblab-agent` into Claude Code; no secret committed. |

### Isolated test data (`agentTestSeed:seed`, idempotent)

Three projects owned by the fixture account, chosen to cover the agent API's
derived provisioning states **without a live sandbox** (no `VERCEL_TOKEN`, no cost):

| Project | `provisioning` | Notable fields |
|---|---|---|
| Agent QA · Ready Site | `ready` | `previewUrl` + `sandboxId` set; one `completed` deployment |
| Agent QA · Provisioning Site | `pending` | no `previewUrl`, no deployment (loading state) |
| Agent QA · Failed Site | `failed` | `provisioningError` set (error state) |

Re-running `seed` clears prior fixtures first (deterministic). `reset` tears them
down; `info` reports current fixture state; `foreignProjectIdForQa` surfaces a
non-fixture project id for the IDOR check.

## The QA harness

`packages/mcp/src/agent/qa-runner.ts` drives the **same** code path the MCP tools
use (`config → connector → tools`). Run:

```bash
cd apps/web/client && bunx convex run agentTestSeed:seed   # once
WEBLAB_AGENT_API_URL=https://avid-gnat-539.convex.site \
WEBLAB_AGENT_API_TOKEN=<token> \
WEBLAB_QA_FOREIGN_PROJECT_ID=<any non-fixture project id> \
bun packages/mcp/src/agent/qa-runner.ts
```

Exit 0 = all pass; exit 1 = any fail. `WEBLAB_QA_JSON=1` prints a machine summary.
The MCP **server** itself (`server.ts`) was also smoke-tested over stdio:
`initialize` → `tools/list` (6 tools) → `tools/call weblab_health_check`
(`ok/authenticated/agentUserResolved = true`) → `tools/call weblab_list_projects`
(`count = 3`).

## Checklist + results (all asserted from tool output)

| # | Flow | Tool call / input | Expected | Actual | Status |
|---|---|---|---|---|---|
| QA-01 | startup | `loadAgentConfigFromEnv({})` | throws `CONFIG_MISSING` | threw `[CONFIG_MISSING]` | ✅ |
| QA-02 | new-user onboarding | `health_check {}` | `ok/authenticated/agentUserResolved = true` | all true | ✅ |
| QA-03 | returning-user project access | `list_projects {}` | ≥3 projects, all tagged `agent-qa`, newest-first | `count=3 allTagged=true sorted=true` | ✅ |
| QA-04 | read project/site state | `get_project { id: ready }` | `previewUrl`+`sandboxId` set, branch `main`, framework `nextjs` | matches | ✅ |
| QA-05 | key project action (status) | `get_project_status { id: ready }` | `ready` + `latestDeployment.status=completed` | matches | ✅ |
| QA-06 | loading state via API | `get_project_status { id: pending }` | `pending`, `previewUrl=null`, `latestDeployment=null` | matches | ✅ |
| QA-07 | error state via API | `get_project_status { id: failed }` | `failed` + non-null `provisioningError` | matches | ✅ |
| QA-08 | not-found | `get_project { id: bogus }` | `NOT_FOUND` | threw `[NOT_FOUND]` | ✅ |
| QA-09 | invalid input | `get_project { id: "   " }` | `INVALID_INPUT` (client-side) | threw `[INVALID_INPUT]` | ✅ |
| QA-10 | permission / IDOR | `get_project { id: <foreign project> }` | `PERMISSION_DENIED` (no leak) | threw `[PERMISSION_DENIED]` | ✅ |
| QA-11 | auth failure | `health` with wrong Bearer token | `AUTH_FAILED` | threw `[AUTH_FAILED]` | ✅ |
| QA-12 | resilience | connector against bad host | `BACKEND_UNAVAILABLE` | threw `[BACKEND_UNAVAILABLE]` | ✅ |
| QA-13 | write gate | `create_test_project { confirm: true }` | `UNSUPPORTED` (honest stub) | threw `[UNSUPPORTED]` | ✅ |
| QA-14 | write gate | `create_test_project {}` (no confirm) | `INVALID_INPUT` (schema gate) | threw `[INVALID_INPUT]` | ✅ |
| QA-15 | logs | `read_logs { projectId }` | `UNSUPPORTED` (honest stub) | threw `[UNSUPPORTED]` | ✅ |

## Findings log

### F1 — Agent API not deployed / not configured on dev (CRITICAL, FIXED)

- **Tool call / input:** `GET https://avid-gnat-539.convex.site/agent/health`
  (and every `/agent/*` route).
- **Expected:** `200` health JSON (or `500 BACKEND_UNAVAILABLE` if token unset).
- **Actual (before fix):** `404 {"...":"No matching routes found"}` — the routes
  did not exist on the running deployment.
- **Root cause:** the v1 commit (`43829e00b`) regenerated `_generated/api.d.ts`
  (codegen) but the functions + `http.ts` routes were never **pushed** to the dev
  deployment, and `WEBLAB_AGENT_API_TOKEN` / `WEBLAB_AGENT_USER_ID` were unset.
  Convex codegen ≠ deploy.
- **Likely owner / files:** `apps/web/client/convex/http.ts`,
  `apps/web/client/convex/agentApi.ts` (deploy/ops, not a code defect).
- **Severity:** Critical (the entire surface was unreachable).
- **Fix applied:** `bunx convex dev --once` (push) + `convex env set` for both
  vars. Verified live (QA-02). **Follow-up:** prod is still unconfigured — see
  "Manual / next".

### F2 — No isolated agent fixtures or runnable QA harness existed (MEDIUM, FIXED)

- **Expected:** a stable, repeatable dataset + script so future sessions can QA
  the API without ad-hoc data or a browser.
- **Actual (before):** none — testing required hand-creating data.
- **Fix applied:** added `agentTestSeed.ts` (seed/reset/info/foreignProjectIdForQa,
  internal-only, idempotent) and `qa-runner.ts` (15-check harness, exit-coded).

### No code defects found

`agentApi.ts` and the MCP connector behaved exactly to spec across auth, owner
scoping (the `forbidden` vs `not_found` discrimination correctly prevents IDOR
enumeration), HTTP→error-code mapping, response-shape validation, and the two
honest `UNSUPPORTED` stubs (no fabricated capabilities).

## Validation

| Check | Result |
|---|---|
| `bun --filter @weblab/web-client typecheck` | ✅ exit 0 (covers `convex/agentTestSeed.ts`) |
| `bun --filter @weblab/mcp typecheck` | ✅ exit 0 (covers `qa-runner.ts`) |
| `bun --filter @weblab/mcp lint` | ✅ exit 0 |
| `bun --filter @weblab/web-client lint` | ✅ exit 0 |
| `bun test packages/mcp/src/agent` | ✅ 32 pass |
| `qa-runner.ts` (live dev) | ✅ 15/15 pass |
| MCP `server.ts` stdio smoke | ✅ tools/list + 2 tool calls OK |

> Repo-wide `bun lint` and `bun test` report pre-existing failures **outside this
> change** (many `@weblab/*` packages exceed `max-warnings 0`; `template-sources/_forks/shadcn-admin`
> tests miss `vitest-browser-react`). Both workspaces this task touched
> (`@weblab/mcp`, `@weblab/web-client`) lint and typecheck clean, and the agent
> tests pass.

## Manual / next (not API-verifiable)

1. **Production deployment.** Dev is configured; **prod (`rapid-crab-113`) is not.**
   To enable the agent API in prod: `bunx convex deploy` then
   `bunx convex env set --prod WEBLAB_AGENT_API_TOKEN <tok>` and
   `WEBLAB_AGENT_USER_ID <prod fixture user>`. Requires a prod agent account.
2. **Real Clerk agent account (optional).** The fixture user bypasses Clerk
   entirely (fine for the read API). If a future agent capability needs a real
   Clerk identity (e.g. authenticated provisioning), create a throwaway Clerk
   user and use its real `user_…` id instead of the synthetic fixture id.
3. **Write path + logs are intentionally UNSUPPORTED in v1.** `create_test_project`
   and `read_logs` need an authenticated sandbox/session context the service token
   can't hold (browser-only today). Verifying real project creation, live preview
   rendering, and sandbox log tails **still requires browser/editor QA**.
4. **Loading into a live Claude Code session** requires restarting Claude Code so
   it reads `.mcp.json` (MCP servers load at startup). The connector path is
   already proven here via `qa-runner.ts` + the stdio smoke test.

## Exact next prompt for the next agent

```
Extend the Weblab agent API past v1 read-only, guided by docs/agent-memory/api-agent-qa-report.md
and docs/agent-context/weblab-mcp-setup.md.

1. Configure the agent API on the PRODUCTION Convex deployment (rapid-crab-113):
   bunx convex deploy, then set WEBLAB_AGENT_API_TOKEN + WEBLAB_AGENT_USER_ID --prod
   (create a prod fixture/agent account first). Verify with weblab_health_check.
2. Replace the weblab_read_logs UNSUPPORTED stub with a real read-only internal
   action that tails an agent-owned project's latest deployment buildLog +
   sandbox dev log (read-only; no session mutation). Keep error codes stable.
3. Add agent API tools for the next read flows the QA harness can assert:
   list_branches, get_branch_status, and list_recent_deployments (owner-scoped,
   same not_found/forbidden discrimination as _getAgentProject — no IDOR).
4. For each new tool: add a QA-XX check to packages/mcp/src/agent/qa-runner.ts,
   add unit tests next to the existing 32, update agentTestSeed.ts fixtures if a
   new state must be covered, and update docs/feature-catalog.md (F-482/F-693) +
   docs/test-plan.md (T-502).
5. Constraints: no `any`; import APP_NAME from @weblab/constants/editor; Bun only;
   do NOT run the dev server or `bun db:gen`; never use real/prod user data; keep
   every write/destructive capability behind an explicit confirm gate; do not mark
   a flow working unless verified by connector/API output.
Validate: bun --filter @weblab/web-client typecheck, bun --filter @weblab/mcp lint,
bun test packages/mcp/src/agent, and a green qa-runner.ts run. Append results here.
```
