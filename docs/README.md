# Weblab Documentation

This is a Next.js application for the Weblab documentation.

Run development server:

```bash
bun run dev
# or
pnpm dev
# or
yarn dev
```

Open http://localhost:3000 with your browser to see the result.

For production deployments, set `NEXT_PUBLIC_APP_NAME=Weblab` and `NEXT_PUBLIC_APP_DOMAIN=docs.weblab.build` on the docs service.

The docs service also exposes `/api/health` for Railway healthchecks.

## Explore

In the project, you can see:

- `lib/source.ts`: Code for content source adapter, provides the interface to
  access your content.
- `app/layout.config.tsx`: Shared options for layouts, optional but preferred to
  keep.

| Route                     | Description                                            |
| ------------------------- | ------------------------------------------------------ |
| `app/(home)`              | The route group for your landing page and other pages. |
| `app/docs`                | The documentation layout and pages.                    |
| `app/api/search/route.ts` | The Route Handler for search.                          |

### Documentation Structure

The documentation is organized into the following sections:

- **Getting Started**: Quick introduction and installation guides
- **User Guide**: Comprehensive guide for using Weblab
- **Features**: Detailed description of Weblab's features
- **Tutorials**: Step-by-step guides for common tasks
- **Developer Documentation**: Technical documentation for contributors
- **Editor Updates**: Notes for shipped editor changes such as the [Left Panel Refresh](./left-panel-refresh.md)
- **Agent Context**: Optional context files for coding agents in [`agent-context/`](./agent-context/README.md)
  covering current progress, repo structure, setup, architecture, data/API, and
  product/design expectations.

### Recent Engineering Notes

- Comment collaboration endpoints now require project membership, and comment replies are returned in creation order to keep threads stable after refreshes.
- Repository metadata and package manifests now point to the renamed `Weblab` GitHub repo.
- Current agent-facing progress and setup notes live in [`agent-context/current-progress.md`](./agent-context/current-progress.md)
  and [`agent-context/development-setup.md`](./agent-context/development-setup.md).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js
  features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
