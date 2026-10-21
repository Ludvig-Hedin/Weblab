# Finder moves and project organization research

**Implementation target:** `apps/desktop-local`, the local Mac app on GitHub main. Ordinary folder sites edit their actual saved folder; imported HTML is copied into a separate editable site. Ordinary folder projects do not have a private editing copy.

Research date: 2026-10-01. Scope: official Apple, Electron and Git documentation. Platform claims below come from official documentation. Current implementation and limits are described at the end.

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

## Current app source assessment and UX boundaries

The active app is `apps/desktop-local/apps/desktop`. Its site library stores a stable site UUID and a path. Ordinary folder sites edit that folder directly. Imported HTML is copied into an editable site folder, with the original file recorded as provenance. A path alone cannot prove the same folder remains there after a Finder move or replacement.

1. **Organization stays in the library.** Folder membership changes metadata, never disk location. Names and organization survive recovery because the site UUID stays the same.
2. **Show the editing location first.** Full path hover and Show details expose the actual folder or HTML entry. Imported HTML's original path is a secondary detail. Copy path, Reveal in Finder and Locate folder are distinct actions.
3. **Recover quietly when identity is proven.** Ordinary bookmarks resolve on opening/details, with strict directory identity validation. A failed resolution preserves the card and uses explicit Locate and confirmation. A copied folder, old surviving path, matching name or Git remote is insufficient. Watchers are triggers, not identity: Node documents missing watch events and inode replacement caveats. [Node filesystem watch caveats](https://nodejs.org/api/fs.html#caveats)
4. **Use one explicit reconnect flow.** Show previous and chosen locations before confirmation. Cancel leaves metadata untouched. Validate the current site shape and HTML entry/Git pointers. Never silently repair Git or move files. Folder relinking is an established recovery pattern in Lightroom. [Adobe folder recovery](https://helpx.adobe.com/ie/lightroom-classic/desktop/manage-catalogs-and-files/create-folders.html)
5. **Close before moving an active site.** The editor holds a fixed root. Guard queued/source actions and request cancellation when identity changes. Relink waits until every window has closed the site. An external command already executing cannot be undone by this check.
6. **Physical moving is separate work.** A future disk move must show source and destination, refuse collisions, pause app-owned operations, support interruption and verify cross-volume copies before deleting anything. The first scope has no physical move button and makes no promise about third-party absolute paths.

## Acceptance scenarios before shipping the recovery promise

- Rename a source folder, move its parent, move to another same-volume directory; repeat with the app closed and after Mac restart. Preserve one site ID, its folder membership and existing files/history.
- Move while AI edits: block new work, request cancellation and require closing/reopening before reconnect. Do not promise rollback of already executing external commands.
- Disconnect/reconnect a source disk; deny/restore permission. Preserve the unavailable card without repeated unwanted system dialogs.
- Replace the old path with a different folder; copy a project while retaining the original; present two identical copies. Never silently attach the wrong instance.
- Move across volumes or through cloud-backed storage. Recover with a picker when automatic resolution fails; do not promise those cases auto-resolve.
- Change source files before/after relocation. Preserve identity where established and keep source-drift review intact.
- Crash during relinking or physical movement. Relaunch with recoverable state and no deleted unique files.
- Move a linked worktree or its main repository. Explain any repair, preserve Git state, and do not prune or recreate an unavailable worktree.

## Current local app implementation

The Sites dashboard gets flat organization folders stored only in local app metadata. Moving a card never moves a Finder folder. The full editing path is visible on hover and in Show details; imported HTML's original file is secondary information.

A separate registry binds stable site UUIDs to checked directory identities and best-effort ordinary macOS bookmarks. New imports enroll after explicit selection/creation. Legacy sites require explicit Locate and confirmation once. Quiet resolution happens on opening/details, not a full-disk search. Uncertain copies require confirmation. Relinking preserves the site name, organization, preview and other saved metadata. Existing HTML entries and Git worktree pointers must still be valid; Weblab does not repair Git automatically. The JXA helper is shipped outside ASAR as an extra resource. Verified dead-owner lock recovery preserves live, uncertain and replaced locks.

An open site's location stays fixed. Relinking must wait for every window using that site to close. Source actions verify the directory first. The editor server checks root identity before incoming work, after queued work waits, and after upload bodies arrive. It stops new work on a mismatch and attempts to abort active agents. This cannot roll back an OS or external-agent command already executing. Close the site before moving it in Finder; reopen afterward. This limitation is deliberate and visible, rather than a guarantee that every third-party absolute path or running process survives a move.

Physical moves from Weblab, cross-volume automatic tracking, linked-worktree repair, MAS scoped access and full packaged-app/restart/offline-volume proof remain separate work. Temporary-folder tests are not proof of every Finder, cloud-storage or external command behavior.
