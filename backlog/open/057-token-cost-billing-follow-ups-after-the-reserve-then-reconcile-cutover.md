# Token-cost billing: follow-ups after the reserve-then-reconcile cutover

- **Discovered:** 2026-06-17 (token-cost billing ship)
- **Where:** `apps/web/client/convex/{usage,lib/creditCost,schema}.ts`, F-557
- **Symptom / follow-ups (none blocking — feature is live & verified):**
  1. **Deploy gate:** the new `costUsd` field on `usageRecords` + the
     `reconcileUsage` mutation must be deployed to the Convex backend (dev
     `avid-gnat-539` synced via `convex codegen`; prod ships via
     `convex-deploy-production.yml`). Until prod deploys, `reconcileUsage`
     calls 404 and the route's try/catch swallows it → billing silently stays
     at the conservative reserved 1 credit. Verify after the next prod deploy.
  2. **Tuning levers** live in `convex/lib/creditCost.ts`:
     `LLM_COST_BUDGET_FRACTION` (0.5 = 50% of plan price is model-spend budget)
     and `FREE_CREDIT_VALUE_USD` (0.125, mirrors T1). Free users currently get
     ~$6.25/mo of model spend (50 credits × $0.125) — lower `FREE_CREDIT_VALUE_USD`
     if free-tier burn is too high at scale.
  3. **Sync footgun:** `PRO_TIER_COST_CENTS` in `creditCost.ts` mirrors the
     `cost` of `PRO_PRICES` in `packages/stripe/src/constants.ts` (the Convex
     `prices` table has no `cost` column). Cross-ref comments added on both
     sides; a future improvement is to store `cost`/`creditValueUsd` on the
     `prices` row + backfill via the Stripe webhook to kill the duplication.
  4. **Not yet token-priced (intentional, out of scope):** `ASK`/`PLAN` chat
     remain free (as before); image generation stays a flat 5 credits
     (`reserveImage`). Re-price these if/when desired.
  5. **Unknown-model cost = 0** → reconcile fully refunds the reservation (free
     message). All routed models are in `MODEL_PRICING`; a registry gap would
     silently make those requests free. The existing `[observability] no pricing
     for model` warning is the signal to watch.
