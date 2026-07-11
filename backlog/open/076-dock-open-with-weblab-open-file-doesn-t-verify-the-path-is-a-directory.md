# Dock / "Open With Weblab" `open-file` doesn't verify the path is a directory

- **Discovered:** 2026-06-12 (caveman-review of desktop folder-drop)
- **Where:** apps/desktop/main.js `deliverOpenFolder` (`open-file` handler) → renderer `useOpenLocalProject.openLocalFolderAtPath`.
- **Symptom:** macOS `open-file` can fire for a FILE, not just a folder. `deliverOpenFolder` forwards any string path to the renderer, which calls `localfs.list(rootPath, '.')` — on a file path that errors and surfaces a generic toast.
- **Root cause:** `CFBundleDocumentTypes` registers `public.folder` only, but the OS / "Open With" can still hand a file path; no `fs.statSync(p).isDirectory()` guard in main before delivering.
- **Next step:** in `deliverOpenFolder`, guard with `fs.existsSync(p) && fs.statSync(p).isDirectory()`; if it's a file, drop it (or open its parent dir).
- **Risk if ignored:** confusing error when a file is opened via dock/"Open With"; cosmetic, not data-loss.
- **Tags:** `#bug` `#desktop`
