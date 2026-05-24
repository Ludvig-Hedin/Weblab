# Vercel Sandbox is the sole runtime (CodeSandbox archived 2026-05-24)

> _Earlier revisions of this note described a staged migration where
> CodeSandbox remained the default. That migration completed 2026-05-24
> (commits `5e8dca441` + `de3dc9269`). This file is now the authoritative
> reference for the Vercel-only runtime._

## Status

| Item                                  | State              |
|---------------------------------------|--------------------|
| Default sandbox runtime               | Vercel Sandbox     |
| CodeSandbox SDK                       | Archived, retained as `@deprecated` dead code |
| `WEBLAB_CLOUD_PROVIDER` env var       | Legacy / no-op     |
| `CSB_API_KEY` env var                 | Optional, unused by new code |

## Required Vercel env

Set on Railway (production) and in `.env.local` (development):

```
VERCEL_TEAM_ID=team_...
VERCEL_PROJECT_ID=prj_...
VERCEL_TOKEN=vcp_...
```

## Optional Vercel env

| Variable                          | Default | Effect |
|-----------------------------------|---------|--------|
| `VERCEL_SANDBOX_TIMEOUT_MS`       | 45 min  | Per-sandbox idle timeout |
| `VERCEL_BLANK_SNAPSHOT_ID`        | unset   | Snapshot id of a pre-baked Next.js scaffold. When set, `createProject` resumes from the snapshot instead of running scaffold + `npm install` (saves 60-180s). Bake with `bun scripts/create-vercel-template.mjs`. |
| `WEBLAB_VERCEL_VCPUS`             | 4       | vCPU per sandbox (1-8) |
| `WEBLAB_VERCEL_WARM_POOL_SIZE`    | 0       | Idle pre-attached sandbox pool size. Cuts ~3-8s VM resume at the cost of continuous VM-hours. |

## Supported framework scaffolders

Implemented in [packages/code-provider/src/providers/vercel-sandbox/index.ts](../../packages/code-provider/src/providers/vercel-sandbox/index.ts):

- `scaffoldNextProject` — Next.js 15 + Tailwind v4 + Turbopack, port 3000, dev: `npm run dev -- --turbopack --hostname 0.0.0.0`
- `scaffoldStaticHtmlProject` — single `index.html` + tiny `package.json` with `serve`, port 8080, dev: `npm run dev` (`serve -s --no-clipboard -l tcp://0.0.0.0:8080`)

`scaffoldByFramework` dispatches over the `VercelScaffoldFramework` union; calling `createProject({ framework })` with anything outside that union throws an exhaustiveness error. Vite/Remix/Astro/TanStack Start are gated upstream in `@weblab/framework`'s `isFrameworkReady` until their scaffolders land.

## Dev-server lifecycle

`isDevServerRunning` / `stopDevServers` match both Next.js (`next-server` / `next dev`) and the static-HTML `serve` worker via a single `pgrep -f` pattern. This keeps `setup()` and `Task.restart()` framework-agnostic so resuming a snapshot doesn't spawn duplicate workers and fight over the host port.

## How sandbox provisioning flows today

```
project.createBlank (convex action)
  └─> VercelSandboxProvider.createProject({ framework })
       ├─ fast path: resume from VERCEL_BLANK_SNAPSHOT_ID (Next.js only)
       └─ slow path: Sandbox.create → scaffoldByFramework → npm install → snapshot → resume
  └─> internal.projects._insertProjectGraph (writes project + default branch)

branch.createBlank (convex action)
  └─> VercelSandboxProvider.createProject({ framework: 'nextjs' })
  └─> internal.branches._insertBranchWithFrames

editor open
  └─> SessionManager.connect
       ├─ branch.runtime.type === 'local' → NodeFsProvider
       ├─ branch.runtime.cloud.provider === 'vercel_sandbox' → VercelBrowserProvider (tRPC proxy)
       └─ any other cloud provider → throw CODESANDBOX_ARCHIVED_MESSAGE
```

## What's temporarily disabled

Active code paths that fail with a clear, structured error rather than executing CodeSandbox SDK calls or silently provisioning empty Vercel VMs:

| Action                                       | Error                                                                                       | Ticket               |
|----------------------------------------------|---------------------------------------------------------------------------------------------|----------------------|
| `convex.projectActions.fork`                 | "Project fork is temporarily unavailable. … Use Create blank project as a workaround."     | `TODO(sandbox-fork)` |
| `convex.branchActions.fork`                  | "Branch fork is temporarily unavailable. … Use Create blank branch."                       | `TODO(sandbox-fork)` |
| `convex.publishHelpers.forkBuildSandbox`     | "Publish is temporarily unavailable on the Vercel runtime."                                | `TODO(publish-vercel)` |
| Editor session for legacy `cloud_provider: 'code_sandbox'` rows | `CODESANDBOX_ARCHIVED_MESSAGE` — user must re-import the project          | n/a (one-shot user migration) |

Each TODO's full plan is sketched below.

### `TODO(sandbox-fork)` — Vercel snapshot fork

Sketch:
1. `VercelSandboxProvider.initialize({ sandboxId: sourceSandboxId })`
2. `await sandbox.snapshot({ expiration: 0 })` → `snapshotId`
3. `Sandbox.create({ source: { type: 'snapshot', snapshotId }, ports: [port], ... })` → new sandbox
4. Return `{ id, previewUrl, snapshotId, ... }` matching the existing `CreateProjectOutput` shape so callers (project-fork, branch-fork) don't need bespoke wiring.

### `TODO(publish-vercel)` — Vercel build fork for publish

Same shape as `TODO(sandbox-fork)` plus:
- After resume, run `npm install --omit=dev && npm run build`
- Read the build output (`/.next/standalone/`, `out/`, etc.) into a `Record<path, FreestyleFile>` and feed `deployFreestyle` / `deployExternal`
- `await sandbox.stop({ blocking: false })` after deploy

## Why archive instead of full delete

DB rows from before 2026-05-24 still carry `runtimeMetadata.cloud.provider === 'code_sandbox'`. Collapsing the union literal would require a destructive migration of those rows. The dead-code archive keeps the type system happy and the editor surfaces a re-import message instead of crashing. Once a one-shot user migration ships, this note's "Slated for full deletion" entries can land in a follow-up commit.

## Related code

- [packages/code-provider/src/providers/vercel-sandbox/index.ts](../../packages/code-provider/src/providers/vercel-sandbox/index.ts) — provider + scaffolders
- [packages/code-provider/src/providers/codesandbox/](../../packages/code-provider/src/providers/codesandbox/) — `@deprecated`
- [packages/constants/src/csb.ts](../../packages/constants/src/csb.ts) — `@deprecated`
- [apps/web/client/convex/projectActions.ts](../../apps/web/client/convex/projectActions.ts) — `createBlank`, `fork`
- [apps/web/client/convex/branchActions.ts](../../apps/web/client/convex/branchActions.ts) — `createBlank`, `fork`
- [apps/web/client/convex/lib/publishHelpers.ts](../../apps/web/client/convex/lib/publishHelpers.ts) — `forkBuildSandbox`
- [apps/web/client/src/components/store/editor/sandbox/session.ts](../../apps/web/client/src/components/store/editor/sandbox/session.ts) — `SessionManager.connect`
- [apps/web/client/src/components/store/editor/sandbox/vercel-browser-provider.ts](../../apps/web/client/src/components/store/editor/sandbox/vercel-browser-provider.ts) — browser-side proxy
