import { mutation } from './_generated/server';
import { requireUser } from './lib/permissions';
import { evaluateTranscribeRateLimit } from './lib/transcribeRateLimit';

// Fleet-wide sliding-window rate limit for POST /api/transcribe (F-476).
//
// Replaces the old in-memory `Map` in
// `src/app/api/transcribe/helpers/rate-limit.ts`, which was per-Node-process:
// on Railway with N replicas each replica enforced its own 10/min cap, so the
// effective fleet-wide limit was `N × 10`/min instead of 10/min. Reading and
// patching a single `transcribeRateLimits` row per user inside one Convex
// mutation keeps the cap global regardless of how many replicas are running.
//
// Distinct from the `rateLimits` table in `schema.ts` — that one backs
// Pro billing/credit quotas (`usage.ts`) and must not be reused or modified
// for this unrelated anti-spam concern.

export const checkAndRecord = mutation({
    args: {},
    handler: async (ctx): Promise<{
        allowed: boolean;
        remaining: number;
        retryAfterSeconds: number;
    }> => {
        // Auth is derived server-side from the caller's identity, never from
        // a client-supplied id — mirrors `usage.increment` etc.
        const user = await requireUser(ctx);

        const existing = await ctx.db
            .query('transcribeRateLimits')
            .withIndex('by_user', (q) => q.eq('userId', user._id))
            .unique();
        const decision = evaluateTranscribeRateLimit(existing?.timestamps ?? [], Date.now());

        if (existing) {
            await ctx.db.patch(existing._id, {
                windowStart: decision.windowStart,
                timestamps: decision.timestamps,
            });
        } else {
            await ctx.db.insert('transcribeRateLimits', {
                userId: user._id,
                windowStart: decision.windowStart,
                timestamps: decision.timestamps,
            });
        }

        return {
            allowed: decision.allowed,
            remaining: decision.remaining,
            retryAfterSeconds: decision.retryAfterSeconds,
        };
    },
});
