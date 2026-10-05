import { describe, expect, it } from 'bun:test';

import { estimateWhisperCostUsd, WHISPER_USD_PER_MINUTE } from './cost';

describe('estimateWhisperCostUsd', () => {
    it('is zero for empty audio', () => {
        expect(estimateWhisperCostUsd(0)).toBe(0);
    });

    it('bills one minute of assumed-bitrate audio at the per-minute rate', () => {
        expect(estimateWhisperCostUsd(4_000 * 60)).toBeCloseTo(WHISPER_USD_PER_MINUTE, 10);
    });

    it('caps a max-size (25 MB) upload well under a dollar', () => {
        expect(estimateWhisperCostUsd(25 * 1024 * 1024)).toBeLessThan(1);
    });
});
