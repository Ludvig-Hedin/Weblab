# F-313 — Editor-bar `restart-sandbox-button.tsx` comment cites CodeSandbox

- **Discovered:** 2026-05-28 (static bug-hunt across F-300..F-402)
- **Resolved:** 2026-07-07 — comment rewritten for Vercel Sandbox (5-15s typical cold boot; explains the 60s ceiling is intentionally over-provisioned rather than the expected boot time). Left the numeric `RESTART_READY_CEILING_MS` unchanged (60s) — the backlog's "consider reducing to 30s" was speculative and touches live restart-timing behavior; not worth the regression risk for a comment-accuracy fix.
- **Tags:** `#docs` `#brand-leak` `#editor`
