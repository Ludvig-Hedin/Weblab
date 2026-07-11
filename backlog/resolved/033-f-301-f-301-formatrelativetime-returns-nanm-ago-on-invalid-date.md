# F-301 — `formatRelativeTime` returns `"NaNm ago"` on invalid date

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Resolved:** 2026-07-07 (found already fixed while triaging backlog) — `comments-tab/index.tsx:14-19` guards `Number.isNaN(d.getTime())` (returns `''`) and negative `diff` (returns `'just now'`).
- **Tags:** `#bug` `#editor` `#comments`
