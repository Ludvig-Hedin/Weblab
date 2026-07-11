# F-318 — `useDropdownControl` effect omits `isOpen` from deps → stale closure race

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Resolved:** 2026-07-07 (found already fixed while triaging backlog) — `use-dropdown-manager.tsx:137-143` has `isOpen` in the effect's deps, with a comment explaining why it's safe (sync direction is `openDropdownId` → `isOpen`, not the reverse — no loop risk).
- **Tags:** `#bug` `#editor` `#editor-bar` `#hook`
