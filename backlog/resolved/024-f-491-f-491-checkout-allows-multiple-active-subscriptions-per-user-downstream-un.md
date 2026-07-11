# F-491 — `checkout` allows multiple active subscriptions per user; downstream `.unique()` queries crash billing portal

- **Discovered:** 2026-05-28 (validate-feature F-490..F-501 deep pass)
- **Resolved:** 2026-05-28 (backlog user-flow sweep, found already fixed but never moved out of Open) — `checkout` calls `_findActiveSubscriptionForCaller` first and throws `ALREADY_SUBSCRIBED`; `_findActiveSubscriptionForCaller` + `_findActiveProSubscriptionForPromo` use `.take(2)` + pick-first + `console.warn` instead of `.unique()`.
- **Tags:** `#bug` `#billing` `#critical`
