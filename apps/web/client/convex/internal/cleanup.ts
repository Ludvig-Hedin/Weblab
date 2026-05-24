import { internalMutation } from '../_generated/server';

// Periodic cleanup helpers invoked by `convex/crons.ts`.

// TTL must exceed the longest plausible client heartbeat gap (browser
// throttles backgrounded setInterval to ≥60s). 15min is a safe upper bound
// that still keeps the cursors table small.
const CURSOR_PURGE_TTL_MS = 15 * 60 * 1000;

export const purgeStaleCursors = internalMutation({
    args: {},
    handler: async (ctx) => {
        const cutoff = Date.now() - CURSOR_PURGE_TTL_MS;
        // Use the by_project_lastSeen index to scan oldest-first cheaply.
        // Without an `eq` on projectId we can't use withIndex range — fall
        // back to a full scan + filter. Cursors table is bounded (~one row
        // per active editor session), so full scan is fine at <10k rows.
        const stale = await ctx.db
            .query('cursors')
            .filter((q) => q.lt(q.field('lastSeen'), cutoff))
            .collect();
        for (const row of stale) {
            await ctx.db.delete(row._id);
        }
        return { deleted: stale.length };
    },
});
