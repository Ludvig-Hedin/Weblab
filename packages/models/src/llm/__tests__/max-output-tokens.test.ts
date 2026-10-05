import { describe, expect, it } from 'bun:test';

import {
    getMaxOutputTokens,
    getMaxTokens,
    MODEL_MAX_OUTPUT_TOKENS,
    OPENROUTER_MODELS,
} from '../index';

describe('getMaxOutputTokens', () => {
    it('caps large-context cloud models at MODEL_MAX_OUTPUT_TOKENS', () => {
        expect(getMaxTokens(OPENROUTER_MODELS.OPEN_AI_GPT_6_SOL)).toBeGreaterThan(
            MODEL_MAX_OUTPUT_TOKENS,
        );
        expect(getMaxOutputTokens(OPENROUTER_MODELS.OPEN_AI_GPT_6_SOL)).toBe(
            MODEL_MAX_OUTPUT_TOKENS,
        );
    });

    it('never exceeds the model context window', () => {
        // Unknown local models fall back to a 32,768-token window.
        const local = 'ollama/tiny' as const;
        expect(getMaxOutputTokens(local)).toBeLessThanOrEqual(getMaxTokens(local));
    });

    it('defaults to 32,000', () => {
        expect(MODEL_MAX_OUTPUT_TOKENS).toBe(32_000);
    });
});
