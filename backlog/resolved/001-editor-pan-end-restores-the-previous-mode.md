# Editor pan-end restores the previous mode

- **Discovered:** 2026-06-13 (editor hotkeys + canvas deferred findings)
- **Resolved:** 2026-07-07 — `canvas/index.tsx` now stores the mode active before middle-mouse panning and restores it on mouseup, matching the already-fixed space-key pan behavior. Panning while in PREVIEW/COMMENT/CMS no longer drops the user into DESIGN.
- **Tags:** `#bug` `#editor` `#user-flow`
