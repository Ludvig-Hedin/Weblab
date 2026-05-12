# @weblab/docs — Documentation site

The published Weblab documentation site (Fumadocs + Next.js) that deploys to **docs.weblab.build**.

> Looking for the repository documentation hub (agent docs, guides, notes, audits)? See [`/docs/README.md`](../../docs/README.md). This app is *just* the public site.

## Develop

```bash
# from repo root
bun docs            # bun --filter @weblab/docs dev → http://localhost:3000
```

or from this directory:

```bash
bun run dev
```

For production deployments, set `NEXT_PUBLIC_APP_NAME=Weblab` and `NEXT_PUBLIC_APP_DOMAIN=docs.weblab.build` on the docs service.

The docs service exposes `/api/health` for Railway healthchecks.

## Structure

| Path | Purpose |
|---|---|
| `src/app/(home)` | Landing page + non-docs routes |
| `src/app/docs` | Documentation layout and pages |
| `src/app/api/search/route.ts` | Search route handler |
| `src/lib/source.ts` | Fumadocs content source adapter |
| `src/app/layout.config.tsx` | Shared layout options |
| `content/docs/` | All published documentation (MDX) |

### Published content sections

- **Getting Started** (`content/docs/getting-started/`)
- **Tutorials** (`content/docs/tutorials/`)
- **Developers** (`content/docs/developers/`)
- **Self-Hosting** (`content/docs/self-hosting/`)
- **Migrations** (`content/docs/migrations/`)
- **Enterprise** (`content/docs/enterprise.mdx`)
- **FAQ** (`content/docs/faq.mdx`)

## Deployment

Railway service for docs.weblab.build is configured via [`railway.toml`](./railway.toml). After the docs site was moved from `/docs/` to `/apps/docs/`, the Railway service "Root Directory" must point to `apps/docs`.

## Learn more

- [Fumadocs](https://fumadocs.dev) — the docs framework
- [Next.js](https://nextjs.org/docs)
