# F-332 — Terminal theme update doesn't `refresh()` xterm buffer

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Resolved:** 2026-07-07 — `terminal.tsx`: added `terminalSession.xterm.refresh(0, terminalSession.xterm.rows - 1)` after the theme assignment so existing buffer content repaints in the new theme.
- **Tags:** `#bug` `#editor` `#terminal`
