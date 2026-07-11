# F-437 — Uploaded favicon / OG image path uses raw `file.name`

- **Discovered:** 2026-05-28 (validate-feature F-420..F-439 deeper pass)
- **Resolved:** 2026-06-19 (bug-hunt iter-17, commit `4a0fa75c4`, found already fixed while triaging backlog) — `settings-modal/site/index.tsx` uses the sanitized stored filename returned from `editorEngine.image.upload()`, not raw `file.name`.
- **Tags:** `#bug` `#editor` `#cms`
