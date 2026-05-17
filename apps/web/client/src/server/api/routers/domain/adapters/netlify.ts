import type {
    DeploymentRequest,
    DeploymentResponse,
    HostingProviderAdapter,
    TokenValidationResult,
} from '@weblab/models';

/**
 * Netlify hosting adapter — deploys to the user's own Netlify account via the
 * Netlify deploy API (file-digest upload). Requires a user-connected Netlify
 * API token stored encrypted in `hosting_provider_connections`.
 *
 * Phase 2b: real implementation pending. Netlify builds from source, so the
 * publish pipeline must ship source files + a framework preset rather than
 * Weblab's pre-built Next standalone output.
 */
export class NetlifyAdapter implements HostingProviderAdapter {
    constructor(private readonly token?: string) {}

    async deploy(_request: DeploymentRequest): Promise<DeploymentResponse> {
        if (!this.token) {
            throw new Error('Netlify deployment requires a connected account token.');
        }
        throw new Error('Netlify deployment is not available yet (Phase 2b).');
    }

    async validateToken(token: string): Promise<TokenValidationResult> {
        // Netlify: GET https://api.netlify.com/api/v1/user → { full_name, email, id }
        try {
            const res = await fetch('https://api.netlify.com/api/v1/user', {
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(8000),
            });
            if (!res.ok) {
                return { ok: false, message: `Netlify rejected the token (HTTP ${res.status}).` };
            }
            const data = (await res.json()) as {
                full_name?: string;
                email?: string;
                id?: string;
            };
            return {
                ok: true,
                accountLabel: data.full_name ?? data.email ?? 'Netlify account',
                accountId: data.id,
            };
        } catch (err) {
            return {
                ok: false,
                message: err instanceof Error ? err.message : 'Failed to reach Netlify.',
            };
        }
    }
}
