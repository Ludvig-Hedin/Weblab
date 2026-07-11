# F-491 — Stripe webhook lacks `evt.id` idempotency; replays grant duplicate credits

- **Discovered:** 2026-05-28 (validate-feature F-490..F-501 run)
- **Resolved:** 2026-05-28 (CodeRabbit-fix pass, found already fixed but never moved out of Open) — `stripeEventLog` table (`by_event_id`) + `alreadyProcessed()` guard at the top of every `_handleSub*` mutation; transactional dedup; bounded by a daily `purgeStaleStripeEvents` cron.
- **Tags:** `#bug` `#billing` `#webhook` `#idempotency`
