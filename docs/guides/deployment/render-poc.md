# Render POC Deployment

This is the lowest-friction path to get this repo running at a shareable Render URL.

## Scope

- One Render web service
- Existing hosted Supabase project
- No custom domain
- Good enough for a proof of concept with a few users

## Required environment variables

Set these in Render:

```properties
NEXT_PUBLIC_SITE_URL=https://<your-render-service>.onrender.com
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
SUPABASE_URL=https://<your-project-ref>.supabase.co
SUPABASE_DATABASE_URL=<your-supabase-postgres-connection-string>
SUPABASE_SERVICE_ROLE_KEY=<your-supabase-service-role-key>
CSB_API_KEY=<your-codesandbox-api-key>
OPENROUTER_API_KEY=<your-openrouter-api-key>
PORT=3000
```

## One-time database step

Before the first deploy, make sure the database schema has been applied to the hosted Supabase database:

```bash
cd /absolute/path/to/onlook
export SUPABASE_DATABASE_URL='<your-supabase-postgres-connection-string>'
bun install
bun db:push
```

If demo login already works, your auth setup is at least partially functional, but `bun db:push` is still the safest way to make sure the app tables exist.

## Render service settings

Create a new Render Web Service from this repo with:

- Runtime: `Docker`
- Dockerfile Path: `./Dockerfile`
- Branch: your deployment branch
- Region: the nearest region to you
- Instance Type: `Standard` recommended for POC

You do not need a Start Command because the Dockerfile already defines it.

## Notes

- The app expects a real Postgres connection string in `SUPABASE_DATABASE_URL`, not just the Supabase API URL.
- `NEXT_PUBLIC_SITE_URL` must match the final Render URL after the service is created.
- If you change the Render service name later, update `NEXT_PUBLIC_SITE_URL` and redeploy.
