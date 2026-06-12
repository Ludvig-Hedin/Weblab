import { describe, expect, it } from 'bun:test';

import { loadAgentConfigFromEnv } from './config.js';
import { AgentApiError } from './errors.js';

describe('loadAgentConfigFromEnv', () => {
    it('returns config when both vars are set', () => {
        const config = loadAgentConfigFromEnv({
            WEBLAB_AGENT_API_URL: 'https://dep.convex.site',
            WEBLAB_AGENT_API_TOKEN: 'wlk_secret',
        });
        expect(config).toEqual({ baseUrl: 'https://dep.convex.site', token: 'wlk_secret' });
    });

    it('strips trailing slashes from the base url', () => {
        const config = loadAgentConfigFromEnv({
            WEBLAB_AGENT_API_URL: 'https://dep.convex.site///',
            WEBLAB_AGENT_API_TOKEN: 'wlk_secret',
        });
        expect(config.baseUrl).toBe('https://dep.convex.site');
    });

    it('trims surrounding whitespace', () => {
        const config = loadAgentConfigFromEnv({
            WEBLAB_AGENT_API_URL: '  https://dep.convex.site  ',
            WEBLAB_AGENT_API_TOKEN: '  wlk_secret  ',
        });
        expect(config).toEqual({ baseUrl: 'https://dep.convex.site', token: 'wlk_secret' });
    });

    it('throws CONFIG_MISSING when the url is absent', () => {
        try {
            loadAgentConfigFromEnv({ WEBLAB_AGENT_API_TOKEN: 'wlk_secret' });
            throw new Error('expected to throw');
        } catch (err) {
            expect(err).toBeInstanceOf(AgentApiError);
            expect((err as AgentApiError).code).toBe('CONFIG_MISSING');
        }
    });

    it('throws CONFIG_MISSING when the token is absent', () => {
        try {
            loadAgentConfigFromEnv({ WEBLAB_AGENT_API_URL: 'https://dep.convex.site' });
            throw new Error('expected to throw');
        } catch (err) {
            expect(err).toBeInstanceOf(AgentApiError);
            expect((err as AgentApiError).code).toBe('CONFIG_MISSING');
        }
    });
});
