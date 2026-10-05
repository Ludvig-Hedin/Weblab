import { describe, expect, it } from 'bun:test';

import {
    AI_PAUSED_MESSAGE,
    aiGuardErrorResponse,
    buildTurnGuard,
    guardStatusFor,
    isAiDisabledFlag,
    isGateNotDeployedError,
} from './ai-guard-response';

describe('guardStatusFor', () => {
    it('uses 503 for fleet pauses and 429 for per-user limits', () => {
        expect(guardStatusFor('disabled')).toBe(503);
        expect(guardStatusFor('budget')).toBe(503);
        expect(guardStatusFor('user_spend')).toBe(429);
        expect(guardStatusFor('rate_limited')).toBe(429);
        expect(guardStatusFor('continuation_cap')).toBe(429);
        expect(guardStatusFor('pro_model_required')).toBe(403);
    });
});

describe('aiGuardErrorResponse', () => {
    it('returns the { error, code } shape the chat error UI renders, with Retry-After', async () => {
        const res = aiGuardErrorResponse(429, 'Slow down.', {
            reason: 'rate_limited',
            retryAfterSeconds: 42,
        });
        expect(res.status).toBe(429);
        expect(res.headers.get('Retry-After')).toBe('42');
        expect(await res.json()).toEqual({
            error: 'Slow down.',
            code: 429,
            reason: 'rate_limited',
            retryAfterSeconds: 42,
        });
    });

    it('uses the friendly paused copy', () => {
        expect(AI_PAUSED_MESSAGE).toBe('AI is paused right now. Please try again later.');
    });
});

describe('buildTurnGuard', () => {
    it('treats a trailing user message as a fresh turn', () => {
        expect(
            buildTurnGuard('c1', [
                { id: 'u1', role: 'user' },
                { id: 'a1', role: 'assistant' },
                { id: 'u2', role: 'user' },
            ]),
        ).toEqual({ key: 'c1:u2', scope: 'c1', isContinuation: false });
    });

    it('treats a trailing assistant message as a continuation of the same turn', () => {
        expect(
            buildTurnGuard('c1', [
                { id: 'u2', role: 'user' },
                { id: 'a2', role: 'assistant' },
            ]),
        ).toEqual({ key: 'c1:u2', scope: 'c1', isContinuation: true });
    });
});

describe('flags and errors', () => {
    it('parses the kill switch flag', () => {
        expect(isAiDisabledFlag('true')).toBe(true);
        expect(isAiDisabledFlag('1')).toBe(true);
        expect(isAiDisabledFlag('false')).toBe(false);
        expect(isAiDisabledFlag(undefined)).toBe(false);
    });

    it('recognises only the not-deployed gate error', () => {
        expect(
            isGateNotDeployedError(
                new Error("Could not find public function for 'aiGuards:checkAndRecord'"),
            ),
        ).toBe(true);
        expect(isGateNotDeployedError(new Error('network down'))).toBe(false);
    });
});
