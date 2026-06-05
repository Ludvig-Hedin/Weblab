# Local-First Desktop Mode — Implementation Plan

Companion to [`2026-06-05-local-first-desktop-design.md`](./2026-06-05-local-first-desktop-design.md). Extends the **existing** `apps/desktop` app.

Conventions: every phase ends green on `bun typecheck` + its unit tests. Touch only listed files (multi-session tree — never `git add .`). Reuse `inferPortFromDevScript` and the install-command patterns already in `apps/web/server/src/sandbox/index.ts`.

---

## Phase 1 — Local file plumbing + boot to a live canvas

**Outcome:** Open a local Next.js/static-HTML folder in the desktop app → its dev server boots locally → canvas renders `http://localhost:<port>`; file read/write/list/watch all hit real disk.

### 1a. Electron IPC — filesystem (main + preload)
- `apps/desktop/main.js`: add origin-gated `ipcMain.handle`:
  - `weblab:localfs:pickFolder` → `dialog.showOpenDialog({properties:['openDirectory']})` → `{rootPath}|null`
  - `weblab:localfs:read|write|list|stat|rename|delete|mkdir|copy` → `node:fs/promises`, **path-confined** to a root passed per call (`resolveWithinRoot(root, rel)` that rejects `..`/absolute escapes).
- `apps/desktop/preload.js`: extend `window.weblabNative` with `localfs` (promise wrappers over `ipcRenderer.invoke`).
- **Verify:** unit test `resolveWithinRoot` (confinement); manual IPC round-trip via a tiny harness.

### 1b. Electron IPC — dev server + watch
- `main.js`: `weblab:localdev:start|stop|status` → `child_process.spawn(cmd,{cwd:root,env:syncShellEnvironment()})`; track child per root; stream stdout/stderr via `webContents.send('weblab:localdev:output',…)`. `weblab:localfs:watch:start|stop` → `chokidar.watch(root,{ignored:[node_modules,.git,.next,dotfiles]})` → `webContents.send('weblab:localfs:watch-event',…)`.
- Port: reuse `inferPortFromDevScript`; probe `http://127.0.0.1:<port>` until bound (≤90s), same as server `setup`.
- Add `syncShellEnvironment()` (port from `docs/archive/t3code/apps/desktop/src/syncShellEnvironment.ts`).
- **New dep:** `chokidar` in `apps/desktop/package.json`.
- **Verify:** spawn a dummy `npx serve` in a temp dir; confirm port-bound + watch-event on write.

### 1c. `LocalProvider` — implement the stub
- `packages/code-provider/src/providers/nodefs/index.ts`: replace no-op bodies with delegations to `window.weblabNative.localfs/localdev`. Implement `NodeFsFileWatcher` (subscribe to `watch-event`), `NodeFsTask` (dev lifecycle), command exec. `createSession()` → `{previewUrl:'http://localhost:'+port}`. `setup()` → install + start. Guard: throw if `window.weblabNative?.localfs` missing.
- Confirm `index.browser.ts` instantiates this in the renderer (read first).
- **Verify:** `bun --filter @weblab/code-provider typecheck`; unit tests with a mocked `weblabNative` (fs round-trips, path confinement, watcher callback, createSession url).

### 1d. Open-folder entry → local branch → render
- `apps/web/client`: desktop-gated "Open local folder" action → `pickFolder` → create a local branch (`runtimeType='local'`, `runtimeMetadata.local={rootPath}`) via the existing Convex branch path → open editor → `session.ts` already routes to `NodeFs`.
- Ensure the frame `src` is set from `createSession().previewUrl`.
- **Verify (manual, desktop):** open a sample Next.js folder → live canvas.

---

## Phase 2 — Visual edit ↔ disk + external sync
- Confirm element/style edits flow through `editorEngine` FS → `LocalProvider.writeFile` → disk (parser rebase unchanged).
- Echo-suppression: `LocalProvider` records paths it writes; the watcher ignores events for them within a debounce window so app writes don't loop.
- **Verify:** canvas edit appears in VS Code; VS Code edit appears on canvas (no loop).

