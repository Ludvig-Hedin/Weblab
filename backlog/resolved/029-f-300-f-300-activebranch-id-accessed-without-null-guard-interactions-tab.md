# F-300 — `activeBranch.id` accessed without null guard (Interactions tab)

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Resolved:** 2026-07-07 (found already fixed while triaging backlog) — `list-view.tsx:96,107` and `timeline-editor.tsx:60-64` use `activeBranch?.id` + early return.
- **Tags:** `#bug` `#editor` `#interactions`
