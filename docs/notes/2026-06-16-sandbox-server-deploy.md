# Sandbox server (`@weblab/web-server`) was never deployed → every prod preview 502s

**Date:** 2026-06-16
**Severity:** prod-breaking (all previews)
**Symptom:** Canvas preview overlay loads forever; opening the preview URL returns
`502: This sandbox is not listening on the requested port. Code: SANDBOX_NOT_LISTENING`.

## Root cause

The editor does **not** start `next dev` inside the Vercel Sandbox at provision
time. Provisioning (`convex/projectActions.ts → VercelSandboxProvider.createProject`)
only creates the VM, scaffolds files, and stores the dev command. The dev server
is started later by the editor calling `sandbox.setup` over a **WebSocket tRPC
connection to the `@weblab/web-server` Fastify service** (`:8080`,
`editorServerConfig.prefix = '/trpc'`). That server runs `next dev` in the
sandbox and polls until the port binds.

In production that server **was never deployed**:

- The root `Dockerfile` (the only Railway service) builds and runs **only** the
  Next.js client (`CMD … cd apps/web/client && bun run start`, `EXPOSE 3000`). It
  copies `apps/web/server/package.json` but never builds or runs the server.
- `NEXT_PUBLIC_SANDBOX_SERVER_URL` is set nowhere, so the client falls back to
  `wss://<host>:8080/trpc` (`apps/web/client/src/lib/sandbox-server-client.ts`).
  Railway only exposes `:3000`, so that WS never connects.
- The boot call (`VercelBrowserTask.startDevServer → sandbox.setup.mutate`) had
  **no timeout**, so it hung forever → `next dev` never ran → sandbox port 3000
  never opened → **502 SANDBOX_NOT_LISTENING**, overlay spins forever.

Additional pre-existing bugs that meant the server couldn't have worked even if
wired:

- `apps/web/server/src/server.ts` bound `127.0.0.1` (fastify default), unroutable
  in a container. **Fixed:** now binds `0.0.0.0` and honors `process.env.PORT`.
- `apps/web/server/Dockerfile` was dev-grade (`CMD bun run dev` watch mode,
  `EXPOSE 8081` while the server listens on `8080`, and a `bun install` that
  cannot resolve workspace deps from the subdir). **Replaced** with a fail-fast
  stub; production uses the new repo-root `Dockerfile.sandbox-server`.

## Code changes already landed (this commit)

- `apps/web/server/src/server.ts` — bind `0.0.0.0`, honor `PORT`, add `/health`.
- `Dockerfile.sandbox-server` (new, repo root) — workspace-aware frozen install;
  `CMD bun apps/web/server/src/index.ts` (bun runs the TS entry directly).
- `apps/web/server/Dockerfile` — replaced with a fail-fast stub pointing here.
- `Dockerfile` (client) — added `ARG/ENV NEXT_PUBLIC_SANDBOX_SERVER_URL` so the
  WS URL is baked into the client bundle at build time.
- `vercel-browser-provider.ts` — 60s timeout on the dev-server `setup` WS call so
  an unreachable server surfaces an error (and the frame boot watchdog/Retry)
  instead of an infinite spinner.

## Manual deploy steps (you must do these — Railway dashboard/CLI)

1. **Create a second Railway service** in the same project, from this repo.
   - **Point it at the dedicated config file, NOT the Dockerfile-Path field.**
     Service → Settings → Config-as-code → set the path to
     `/railway.sandbox-server.toml`.
     - ⚠️ **Gotcha (this is why the first build failed):** the repo-root
       `railway.toml` is the *client* config (`dockerfilePath = "Dockerfile"`,
       which runs `next build`). Railway applies the root config to every service
       and *"configuration defined in code always overrides the dashboard"*, so
       the service's **Dockerfile Path** field is ignored — the sandbox service
       built the client image and failed on the client-only build ARG
       `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (the `/offline` prerender). A separate
       config file is the only clean override. `railway.sandbox-server.toml`
       pins `dockerfilePath = "Dockerfile.sandbox-server"` + `/api/health`.
     - (Alternative if you don't want a config file: set the service variable
       `RAILWAY_DOCKERFILE_PATH=Dockerfile.sandbox-server`. Less certain to win
       against the root `railway.toml`; the config-file path is preferred.)
   - Generate a public domain (e.g. `weblab-sandbox.up.railway.app`). Railway
     terminates TLS on 443 and proxies WebSockets, so no port mapping is needed —
     the server reads `PORT` from Railway.
2. **Set runtime variables on the sandbox-server service** (same values as the
   client service):
   - `CLERK_JWT_ISSUER_DOMAIN` — required to verify the browser's Clerk JWT.
   - `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID`, `VERCEL_TOKEN` — the Vercel Sandbox SDK.
   - `NODE_ENV=production` (also set in the Dockerfile).
3. **Point the client at it.** On the **client** service set:
   - `NEXT_PUBLIC_SANDBOX_SERVER_URL = https://weblab-sandbox.up.railway.app`
     (the client converts `http(s)→ws(s)` and appends `/trpc`). Because this is a
     `NEXT_PUBLIC_*` var it is baked at build — **trigger a client rebuild** after
     setting it (Railway passes service variables as build args; the root
     Dockerfile now declares the ARG).
4. **Verify:**
   - `GET https://weblab-sandbox.up.railway.app/health` → `{"ok":true}`.
   - Create a project; preview should serve instead of 502. If it still 502s,
     check the sandbox-server logs for the `setup` call and confirm the `VERCEL_*`
     vars are present.

## Why not just bundle the server into the client image?

The server holds long-lived `@vercel/sandbox` handles and per-session WS
connections; it is a stateful service distinct from the stateless Next.js client
and should scale/restart independently. Bundling is possible later (run both
processes in one container) but a separate service is the clean fix.

## Follow-up (tracked in BACKLOG)

- Consider making `NEXT_PUBLIC_SANDBOX_SERVER_URL` required in prod (`env.ts`) so
  a future deploy can't silently regress to the `:8080` fallback. Left optional
  for now because local dev intentionally relies on the fallback.
