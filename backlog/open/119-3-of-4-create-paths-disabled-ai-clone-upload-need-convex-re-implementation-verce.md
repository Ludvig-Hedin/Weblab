# 3 of 4 create paths disabled — AI / clone / upload need Convex re-implementation (Vercel 402 now RESOLVED)

> **RESOLVED 2026-06-03** — all three are wired: AI prompt (`createFromPrompt`, commit `ab96d3e69`), site clone (`createFromWebsiteClone`, commit `38a0cf921`), upload folder (entry points route to the working `/projects/import/local` page → `createEmptySandbox`, commit `7a9c5df8e`). GitHub repo import also re-enabled (`createFromGit`). Remaining create gaps tracked in the two fork/figma entries at the top of Open.

- **Discovered:** 2026-05-29 (create-flow e2e session). External Vercel 402 blocker is **gone** — verified `Sandbox.create` provisions in ~3.6s and a blank snapshot resume serves HTTP 200 in ~13s. So **blank create works end to end** (`api.projectActions.createBlank`). The other three paths are still stubbed.
- **Where / current state:**
  - **AI prompt:** [src/components/store/create/manager.ts](apps/web/client/src/components/store/create/manager.ts) `startCreate` throws `UNAVAILABLE_MESSAGE`. Editor reads `api.projectCreateRequests.getPendingRequest` ([convex/projectCreateRequests.ts](apps/web/client/convex/projectCreateRequests.ts)) → only sets `isFirstCreation` (copy). **No insert mutation for `projectCreateRequests`, and no editor consumer that actually sends the prompt to the AI chat** — the auto-kickoff was part of the removed `project.create(creationData)` flow.
  - **Site clone:** [src/hooks/use-clone-website.ts](apps/web/client/src/hooks/use-clone-website.ts) `cloneFromUrl` — `scrapeUrl` ([convex/utils.ts:152](apps/web/client/convex/utils.ts#L152), returns markdown/HTML + base64 screenshot) works, then `unavailable('Cloning from URL')`. Clone = scrape → AI rebuild, so it depends on the same missing AI-kickoff.
  - **Upload folder:** [src/hooks/use-import-local-project.ts](apps/web/client/src/hooks/use-import-local-project.ts) throws before the FS-Access picker; needs the removed `sandbox.fork` + `orphanBulkUpload` + `startOrphan`.
- **Root cause:** Convex migration removed `sandbox.fork`, `project.create(creationData)`, and the bulk-upload/orphan primitives. `createBlank` returns `{projectId}` only and takes no initial files; `writeFile` exists on the provider ([packages/code-provider/src/providers/vercel-sandbox/index.ts:586](packages/code-provider/src/providers/vercel-sandbox/index.ts#L586)) but nothing wires scrape/upload content into a provisioned sandbox.
- **Next step (incremental, verify each in a logged-in browser before shipping):**
  1. **Upload** (no AI): client FS-Access gather → new Convex action: provision (createBlank path) → bulk `writeFile` into the live sandbox → re-snapshot → insert project graph.
  2. **AI kickoff**: add a `projectCreateRequests` insert mutation; add an editor consumer that, on a pending request, sends the stored prompt to the AI chat and marks the request done.
  3. **Clone**: reuse (2) — feed the `scrapeUrl` result as the create-request context.
- **Risk if ignored:** only blank create is usable; AI/clone/upload show "temporarily unavailable".
- **Tags:** `#feature` `#sandbox` `#convex` `#ai`
