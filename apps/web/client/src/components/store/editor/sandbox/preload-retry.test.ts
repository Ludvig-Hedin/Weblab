import { describe, expect, it } from 'bun:test';

import {
    MAX_PRELOAD_RETRY_ATTEMPTS,
    MAX_PRELOAD_TRANSIENT_RETRY_ATTEMPTS,
    planPreloadRetry,
} from './preload-retry';

describe('planPreloadRetry', () => {
    it('keeps retrying the transient cold-boot case well past the non-transient cap', () => {
        // The old budget gave up at MAX_PRELOAD_RETRY_ATTEMPTS (~10s) and
        // stranded slow Vercel boots. A transient failure at that attempt
        // count must still retry.
        const plan = planPreloadRetry(true, MAX_PRELOAD_RETRY_ATTEMPTS);
        expect(plan.willRetry).toBe(true);
        expect(plan.maxAttempts).toBe(MAX_PRELOAD_TRANSIENT_RETRY_ATTEMPTS);
    });

    it('never escalates a transient failure to console.error', () => {
        // Even when exhausted, the transient case logs at debug — it is
        // expected on every healthy slow cold-boot.
        for (const attempt of [
            0,
            MAX_PRELOAD_RETRY_ATTEMPTS,
            MAX_PRELOAD_TRANSIENT_RETRY_ATTEMPTS,
        ]) {
            expect(planPreloadRetry(true, attempt).logLevel).toBe('debug');
        }
    });

    it('stops retrying transient once the patient ceiling is reached', () => {
        const plan = planPreloadRetry(true, MAX_PRELOAD_TRANSIENT_RETRY_ATTEMPTS);
        expect(plan.willRetry).toBe(false);
    });

    it('fails fast and loud on a genuine (non-transient) error', () => {
        const willing = planPreloadRetry(false, MAX_PRELOAD_RETRY_ATTEMPTS - 1);
        expect(willing.willRetry).toBe(true);
        expect(willing.logLevel).toBe('debug');

        const exhausted = planPreloadRetry(false, MAX_PRELOAD_RETRY_ATTEMPTS);
        expect(exhausted.willRetry).toBe(false);
        expect(exhausted.logLevel).toBe('error');
        expect(exhausted.maxAttempts).toBe(MAX_PRELOAD_RETRY_ATTEMPTS);
    });
});
