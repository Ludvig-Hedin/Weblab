# F-558 — `userActions.remove` deletes Clerk identity before cascade can fail; orphan PII on partial-fail

- **Discovered:** 2026-05-28 (validate-feature F-510..F-565 deep bug-hunt)
- **Where:** [apps/web/client/convex/userActions.ts:42-49](apps/web/client/convex/userActions.ts#L42)
- **Symptom:** Account-delete UI calls Clerk `deleteUser` first, then `internal.internal.cascade.deleteUserCascade`. If the cascade mutation throws (Convex read-limit, transient network, schema validator), the Clerk identity is already gone but every Convex `users` row + all FK'd PII (workspaceMembers, projectMembers, providerConnections, hostingProviderConnections, subscriptions, rateLimits, usageRecords, aiUsageEvents, cursors, skills, deployments, projectInvitations, userCanvases, projectOfflinePins, feedbacks) remains.
- **Root cause:** Deliberate "Clerk-first" ordering per the docstring at line 13-18 ("Delete the Clerk identity FIRST so a partial failure cannot leave a re-signinable orphan"). Trade-off prioritizes auth invariant (no re-sign-in into a half-deleted account) over PII completeness, but no retry / dead-letter queue catches the orphaned-Convex case.
- **Next step:** After `deleteClerkIdentity` succeeds, wrap `deleteUserCascade` in a retry loop (3 attempts with exponential backoff) and, on terminal failure, write a row to a new `pendingUserDeletions` table that a cron sweeps until cascade succeeds. Alternative: split cascade into smaller bounded mutations (per-table chunks) so no single mutation hits the 16k read limit on heavy users.
- **Risk if ignored:** GDPR exposure on any partial-failure delete; admin `/admin/usage` dashboard surfaces a "deleted user" row indefinitely; cascade re-run by hand requires a DB engineer.
- **Tags:** `#bug` `#privacy` `#convex` `#tech-debt`
