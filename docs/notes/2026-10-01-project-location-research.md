# Project locations on macOS: source research

Research date: 2026-10-01. Scope: official Apple, Electron and Git documentation. This is research for a proposal, not an implementation or a claim about the current desktop app.

## What the platform actually provides

- **Persistent bookmarks are the right macOS locator.** Apple describes an NSURL bookmark as a persistent reference whose association *usually* survives moving or renaming a file or folder, app relaunch, and system restart. Resolution returns its current URL. This is best effort, not a guarantee of finding any moved folder. [Apple NSURL](https://developer.apple.com/documentation/Foundation/NSURL)
- **Paths and IDs are different tools.** A path becomes wrong after a Finder move. A file reference URL can follow an item moved on the same disk while the app runs, but Apple warns against storing it between launches because its ID may change after reboot. Use bookmark data for persistence. [Apple file access guide](https://developer.apple.com/library/archive/documentation/FileManagement/Conceptual/FileSystemProgrammingGuide/AccessingFilesandDirectories/AccessingFilesandDirectories.html)
- **Resource identifiers are supporting evidence, not project IDs.** `fileResourceIdentifier` compares filesystem objects, including paths that refer to the same inode on the same filesystem. Apple explicitly says it is not persistent across restarts. [Apple resource identifier](https://developer.apple.com/documentation/foundation/urlresourcevalues/fileresourceidentifier)
- **Do not use `preferFileIDResolution` to solve replacement conflicts.** Apple now marks this option deprecated and states it has no effect. A proposal that depends on it giving identity priority is unsafe. [Apple bookmark option](https://developer.apple.com/documentation/foundation/nsurl/bookmarkcreationoptions/preferfileidresolution)
- **Avoid minimal bookmarks for this use case.** Apple says `minimalBookmark` contains less information and can resolve in fewer ways. Full ordinary bookmark data is the better initial candidate for robust location tracking. This last choice is a recommendation. [Apple minimal bookmark](https://developer.apple.com/documentation/Foundation/NSURL/BookmarkCreationOptions/minimalBookmark)

## Sandbox access and stale bookmarks

Location and permission are separate concerns. In an App Sandbox build, Apple prescribes creating a security-scoped bookmark for access after relaunch, resolving with security scope, checking the stale result, recreating and replacing stored stale data, then starting access before I/O and stopping when done. A resolved URL alone does not grant access. Required entitlements and failure handling belong in the native integration. [Apple sandbox file access](https://developer.apple.com/documentation/security/accessing-files-from-the-macos-app-sandbox)

For background recovery, Apple provides `withoutUI` and `withoutMounting` resolution options. Recommendation: use them for quiet attempts; ask the user before a workflow that needs mounting or access approval. Do not show macOS dialogs automatically whenever the project list loads. [Apple resolution options](https://developer.apple.com/documentation/foundation/nsurl/bookmarkresolutionoptions)

## Electron implications

Electron documents `securityScopedBookmarks` and the returned base64 bookmarks as **macOS MAS only**. Its return table says non-MAS builds return an empty bookmark array regardless of this option. The dialog switch is therefore not a durable Finder tracking solution for an ordinary Electron distribution. [Electron dialog](https://www.electronjs.org/docs/latest/api/dialog)

`app.startAccessingSecurityScopedResource(bookmarkData)` is also MAS-specific and returns a cleanup function. Electron warns that failing to call cleanup leaks kernel resources and can prevent further sandbox access until restart. This documented API does not return a resolved current path or refreshed stale bookmark. [Electron app](https://www.electronjs.org/docs/latest/api/app#appstartaccessingsecurityscopedresourcebookmarkdata-mas)

**Architecture recommendation, inferred from those API boundaries:** use a small native Foundation bridge or helper for creating and resolving ordinary bookmarks in non-MAS builds. Expose current path, stale/refreshed bookmark data, and structured failures through the existing desktop main-process boundary. A sandboxed build also needs scoped access lifecycle handling. Confirm actual packaging, entitlements and subprocess access before choosing the bridge shape; browser JavaScript and an Electron dialog flag alone are insufficient.

## Limits that the UX must handle

| Situation | Evidence and safe product behavior |
| --- | --- |
| Same-volume rename or move | Strongest documented case for reference tracking. Attempt bookmark resolution quietly, validate the result, then update the shown location. |
| Cross-volume move | Apple FileManager implements cross-volume moves as copy then removal. This does not establish a bookmark guarantee for Finder moves. Treat automatic resolution as best effort and retain a Locate folder fallback. [Apple move API](https://developer.apple.com/documentation/foundation/filemanager/moveitem(at:to:)) |
| Copied folder | Recommendation: a copy is a second local instance, not proof the original moved. A copied marker would also duplicate its ID. Never automatically merge two visible copies solely by folder name, Git remote, content or a copied marker. |
| Missing, deleted or inaccessible folder | Recommendation: preserve the project card, chats and organization. Show “Folder unavailable” and Locate folder. Do not recreate the missing directory or infer deletion from one failed lookup. |
| Offline removable disk or network location | Recommendation: show temporary unavailability separately where evidence permits. Resolve again on reopen or reconnect; no full-disk scan by default. |
| Different folder now at the old path | Recommendation: existence at the old path is not enough. Validate against local-instance evidence. If ambiguous, ask which folder to attach before opening or writing. |

The official sources consulted do not promise deterministic bookmark behavior for copies, deletion/recreation, every cloud provider, network filesystem, or cross-volume Finder movement. These cases need a focused macOS prototype and explicit recovery acceptance criteria before making a user-facing reliability promise.

## Git adds a separate recovery step

Git linked worktrees keep connections with the main repository. Manually moving the main worktree breaks links from linked worktrees; manually moving a linked worktree prevents the main repository locating it. Git documents `git worktree repair` to reestablish these connections, including both directions when both main and linked worktrees move and their new paths are supplied. `git worktree move` cannot move the main worktree or linked worktrees containing submodules. Git also supports locking worktrees on intermittently mounted devices to prevent pruning. [Official Git worktree documentation](https://git-scm.com/docs/git-worktree)

Recommendation: discovering the new directory is only step one. Validate repository/worktree connections next. Offer or perform narrowly scoped repair of positively identified app-owned worktrees according to the product's authorization policy. Preserve changes, report failed repair, and never substitute pruning, recreating or deleting a worktree for reconnecting it. Restart app-owned watchers and services after rebinding; moving a folder does not imply a running process has a valid new working directory.

## Proposal shape

Use a stable app project ID for chats, settings and organization. Keep a separate, per-device local instance with bookmark data and a last known path. Treat that path as a useful display/cache, never the project primary key. A validated bookmark update changes the location attachment without creating another project.

Virtual folders should hold project IDs and their own names/order. Dragging a card into a folder or renaming a virtual folder changes organization only. Finder moves should not alter that membership. Display the physical location in project details with Show in Finder and Locate folder actions. Keep display-name changes separate from physical folder renaming unless the user explicitly invokes a disk action.

For unresolved or ambiguous locations, preserve the project and all app history, then let the user select a folder and confirm the attachment if identity conflicts. Optional portable markers can help validate a selection, but copied IDs require a copy/conflict policy. This separation is an architecture recommendation, not behavior supplied by macOS bookmarks.


## Current Weblab source assessment

Source inspection, not installed-app or live Finder proof: `apps/desktop/weblab-local.js` persists grants as canonical path strings (`grantLocalRoot`, `requireGrantedRoot`), keys the private-copy index by source path (`createPrivateWorkingCopy`), and validates an immutable manifest against its saved source path (`readPrivateCopyManifest`). Handoff reads and compares that saved source (`buildLocalGitHandoffPlan`). No bookmark/relocation recovery is present in these paths. An original folder rename/move can therefore make its saved source reference unavailable and prevent handoff. The private working copy is in app storage and is a separate directory, so moving only the source need not remove saved edits. This does not establish behavior of the installed legacy desktop version, which uses a different architecture.

The dashboard folders added in this thread contain project IDs in localforage and do not move filesystem directories. The new hover/details currently show the **working-copy path**, not a separately resolved source path. Recovery UX should show the source location first and offer the private-copy location as a secondary detail.

## Recommended UX and implementation boundaries

This is a proposal only. No application source was changed for this research.

1. **Library organization is the default.** Dragging a site between Weblab folders changes membership only. Project display names are independent of filesystem names. The physical action has the distinct label “Move folder on disk…”, never a second ambiguous “Move”.
2. **Keep project identity, source location and saved work separate.** A stable project ID owns chat/history/organization. Each device has its own source-location binding, bookmark and last-known path. The private-copy identity and edit journal remain stable when only the source location changes. No marker is written into the read-only source repository in the first implementation.
3. **Locate quietly, recover explicitly.** Resolve ordinary bookmarks on launch, open, app reactivation after filesystem events, and immediately before handoff. Validate the target before updating a binding. Check the known location too without trusting its existence as proof of identity. Refresh stale bookmarks. Watchers are triggers, not an identity system: Node documents unreliable/missing watch events and inode replacement caveats. [Node filesystem watch caveats](https://nodejs.org/api/fs.html#caveats)
4. **Preserve a missing project's normal card and saved work.** Show “Source folder unavailable. Your work is saved in Weblab.” with “Locate folder…”. If the drive is known to be disconnected, show “Connect [drive]”; if access is denied, offer access recovery. Do not claim deletion from absence. Editing in the available private copy may continue, but source-dependent handoff/apply is unavailable until reconnected. Separate backup of saved work remains available where supported.
5. **Reconnect in one flow.** The user chooses or drops the moved folder onto the affected card. Confirm folder identity independently of content drift. A known same-folder move rebinds; changed source files go to the existing change-review path. For a duplicate or uncertain identity, show both locations and “Use this folder as the source? Future updates will go to this folder.” Do not auto-merge copies based on name, Git remote or matching content. Cancellation leaves all bindings and saved work unchanged. Relinking missing folders is an established recovery pattern in Lightroom, although Weblab should additionally try bookmark recovery first. [Adobe folder recovery](https://helpx.adobe.com/ie/lightroom-classic/desktop/manage-catalogs-and-files/create-folders.html)
6. **Rebinding is a coordinated local transaction.** Preserve the immutable baseline and journal, update a separate mutable binding and permissions through the trusted native boundary, invalidate old handoff plans, and prevent open/export/relink races. Existing path-keyed index and manifest validation need an explicit migration; simply replacing every saved path or recreating the private copy would risk lost history or weakened validation. Git worktree identity/layout checks must distinguish expected relocation from source changes. Repairing an original worktree changes external Git metadata and needs an explicit reviewed action, not silent repair during discovery.
7. **Physical moving is a later, separate capability.** Show source and destination before action. Pause only Weblab-owned writes/CLI/services, refuse collisions and unsupported layouts, and recover after interruption. Cross-volume moves require verified copy and a recoverable cleanup phase; do not claim copy/delete is atomic or immediately remove the original after an incomplete copy. Linked worktrees/submodules need dedicated handling. Weblab can protect its own references but cannot promise to repair another app's absolute paths, external scripts or every cloud/network volume.

Recommended first scope: existing virtual folders + source-path details + bookmark tracking + manual reconnect with preserved history. Add physical movement only after recovery has been proven in the packaged app.

## Acceptance scenarios before shipping the recovery promise

- Rename a source folder, move its parent, move to another same-volume directory; repeat with the app closed and after Mac restart. Preserve one project ID, its folder membership, history and private edits.
- Move while AI edits the private copy; reconnect without overwriting or recreating saved work. Export cannot use a stale source-binding generation.
- Disconnect/reconnect a source disk; deny/restore permission. Show the appropriate temporary state without repeated unwanted system dialogs.
- Replace the old path with a different folder; copy a project while retaining the original; present two identical copies. Never silently attach the wrong instance.
- Move across volumes or through cloud-backed storage. Recover with a picker when automatic resolution fails; do not promise those cases auto-resolve.
- Change source files before/after relocation. Preserve identity where established and keep source-drift review intact.
- Crash during relinking or physical movement. Relaunch with recoverable state and no deleted unique files.
- Move a linked worktree or its main repository. Explain any repair, preserve Git state, and do not prune or recreate an unavailable worktree.
