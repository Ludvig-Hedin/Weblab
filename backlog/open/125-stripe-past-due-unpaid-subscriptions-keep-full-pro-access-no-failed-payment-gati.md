# Stripe `past_due` / `unpaid` subscriptions keep full Pro access (no failed-payment gating)

- **Discovered:** 2026-05-29 (test-hardening session: billing audit, HIGH-confidence)
- **Where:** [convex/lib/stripeWebhook.ts:279](apps/web/client/convex/lib/stripeWebhook.ts#L279) (`isRenewal` only handles `stripeStatus === 'active'`), [convex/lib/enums.ts](apps/web/client/convex/lib/enums.ts) (`vSubscriptionStatus` is only `active | canceled`), entitlement at [convex/usage.ts:54](apps/web/client/convex/usage.ts#L54) (keys solely off `status === 'active'`).
- **Symptom:** When a renewal charge fails, Stripe sends `customer.subscription.updated` with `status: 'past_due'`. `_handleSubUpdated` has no branch that maps non-active statuses, so the row stays `active` and the user keeps Pro credits while not paying. There is **no `invoice.payment_failed` handler** (grep: 0 matches). Conversely, when `customer.subscription.deleted` finally fires, access is yanked with no prior grace/warning.
- **Root cause:** The subscription model has only two states; `past_due`/`unpaid`/`incomplete` are unrepresentable, and entitlement never consults `stripeCurrentPeriodEnd`.
- **Next step:** Decide the dunning policy (grace window vs immediate gate), extend `vSubscriptionStatus` + `_handleSubUpdated` to map `past_due`/`unpaid`, and add an `invoice.payment_failed` handler in the webhook switch ([convex/http.ts](apps/web/client/convex/http.ts)). Add a `convex-test` harness so `_handleSubUpdated` can be unit-tested.
- **Risk if ignored:** revenue leak (failed renewals keep access) + abrupt access loss with no warning UX.
- **Tags:** `#bug` `#billing` `#convex` `#money-path`
