# Image credit deduction can't span multiple Pro rate-limit buckets

- **Discovered:** 2026-05-29 (image-gen independent review)
- **Where:** [convex/lib/usageMath.ts](apps/web/client/convex/lib/usageMath.ts) `selectDeductionBucket` (has a `TODO(image-credits)` marker); consumed by `applyIncrement` / `reserveImage` in [convex/usage.ts](apps/web/client/convex/usage.ts).
- **Symptom:** A Pro user whose remaining credits are split across two buckets (e.g. 3 + 4 left = 7 total) can't generate a 5-credit image because no single bucket holds ≥5 — they get `USAGE_LIMIT_REACHED` despite having enough total. Reachable near billing-period rollover. Text usage (cost 1) is unaffected.
- **Root cause:** deduction targets one bucket and the usageRecord links one bucket so `revertIncrement` can refund it; spanning buckets needs multi-link tracking.
- **Next step:** add a `linkedRateLimits: {id, amount}[]` field (or child table) on `usageRecords`, drain oldest-first across buckets in `applyIncrement`, refund each in `revertIncrement`.
- **Risk if ignored:** rare false "out of credits" for paying users near period boundaries.
- **Tags:** `#bug` `#billing`
