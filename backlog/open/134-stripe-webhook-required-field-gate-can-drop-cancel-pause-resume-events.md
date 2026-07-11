# Stripe webhook required-field gate can drop cancel/pause/resume events

- **Discovered:** 2026-05-28 (CodeRabbit-fix pass, local-review)
- **Where:** [apps/web/client/convex/http.ts:216-234](apps/web/client/convex/http.ts#L216-L234) — the `if (!event.id || !sub.id || !item?.id || !priceId || !customerId || !item.current_period_start || !item.current_period_end)` 202 gate
- **Symptom:** the gate requires `priceId` + `customerId` + `current_period_*` for **every** routed event before dispatch, then 202-accept-ignores (no Stripe retry). But `_handleSubDeleted` / `_handleSubPaused` / `_handleSubResumed` only consume `subscriptionId`. If Stripe ever delivers a cancel/pause/resume without a fully-expanded price/period (e.g. canceled-immediately, or future API-version field relocation), the event is permanently dropped and the subscription stays `status:'active'` in our DB → user keeps entitlements they no longer pay for.
- **Root cause:** one-size gate; pre-existing (predates the `evt.id` dedup work, which only added `!event.id` to the same gate).
- **Next step:** gate billing fields only for `created`/`updated` (`const needsBilling = event.type === 'customer.subscription.created' || 'customer.subscription.updated'`). **Must also** relax `vSubEventInput` (make `priceId`/`customerId`/`currentPeriod*` optional) since those handlers don't read them — a gate-only change would pass the gate then fail the validator → 500 retry loop. Needs a convex-test once a harness exists.
- **Risk if ignored:** low in practice (Stripe currently sends the full subscription object on delete/pause/resume) but a silent revenue/entitlement leak if that ever changes.
- **Tags:** `#bug` `#billing` `#webhook`
