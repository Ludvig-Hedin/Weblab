# CodeSandbox Removal — Execution Plan

> **Status (2026-05-24): COMPLETED via Phase 1 + Phase 2 commits.** The
> dual-mode runtime is gone; Vercel Sandbox is the sole runtime. CodeSandbox
> provider files and `@codesandbox/sdk` were retained as `@deprecated` dead
> code per owner decision (full deletion gated on legacy row migration).
> See [docs/notes/2026-05-13-vercel-sandbox-provider.md](../notes/2026-05-13-vercel-sandbox-provider.md)
> for the post-archive runtime reference, and the architecture decision
> log entry dated 2026-05-24 for the rationale. The phase-by-phase plan
> below is retained as historical context; do not execute it again.

---

**Original status (now superseded):** Investigation complete 2026-05-23.
Execution deferred until parallel agent finishes the in-flight
Supabase→Convex / Vercel browser provider work.

**Base commit:** `d893c9242` (HEAD when this was written). After parallel agent
commits, re-verify file:line refs below — they may shift.

**Decisions captured (do not re-ask):**

| Decision | Value |
|----------|-------|
| Branch policy | Commit on `main` (no new feature branch) |
| Framework scope | Keep all (port Vite/Remix/Astro/TanStack/static-HTML to Vercel) |
| Live data | None — safe to delete CSB paths without back-compat shim |
| Removal style | Staged: Phase 1 additive → Phase 2 delete → Phase 3 docs |

---

## Symptom

User reports Claude keeps describing the codebase as using CodeSandbox even
though the user "migrated to Vercel Sandbox previously". Root cause: dual
provider state. `.env.example` sets `WEBLAB_CLOUD_PROVIDER=vercel_sandbox` for
local dev, but committed code defaults to `code_sandbox` and 30+ files still
branch on the provider type.

## Current state inventory

