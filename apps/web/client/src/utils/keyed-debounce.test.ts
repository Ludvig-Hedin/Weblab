import { describe, expect, it } from 'bun:test';

import { keyedDebounce } from './keyed-debounce';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('keyedDebounce', () => {
    it('fires BOTH when two different keys are called within the window', async () => {
        // Regression: a single shared debounce dropped the first key here. With
        // per-key timers, editing two properties quickly keeps both writes.
        const calls: string[] = [];
        const d = keyedDebounce<string>(
            (k) => calls.push(k),
            20,
            (k) => k,
        );
        d('a');
        d('b');
        await wait(60);
        expect(calls.sort()).toEqual(['a', 'b']);
    });

    it('debounces calls with the SAME key down to the last one', async () => {
        const calls: string[] = [];
        const d = keyedDebounce<string>(
            (k) => calls.push(k),
            20,
            () => 'same-key',
        );
        d('x');
        d('y');
        await wait(60);
        expect(calls).toEqual(['y']);
    });

    it('cancel() clears every pending timer', async () => {
        const calls: string[] = [];
        const d = keyedDebounce<string>(
            (k) => calls.push(k),
            20,
            (k) => k,
        );
        d('a');
        d('b');
        d.cancel();
        await wait(60);
        expect(calls).toEqual([]);
    });
});
