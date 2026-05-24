'use node';

import type {
    DeploymentRequest,
    DeploymentResponse,
    HostingProviderAdapter,
    TokenValidationResult,
} from '@weblab/models';
import { HostingProvider } from '@weblab/models';

import { FreestyleAdapter } from './freestyle';

// Post-migration: external provider adapters (Vercel/Netlify/Cloudflare/
// Railway/Render) lived in src/server/api/routers/domain/adapters/* which
// was deleted with the tRPC tree. The Convex action layer only needs them
// for `hostingConnectionActions.validateToken` / `createWithValidation`.
// For now only Freestyle is wired locally — other providers throw a clear
// error so the UI can surface "not yet supported" instead of crashing.
//
// To re-enable a provider: copy its adapter class into a new
// `convex/lib/adapters/<provider>.ts` (Node-side, "use node"), wire it up
// below.

export interface HostingProviderFactoryOptions {
    token?: string;
}

class UnsupportedAdapter implements HostingProviderAdapter {
    constructor(private provider: HostingProvider) {}

    async deploy(_request: DeploymentRequest): Promise<DeploymentResponse> {
        return {
            deploymentId: '',
            success: false,
            message: `[hostingFactory] ${this.provider} adapter not yet ported to Convex.`,
        };
    }

    async validateToken(_token: string): Promise<TokenValidationResult> {
        return {
            ok: false,
            message: `${this.provider} adapter not yet ported to Convex. Port the adapter class into convex/lib/adapters/.`,
        };
    }
}

export class HostingProviderFactory {
    static create(
        provider: HostingProvider = HostingProvider.FREESTYLE,
        _options: HostingProviderFactoryOptions = {},
    ): HostingProviderAdapter {
        if (provider === HostingProvider.FREESTYLE) {
            return new FreestyleAdapter();
        }
        return new UnsupportedAdapter(provider);
    }
}