| Layer | File | What's there |
|-------|------|--------------|
| Enum | `packages/code-provider/src/providers.ts` | `CodeSandbox` + `VercelSandbox` + `NodeFs` + `E2B` + `Daytona` + `Modal` |
| Package | `packages/code-provider/package.json:43` | Both deps: `@codesandbox/sdk` AND `@vercel/sandbox` |
| Provider | `packages/code-provider/src/providers/codesandbox/` | Full CodeSandbox implementation (~1000 LoC) |
| Constants | `packages/constants/src/csb.ts` | CSB template IDs (`pf2nqh`, `pt_EphPmsurimGCQdiB44wa7s`, `html-qz83hv`) + `getSandboxPreviewUrl` helper |
| Env schema | `apps/web/client/src/env.ts:11-12` | `CSB_API_KEY: z.string()` (required), `WEBLAB_CLOUD_PROVIDER` default `code_sandbox` |
| Env example | `apps/web/client/.env.example` | `CSB_API_KEY` listed as required, `WEBLAB_CLOUD_PROVIDER=vercel_sandbox` set |
| Convex action | `apps/web/client/convex/projectActions.ts:171-280` | `createBlank` branches by framework + WEBLAB_CLOUD_PROVIDER; non-Next.js hardcoded to CSB |
| Convex models | `apps/web/client/convex/projects.ts:427, 474, 551` | `v.union(v.literal('code_sandbox'), v.literal('vercel_sandbox'))`, default `'code_sandbox'` |
| Convex action | `apps/web/client/convex/branchActions.ts` | CSB-specific branch lifecycle |
| tRPC router | `apps/web/client/src/server/api/routers/project/sandbox.ts` | `cloudProviderSchema`, `toCodeProvider`, `getProvider` defaults to CSB |
| tRPC router | `apps/web/client/src/server/api/routers/project/project.ts:632, 682, 768, 847-848` | Provider validation + defaults |
| tRPC router | `apps/web/client/src/server/api/routers/project/branch.ts` | Provider plumbing |
| tRPC router | `apps/web/client/src/server/api/routers/project/fork.ts` | CSB fork path |
| tRPC router | `apps/web/client/src/server/api/routers/publish/helpers/fork.ts` | CSB fork helper |
| DB mapper | `packages/db/src/mappers/project/branch.ts:32` | Default `provider: 'code_sandbox'` |
| Models | `packages/models/src/project/{branch,project}.ts` | Union type `'code_sandbox' \| 'vercel_sandbox'` |
| Frame UI | `apps/web/client/src/app/project/[id]/_components/canvas/frame/codesandbox-preview.ts` | Whole file is CSB-specific |
| Frame UI | `apps/web/client/src/app/project/[id]/_components/canvas/frame/index.tsx` | Imports + uses codesandbox-preview |
| Frame UI | `use-sandbox-liveness.ts`, `frame-connection.ts`, `use-frame-reload.ts` | CSB-specific behaviors |
| Editor store | `apps/web/client/src/components/store/editor/sandbox/{session,errors,terminal,global-error-suppress,index}.ts` | Provider branches |
| Editor store | `apps/web/client/src/components/store/create/manager.ts:337` | Provider union |
| Hooks | `apps/web/client/src/hooks/use-import-local-project.ts:114, 150, 175` | Provider routing |
| Hooks | `apps/web/client/src/hooks/use-clone-website.ts:102` | Provider union |
| Hooks | `apps/web/client/src/components/store/editor/git/git.ts` | CSB ref |
| Imports UI | `apps/web/client/src/app/projects/import/local/_context/index.tsx:205-250` | Provider routing |
| Imports UI | `apps/web/client/src/app/projects/import/figma/_context/index.tsx:174-237` | Provider routing |
| Restart UI | `apps/web/client/src/app/project/[id]/_components/bottom-bar/restart-sandbox-button.tsx` | CSB ref |
| Templates | `apps/web/client/src/app/projects/_components/templates/template-data.ts` | CSB template IDs |
| Framework adapters | `packages/framework/src/adapters/{vite-react,remix,astro,tanstack-start,static-html}.ts` | `codesandboxId` field on each |
| Framework registry | `packages/framework/src/registry.ts:72, 76` | `isFrameworkReady`, `listReadyFrameworkAdapters` |
| Framework types | `packages/framework/src/types.ts` | `codesandboxId` on `FrameworkAdapter.template` |
| Constants barrel | `packages/constants/src/editor.ts` | Re-exports from `csb.ts` |
| Tests | `apps/web/client/test/frame/codesandbox-preview.test.ts` | Whole file is CSB tests |
| Tests | `apps/web/client/test/pages/helper.test.ts` | CSB refs |
| Preload | `apps/web/preload/script/index.ts` | CSB ref |
| Scripts | `apps/web/client/scripts/create-csb-template.mjs` | Template provisioning script |
| Scripts | `apps/web/client/scripts/provision-template-sandboxes.mjs` | Uses CSB |
| Docs (will update Phase 3) | `CLAUDE.md`, `docs/agent-context/{repo-map,packages-reference,data-api-architecture,development-setup,editor-architecture}.md`, `docs/agent-memory/architecture-decisions.md`, `docs/notes/2026-05-13-vercel-sandbox-provider.md`, `docs/notes/2026-05-03-codesandbox-preview-tokenized-urls.md`, `docs/notes/2026-05-06-project-runtime-modes.md`, `docs/migration/DEPLOYMENT_MIGRATION_RUNBOOK.md`, `README.md`, `docs/audits/website-product-audit.md`, `docs/guides/deployment/{render-poc,railway}.md` |

Total: ~30 production files, ~10 doc files, ~3 test files.

**Active CodeSandbox refs (committed state):** 202 (excluding node_modules and tests)

---

## Pre-flight (verify before each phase)

```bash
git status --short | wc -l          # should be 0 (no parallel agent work)
git log --oneline -5                 # confirm base commit
bun typecheck                        # baseline passes
```

