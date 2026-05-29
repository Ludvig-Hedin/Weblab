import { describe, expect, it } from 'bun:test';

import { canReachLocalOllamaFromBrowser } from './ollama-client';

describe('canReachLocalOllamaFromBrowser', () => {
    it('forbids browser→localhost Ollama probes in hosted production (CSP blocks them)', () => {
        expect(canReachLocalOllamaFromBrowser('production')).toBe(false);
    });

    it('allows the probe in development', () => {
        expect(canReachLocalOllamaFromBrowser('development')).toBe(true);
    });

    it('allows the probe in test / other / undefined environments', () => {
        expect(canReachLocalOllamaFromBrowser('test')).toBe(true);
        expect(canReachLocalOllamaFromBrowser(undefined)).toBe(true);
    });
});
