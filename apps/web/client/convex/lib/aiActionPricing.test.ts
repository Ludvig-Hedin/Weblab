import { describe, expect, it } from 'bun:test';

import { estimateModelCostUsd } from './aiActionPricing';

describe('estimateModelCostUsd', () => {
    it('prices known models from token usage', () => {
        // 1M in + 1M out on gpt-5 = $1.25 + $10.
        expect(
            estimateModelCostUsd('openai/gpt-5', { inputTokens: 1_000_000, outputTokens: 1_000_000 }),
        ).toBeCloseTo(11.25, 6);
    });

    it('prices unknown models conservatively', () => {
        expect(
            estimateModelCostUsd('x/unknown', { inputTokens: 1_000_000, outputTokens: 0 }),
        ).toBeGreaterThanOrEqual(5);
    });

    it('falls back to a fixed cost when usage is missing', () => {
        expect(estimateModelCostUsd('openai/gpt-5', undefined, 0.02)).toBe(0.02);
    });
});
