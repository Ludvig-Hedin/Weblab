# F-427 — `disconnectGitHub` button shows confirm dialog then no-ops

- **Discovered:** 2026-05-28 (validate-feature F-420..F-439 run)
- **Resolved:** 2026-07-07 (found already fixed while triaging backlog) — `api.users.disconnectGitHub` is a fully implemented Convex mutation (`convex/users.ts:164-173`) that patches `githubInstallationId: undefined`; the tab calls it, updates local state, and toasts success/failure. No "temporarily unavailable" stub remains.
- **Tags:** `#bug` `#integration`
