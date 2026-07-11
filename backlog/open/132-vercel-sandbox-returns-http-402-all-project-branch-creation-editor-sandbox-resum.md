# Vercel Sandbox returns HTTP 402 — all project/branch creation + editor sandbox resume is blocked

- **Discovered:** 2026-05-29 (investigate: "can't create projects")
- **Where:** Vercel account behind `VERCEL_TEAM_ID` (set on both Convex deployments `avid-gnat-539` dev + `rapid-crab-113` prod). Surfaces at [apps/web/client/convex/projectActions.ts:243](apps/web/client/convex/projectActions.ts#L243) (`VercelSandboxProvider.createProject` → `Sandbox.create`).
- **Symptom:** `projectActions.createBlank` / `branchActions.createBlank` fail; prod client sees masked "Server Error" (request id `d93c958b083e9289`). Prod Convex log: `Uncaught Error: Status code 402 is not ok`. Editing an existing project also breaks because opening the editor resumes the sandbox via the same `Sandbox.create` call.
- **Root cause:** HTTP 402 Payment Required from the Vercel Sandbox API — the token authenticates (else 401/403) but the team has hit a spend/quota limit, has no payment method, or is on a plan that excludes Sandbox. **Not a code bug.**
- **Next step (manual, owner = Ludvig):** In the Vercel dashboard for the team in `VERCEL_TEAM_ID` → Settings → Billing: confirm an active paid plan that includes Sandbox, add/repair a payment method, and raise/clear the spend-management cap. Then retry "Start blank". If it should run on a different team, rotate `VERCEL_TEAM_ID`/`VERCEL_PROJECT_ID`/`VERCEL_TOKEN` on **both** Convex deployments (`npx convex env set … ` and `… --prod`).
- **Risk if ignored:** core product is unusable — no project can be created, opened, or edited.
- **Tags:** `#bug` `#infra` `#blocker` `#sandbox` `#billing`
