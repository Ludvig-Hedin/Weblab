# Paid local editing release plan — 2026-09-23

## Scope

First release supports existing local Git projects through the desktop shell, visual editing for wired Next.js App Router + Tailwind v4 projects, and reviewed Git patch handoff. Other local projects can open for text and code editing, while visual style controls must fail closed. Online Clerk sign-in and Convex project metadata are acceptable for this release; project files stay local. Hosted publishing, cloud sandboxes, branch forks, and published CMS are outside this release. They must be unavailable with honest UI and backend errors while incomplete. A hosted Weblab UI is still needed for distribution; development can use a locally running UI.

## Release gates

1. Opening an existing Git folder changes no original project file, Git ref, index, commit, dependency tree, or dev process. A private working copy is created. Visual editing preparation is a separate explicit action and shows the exact changes it will make in that copy.
2. After preparation, the private copy is authoritative until a reviewed Git patch is handed to the original project. A visual edit writes the intended private file on disk; a reload and external disk edit reconcile without silent overwrite. Write conflicts fail visibly and preserve both versions for recovery.
3. Text, layout, color token, and breakpoint edits round-trip through source, reload, and undo/redo without changing unrelated classes or files. A stale DOM element ID cannot select the page body.
4. Local preview uses the dev server's actual port after boot and restart. Fixed-port collisions fail clearly; stop waits for the old child to exit.
5. Git handoff shows exact Weblab-only diffs and exports a patch that applies to a disposable clone of the source snapshot. Export refuses source drift and unrelated changes. Opening a folder never initializes Git or renames a branch; commit and push remain in the designer's Git client.
6. Cloud sandbox access is denied server-side until per-project authorization exists. Public mutations cannot attach caller-supplied cloud sandbox IDs. Clone, restore, publish, and branch fork cannot create misleading success or failed deployment rows.
7. A real desktop run on at least three existing Git projects completes open → prepare → select → edit at three widths → save → reload → undo/redo → external edit → review/export/apply Git patch → close/reopen, including a failed write and port collision. The visual edit matrix uses wired Next.js App Router + Tailwind v4 projects, including one without `public/` and one standard linked Git worktree. Plain static HTML and Next.js with another CSS system must open for code/text work and reject visual styles without changing preview or source. No lost edits or unexpected changes to the original Git state.

## Review findings added to the implementation contract

- The local editor starts terminal task sessions for every branch. Opening must skip the task's `open()` path and any dependency install or dev script. Preview starts only from an explicit control.
- The first disk snapshot enters ZenFS verbatim. `CodeFileSystem.writeFile` instruments and formats JSX/HTML, so raw hydration and ordinary local source saves must bypass that transform. A separate preparation plan computes the instrumentation diff without writing to disk.
- Multi-file edits need a transaction. Until one exists, reject them before the first disk write. A partial failure cannot silently leave half an action outside undo history.
- Native writes compare against the last disk hash and atomically replace one file. Node has no cross-process compare-and-swap rename, so an external write can race the final check. Keep recoverable original bytes and surface the precise limit.
- Renderer-origin checks are not a local file grant. Native IPC must bind every file, watcher, preview, and Git request to a folder chosen through the OS picker or native folder-open event. Arbitrary shell execution from the renderer must be removed or separately authorized.
- An empty responsive override map still needs an exact source removal. Sparse Tablet/Desktop entries must retain their prefixes. Tests must assert the source class diff, not only the in-memory map.
- A local project without the preload script may render a preview but cannot be called visually editable. The preparation step must install the bridge and keep sibling frames usable while showing a clear unprepared state.
- Git handoff must preserve the selected repository root and pre-existing staging. The first release can read Git status/diff and leave commit/push to the designer's Git client.

## Implementation order

### A. Stop destructive behavior first

- Make local `GitManager.init()` read-only for existing folders; never call `initRepo()` on local projects. Probe native Git, including worktrees, and preserve current branch, HEAD, and index.
- Propagate Electron command failures through `NodeFsProvider` and `SessionManager`; fix `GitManager.getStatus()` to return filenames.
- Add focused tests around a temporary dirty Git repository and failed command/push.

### B. Make local files usable and safe

- Hydrate `CodeFileSystem` from `NodeFsProvider` before the editor reads files. Do not use the cloud sync engine unchanged: its first pull instruments all JSX and then pushes it to disk.
- Introduce an explicit preparation step for source instrumentation and preload setup. Show the changed file set and require an intentional action before writing to the user's repo. Keep the original disk content if setup fails midway.
- After preparation, synchronize editor writes to disk with per-file baseline hashes. Before overwriting, compare the current disk content to the last observed version; surface conflicts rather than overwriting external edits. Watch disk changes and refresh the editor mirror.
- Reject symlink traversal outside the selected root and propagate directory listing errors. Exercise the actual manager path, not only `NodeFsProvider` in isolation.

### C. Make the visual edit loop reliable

- Preserve authored responsive value type and provenance, separate computed seeds from durable writes, remove obsolete breakpoint utilities on clear, and cancel pending rebase before undo/redo.
- Change stale element lookups to nullable and update every caller. Rebuild the committed preload artifact.
- Test exact source diffs, tokens, clear, undo/redo, reload, and DOM replacement.

