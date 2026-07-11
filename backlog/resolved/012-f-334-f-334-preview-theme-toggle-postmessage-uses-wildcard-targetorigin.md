# F-334 — Preview theme toggle `postMessage` uses wildcard targetOrigin

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Resolved:** 2026-07-07 — `preview-theme-toggle.tsx`: derives `new URL(frame.src).origin` per-frame (try/catch fallback to `'*'` only when `frame.src` is empty/unparsable, e.g. mid-boot `data:`/opaque src).
- **Tags:** `#bug` `#editor` `#security` `#defense-in-depth`
