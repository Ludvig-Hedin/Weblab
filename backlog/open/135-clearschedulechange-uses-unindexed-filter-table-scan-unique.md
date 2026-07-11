# `_clearScheduleChange` uses unindexed `.filter` table scan + `.unique()`

- **Discovered:** 2026-05-28 (CodeRabbit-fix pass, local-review)
- **Where:** [apps/web/client/convex/lib/stripeWebhook.ts](apps/web/client/convex/lib/stripeWebhook.ts) — `_clearScheduleChange`, `.filter(q => q.eq(q.field('stripeSubscriptionScheduleId'), …)).unique()`
- **Symptom:** unlike every other lookup in the file (all `withIndex`), this scans the entire `subscriptions` table on each schedule release; `.unique()` throws if two rows ever share a schedule id. Violates the Convex "never `.filter`" guideline.
- **Root cause:** missing index; pre-existing (untouched by the dedup work).
- **Next step:** add `subscriptions.index('by_stripe_subscription_schedule_id', ['stripeSubscriptionScheduleId'])` and switch to `withIndex`; consider `.first()` over `.unique()` per the duplicate-row hazard already acknowledged in `_resolveCallerUserId`.
- **Risk if ignored:** full-table scan cost grows with subscription count; a duplicate schedule id crashes `releaseSubscriptionSchedule`.
- **Tags:** `#tech-debt` `#billing` `#performance`