## Phase 3 — Cloud AI on local files
- AI chat authenticated to cloud; `ClientTool` edits (`write_file`, `bash_edit`, …) apply via `LocalProvider`. Verify chat route works with a local active provider (expected: no server change).
- **Verify:** "make the hero button blue" edits the real source file; canvas + disk updated.

## Phase 4 — Create + import polish
- "New local project": scaffold via `@weblab/framework` templates into a picked empty folder (IPC writes) → open.
- Recent-projects: persist `{rootPath,name,lastOpened}` to Electron `userData/recent-projects.json`; surface a recents list; reopen rebuilds the local branch from `rootPath`.
- **Verify:** create → edit → close → reopen from recents → intact.

## Phase 5 — Release & website install
- Bump `apps/desktop/package.json` version; `electron-builder` build per platform; confirm `electron-updater` feed + the `download/page.tsx` URLs resolve to the new release assets.
- **Signing/notarization** (macOS Developer ID + notarize; Windows cert) — needs Ludvig's certs/secrets in CI. Document exact steps; unsigned fallback warns.
- **Verify:** tag `desktop-vX.Y.Z` → CI builds → download from site → install → run local-first flow end-to-end.

---

---

## Phase 1d — integration contract (researched 2026-06-05)

Status of the foundation: **C1 (Electron IPC bridge) + C2 (`LocalProvider`) are DONE, verified, committed** (`d87e511eb`). What remains for a user-triggerable P1 is the open-folder → local-project-create → render path. The schema + seams are fully present:

- `vProjectStorageMode` and `vBranchRuntimeType` (`convex/lib/enums.ts:110-120`) both include `'local'`.
- `projects.sandboxId` / `sandboxUrl` are **optional** (`schema.ts:279-280`) → a local project sets neither.
- `branches.sandboxId` is **required** `v.string()` (`schema.ts:300`) → a local branch needs a synthetic non-empty id (e.g. `local:<rootPath-hash>`); `session.ts` local path ignores it (uses `runtime.local.rootPath`).
- All cloud creates funnel through the `projects.create` mutation / `internal.projects._insertProjectGraph` (`projects.ts:441-559`) which writes project + branch + members + canvas + frames + conversation.

**Build steps:**
1. **`convex/projectActions.ts` → new `createLocal` action** (mirror `createBlank` minus sandbox provisioning): resolve workspace + `project.create` cap, then a new `internal.projects._insertLocalProjectGraph` mutation that writes:
   - project: `storageMode:'local'`, `runtimeMetadata:{ framework }`, no sandbox fields.
   - branch: `runtimeType:'local'`, `runtimeMetadata:{ local:{ rootPath, devCommand?, port? } }`, `sandboxId: 'local:'+hash(rootPath)`.
   - frames: **`url` = `http://localhost:<port>`** where `<port>` = inferred from the framework default (Next.js 3000 / static-html 3000) or a passed port.
2. **Desktop-gated UI entry** (`apps/web/client`, gated on `window.weblabNative?.localfs`): "Open local folder" + "New local project" → `pickFolder()` → `createLocal({ rootPath, name: basename(rootPath) })` → route to `/project/<id>`.
3. **`name`** derived from the folder basename.

**⚠️ The one runtime-verify item:** frame `url` is the iframe `src` (`canvas/frame/view.tsx`), set at create-time. For local the real port is only known after the dev server binds (`LocalProvider.createSession()` returns it). Two options to verify in a running editor:
   - (a) set frame `url` at create from the inferred port and ensure the dev server binds exactly that port (pass `port` into `runtime.local`), **or**
   - (b) after `createSession()`, write the returned `previewUrl` back to the frames (a small frames-url update mutation) and reload the iframe.
   Pick (a) if the inferred port is reliable; fall back to (b). **Must be verified against a running desktop build — a wrong port = blank canvas.** This is why 1d was not built blind.

## Cross-cutting
- **Docs:** update `apps/desktop/README`/`RELEASES.md`, `docs/feature-catalog.md` (+ `docs/test-plan.md`), `CLAUDE.md` sandbox note (local mode is now a real runtime), `docs/agent-memory/feature-log.md`.
- **Backlog:** any deferred edge (full cloud↔local sync engine, non-React element mapping) → `BACKLOG.md`.
- **Manual blockers to surface to Ludvig:** Apple Developer cert + (optional) Windows cert for clean website install.
