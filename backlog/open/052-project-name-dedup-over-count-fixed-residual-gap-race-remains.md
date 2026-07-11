# Project-name dedup — over-count fixed; residual gap/race remains

- **Discovered:** 2026-06-17 (QA pass) — **over-count FIXED this commit**
- **Where:** `apps/web/client/convex/projects.ts` `_countProjectsByNamePrefix` (~line 1099); caller `apps/web/client/convex/projectActions.ts` (~line 459)
- **Symptom (fixed part):** `startsWith` prefix match counted `"New Project · Jun 1"` against `"Jun 10".."Jun 19"`, inflating the `(N)` suffix. Now matches the exact base + numbered siblings only (offline-verified: 6→3, suffix 7→4).
- **Residual:** Two creates in the same tick read the same count (no atomicity), and deleting a middle sibling leaves a gap so `existingCount + 1` can still collide.
- **Next step:** Move dedup into an atomic insert (compute next-free suffix inside the insert mutation), or switch `_countProjectsByNamePrefix` → an `internalQuery` returning taken names and pick the smallest free `(N)` — note this requires Convex codegen regen (blast-radius care on the shared tree).
- **Risk if ignored:** Occasional duplicate/gapped project names on rapid or post-delete same-day creation. Cosmetic.
- **Tags:** `#bug` `#convex`
