// Pure, ctx-free helpers for POST /api/transcribe rate-limit math.
//
// Kept outside the mutation so the rolling-window behavior can be unit-tested
// without a Convex auth/database harness.

import { evaluateSlidingWindows } from './aiGuardMath';

export const TRANSCRIBE_RATE_LIMIT_WINDOW_MS = 60_000;
export const TRANSCRIBE_RATE_LIMIT_MAX = 10;

export interface TranscribeRateLimitDecision {
    allowed: boolean;
    remaining: number;
    retryAfterSeconds: number;
    timestamps: number[];
    windowStart: number;
}

export function evaluateTranscribeRateLimit(
    previousTimestamps: readonly number[],
    now: number,
): TranscribeRateLimitDecision {
    // Delegates to the generalised multi-window limiter shared with the AI
    // request buckets (aiGuardMath.evaluateSlidingWindows).
    const decision = evaluateSlidingWindows(previousTimestamps, now, [
        { windowMs: TRANSCRIBE_RATE_LIMIT_WINDOW_MS, max: TRANSCRIBE_RATE_LIMIT_MAX },
    ]);
    return {
        allowed: decision.allowed,
        remaining: decision.allowed
            ? TRANSCRIBE_RATE_LIMIT_MAX - decision.timestamps.length
            : 0,
        retryAfterSeconds: decision.retryAfterSeconds,
        timestamps: decision.timestamps,
        windowStart: decision.timestamps[0] ?? now,
    };
}
