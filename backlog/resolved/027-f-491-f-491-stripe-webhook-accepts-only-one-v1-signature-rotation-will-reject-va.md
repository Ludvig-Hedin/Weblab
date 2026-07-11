# F-491 — Stripe webhook accepts only one `v1=` signature; rotation will reject valid requests

- **Discovered:** 2026-05-28 (validate-feature F-490..F-501 run)
- **Resolved:** 2026-07-07 (found already fixed while triaging backlog) — `verifyStripeSignature` in `http.ts` collects every `v1=` pair into an array and accepts the request if any signature matches, with a comment explaining the rotation scenario.
- **Tags:** `#bug` `#billing` `#webhook`