### D. Finish local preview and Git handoff

- Propagate the dev server's actual loopback URL to frame URLs and branch runtime metadata as one authorized update; keep route paths. Await child exit on restart and fail clearly for a pinned occupied port.
- Show local Git status/diff accurately. Keep push and PR actions unavailable until their remote auth and failure paths are exercised.

### E. Close cloud exposure for this release

- Default cloud provisioning and Fastify sandbox file/command routes to disabled. Reject client-supplied cloud sandbox IDs in public Convex mutations.
- Disable unsafe Clone, restore, and publish at their backend entry points before provisioning or deployment-row creation. Hide or label those controls in the local release UI. Do not delete existing project records.
- Before any later cloud re-enable, add per-sandbox project authorization and recovery tests.

## Verification constraints

This checkout has no `node_modules`. Registered `agent-heavy-run` lanes now exist for Weblab install, typecheck, lint, tests, and preload build, but install and typecheck require 50% reclaimable RAM and the guard most recently reported 42%. The owner asked to continue source fixes without those checks. Browser verification also requires an `agent-browser-lease` and a registered dev server. Do not claim paid-work readiness from source review alone.

## Independent security review, 2026-09-23

- The local mirror must keep the hash from the source version being edited. A watcher refresh cannot silently advance an in-flight edit's write precondition. The first conservative fix rejects saves to an externally changed file until project reopen; a per-buffer accept/rebase flow remains.
- Git status can execute `core.fsmonitor` from repository config. Disable fsmonitor and optional locks for read-only status probes.
- Native path checks and hash checks cannot close the external-process race before path-based rename in portable Node. File identity checks and bounded backups reduce risk but do not meet the paid-work no-lost-edit gate. A descriptor-relative native helper or a documented exclusive-editing workflow is required.
- Cloud sandbox access must fail at the Fastify tRPC boundary and at every independent Convex provisioning or publishing entrypoint, including wireframe export and queued internal provisioning. The disabled tRPC handlers must keep their typed response contracts for existing client code.

## Current implementation checkpoint

Local opening, disk mirroring, explicit preview start, source preparation review, per-file guarded writes, rollback, native Git read-only status, responsive override repairs, stale DOM-ID handling, and cloud release gates are implemented in source. The reviewed preparation now uses same-origin scripts and refuses an old preload bundle; the checked-in public bundle is still old, so the current UI cannot complete preparation. The direct-original-write race led to the private-copy decision below. Static HTML without a dev script and Next.js without `public/` now have source implementations and focused native tests. Typecheck, lint, preload rebuild, and live desktop QA remain open release gates.

## Safety decision, 2026-09-23

A native descriptor-relative helper can confine paths, but macOS does not offer a rename that atomically checks the target's previous hash. An external editor can still save between Weblab's comparison and replacement. The paid-work flow therefore opens an existing Git root read-only, snapshots its current dirty working tree into a private Weblab-owned copy, and edits only that copy. The original worktree, index, HEAD, and Git metadata remain untouched by opening or editing. A handoff must show changes relative to the snapshot and export a Weblab-only Git patch for explicit import. If an unsupported file changes, export fails visibly rather than omitting it. This decision supersedes direct writes to the original folder in the earlier steps above. Direct original-root mutation is gated in native IPC.

The private copy, static/Next preview paths, guarded write journal, and handoff UI/export are implemented in source. Standard linked worktrees now materialize into independent, shallow private Git repositories; their source pointer, HEAD, index, and committed-tree size are checked. Focused native/provider tests passed (40) before the latest install and packaging changes. The current native checks pass 33/33, including linked-worktree patch application, interrupted-write recovery, and npm/Yarn/pnpm lock setup. An explicit frozen Bun dependency install in the private copy has been added in source, with lifecycle scripts disabled, symlink containment checks, and a successful-install record that gates preview. A single npm v2/v3, Yarn v1, or pnpm v9 lock can be migrated in isolation for that install; workspaces, local dependencies, and private registry setup remain unsupported. Desktop packaging source stages Bun 1.3.10 for macOS, Windows, and Linux and uses it for packaged preview; it has not been built or run. The machine guard still blocks this checkout's Bun install below its 50% reclaimable RAM floor. The public preload bundle is stale, and web type/lint plus live desktop editing proof remain open gates. Preview dev scripts retain the user's OS file permissions, so the UI warns before starting them.

The static HTML preview path does not provide a Tailwind stylesheet. Static HTML visual style edits are rejected before optimistic preview or source writes. A durable CSS writer with responsive rules and undo/redo remains deferred beyond the Tailwind Next.js first release. Local Next.js style capability is checked from the private branch's package, PostCSS plugin, App Router layout import, and Tailwind entry CSS; unsupported projects remain open for text/code work. This source guard still needs focused web checks and live desktop proof.

Opacity and layer visibility had direct iframe calls that skipped source history. They now use the source-backed style action. A queued style transaction waits for its iframe dispatch and style mirror before committing; responsive rebase is deferred until commit succeeds, and failed commits restore the preview. Focused web tests and live reload/undo proof are still required.
