# F-491 — `update` action does not catch already-released schedule from Stripe; upgrade/downgrade aborts

- **Discovered:** 2026-05-28 (validate-feature F-490..F-501 deep pass)
- **Resolved:** 2026-05-28 (backlog user-flow sweep, found already fixed but never moved out of Open) — the `release` call is wrapped in try/catch that swallows `invalid_request_error`, mirroring `releaseSubscriptionSchedule`.
- **Tags:** `#bug` `#billing`
