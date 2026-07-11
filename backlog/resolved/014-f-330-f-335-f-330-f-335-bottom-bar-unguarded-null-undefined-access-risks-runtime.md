# F-330..F-335 — Bottom-bar unguarded null/undefined access risks runtime crash

- **Discovered:** 2026-05-28 (validate-feature F-300..F-361 + F-420..F-439 run)
- **Resolved:** 2026-05-28 (backlog user-flow sweep, found already fixed but never moved out of Open) — the one genuinely-unguarded write, `terminal-area.tsx:82`, guards `sandbox?.session` before assigning; `terminal-area.tsx:55` access is inside a try/catch (safe); `restart-sandbox-button.tsx:177` `activeBranch.sandbox.id` is type-safe (`Branch.sandbox` is non-optional).
- **Tags:** `#bug` `#editor`
