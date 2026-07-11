# Stripe webhook reads billing period from `items.data[0]`, not the subscription — API-version fragile

- **Discovered:** 2026-05-29 (test-hardening session: billing audit, NEEDS-VERIFICATION)
- **Where:** [convex/http.ts:195](apps/web/client/convex/http.ts#L195) (`current_period_start/end` read off `subscription.items.data[0]`; 202-drop guard at ~L222), SDK constructed with no pinned `apiVersion` at [convex/subscriptionActions.ts:27](apps/web/client/convex/subscriptionActions.ts#L27).
- **Symptom:** `current_period_start/end` moved onto subscription **items** only in Stripe API `2025-03-31.basil`+. On an older account default API version those fields are `undefined` → the guard returns `202` and silently drops the event — including `customer.subscription.created`, so a brand-new paid subscription is never persisted (user charged, zero access). Renewal quota reset also depends on a distinct `subscription.updated` rather than the canonical `invoice.paid` signal.
- **Next step:** Confirm the Stripe API version pinned for this account's webhook endpoint; make the parser fall back to `sub.current_period_*` when the item fields are absent; pin `apiVersion` on the `new Stripe()` client so the webhook JSON shape and SDK agree.
- **Risk if ignored:** on an API-version mismatch every checkout silently no-ops server-side.
- **Tags:** `#bug` `#billing` `#convex` `#needs-verification`
