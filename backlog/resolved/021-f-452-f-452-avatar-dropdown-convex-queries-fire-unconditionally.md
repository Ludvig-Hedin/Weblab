# F-452 — Avatar dropdown Convex queries fire unconditionally

- **Discovered:** 2026-05-28 (validate-feature F-450..F-453 deeper pass)
- **Resolved:** 2026-07-07 — `avatar-dropdown/index.tsx` and `plans.tsx` both gate their Convex `useQuery` calls on `useHasAuthCookie() === true ? {} : 'skip'`.
- **Tags:** `#tech-debt` `#auth-gated`
