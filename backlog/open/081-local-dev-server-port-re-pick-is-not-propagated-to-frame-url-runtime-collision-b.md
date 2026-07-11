# Local dev-server port re-pick is not propagated to `frame.url` (runtime collision → blank preview)

- **Discovered:** 2026-06-12 (desktop local-port EADDRINUSE fix)
- **Where:** apps/desktop/weblab-local.js (`startDevServer` → `findFreePort`), apps/web/client/src/components/store/editor/sandbox/{session.ts,index.ts}, convex/projects.ts `createLocal`. See `TODO(local-port-propagation)` in weblab-local.js.
- **Symptom:** the create flow now picks a free uncommon port and `restart` frees+rebinds the same one, so the common cases match. But if a *foreign* process grabs the project's stored port between sessions, the bridge increments to a different free port while `frame.url` (built at `createLocal`) still points at the old port → the iframe shows a blank/loading frame (no crash). Same for **legacy local projects created before this fix** whose stored `runtime.local.port` is 3000 — they collide with the editor's own :3000 and never match.
- **Root cause:** the bound port is authoritative on the desktop bridge, but nothing adopts the returned `{url}` back into `frame.url` when it differs from the stored port.
- **Next step:** after the local dev server reports running, compare its `url` to the branch frames' url; if different, `editorEngine.frames.updateAndSaveToStorage(frameId, { url })` + `reloadView` (SandboxManager has `editorEngine` + `branch`). A one-time migration (or auto-repick-on-open) handles legacy :3000 rows.
- **Risk if ignored:** rare blank preview on foreign-process collisions; legacy :3000 local projects stay broken until re-created.
- **Tags:** `#bug` `#tech-debt`
