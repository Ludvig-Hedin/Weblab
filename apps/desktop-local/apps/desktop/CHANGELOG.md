# Changelog

## Unreleased (2026-10-01)

- Keep newer file changes when an older AI edit is undone, and wait for active edits before restoring files.
- Show partial files and guarded Undo after a failed or stopped AI turn.
- Block known secret files and renamed secrets from Upload, including Select all.
- Preserve unrelated staged work when uploading selected files.
- Import linked HTML pages and nested assets without following directory links.
- Check missing deployment keys on every attempt, and refuse preparation when remote settings cannot be checked.
- Keep the editor’s AI key out of the website preview process.
- Save local settings without following symbolic links or replacing unreadable files, and use a complete private temporary file before replacement.
- Explain that GitHub uploads can trigger hosting updates, test links may be public, and a failed deployment needs its online result checked.

## 0.2.1 (2026-09-29)

- Show and hide native dropdown options from the Style panel, then select an option to edit its look while the sketch stays in Edit mode.
- Smooth canvas pan and zoom for large HTML sketches by painting one transform per frame.
- Check for updates from the Weblab menu. New Mac releases also appear in the top bar and open their DMG download.

## 0.2.0 (2026-09-28)

- Edit shared components the way Framer and Webflow do: open one, change its props, and every use updates.
- Replace images by double-click, the menu, a dropped file or paste, and pick from an image library.
- Drag a website folder onto the Dock icon or a Weblab window to open it. A second website opens in its own window.
- Command-click a dashboard site or use its right-click menu to open it in a new window.
- Import a plain HTML file and its linked local assets from the desktop dashboard, then edit the copy without a framework setup.
