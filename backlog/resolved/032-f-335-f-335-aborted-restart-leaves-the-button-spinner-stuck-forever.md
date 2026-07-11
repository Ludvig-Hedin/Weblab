# F-335 — Aborted restart leaves the button spinner stuck forever

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Resolved:** 2026-07-07 (found already fixed while triaging backlog) — [restart-sandbox-button.tsx:213-221](apps/web/client/src/app/project/[id]/_components/bottom-bar/restart-sandbox-button.tsx#L213) resets `restarting` / `restartElapsedSec` / `restartGraceUntilRef` on the abort path before returning.
- **Tags:** `#bug` `#editor` `#bottom-bar`
