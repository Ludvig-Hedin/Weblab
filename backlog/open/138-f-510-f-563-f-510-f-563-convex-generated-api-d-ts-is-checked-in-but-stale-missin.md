# F-510 / F-563 — Convex `_generated/api.d.ts` is checked-in but stale (missing `layoutGuideStyles`)

- **Discovered:** 2026-05-28 (validate-feature F-510..F-565 deep bug-hunt)
- **Where:** [apps/web/client/convex/_generated/api.d.ts](apps/web/client/convex/_generated/api.d.ts), drift introduced by [apps/web/client/convex/layoutGuideStyles.ts](apps/web/client/convex/layoutGuideStyles.ts)
- **Symptom:** Running `bunx convex codegen` against the live deployment regenerates `_generated/api.d.ts` with two new lines re-exporting `layoutGuideStyles`. The committed copy on `main` is missing those lines, so any client code that does `api.layoutGuideStyles.list()` (or similar) will fail TypeScript compilation against the checked-in generated file until codegen is re-run.
- **Root cause:** Latent — no production consumer of `api.layoutGuideStyles.*` exists yet (verified by `grep`), so CI hasn't caught it. The first commit that adds a consumer will break TS until someone re-runs codegen.
- **Next step:** Run `bunx convex codegen` from `apps/web/client/`, then `git add apps/web/client/convex/_generated/api.d.ts && git commit -m "chore(convex): refresh _generated for layoutGuideStyles"`. Also add an `F-566` row to [docs/feature-catalog.md](docs/feature-catalog.md) section 25 (and matching `T-566` to [docs/test-plan.md](docs/test-plan.md)) per the Change Protocol — the module is on disk but not catalogued.
- **Risk if ignored:** First PR that imports `api.layoutGuideStyles` will fail CI; reviewer will have to ask "did you re-run codegen?" instead of the diff being clean.
- **Tags:** `#docs` `#dx` `#convex`
