# Agent QA Access — how an agent gets into weblab.build to test

Two complementary, **dev-only** routes give an automated QA agent access without a
human in the loop. Use Route 1 for fast API/state checks, Route 2 for real
authenticated editor UI QA.

> **Never commit** the agent token, Clerk secrets, session cookies, or Playwright
> storage-state files. Keep everything on the DEV deployment (`avid-gnat-539`) and
> in `$TMPDIR`. Do **not** configure any of this on prod (`rapid-crab-113`).

---

## Route 1 — Agent API (read-only metadata / provisioning-state QA)

The `weblab-agent` MCP server (`packages/mcp/src/agent/`) + the Convex
`/agent/*` HTTP surface (`convex/agentApi.ts`, routed in `convex/http.ts`) are a
token-authenticated, browser-free read API scoped to a **synthetic non-Clerk
fixture user** (`WEBLAB_AGENT_USER_ID=user_agent_qa_fixture`). It can read
projects/status but **cannot** log into the browser UI and **cannot** create real
sandboxes (create/logs are honest `UNSUPPORTED` stubs gated on Clerk JWT +
`VERCEL_TOKEN`).

**Already configured on dev.** The shared secret lives in the Convex deployment:

```bash
cd apps/web/client
TOK=$(bunx convex env get WEBLAB_AGENT_API_TOKEN)          # the dev secret
bunx convex env get WEBLAB_AGENT_USER_ID                    # → user_agent_qa_fixture
bunx convex run agentTestSeed:seed                          # 3 fixtures: ready/pending/failed
```

Use it **right now**, no Claude Code restart needed — hit the API directly or run
the harness with the token inline:

```bash
# direct curl (sandbox-off: *.convex.site needs network)
curl -s -H "Authorization: Bearer $TOK" https://avid-gnat-539.convex.site/agent/health
curl -s -H "Authorization: Bearer $TOK" https://avid-gnat-539.convex.site/agent/projects

# full harness (15 checks, exit-coded)
WEBLAB_AGENT_API_URL=https://avid-gnat-539.convex.site \
WEBLAB_AGENT_API_TOKEN=$TOK WEBLAB_QA_JSON=1 \
bun packages/mcp/src/agent/qa-runner.ts
```

**To make the `mcp__weblab-agent__*` tools work in-session** (instead of inline
curl): the repo `.mcp.json` injects `${WEBLAB_AGENT_API_TOKEN}` from Claude Code's
launch environment. So the **one human step** is to export it once and restart
Claude Code:

```bash
export WEBLAB_AGENT_API_TOKEN=<value from `bunx convex env get WEBLAB_AGENT_API_TOKEN`>
# then restart Claude Code so the MCP server relaunches with the env
```

Verified working 2026-06-17: `/agent/health` → `{"authenticated":true,
"agentUserResolved":true}`; `qa-runner.ts` exits 0. Note the seeded "ready"
fixture's `previewUrl` is a placeholder (`agent-qa-ready.example.com`), not a live
sandbox.

---

## Route 2 — Localhost Clerk test user + Playwright (full authed editor UI QA)

This is the durable way to QA the **real editor UI**, fully agent-driven and
repeatable every session.

**Why localhost:** localhost runs Clerk **development** keys (`.env.local` =
`pk_test`/`sk_test`), so any `+clerk_test` email verifies with the fixed OTP
`424242` — deterministic, no inbox, no human relay. (Live `weblab.build` uses
`pk_live` Clerk, so `+clerk_test` does **not** work there unless prod test mode is
enabled — see `prod-e2e-testing.md` for the fragile prod mail.tm fallback.)

### Steps

1. Node ≥ 20 (nvm default is v18 and breaks dev/typecheck): the repo's default is
   already v20.20.2; otherwise `nvm use 20`.
2. Start the stack against the remote dev backend:
   - `bun dev:ui` — lightest (client `:3000` only) → auth + dashboard + create flow.
   - `bun dev:remote` — full (`:3000` + preload + `:8080` sandbox server) → needed
     for the **editor canvas / live preview**.
3. Get an authenticated Playwright `storageState` with the committed helper:
   ```bash
   node scripts/qa/auth-setup.mjs            # BASE_URL defaults to http://localhost:3000
   # writes $TMPDIR/weblab-local-auth-state.json
   ```
4. Reuse the saved state in any QA script:
   ```js
   const ctx = await browser.newContext({ storageState: process.env.TMPDIR + '/weblab-local-auth-state.json' });
   ```
   Re-run step 3 only if a navigation to `/projects` redirects back to `/sign-in`
   (state expired).

### Auth flow the helper automates (selectors)

```
goto  <BASE>/sign-in
fill  input[type="email"]          weblab.qa+clerk_test@example.com
press Enter                         → /sign-in/verify
fill  input[data-input-otp="true"] 424242
click button "Verify"
waitForURL /projects
context.storageState({ path: <TMPDIR>/weblab-local-auth-state.json })
```

### Not yet enabled: agent create-in-UI via the API

Creating a real sandbox via the agent token is a deliberate `UNSUPPORTED` stub
(`packages/mcp/src/agent/tools.ts`). Enabling it needs a Clerk-authed provisioning
path **and** `VERCEL_TOKEN` on the Convex deployment. Route 2 (real Clerk session)
is the correct way to exercise create/editing instead.

---

## Safety properties (keep these true)

- Agent token is a long-lived static shared secret — treat like a password;
  generate with `openssl rand -hex 32` if rotating; never commit; dev-only.
- The agent account is a synthetic non-Clerk fixture — the API can never read or
  mutate real users' data. Never point `WEBLAB_AGENT_USER_ID` at a real user.
- `+clerk_test`/`424242` works only because localhost uses Clerk dev keys.
- Playwright `storageState` holds a live session cookie → `$TMPDIR` only, never
  committed, always the disposable `+clerk_test` identity.
