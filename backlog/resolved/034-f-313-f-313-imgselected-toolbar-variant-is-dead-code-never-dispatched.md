# F-313 ImgSelected toolbar variant is dead code — never dispatched

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Resolved:** 2026-07-07 (found already fixed while triaging backlog) — `editor-bar/index.tsx` imports `ImgSelected`, `TAG_TYPES[IMG] = ['img']`, and `getTopBar()` branches on `selectedTag === TAG_CATEGORIES.IMG`. Selecting an `<img>` renders the image-specific toolbar.
- **Tags:** `#bug` `#editor` `#editor-bar` `#catalog-drift`
