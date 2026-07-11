# Expired Vercel sandbox restore/liveness is still unavailable after Convex migration

- **Discovered:** 2026-06-07 (local/prod E2E QA pass)
- **Resolved:** 2026-06-08 (local validation, not yet deployed to production)
- **Where:** `apps/web/client/convex/projectActions.ts`; `apps/web/client/convex/projects.ts`; `apps/web/client/src/app/project/[id]/_components/canvas/frame/use-sandbox-liveness.ts`; `apps/web/client/src/app/project/[id]/_components/canvas/frame/index.tsx`
- **Fix:** Added Convex-backed preview liveness probing and snapshot restore. The editor now validates branch-owned Vercel preview URLs server-side, detects stopped/reclaimed sandboxes, creates a new Vercel sandbox from the branch snapshot, updates project/branch/frame sandbox metadata, and reloads the editor onto the fresh preview.
- **Validation:** `bun --filter @weblab/web-client typecheck` passed. Local Convex sync via `bun --filter @weblab/web-client convex:dev:once` was required before browser testing. The previously expired project restored to a new sandbox URL and `curl -I https://sb-7hsurxnx9im0.vercel.run` returned `HTTP/2 200`.
- **Remaining production note:** Requires deployment plus Convex function deployment before `weblab.build` can serve the fix.
- **Tags:** `#bug` `#editor` `#sandbox` `#convex`
