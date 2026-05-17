import type { HostingProviderAdapter } from '@weblab/models';
import { HostingProvider } from '@weblab/models';

import { CloudflareAdapter } from './adapters/cloudflare';
import { FreestyleAdapter } from './adapters/freestyle';
import { NetlifyAdapter } from './adapters/netlify';
import { RailwayAdapter } from './adapters/railway';
import { RenderAdapter } from './adapters/render';
import { VercelAdapter } from './adapters/vercel';

export interface HostingProviderFactoryOptions {
    /** Decrypted provider API token. Required at deploy time for external
     *  providers; omitted for FREESTYLE and for the validate-token flow. */
    token?: string;
}

export class HostingProviderFactory {
    static create(
        provider: HostingProvider = HostingProvider.FREESTYLE,
        options: HostingProviderFactoryOptions = {},
    ): HostingProviderAdapter {
        switch (provider) {
            case HostingProvider.FREESTYLE:
                return new FreestyleAdapter();
            case HostingProvider.VERCEL:
                return new VercelAdapter(options.token);
            case HostingProvider.NETLIFY:
                return new NetlifyAdapter(options.token);
            case HostingProvider.CLOUDFLARE:
                return new CloudflareAdapter(options.token);
            case HostingProvider.RAILWAY:
                return new RailwayAdapter(options.token);
            case HostingProvider.RENDER:
                return new RenderAdapter(options.token);
            default: {
                const exhaustiveCheck: never = provider;
                throw new Error(`Unsupported hosting provider: ${String(exhaustiveCheck)}`);
            }
        }
    }
}
