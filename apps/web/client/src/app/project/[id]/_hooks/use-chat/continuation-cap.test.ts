import { describe, expect, it } from 'bun:test';

import { decideAutoContinuation, MAX_AUTO_CONTINUATIONS_PER_TURN } from './continuation-cap';

describe('decideAutoContinuation', () => {
    it('allows exactly MAX continuations per turn, then stops', () => {
        let count = 0;
        const allowed: boolean[] = [];
        for (let i = 0; i < MAX_AUTO_CONTINUATIONS_PER_TURN + 3; i++) {
            const d = decideAutoContinuation(count);
            allowed.push(d.allow);
            count = d.nextCount;
        }
        expect(allowed.filter(Boolean)).toHaveLength(MAX_AUTO_CONTINUATIONS_PER_TURN);
        expect(allowed.slice(MAX_AUTO_CONTINUATIONS_PER_TURN).every((a) => !a)).toBe(true);
    });

    it('keeps refusing once the cap is hit', () => {
        expect(decideAutoContinuation(5, 5)).toEqual({ allow: false, nextCount: 5 });
        expect(decideAutoContinuation(4, 5)).toEqual({ allow: true, nextCount: 5 });
    });

    it('defaults to 5', () => {
        expect(MAX_AUTO_CONTINUATIONS_PER_TURN).toBe(5);
    });
});
