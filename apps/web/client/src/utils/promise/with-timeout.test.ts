import { describe, expect, it } from 'bun:test';

import { TimeoutError, withTimeout } from './with-timeout';

/** A promise that intentionally never settles — the failure mode behind the production 524. */
function neverSettles<T>(): Promise<T> {
    return new Promise<T>(() => undefined);
}

describe('withTimeout', () => {
    it('resolves with the value when the promise settles before the deadline', async () => {
        const result = await withTimeout(Promise.resolve('ok'), 1000);
        expect(result).toBe('ok');
    });

    it('rejects with TimeoutError when the promise hangs past the deadline', async () => {
        let caught: unknown;
        try {
            await withTimeout(neverSettles<string>(), 20, 'Convex query');
        } catch (error) {
            caught = error;
        }
        expect(caught).toBeInstanceOf(TimeoutError);
        expect((caught as TimeoutError).message).toBe('Convex query timed out after 20ms');
    });

    it('propagates the original rejection when the promise rejects first', async () => {
        let caught: unknown;
        try {
            await withTimeout(Promise.reject(new Error('upstream boom')), 1000);
        } catch (error) {
            caught = error;
        }
        expect(caught).toBeInstanceOf(Error);
        expect((caught as Error).message).toBe('upstream boom');
    });

    it('does not reject after the wrapped promise already resolved', async () => {
        // Resolve fast, then wait past the (short) deadline to prove the timer
        // was cleared and cannot fire a late rejection.
        const value = await withTimeout(Promise.resolve(42), 10);
        expect(value).toBe(42);
        await new Promise((resolve) => setTimeout(resolve, 25));
        // Reaching here without an unhandled rejection is the assertion.
        expect(value).toBe(42);
    });
});
