# "Access denied" opening a just-created project — RESOLVED iter-12: collision-only, NOT a product bug

> **iter-12 (stable isolated session): did NOT reproduce.** Created a fresh blank project and immediately re-opened it with 0 UNAUTHORIZED — no "Access denied", preview rendered. So the iter-11 occurrence was the multi-agent collision racing the shared QA user's workspace, not a create→access-row bug. Closing.


- **Discovered:** 2026-06-18 (iter-11 authed Playwright; the shared QA user had a parallel agent active)
- **Symptom:** Created a fresh blank project as `weblab.qa+clerk_test`, then immediately re-opened it → the editor showed **"Access denied — Please contact the project owner to request access"** + a console `Failed to load project data`. Preview never rendered.
- **Most likely cause:** test collision — the parallel QA agent shares the same Clerk user/personal-workspace and was concurrently mutating it, so the access/ownership check for this run raced. **NOT yet confirmed as a product bug.**
- **Next step:** Reproduce in an ISOLATED session (single agent, no parallel +clerk_test activity): create → immediately open. If "Access denied" still appears, it's a real create→access-row race (the project graph is inserted optimistically by `projectActions.createBlank` before/while the access/userCanvas rows settle — see the iter-1 orphan-on-scheduler-failure note). If it doesn't, close as collision-only.
- **Tags:** `#bug?` `#convex` `#needs-repro`
