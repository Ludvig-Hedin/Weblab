# Weblab fork and product audit — 2026-09-22

## Scope and evidence

Read-only source, Git history, backlog, and product audit. The worktree was clean on `main` at `f14610927` (2026-07-11). No app server, browser session, typecheck, or test suite ran. Dependencies are not installed in this checkout. Source paths below identify mechanisms and blockers; runtime incidence and fix quality still need live validation.

## Upstream comparison

Weblab and [onlook-dev/onlook](https://github.com/onlook-dev/onlook) share commit [`a242be584`](https://github.com/onlook-dev/onlook/commit/a242be584fa9c71ca5be9e5e7a2640595c4200be) from 2026-02-26. [Upstream `main` through `423e2e924`](https://github.com/onlook-dev/onlook/compare/a242be584fa9c71ca5be9e5e7a2640595c4200be...423e2e924366419e418ee049093872d535eea41a) adds four commits: three README/image edits and one [project-access security fix](https://github.com/onlook-dev/onlook/commit/423e2e924366419e418ee049093872d535eea41a) on 2026-07-21. There are no upstream editor fixes after the shared base to import. A re-check on 2026-09-23 found `main` still at `423e2e924`; the only later branch activity is an unmerged header-logo branch from 2026-03-27.

Weblab has 838 local commits since that base and replaced the upstream Supabase/tRPC/CodeSandbox stack with Clerk/Convex/Vercel Sandbox. Upstream's security patch changes tRPC routers removed from Weblab, so a cherry-pick does not apply. Its access-control concern does: `apps/web/server/src/router/routes/sandbox.ts:12-16,42-124` checks identity but not project ownership before file operations and command execution on a supplied sandbox ID. The public upstream README also says its newer hosted product is separate from this open-source editor; hosted-product improvements cannot be assumed to exist in the public repo.

## Current product state

The feature catalog describes a broad product: project creation/import, canvas and style editing, responsive frames, components, AI chat, branching, comments, CMS, desktop local folders, and publishing UI. The [July editor quality audit](editor-quality-audit.md) documents substantial fixes and a successful live walkthrough at that time. That is useful historical proof, not a current September end-to-end result.

| Area | Current assessment | Evidence |
| --- | --- | --- |
| Cloud editing | High work-loss risk on restore/re-pull; responsive source edits remain unsafe | `convex/projectActions.ts:1262-1299`, `src/services/sync-engine/sync-engine.ts:317-443`, `BACKLOG.md:45-52` |
| Desktop local editing | Real NodeFs and desktop IPC path exists, but still needs a running web UI, Convex/Clerk, and live reliability proof | `src/hooks/use-open-local-project.ts:164-225`, `convex/projects.ts:595-705`, `apps/desktop/main.js:8-10,301` |
| Publishing | Unavailable for every provider: `run` reaches a function that always throws | `convex/publishActions.ts:88`, `convex/lib/publishHelpers.ts:43-62` |
| Branching and cloning | Branch fork is unavailable; the separate project Clone action can report success while copying an older snapshot | `convex/branchActions.ts:45-62`, `convex/projectActions.ts:1409-1497`, `BACKLOG.md:498-499` |
| CMS | Editor binding/preview exists; no verified published CMS path | `convex/cmsBindings.ts:87-97`, `src/app/project/[id]/_components/cms-workspace/data-pusher.tsx:43-46`, `BACKLOG.md:524` |
| Deployment | Railway project was removed by the owner; current web app is not deployed | Owner report. No production probe performed. |

Paths in the table under `src/` and `convex/` are relative to `apps/web/client/`.

## Priority findings

1. **Protect saved work before any cloud pilot.** `restoreSandbox` recreates from the branch's stored snapshot ID and writes that same ID back. The restore flow reloads the editor. The sync engine then deletes local paths absent from the restored sandbox and writes sandbox content over matching local files without a local-dirty check. The same pull also runs on sync resume and boot retry. This establishes a work-loss mechanism for edits newer than the saved snapshot; live reproduction and the exact affected timing are still needed. See `apps/web/client/convex/projectActions.ts:1262-1299` and `apps/web/client/src/services/sync-engine/sync-engine.ts:214-276,347-443`. Do not fix this with an untested one-line direction flip: define snapshot/reconciliation ownership, add a fixture covering edit → expiry → restore, then test the live flow.
2. **Make responsive edits round-trip safely.** The override map seeds values from computed iframe styles, then sends them through a source rebase as if authored. Value/custom type and provenance are lost, so tokens can become hardcoded classes. Clearing an override also leaves existing breakpoint utilities in source, or skips the write when the map becomes empty. See `src/components/store/editor/style/index.ts:307-416`, `action/index.ts:275-286`, `code/tailwind.ts:84-98`, and `BACKLOG.md:45-52,614`. Gate on source diff and reload tests across desktop/tablet/mobile, named tokens, clear, and undo.
3. **Authorize each sandbox operation.** The Fastify proxy allows a signed-in caller with a sandbox ID to read/write files and run commands without project membership checks. This is a cross-project access risk before external users. See `apps/web/server/src/router/routes/sandbox.ts:12-16,42-124`. Resolve sandbox ID to project and check capabilities on every operation; test denied cross-project reads, writes, and command execution.
4. **Repair or remove dead-end product actions.** Publish always throws, and branch fork explicitly throws. Publishing UI currently exposes the action, so the application cannot complete the core design-to-live-site journey. See `convex/lib/publishHelpers.ts:43-62`, `convex/branchActions.ts:45-62`. Implement a safe Vercel snapshot/build fork and validate deployment, or hide those actions during a local beta.
5. **Stop stale project cloning.** The live project Clone action resumes the default branch's stored snapshot ID without taking a fresh snapshot of edited files, then reports success. It can therefore copy the saved snapshot state instead of the current project; marketplace template use reaches this path too. This is separate from the disabled branch fork. See `convex/projectActions.ts:1409-1497`, `src/app/projects/_components/settings/clone-project.tsx:30-53`, and `BACKLOG.md:498-499`. Disable Clone for edited projects until it captures current files and the project graph, then test content equality after cloning.
6. **Verify local desktop preview recovery.** Desktop can choose a new free port while the frame keeps its persisted URL; the new URL is not propagated in the inspected path. Static HTML scripts with fixed ports can also ignore `PORT`. This can leave the local canvas blank on a collision. See `apps/desktop/weblab-local.js:171-185,274-303` and `BACKLOG.md:1242-1252`. These are source-backed risks, not live reproductions. Desktop local branches bypass the cloud sync/restore risks above (`src/components/store/editor/sandbox/index.ts:146-148`).
7. **Fix stale element lookup at the bridge.** Preload falls back to `document.body` for an unknown element ID; surviving editor callers can treat the body as a valid selection. See `apps/web/preload/script/api/elements/index.ts:7-9` and `BACKLOG.md:575`. Change the nullable bridge contract, update consumers, rebuild the preload artifact, and test stale selection after DOM replacement.

## A credible local beta

Start with **desktop local editing of existing Next.js/Tailwind projects**, aimed at a designer working with a developer who owns the Git repository. Running the web UI on `localhost` alone does not make cloud projects local: `sandbox/session.ts:139-166` still selects Vercel Sandbox unless the project runtime is `local`. The desktop shell loads the web UI from a configured URL (`apps/desktop/main.js:8-10,301`); with Railway removed, a local beta needs that UI running locally and the shell pointed at it. Desktop local projects still create their metadata in Convex and require sign-in. This is not offline software.

Accept a beta only after three real, non-demo sites complete this loop without source corruption: open folder → select elements → edit text/layout/style at three widths → save → reload → undo/redo → inspect Git diff → close/reopen. Include external code changes, preview port collision, and a failed write. Measure task completion, lost edits, time to first usable canvas, and unsupported elements. Have designers perform their own tasks while observing where they return to code or another tool.

For a hosted-site promise, add reliable preview sharing, publish/staging/rollback, custom domains, and end-to-end CMS publication before claiming a Framer or Webflow replacement. [Framer's version/staging flow](https://www.framer.com/help/articles/staging-and-versions/) and [Webflow's CMS pages](https://help.webflow.com/hc/en-us/articles/33961307099027-Intro-to-the-Webflow-CMS) are practical baseline jobs. Full feature parity is a much larger investment than the local beta; avoid it until the edit/save loop earns trust.

## Recommended order

1. Rebuild a reproducible local environment and run one witnessed desktop editing flow. Check the current Clerk/Convex connection and sandbox credentials without assuming the existing `.env.local` values are valid. Do not recreate Railway yet.
2. Add focused recovery and responsive round-trip tests, fix the work-loss paths, and repair desktop preview URL propagation. Re-run the same three-site designer loop.
3. Close sandbox ownership authorization before any multi-user beta. Make incomplete actions unavailable in the UI until their backend path works.
4. Restore preview/publish with a safe build copy and rollback. Prove CMS content in a published build before offering CMS as a site feature.
5. Redeploy the web app only after the local beta and deployment path pass; Railway removal alone does not explain the editor's code-level blockers.

The first live local run will determine effort. Source-only evidence supports a focused stabilization project, not a small upstream merge or a routine redeploy.