If `git status` is not empty, stop. Do not edit on top of parallel work.

---

## Phase 1 — Vercel becomes the only runtime (additive)

**Goal:** Every code path that today routes to CodeSandbox routes to Vercel
instead. CSB code still present as dead branches; deleted in Phase 2.

### 1.1 Add per-framework scaffolders to VercelSandboxProvider

`packages/code-provider/src/providers/vercel-sandbox/index.ts`

Add five scaffolders mirroring the existing `scaffoldNextProject` pattern
(write package.json + entry files + tsconfig, then `npm install`, then
`checkpointAndResume`):

- `scaffoldViteReactProject` — `package.json` with `vite` + `@vitejs/plugin-react`
  + `react` + `react-dom` + TS deps, `index.html` + `src/main.tsx` + `src/App.tsx`
  + `vite.config.ts`, dev: `vite --host 0.0.0.0 --port 5173`
- `scaffoldRemixProject` — Remix Vite, dev: `remix vite:dev --host 0.0.0.0 --port 3000`
- `scaffoldAstroProject` — `astro` + `@astrojs/check`, dev: `astro dev --host 0.0.0.0 --port 4321`
- `scaffoldTanstackStartProject` — TanStack Start template, dev: `vinxi dev --host 0.0.0.0 --port 3000`
- `scaffoldStaticHtmlProject` — single `index.html` + tiny `package.json` with
  `serve` dep, dev: `serve -l 8080 -s .`

Export per-framework `createProject` static methods so the convex action can
pick by framework id, OR pass framework id into existing `createProject` as
input and dispatch internally. Recommend the second — keeps the public API
narrow.

### 1.2 Flip env defaults

`apps/web/client/src/env.ts`

```diff
-    CSB_API_KEY: z.string(),
-    WEBLAB_CLOUD_PROVIDER: z.enum(['code_sandbox', 'vercel_sandbox']).default('code_sandbox'),
+    CSB_API_KEY: z.string().optional(),
+    WEBLAB_CLOUD_PROVIDER: z.enum(['code_sandbox', 'vercel_sandbox']).default('vercel_sandbox'),
```

(Phase 2 drops `CSB_API_KEY` and the `code_sandbox` enum value entirely.)

### 1.3 Rewrite convex/projectActions.ts createBlank

Drop the `framework === 'nextjs' && WEBLAB_CLOUD_PROVIDER === 'vercel_sandbox' ? vercel : csb`
branch. Always Vercel. Dispatch by framework:

```ts
const FRAMEWORK_VERCEL_SCAFFOLD: Record<string, 'next' | 'vite-react' | 'remix' | 'astro' | 'tanstack-start' | 'static-html'> = {
  nextjs: 'next',
  'vite-react': 'vite-react',
  remix: 'remix',
  astro: 'astro',
  'tanstack-start': 'tanstack-start',
  'static-html': 'static-html',
};
// then call VercelSandboxProvider.createProject({ framework: FRAMEWORK_VERCEL_SCAFFOLD[framework], port })
```

Remove the CSB fallback path. Remove the `CodeSandbox` import + key check.
Remove the catch-block CSB shutdown branch (Vercel auto-expires).

### 1.4 Flip every `?? 'code_sandbox'` default to `'vercel_sandbox'`

Mechanical sweep:

- `apps/web/client/convex/projects.ts:474` → `provider: args.sandboxRuntime?.provider ?? 'vercel_sandbox'`
- `apps/web/client/src/server/api/routers/project/project.ts:682` → same
- `packages/db/src/mappers/project/branch.ts:32` → `provider: 'vercel_sandbox'`
- `apps/web/client/src/server/api/routers/project/sandbox.ts:153` → `provider: CodeProvider.VercelSandbox`
- `apps/web/client/src/server/api/routers/project/sandbox.ts:58, 74` → drop CSB branch, always Vercel
- `apps/web/client/src/app/projects/import/{local,figma}/_context/index.tsx` → drop hardcoded `'code_sandbox'` fallbacks
- `apps/web/client/src/components/store/editor/sandbox/session.ts:80, 102` → drop CSB branches

