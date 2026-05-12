# Railway Deployment Guide

This repo can be deployed to Railway using the existing root `Dockerfile` for the web app.

## Why switch from Render

The current Render proof-of-concept doc in this repo recommends a paid `Standard` instance. If you are seeing `HTTP 502` together with Render memory limit warnings on the free tier, the free instance is the wrong fit for this app.

## What this repo needs at deploy time

The web app validates environment variables during build in [apps/web/client/src/env.ts](/Users/ludvighedin/Programming/personal/AB/coder-new/onlook/apps/web/client/src/env.ts). At minimum, production deploys need these variables set:

```properties
NEXT_PUBLIC_SITE_URL=https://<your-railway-domain>
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
NEXT_PUBLIC_SHOW_DEV_LOGIN=true
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_DATABASE_URL=<your-supabase-postgres-connection-string>
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
CSB_API_KEY=<your-codesandbox-api-key>
OPENROUTER_API_KEY=<your-openrouter-api-key>
PORT=3000
```

Optional variables can stay unset unless you actively use those features.

## Recommended Railway setup

1. Push the repo to GitHub.
2. In Railway, create a new project from that GitHub repo.
3. Add a single service for this repo.
4. Keep using the root `Dockerfile`. Railway automatically detects root Dockerfiles, and this repo now also includes [railway.toml](/Users/ludvighedin/Programming/personal/AB/coder-new/onlook/railway.toml) with a healthcheck path.
5. Add the environment variables listed above.
6. Deploy once.
7. Copy the generated Railway public domain and set `NEXT_PUBLIC_SITE_URL` to that exact URL.
8. Redeploy after updating `NEXT_PUBLIC_SITE_URL`.

## Docs service on Railway

The docs service is configured to deploy from `docs/` as its own Railway service.

Use the config file in [docs/railway.toml](/Users/ludvighedin/Programming/personal/AB/coder-new/onlook/docs/railway.toml) and keep the service root directory set to `docs/`.

Docs service env vars:

```properties
NEXT_PUBLIC_APP_NAME=Weblab
NEXT_PUBLIC_APP_DOMAIN=docs.weblab.build
```

Railway should still supply `PORT`, and `next start` should bind to that port automatically.

If you want to hide the demo login button later, set `NEXT_PUBLIC_SHOW_DEV_LOGIN=false` and redeploy.

## Healthcheck

Railway should use:

```text
/api/health
```

This route is implemented in [docs/src/app/api/health/route.ts](/Users/ludvighedin/Programming/personal/AB/coder-new/onlook/docs/src/app/api/health/route.ts) and returns HTTP 200.

## Database

Keep using your existing hosted Supabase project unless you explicitly want to migrate databases too. Railway does not need to host the database for this app to work.

Before the first Railway deploy, make sure your hosted database schema has been applied:

```bash
cd /Users/ludvighedin/Programming/personal/AB/coder-new/onlook
export SUPABASE_DATABASE_URL='<your-supabase-postgres-connection-string>'
bun install
bun db:push
```

## Migration checklist from Render

1. In Render, open the service and copy every environment variable currently set.
2. In Railway, paste those same values into the new service.
3. Replace only `NEXT_PUBLIC_SITE_URL` with the Railway URL after the first deploy creates it.
4. Trigger a redeploy.
5. Check that `https://<your-railway-domain>/api/health` returns `{"ok":true}`.
6. Then open the app root URL.

## Important caveat

Railway's current free/trial offering is not unlimited. As of April 2026, Railway documents a free-trial credit model and a lower-resource free tier after trial expiry. If this app still exceeds the available runtime memory there, the root problem is the app footprint rather than Render specifically.

## Useful references

- Railway config as code: https://docs.railway.com/config-as-code/reference
- Railway Dockerfile builds: https://docs.railway.com/builds/dockerfiles
- Railway healthchecks: https://docs.railway.com/deployments/healthchecks
- Railway free trial: https://docs.railway.com/pricing/free-trial
- Render deploy troubleshooting: https://render.com/docs/troubleshooting-deploys
