# Deployment Guides

How to deploy Weblab services.

| Guide | What it covers |
|---|---|
| [`railway.md`](./railway.md) | **Primary deployment.** Railway service config for the main web client and docs site. |
| [`render-poc.md`](./render-poc.md) | Render proof-of-concept setup. Reference only; production deploys live on Railway. |

## Service layout

| Service | Path | Notes |
|---|---|---|
| Main web client | `apps/web/client` | Deployed to Railway. Production URL is the main app domain. |
| Documentation site | `apps/docs` | Deployed to Railway. Production URL is `docs.weblab.build`. Has its own `railway.toml`. |

> When verifying deployments, check the Railway dashboard — not Vercel. See [`/CLAUDE.md`](../../../CLAUDE.md#deployment).
