# Local-First Desktop Mode — Design Spec

- **Date:** 2026-06-05
- **Status:** Approved (design) → implementation
- **Owner:** Ludvig
- **Scope:** Add local-first project editing to the **existing** Weblab desktop app (`apps/desktop`). Not a new app — a new desktop **release** with new capability.

## Goal

> "I can download and use it and all features will work. Create and import and edit projects **locally**. Like I can open Cursor and do some edits and then close and it will be saved. Later I come back and any edits I made elsewhere (VS Code, Claude Code) will appear, because it's looking at the local code."

Concretely, in the desktop app:

1. **Open** a local folder → its dev server boots on the user's machine → the canvas renders `http://localhost:<port>`.
2. **Create** a new project scaffolded into a chosen local folder.
3. **Import** = open an existing local folder (same path as Open).
4. **Edit** visually (select element, edit text/styles/layout) **and** via AI chat → writes to the **real local files**.
5. **Persist:** disk is the source of truth. Close → reopen from a recent-projects list → state restored from disk.
6. **External-edit sync:** edits made outside the app (VS Code, Claude Code) are reflected live via a file watcher.

## Non-Goals (v1)

- Browser (non-Electron) local mode — impossible without local process/FS; **desktop-only**, gated on `window.weblabNative`.
- Non-React element→source mapping fidelity (visual *code* edits rely on `@weblab/parser` Babel JSX; React/Next.js + static-HTML are first-class, others render + file-edit but limited element mapping).
- Cloud↔local two-way project sync (the `BranchRuntime.sync` block exists but full sync engine is out of v1).
- Replacing cloud mode — cloud projects are unchanged; local mode is additive.

## Current State / Why This Is Tractable

The local-mode seams are **already scaffolded** (verified against code, 2026-06-05):

| Seam | File | Status |
|---|---|---|
| Runtime discriminant | `packages/models/src/project/branch.ts:1-24` — `BranchRuntime.type: 'cloud'\|'local'\|'hybrid'` + `local:{rootPath,devCommand,port}` + `sync` | **exists** |
| Provider selection | `apps/web/client/src/components/store/editor/sandbox/session.ts:140-155` — `runtime.type === 'local'` → `createCodeProviderClient(CodeProvider.NodeFs, …)` | **exists** |
| Provider factory | `packages/code-provider/src/index.browser.ts` (renderer) + `index.ts` (node) — `CodeProvider.NodeFs` branch | **exists** |
| Local provider | `packages/code-provider/src/providers/nodefs/index.ts` — `NodeFsProvider` + subtypes | **complete STUB** (all no-op) |
| Convex runtime fields | `apps/web/client/src/app/project/[id]/_adapters/convex-bootstrap.ts` — `runtimeType` / `runtimeMetadata` | **exists** |
| AI file tools client-side | `packages/ai/src/tools/classes/write-file.ts` (`extends ClientTool`, `executionSite='client'`) → `editorEngine` filesystem | **exists** |
| Desktop IPC pattern | `apps/desktop/main.js` (`ipcMain.handle('weblab:*')`, origin-gated) + `apps/desktop/preload.js` (`window.weblabNative`) | **exists** (no fs/spawn yet) |

So the build is: **implement the stubbed `NodeFsProvider` (renderer) to delegate over a new Electron IPC bridge** that does the real `fs` / `child_process` / file-watch in the main process, **plus** open/recent-folder UX and local-branch creation. The whole editor (canvas, parser, element editing, chat) is reused **unchanged** through the `Provider` interface.

## Architecture

```
┌─ Electron RENDERER (the existing web editor, loaded in BrowserWindow) ──────────┐
│  session.ts → createCodeProviderClient(NodeFs) → LocalProvider (renderer)        │
│  LocalProvider implements Provider by calling window.weblabNative.localfs.* (IPC)│
│  AI chat (cloud inference) → ClientTool.handle() → editorEngine FS → LocalProvider│
└───────────────▲───────────────────────────────────────────────┬────────────────┘
                │ contextBridge IPC (origin-gated)                │
┌───────────────┴─────────── Electron MAIN process ──────────────▼────────────────┐
│  ipcMain.handle('weblab:localfs:*'): real node fs (read/write/list/stat/rm/mkdir)│
│  ipcMain.handle('weblab:localdev:*'): child_process.spawn dev server, port probe │
│  chokidar watcher → webContents.send('weblab:localfs:watch-event', …)            │
│  syncShellEnvironment() so node/npm are on PATH; dialog.showOpenDialog picker     │
└─────────────────────────────────────────────────────────────────────────────────┘
                                  │ writes/reads
                          ~/path/to/users/project  (source of truth on disk)
```

