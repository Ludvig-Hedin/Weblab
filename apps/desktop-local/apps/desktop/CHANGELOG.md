# Changelog

## 0.2.2 candidate (unreleased)

- Keep the app’s AI key out of project scripts and preserve local settings when a save fails.
- Import linked HTML pages while refusing linked source folders and unsafe paths.
- Upload only selected files without disturbing other staged work. Explain that connected hosting may publish a GitHub push.
- Offer Undo for finished failed or cancelled edits when recovery data is complete. Refuse changed source folders and Git metadata targets.
- Check for missing hosting keys on every deployment attempt without replacing existing provider values.

- Organize Sites into folders without moving their source on disk.
- Reconnect a closed site after its folder moves. Changed folder identity blocks editing, uploads and publications until it is checked again.

- Type supported CMS text directly on the page, including split headings. Save or discard from the app header.
- Keep local Undo/Redo available after reopening the site. Protect unsaved text during reload, quit and site errors.
- Review text and source publications in the native app. Provider and signed-package acceptance remain open.

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
