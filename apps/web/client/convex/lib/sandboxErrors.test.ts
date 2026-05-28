import { describe, expect, it } from 'bun:test';
import { ConvexError } from 'convex/values';

import {
    extractHttpStatus,
    mapSandboxProvisionError,
    type SandboxErrorData,
} from './sandboxErrors';

describe('extractHttpStatus', () => {
    it('parses the @vercel/sandbox SDK "Status code NNN is not ok" message', () => {
        expect(extractHttpStatus(new Error('Status code 402 is not ok'))).toBe(402);
        expect(extractHttpStatus(new Error('status code 503 is not ok'))).toBe(503);
    });

    it('prefers a structured numeric status field over the message', () => {
        expect(extractHttpStatus({ status: 403, message: 'Status code 500 is not ok' })).toBe(403);
        expect(extractHttpStatus({ statusCode: 429 })).toBe(429);
        expect(extractHttpStatus({ response: { status: 401 } })).toBe(401);
    });

    it('returns null when no status can be derived', () => {
        expect(extractHttpStatus(new Error('network blip'))).toBeNull();
        expect(extractHttpStatus('plain string')).toBeNull();
        expect(extractHttpStatus(null)).toBeNull();
    });

    it('ignores out-of-range numbers', () => {
        expect(extractHttpStatus(new Error('Status code 999 is not ok'))).toBeNull();
        expect(extractHttpStatus({ status: 42 })).toBeNull();
    });

    it('does not grab the leading 3 digits of a longer number', () => {
        expect(extractHttpStatus(new Error('Status code 4022 is not ok'))).toBeNull();
    });
});

describe('mapSandboxProvisionError', () => {
    function dataOf(error: unknown): SandboxErrorData {
        expect(error).toBeInstanceOf(ConvexError);
        return (error as ConvexError<SandboxErrorData>).data;
    }

    it('maps 402 to a non-retryable billing ConvexError', () => {
        const mapped = mapSandboxProvisionError(new Error('Status code 402 is not ok'));
        const data = dataOf(mapped);
        expect(data.kind).toBe('billing');
        expect(data.status).toBe(402);
        expect(data.retryable).toBe(false);
        expect(data.message.toLowerCase()).toContain('billing');
        expect(data.message).toContain('402');
    });

    it('maps 401 and 403 to a non-retryable auth ConvexError', () => {
        for (const status of [401, 403]) {
            const data = dataOf(mapSandboxProvisionError({ status }));
            expect(data.kind).toBe('auth');
            expect(data.status).toBe(status);
            expect(data.retryable).toBe(false);
            expect(data.message).toContain('VERCEL_TOKEN');
        }
    });

    it('maps 429 to a retryable rate_limit ConvexError', () => {
        const data = dataOf(mapSandboxProvisionError({ statusCode: 429 }));
        expect(data.kind).toBe('rate_limit');
        expect(data.retryable).toBe(true);
    });

    it('maps 5xx to a retryable upstream ConvexError', () => {
        for (const status of [500, 502, 503, 504]) {
            const data = dataOf(mapSandboxProvisionError(new Error(`Status code ${status} is not ok`)));
            expect(data.kind).toBe('upstream');
            expect(data.status).toBe(status);
            expect(data.retryable).toBe(true);
        }
    });

    it('returns the original error for unrecognized statuses (e.g. 400)', () => {
        const original = new Error('Status code 400 is not ok');
        expect(mapSandboxProvisionError(original)).toBe(original);
    });

    it('returns the original error when no status can be derived', () => {
        const original = new Error('insert failed: unique constraint');
        expect(mapSandboxProvisionError(original)).toBe(original);
    });

    it('does not double-wrap an existing ConvexError', () => {
        const existing = new ConvexError({ kind: 'billing', status: 402, message: 'x', retryable: false });
        expect(mapSandboxProvisionError(existing)).toBe(existing);
    });
});
