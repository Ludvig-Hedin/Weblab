# Project-create reliability: orphaned rows on scheduler failure + orphaned paid VM on provision timeout

- **Discovered:** 2026-06-17 (QA pass — create-flow bug-hunt; subagent line refs are approximate, confirm before fixing)
- **Where:** `apps/web/client/convex/projectActions.ts` (`createBlank` insert→`scheduler.runAfter(_provisionSandbox)`, ~line 472-491); `packages/code-provider/src/providers/vercel-sandbox/index.ts` (`withTimeout` ~45s race around `Sandbox.create`, and `VercelTerminal.run()` overwriting `this.command` without `.kill()`)
- **Symptom:** (1) If scheduling `_provisionSandbox` throws after the optimistic project graph is inserted, the project rows persist with no sandbox and no `_markProvisioningFailed` — the editor spins forever with no error path. (2) On the 45s provision timeout the overlay errors out but the underlying `Sandbox.create` SDK call keeps running to Vercel's own timeout → orphaned **paid** VM (no abort/cancel). (3) `VercelTerminal.run()` can accumulate zombie background processes (no kill of the prior detached command).
- **Next step:** (1) Compensating cleanup in the catch, or move inserts into the scheduled action so partial state is impossible. (2) Wire an `AbortController`/SDK cancel into the `withTimeout` race `finally`. (3) `this.command?.kill()` before reassigning. Confirm exact lines first (these came from a low-tool-use subagent).
- **Risk if ignored:** Stuck "ghost" projects; real billing leak from orphaned VMs.
- **Tags:** `#bug` `#convex` `#infra`
