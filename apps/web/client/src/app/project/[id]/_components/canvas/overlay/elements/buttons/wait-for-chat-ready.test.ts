import { describe, expect, it } from 'bun:test';

import { CHAT_READY_TIMEOUT_MS, waitForChatReady } from './wait-for-chat-ready';

describe('waitForChatReady', () => {
    it('resolves immediately when the chat action is already wired', async () => {
        // No options → exercises the real-timer defaults; resolves on the first
        // tick so no animation frame is ever needed (safe in a DOM-less runner).
        const result = await waitForChatReady({ chat: { isChatActionReady: true } });
        expect(result).toBeUndefined();
    });

    it('resolves once the action attaches on a later poll', async () => {
        let ready = false;
        const target = {
            chat: {
                get isChatActionReady() {
                    return ready;
                },
            },
        };
        // Time never advances past the budget, so only readiness can end the
        // loop. The action attaches just before the next poll runs.
        const schedule = (cb: () => void) => {
            ready = true;
            queueMicrotask(cb);
        };
        const result = await waitForChatReady(target, 1000, { now: () => 0, schedule });
        expect(result).toBeUndefined();
    });

    it('rejects when the action never attaches within the timeout', async () => {
        let clock = 0;
        // Each poll advances the clock by 500ms; with a 1000ms budget the loop
        // exits on the third poll (1500 > 1000) having never become ready.
        const schedule = (cb: () => void) => {
            clock += 500;
            queueMicrotask(cb);
        };
        let error: unknown;
        try {
            await waitForChatReady({ chat: { isChatActionReady: false } }, 1000, {
                now: () => clock,
                schedule,
            });
        } catch (caught) {
            error = caught;
        }
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Chat actions not initialized');
    });

    it('exposes a positive default timeout', () => {
        expect(CHAT_READY_TIMEOUT_MS).toBeGreaterThan(0);
    });
});
