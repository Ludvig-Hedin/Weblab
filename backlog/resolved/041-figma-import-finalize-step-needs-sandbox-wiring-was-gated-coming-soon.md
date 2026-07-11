# Figma import — finalize step needs sandbox wiring (was gated "Coming soon")

- **Discovered:** 2026-06-13 (round-4 broken-feature sweep)
- **Resolved:** 2026-06-13 (local validation; typecheck + lint + figma unit tests green)
- **Where:** new server action `createFromFigma` in [convex/projectActions.ts](apps/web/client/convex/projectActions.ts); shared builder `scaffoldFigmaProjectFiles` in [packages/figma/src/scaffold.ts](packages/figma/src/scaffold.ts); rewired [import/figma/_context/index.tsx](apps/web/client/src/app/projects/import/figma/_context/index.tsx); re-enabled card in [import/page.tsx](apps/web/client/src/app/projects/import/page.tsx).
- **Root cause:** finalize hit three throw-stubs (`forkSandbox`/`startOrphanSandbox`/`orphanBulkUpload`). The deferred note suggested copying the local-import template (`createEmptySandbox` + client upload), but that's a **bare** sandbox — Figma scaffolding emits only `src/app/page.tsx` + `src/components/*.tsx` with no package.json/Next.js/deps, so a bare sandbox has nothing to install or serve.
- **Fix:** server-side `createFromFigma` mirrors `createFromWebsiteClone` — provisions a real Next.js sandbox (snapshot fast-path), overlays the Figma-generated TSX via `sandbox.writeFiles`, inserts the full project graph, returns `{ projectId }`. Client now calls this single atomic action. Imported frames render as editable Next.js components.
- **Follow-up:** higher-fidelity output tracked in the Open "Figma import is low-fidelity" entry.
