// Pure, ctx-free helpers for POST /api/transcribe rate-limit math.
//
// Kept outside the mutation so the rolling-window behavior can be unit-tested
// without a Convex auth/database harness.

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
    const cutoff = now - TRANSCRIBE_RATE_LIMIT_WINDOW_MS;
    const recent = previousTimestamps
        .filter((timestamp) => timestamp > cutoff)
        .sort((a, b) => a - b);

    if (recent.length >= TRANSCRIBE_RATE_LIMIT_MAX) {
        const oldest = recent[0] ?? now;
        const retryAfterMs = Math.max(0, oldest + TRANSCRIBE_RATE_LIMIT_WINDOW_MS - now);
        return {
            allowed: false,
            remaining: 0,
            retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
            timestamps: recent,
            windowStart: oldest,
        };
    }

    const nextTimestamps = [...recent, now];
    return {
        allowed: true,
        remaining: TRANSCRIBE_RATE_LIMIT_MAX - nextTimestamps.length,
        retryAfterSeconds: 0,
        timestamps: nextTimestamps,
        windowStart: nextTimestamps[0] ?? now,
    };
}
