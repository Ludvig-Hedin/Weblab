import { internalMutation } from '../_generated/server';

// Periodic cleanup helpers invoked by `convex/crons.ts`.

// TTL must exceed the longest plausible client heartbeat gap (browser
// throttles backgrounded setInterval to ≥60s). 15min is a safe upper bound
// that still keeps the cursors table small.
const CURSOR_PURGE_TTL_MS = 15 * 60 * 1000;

// Convex mutations have an 8K read + 8K write document budget. Cap a single
// cron tick so a surge of disconnected sessions can't blow the limit and
// silently stop the purge job. Remaining rows roll over to the next 5-min
// tick — the cursors table converges either way.
const PURGE_BATCH_LIMIT = 1000;

export const purgeStaleCursors = internalMutation({
    args: {},
    handler: async (ctx) => {
        const cutoff = Date.now() - CURSOR_PURGE_TTL_MS;
        const stale = await ctx.db
            .query('cursors')
            .filter((q) => q.lt(q.field('lastSeen'), cutoff))
            .take(PURGE_BATCH_LIMIT);
        for (const row of stale) {
            try {
                await ctx.db.delete(row._id);
            } catch (err) {
                // One bad row must not stop the rest of the batch — log
                // and continue. Convex retries the mutation on transient
                // errors; persistent failures fall to the next tick.
                console.warn('[purgeStaleCursors] delete failed', row._id, err);
            }
        }
        return { deleted: stale.length, hadMore: stale.length === PURGE_BATCH_LIMIT };
    },
});