**Inference stays cloud** (Weblab account, internet). Only the **file tools** execute locally — already true (`ClientTool`). No server changes required for AI.

### Data flow — open & edit
1. User clicks **Open folder** → `window.weblabNative.localfs.pickFolder()` → main `dialog.showOpenDialog({properties:['openDirectory']})` → `rootPath`.
2. Client creates a **local branch**: Convex project/branch row with `runtimeType='local'`, `runtimeMetadata.local = { rootPath, devCommand?, port? }`.
3. `SessionManager.start()` sees `runtime.type==='local'` → builds `LocalProvider({rootPath,devCommand,port})`.
4. `LocalProvider.setup()` → IPC: detect package manager, run install, then `getTask()/run()` → IPC spawn dev server (`syncShellEnvironment` first), probe port (reuse `inferPortFromDevScript`).
5. `LocalProvider.createSession()` → returns `previewUrl: http://localhost:<port>`. Frame `src` set to it; canvas renders the local site.
6. Visual edit / AI edit → `LocalProvider.writeFile()` → IPC `fs.writeFile` → disk.
7. `LocalProvider.watchFiles()` starts a chokidar watch (main) → external change → `watch-event` IPC → editor refreshes (provider's `ProviderFileWatcher` callback), **ignoring paths the app itself just wrote** (echo-suppression).

### Data flow — close & reopen
- Recent projects persisted (Electron `userData/recent-projects.json` **and/or** the Convex project row with `runtimeType='local'` + `rootPath`).
- Reopen → re-create the local branch from the stored `rootPath` → boot from disk. No app-side project copy; disk is canonical.

## Components (each isolated + testable)

### C1 — Electron IPC bridge (`apps/desktop`)
- **`main.js`**: register origin-gated `ipcMain.handle` channels:
  - `weblab:localfs:pickFolder` → `dialog.showOpenDialog`
  - `weblab:localfs:read|write|list|stat|rename|delete|mkdir|copy` → `node:fs/promises`, **path-confined to the project root** (reject `..` escapes)
  - `weblab:localdev:start|stop|status` → `child_process.spawn` with `cwd=root`, env from `syncShellEnvironment()`; stream stdout/stderr via `webContents.send`
  - `weblab:localfs:watch:start|stop` → `chokidar` on root (ignore `node_modules`, `.git`, `.next`, dot-dirs); emit `weblab:localfs:watch-event`
- **`preload.js`**: extend `window.weblabNative` with `localfs` + `localdev` namespaces (promised invoke + event subscription), exposed only in desktop.
- **New deps:** `chokidar` (watch). Reference patterns: `docs/archive/t3code/apps/desktop/src` (folder pick, `syncShellEnvironment`, child_process streaming).

### C2 — `LocalProvider` (`packages/code-provider/src/providers/nodefs/index.ts`)
Fill in the stub. Each `Provider` method delegates to `window.weblabNative.localfs/localdev`. Implement the real subtypes: `NodeFsFileWatcher` (subscribe to watch-event IPC), `NodeFsTask` (dev server lifecycle via `localdev`), `NodeFsTerminal`/`NodeFsCommand` (command run via IPC). `createSession()` returns `{previewUrl}`. Guard: throw a clear error if `window.weblabNative?.localfs` is absent (non-desktop).

### C3 — Open / Recent-projects UX (`apps/web/client`)
- Desktop-only entry points (gated on `window.weblabNative`): "Open local folder", "New local project", recent list.
- Local-branch creation helper → Convex (`runtimeType='local'`, `runtimeMetadata.local`).
- "New local project" = scaffold (reuse `@weblab/framework` scaffold templates) into the picked folder via IPC writes, then open.

### C4 — Cloud AI chat — unchanged
Already client-tool based; verify the chat route works when the active provider is `LocalProvider` (tools call `editorEngine` FS → local writes). No server edits expected.

## Provider method → IPC mapping (C2 detail)

| Provider method | Local impl |
|---|---|
| `readFile/writeFile/statFile/listFiles/renameFile/deleteFiles/copyFiles/createDirectory` | `weblab:localfs:*` (node fs in main) |
| `watchFiles` → `ProviderFileWatcher` | `weblab:localfs:watch:*` + `watch-event` subscription |
| `getTask` → `ProviderTask` (dev server) | `weblab:localdev:start/stop/status` |
| `runCommand/runBackgroundCommand` / `ProviderTerminal` | `weblab:localdev` command exec (install, git) |
| `setup` | detect PM + install + start dev server |
| `createSession` | return `{ previewUrl: 'http://localhost:<port>' }` |
| `gitStatus` | `git status --porcelain` via command exec |
| `initialize/ping/reload/reconnect/destroy/pause/stop/listProjects` | thin/no-op as appropriate |

## Security

- IPC channels **origin-gated** like existing `weblab:*` (check `event.senderFrame.url` against allowed origins).
- All fs ops **confined to the project root** — reject absolute paths outside root and `..` traversal.
- Dev server runs the **user's own code** (their repo) — same trust as them running `npm run dev` in a terminal; acceptable. No remote/untrusted code path here.
- No secrets added. `.env` files in the user's folder are theirs, on their disk.

## Risks & Dependencies

| Risk / dep | Mitigation / owner |
|---|---|
| **macOS signing + notarization** for a non-scary "install from website" | Apple Developer cert ($99/yr) — **Ludvig** (secret in CI). Unsigned builds install but warn. **Hard external blocker for go-live install.** |
| Windows SmartScreen | Code-signing cert — Ludvig (optional v1; warn otherwise). |
| User machine needs Node + per-project install (first boot slow) | Accepted; show install progress in UI; `syncShellEnvironment` for PATH. |
| Dev-server port detection | Reuse `inferPortFromDevScript` (already in `apps/web/server/src/sandbox/index.ts`); probe localhost until bound. |
| Watcher edit loops | Echo-suppress: ignore watch events for paths the app wrote within a short window. |
| Renderer can't use node fs directly | All fs/process via IPC to main — core of the design. |
| Multi-session tree | Touch only the files in the plan; never `git add .`. |

## Testing

- **Unit (`packages/code-provider`):** `LocalProvider` fs methods against a temp dir via a mocked `weblabNative` bridge (read/write/list/stat/rename/delete/mkdir round-trips; path-confinement rejects `..`).
- **Watcher:** external write → event delivered; self-write → suppressed.
- **IPC contract:** main handlers validate args + confine paths (node test against a temp dir).
- **E2E (manual, desktop):** open a sample Next.js folder → dev server boots → canvas renders → visual edit writes file → edit file in VS Code → canvas reflects it → close → reopen from recent → intact.
- Each phase ends with `bun typecheck` + targeted unit tests green.

## Phased build (v1 = all of it; this is safe internal order)

1. **P1 — Local file plumbing + boot:** IPC fs bridge (C1 fs+pickFolder) + `LocalProvider` read/write/list/stat/mkdir/delete + **watch** + dev-server spawn (C1 localdev) + `setup`/`createSession` returning localhost. Open-folder entry creates a local branch and renders the running site. *Exit: open a Next.js folder → see it live on the canvas; edits via file API hit disk.*
2. **P2 — Visual edit ↔ disk + external sync:** confirm element edits write to source files; chokidar → editor refresh with echo-suppression. *Exit: VS Code edit appears on canvas; canvas edit appears in VS Code.*
3. **P3 — Cloud AI on local files:** AI chat (authenticated) tool-edits apply to disk via `LocalProvider`. *Exit: "make the button blue" changes the real file.*
4. **P4 — Create + import polish:** "New local project" scaffold into a folder; recent-projects persistence + reopen. *Exit: create→edit→close→reopen intact.*
5. **P5 — Release:** `electron-builder` build, version bump, auto-update feed, **website download verification**, signing/notarization (cert-dependent). *Exit: download from site → install → use.*

## Open decisions (made)
- Preview runtime: **local dev server** (user-confirmed).
- AI: **Weblab cloud** inference, edits applied locally (user-confirmed).
- v1 scope: **full** (open+create+import+edit+AI) (user-confirmed); built in the 5 phases above.
- Provider home: **fill the existing `NodeFsProvider` stub** (renderer) + new desktop IPC — no new package, no new app.
