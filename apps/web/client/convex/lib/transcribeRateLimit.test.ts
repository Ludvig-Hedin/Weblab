import { describe, expect, it } from 'bun:test';

import {
    evaluateTranscribeRateLimit,
    TRANSCRIBE_RATE_LIMIT_MAX,
    TRANSCRIBE_RATE_LIMIT_WINDOW_MS,
} from './transcribeRateLimit';

const NOW = 1_000_000;

describe('evaluateTranscribeRateLimit', () => {
    it('allows only the configured number of requests inside a rolling minute', () => {
        let timestamps: number[] = [];

        for (let i = 0; i < TRANSCRIBE_RATE_LIMIT_MAX; i++) {
            const decision = evaluateTranscribeRateLimit(timestamps, NOW + i);
            expect(decision.allowed).toBe(true);
            timestamps = decision.timestamps;
        }

        const denied = evaluateTranscribeRateLimit(timestamps, NOW + TRANSCRIBE_RATE_LIMIT_MAX);
        expect(denied.allowed).toBe(false);
        expect(denied.remaining).toBe(0);
        expect(denied.retryAfterSeconds).toBe(60);
    });

    it('expires only timestamps that have actually left the rolling window', () => {
        let timestamps = Array.from({ length: TRANSCRIBE_RATE_LIMIT_MAX }, (_, i) => NOW + i);

        const firstAfterOldestExpires = evaluateTranscribeRateLimit(
            timestamps,
            NOW + TRANSCRIBE_RATE_LIMIT_WINDOW_MS,
        );
        expect(firstAfterOldestExpires.allowed).toBe(true);
        timestamps = firstAfterOldestExpires.timestamps;
        expect(timestamps).toHaveLength(TRANSCRIBE_RATE_LIMIT_MAX);

        const sameMillisecondBurst = evaluateTranscribeRateLimit(
            timestamps,
            NOW + TRANSCRIBE_RATE_LIMIT_WINDOW_MS,
        );
        expect(sameMillisecondBurst.allowed).toBe(false);
    });
});
