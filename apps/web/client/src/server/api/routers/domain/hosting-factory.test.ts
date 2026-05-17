import { describe, expect, it } from 'bun:test';

import {
    EXTERNAL_HOSTING_PROVIDERS,
    HOSTING_PROVIDER_LABELS,
    HostingProvider,
} from '@weblab/models';

import { CloudflareAdapter } from './adapters/cloudflare';
import { NetlifyAdapter } from './adapters/netlify';
import { RailwayAdapter } from './adapters/railway';
import { RenderAdapter } from './adapters/render';
import { VercelAdapter } from './adapters/vercel';

/**
 * The factory itself (`hosting-factory.ts`) imports `FreestyleAdapter`, which
 * transitively loads `@/env`. The repo has no env-coupled unit tests, so this
 * suite covers the env-free pieces instead: the provider enum/metadata and the
 * external adapter stubs. The factory's exhaustive `switch` is already proven
 * complete at compile time by its `never` check.
 */
describe('hosting providers', () => {
    it('labels every provider in the enum', () => {
        for (const provider of Object.values(HostingProvider)) {
            expect(HOSTING_PROVIDER_LABELS[provider]).toBeTruthy();
        }
    });

    it('treats every provider except Weblab/Freestyle as external', () => {
        expect(EXTERNAL_HOSTING_PROVIDERS).not.toContain(HostingProvider.FREESTYLE);
        const expectedExternal = Object.values(HostingProvider).filter(
            (p) => p !== HostingProvider.FREESTYLE,
        );
        expect([...EXTERNAL_HOSTING_PROVIDERS].sort()).toEqual(expectedExternal.sort());
    });

    it('external adapter stubs reject when constructed without a token', async () => {
        const adapters = [
            new VercelAdapter(),
            new NetlifyAdapter(),
            new CloudflareAdapter(),
            new RailwayAdapter(),
            new RenderAdapter(),
        ];
        for (const adapter of adapters) {
            let error: unknown;
            try {
                await adapter.deploy({ files: {}, config: { domains: [] } });
            } catch (e) {
                error = e;
            }
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toMatch(/requires a connected account token/);
        }
    });

    it('external adapter deploy stubs reject with a Phase 2b message when a token is supplied', async () => {
        const adapters = [
            new VercelAdapter('fake-token'),
            new NetlifyAdapter('fake-token'),
            new CloudflareAdapter('fake-token'),
            new RailwayAdapter('fake-token'),
            new RenderAdapter('fake-token'),
        ];
        for (const adapter of adapters) {
            let error: unknown;
            try {
                await adapter.deploy({ files: {}, config: { domains: [] } });
            } catch (e) {
                error = e;
            }
            expect(error).toBeInstanceOf(Error);
            expect((error as Error).message).toMatch(/not available yet/);
        }
    });
});
