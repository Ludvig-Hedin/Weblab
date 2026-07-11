# Stale active-workspace id dead-ends "Start blank" — ✅ FIXED 2026-06-19 (iter-14)

- **Discovered:** 2026-06-19 (iter-14 user-flow bug-hunt — project-creation subagent)
- **Where:** `apps/web/client/src/hooks/use-create-blank-project.ts` (createBlank hero/dashboard hook)
- **Symptom:** A returning user whose `ACTIVE_WORKSPACE_STORAGE_KEY` (localStorage) points at a workspace that was **deleted** or that they were **removed from** clicks "Start blank" → `createBlank` forwards the stale `workspaceId` → `_requireProjectCreateCap` → `requireCap` throws plain `Error('FORBIDDEN: project.create')`. Convex **redacts plain action errors to "Server Error" in prod**, so the hook's catch shows a dead-end `Failed to create project / Server Error` toast (non-transient → no Retry; and Retry would re-fail with the same id). The user cannot create a project from the hero/dashboard until they manually clear localStorage.
- **Root cause:** The hook cast the raw localStorage id (`as Id<'workspaces'>`) and forwarded it without validating it's still an accessible workspace. Backend personal-workspace fallback only kicks in when **no** id is supplied.
- **Fix:** Subscribe to `api.workspaces.list` (the caller's real memberships) and drop + `removeItem` the stored id when the loaded list no longer contains it, falling back to the personal workspace (always allowed). While the list is still loading, forward as-is (no regression). No reliance on the redacted error string; no retry → zero risk of misrouting a project to personal when the team workspace was valid but a post-cap insert hiccuped. typecheck (code 0) + eslint clean.
- **Risk if ignored:** team users with churned/deleted active workspaces are hard-blocked from creating new projects.
- **Tags:** `#bug` `#convex` `#fixed`
