import { internalMutation } from '../_generated/server';

// Periodic cleanup helpers invoked by `convex/crons.ts`.

// TTL must exceed the longest plausible client heartbeat gap (browser
// throttles backgrounded setInterval to ≥60s). 15min is a safe upper bound
// that still keeps the cursors table small.
const CURSOR_PURGE_TTL_MS = 15 * 60 * 1000;

// Convex mutations run in a single transaction with a bounded per-call
// read/write document budget. Cap a single cron tick well under that budget
// so a surge of disconnected sessions can't blow the limit and silently stop
// the purge job. Remaining rows roll over to the next 5-min tick — the cursors
// table converges either way.
const PURGE_BATCH_LIMIT = 1000;

export const purgeStaleCursors = internalMutation({
    args: {},
    handler: async (ctx) => {
        const cutoff = Date.now() - CURSOR_PURGE_TTL_MS;
        // Index range query (NOT `.filter`) — `.take(n)` bounds rows returned,
        // not rows scanned, so an unindexed filter would scan the whole table
        // every tick. `by_lastSeen` lets us read only the stale rows.
        const stale = await ctx.db
            .query('cursors')
            .withIndex('by_lastSeen', (q) => q.lt('lastSeen', cutoff))
            .take(PURGE_BATCH_LIMIT);
        let deleted = 0;
        for (const row of stale) {
            try {
                await ctx.db.delete(row._id);
                deleted++;
            } catch (err) {
                // One bad row must not stop the rest of the batch — log
                // and continue. Convex retries the mutation on transient
                // errors; persistent failures fall to the next tick.
                console.warn('[purgeStaleCursors] delete failed', row._id, err);
            }
        }
        return { deleted, hadMore: stale.length === PURGE_BATCH_LIMIT };
    },
});

// Stripe retries an event for up to 3 days; keep a margin and drop
// `stripeEventLog` rows older than 7 days. Past that window no replay can
// arrive, so the row is no longer needed for webhook idempotency. Without this
// the table grows unbounded (one row per Stripe event, forever).
const STRIPE_EVENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const purgeStaleStripeEvents = internalMutation({
    args: {},
    handler: async (ctx) => {
        const cutoff = Date.now() - STRIPE_EVENT_TTL_MS;
        const stale = await ctx.db
            .query('stripeEventLog')
            .withIndex('by_processed_at', (q) => q.lt('processedAt', cutoff))
            .take(PURGE_BATCH_LIMIT);
        let deleted = 0;
        for (const row of stale) {
            try {
                await ctx.db.delete(row._id);
                deleted++;
            } catch (err) {
                console.warn('[purgeStaleStripeEvents] delete failed', row._id, err);
            }
        }
        return { deleted, hadMore: stale.length === PURGE_BATCH_LIMIT };
    },
});