### 1.5 Verify Phase 1

```bash
bun typecheck
bun lint
# Smoke: create a blank Next.js project end-to-end, verify preview loads on Vercel
# Smoke: if multi-framework flag on, create a static-html project, verify preview
```

**Commit:** `feat(sandbox): make Vercel the sole runtime, port all framework scaffolders`

---

## Phase 2 — Delete CodeSandbox

**Pre-flight:** Phase 1 verified, no preview regressions.

### 2.1 Drop the dependency

`packages/code-provider/package.json`

```diff
-    "@codesandbox/sdk": "^1.1.6",
```

Then `bun install` to update lockfile.

### 2.2 Delete CodeSandbox provider files

```
packages/code-provider/src/providers/codesandbox/
  index.ts
  utils/list-files.ts
  utils/read-file.ts
  utils/types.ts
  utils/utils.ts
  utils/write-file.ts
```

Whole folder gone.

### 2.3 Strip CodeSandbox from the provider barrel + factory

`packages/code-provider/src/index.ts`

- Remove `import type { CodesandboxProviderOptions } from './providers/codesandbox';`
- Remove `import { CodesandboxProvider } from './providers/codesandbox';`
- Remove `export { CodesandboxProvider } from './providers/codesandbox';`
- Remove `codesandbox?` from `ProviderInstanceOptions`
- Remove the `CodeProvider.CodeSandbox` branches from `getStaticCodeProvider` and `newProviderInstance`

`packages/code-provider/src/index.browser.ts`

- Same strip.

`packages/code-provider/src/providers.ts`

```diff
-    CodeSandbox = 'code_sandbox',
```

(Optionally also drop `E2B`, `Daytona`, `Modal` if those are dead — verify via
grep first. If they're never referenced, kill them too.)

### 2.4 Delete CSB constants + provider helper

`packages/constants/src/csb.ts` — delete the whole file.

Update `packages/constants/src/editor.ts` — remove the `csb.ts` re-exports.

Replace callers of `getSandboxPreviewUrl(sandboxId, port, previewToken)` with
the Vercel equivalent: the preview URL is returned by
`sandbox.domain(port)` (already stored in `branch.runtimeMetadata.cloud.previewUrl`).
Most callsites already read this from runtime metadata — just drop the helper
import.

`packages/constants/src/files.ts` — check if `STATIC_HTML_SANDBOX_ID` is
referenced. If yes, inline the static-html scaffold instead.

### 2.5 Strip CSB from tRPC routers

`apps/web/client/src/server/api/routers/project/sandbox.ts`

- Drop `CloudProvider` union → just `'vercel_sandbox'`, or drop entirely and
  remove the column from runtime metadata
- Drop `toCodeProvider` ternary → always `CodeProvider.VercelSandbox`
- Drop `getBranchCloudProvider` branch
- Drop the `CodeSandbox` import branch in `getProvider`
- Default `provider = CodeProvider.VercelSandbox`

`apps/web/client/src/server/api/routers/project/project.ts`

- Drop `provider: z.enum(['code_sandbox', 'vercel_sandbox'])` → single literal
  or drop validation
- Drop `'code_sandbox'` defaults

`apps/web/client/src/server/api/routers/project/branch.ts` — same

`apps/web/client/src/server/api/routers/project/fork.ts` — drop CSB fork path

`apps/web/client/src/server/api/routers/publish/helpers/fork.ts` — same

### 2.6 Strip CSB from convex

`apps/web/client/convex/projectActions.ts`

- Drop the `cloudProvider === 'code_sandbox'` branches in `createBlank` +
  cleanup (already done in Phase 1, verify nothing left)

`apps/web/client/convex/branchActions.ts` — drop CSB lifecycle helpers

`apps/web/client/convex/projects.ts`

```diff
-    provider: v.union(v.literal('code_sandbox'), v.literal('vercel_sandbox')),
+    provider: v.literal('vercel_sandbox'),
```

Or drop the union field if no longer needed.

### 2.7 Strip CSB from client editor + UI

Delete:
- `apps/web/client/src/app/project/[id]/_components/canvas/frame/codesandbox-preview.ts`

Edit:
- `apps/web/client/src/app/project/[id]/_components/canvas/frame/index.tsx`
  → remove codesandbox-preview import + branch
- `apps/web/client/src/app/project/[id]/_components/canvas/frame/use-sandbox-liveness.ts`
  → drop CSB-specific liveness ping if present, keep Vercel ping
- `apps/web/client/src/app/project/[id]/_components/canvas/frame/frame-connection.ts`
  → drop CSB-specific connect logic
- `apps/web/client/src/app/project/[id]/_components/canvas/frame/use-frame-reload.ts`
  → drop CSB branch
- `apps/web/client/src/app/project/[id]/_components/bottom-bar/restart-sandbox-button.tsx`
  → drop CSB restart, keep Vercel
- `apps/web/client/src/components/store/editor/sandbox/{session,terminal,errors,global-error-suppress,index}.ts`
  → strip provider branches
- `apps/web/client/src/components/store/editor/git/git.ts` → drop CSB ref
- `apps/web/client/src/components/store/create/manager.ts:337` → drop union
- `apps/web/client/src/hooks/use-import-local-project.ts` → drop CSB branches
- `apps/web/client/src/hooks/use-clone-website.ts` → drop CSB union
- `apps/web/client/src/app/projects/import/local/_context/index.tsx` → drop CSB
  hardcoded fallback (lines around 205-250)
- `apps/web/client/src/app/projects/import/figma/_context/index.tsx` → same
- `apps/web/client/src/app/projects/_components/templates/template-data.ts`
  → swap CSB template IDs for Vercel scaffold framework keys
- `apps/web/client/src/app/projects/_components/select/project-preview-surface.tsx`
  → drop CSB preview URL helper if used

### 2.8 Models: collapse union

`packages/models/src/project/branch.ts:6` → `provider: 'vercel_sandbox'` (or
drop the field)

`packages/models/src/project/project.ts:26` → same

### 2.9 Framework adapters: drop codesandboxId field

`packages/framework/src/types.ts` — drop `codesandboxId` from
`FrameworkAdapter['template']` (or rename to `scaffold: 'next' | ...` matching
Vercel scaffolder dispatch).

`packages/framework/src/adapters/{nextjs,vite-react,remix,astro,tanstack-start,static-html}.ts`
— drop `codesandboxId` field, add `scaffold` field if introduced.

`packages/framework/src/registry.ts` — drop `isFrameworkReady` (the TODO_
gate is now meaningless since all frameworks scaffold via Vercel) and
`listReadyFrameworkAdapters`. Update callers
(`apps/web/client/src/app/projects/import/local/_components/framework-picker.tsx`,
`apps/web/client/src/app/projects/_components/framework-select-dialog.tsx`)
to use `listFrameworkAdapters()` directly. The multi-framework flag stays as
a UI gate.

### 2.10 Env: drop CSB_API_KEY

`apps/web/client/src/env.ts`

```diff
-    CSB_API_KEY: z.string().optional(),
```

Also drop runtimeEnv mapping.

### 2.11 Delete CSB-specific scripts + tests

```
apps/web/client/scripts/create-csb-template.mjs
apps/web/client/test/frame/codesandbox-preview.test.ts
```

`apps/web/client/scripts/provision-template-sandboxes.mjs` — port to Vercel
or delete if unused.

`apps/web/client/test/pages/helper.test.ts` — strip CSB references.

`apps/web/preload/script/index.ts` — strip CSB ref.

### 2.12 Verify Phase 2

```bash
bun install                  # lockfile update
bun typecheck                # must pass
bun lint                     # must pass
bun test --timeout 30000     # all tests pass
# Manual: full create-blank smoke for Next.js
# Manual: editor open + edit + preview verify
# Manual: import-local smoke
```

Grep should return zero hits for these in non-doc, non-test files:

```bash
grep -r "code_sandbox\|CodeSandbox\|CSB_API_KEY\|@codesandbox/sdk\|csb\.app" \
  --include="*.ts" --include="*.tsx" --include="*.json" \
  apps/ packages/ | grep -v node_modules | grep -v test/
```

**Commit:** `chore(sandbox): remove CodeSandbox provider entirely`

---

## Phase 3 — Documentation

### 3.1 CLAUDE.md

Add to "Stack & Style" or new "Runtime" section:

```markdown
## Sandbox runtime — Vercel only

User projects run on Vercel Sandbox (`@vercel/sandbox`). The
`@codesandbox/sdk` dependency and CodeSandbox provider were removed
2026-05-23 (commit <hash>). Do not re-introduce CodeSandbox references or
suggest a multi-provider abstraction — the codebase is single-provider by
choice.

Required env: `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID`, `VERCEL_TOKEN`.
Optional: `VERCEL_SANDBOX_TIMEOUT_MS`, `VERCEL_BLANK_SNAPSHOT_ID`,
`WEBLAB_VERCEL_VCPUS`, `WEBLAB_VERCEL_WARM_POOL_SIZE`.

Per-framework scaffolders live in
`packages/code-provider/src/providers/vercel-sandbox/index.ts` —
`scaffoldNextProject`, `scaffoldViteReactProject`, etc.
```

### 3.2 docs/agent-memory/architecture-decisions.md

Append:

```markdown
## 2026-05-23 — CodeSandbox removed; Vercel Sandbox is the sole runtime

**Decision:** Drop `@codesandbox/sdk` and the entire `code_sandbox` provider
path. Vercel Sandbox handles every framework (Next.js, Vite, Remix, Astro,
TanStack Start, static-HTML) via per-framework scaffolders in the Vercel
provider.

**Reason:** Dual-mode code was confusing (committed default was CodeSandbox,
local dev was Vercel) and Claude kept describing the codebase as
CodeSandbox-backed even though the user had moved to Vercel. Single runtime
removes the ambiguity, drops a dep, simplifies the editor sandbox store.

**Reject:** Do not re-introduce a multi-provider abstraction unless a
concrete second provider lands.
```

### 3.3 docs/agent-memory/feature-log.md

Append:

```markdown
## 2026-05-23 — CodeSandbox removal

- Dropped `@codesandbox/sdk` dependency
- Deleted `packages/code-provider/src/providers/codesandbox/`
- Deleted `packages/constants/src/csb.ts`
- Added per-framework Vercel scaffolders for Vite-React, Remix, Astro,
  TanStack Start, static-HTML
- Flipped `WEBLAB_CLOUD_PROVIDER` default to `vercel_sandbox`
- Made `CSB_API_KEY` optional then dropped it
- Collapsed cloud provider union types to `'vercel_sandbox'` literal
```

### 3.4 docs/agent-context/*

Update these files to drop CSB references and describe Vercel-only:

- `docs/agent-context/repo-map.md` — runtime flow section
- `docs/agent-context/packages-reference.md` — `@weblab/code-provider` entry
- `docs/agent-context/data-api-architecture.md` — sandbox section
- `docs/agent-context/development-setup.md` — env vars section
- `docs/agent-context/editor-architecture.md` — sandbox lifecycle section

### 3.5 Rewrite docs/notes/2026-05-13-vercel-sandbox-provider.md

Replace the entire content with:

```markdown
# Vercel Sandbox is the sole runtime (CodeSandbox removed 2026-05-23)

Previously this note described a staged migration where CodeSandbox remained
the default. That migration completed 2026-05-23: CodeSandbox has been
removed entirely.

## Runtime

All projects run on Vercel Sandbox. Per-framework scaffolders live in
`packages/code-provider/src/providers/vercel-sandbox/index.ts`.

## Required env

- `VERCEL_TEAM_ID`
- `VERCEL_PROJECT_ID`
- `VERCEL_TOKEN`

## Optional env

- `VERCEL_SANDBOX_TIMEOUT_MS`
- `VERCEL_BLANK_SNAPSHOT_ID`
- `WEBLAB_VERCEL_VCPUS`
- `WEBLAB_VERCEL_WARM_POOL_SIZE`

`CSB_API_KEY` and `WEBLAB_CLOUD_PROVIDER` are gone.
```

### 3.6 Other doc files to scrub

- `docs/notes/2026-05-03-codesandbox-preview-tokenized-urls.md` — mark
  obsolete or delete
- `docs/notes/2026-05-06-project-runtime-modes.md` — update for single
  runtime
- `docs/migration/DEPLOYMENT_MIGRATION_RUNBOOK.md` — drop CSB references
- `README.md` — update if it mentions CodeSandbox
- `docs/audits/website-product-audit.md` — historical; flag as outdated
- `docs/guides/deployment/render-poc.md`, `docs/guides/deployment/railway.md` —
  update env var lists
- `docs/archive/*` — leave alone (historical)

### 3.7 .env.example

`apps/web/client/.env.example`

```diff
-# Codesandbox - Used to host user apps. Other providers may be supported in the future. May be optional in the future.
-CSB_API_KEY="<Your api key from https://codesandbox.io/t/api>"
+# Vercel Sandbox - required. All projects run here.
+VERCEL_TEAM_ID=team_...
+VERCEL_PROJECT_ID=prj_...
+VERCEL_TOKEN=vcp_...
```

And drop the `WEBLAB_CLOUD_PROVIDER` block (no longer used).

### 3.8 Changelog + blog

`apps/web/client/src/lib/changelog-entries.ts` — prepend:

```ts
{
    slug: 'vX-Y-vercel-only-runtime',
    version: 'X.Y',
    title: 'Faster, simpler sandbox runtime',
    description: 'All projects now run on Vercel Sandbox. Removed CodeSandbox dependency; cold-boot and preview reliability improved.',
    date: '2026-05-23',
    tags: ['Performance', 'Infra'],
}
```

Blog post optional — this is an infra change, not a user-facing feature.

**Commit:** `docs(sandbox): document Vercel-only runtime; remove CodeSandbox references`

---

## Verification before declaring done

```bash
# Code
bun typecheck                                                        # passes
bun lint                                                             # passes
bun test --timeout 30000                                             # passes
grep -rn "codesandbox\|CodeSandbox\|@codesandbox/sdk\|CSB_API_KEY" \
  --include="*.ts" --include="*.tsx" --include="*.json" \
  apps/ packages/ | grep -v node_modules | wc -l                     # must be 0

# Docs (allowed CSB refs)
# Only these may still mention CodeSandbox/Onlook-CSB history:
# - LICENSE.md (legal attribution)
# - docs/archive/**
# - docs/working-notes/codesandbox-removal-execution-plan.md (this file)
# - this commit's message

# Runtime smoke
# 1. Create blank Next.js project → preview loads
# 2. Edit a file in editor → HMR works
# 3. Open existing project → preview loads
# 4. (If multi-framework flag on) Create blank static-html → preview loads
```

If all green: done. Report.

---

## Notes for the next session

- 202 active CSB refs to clear (committed state). Working tree may have
  drifted — re-grep before each phase.
- Don't try to do Phase 1 + 2 + 3 as one commit. Three commits = three
  rollback points if a smoke test fails.
- Don't reintroduce a multi-provider abstraction "in case we need it later".
  Decision is single-provider. If a second provider ever lands, the
  abstraction can be reintroduced then.
- The five new scaffolders are the only real engineering work. The rest is
  mechanical sweep + delete.
