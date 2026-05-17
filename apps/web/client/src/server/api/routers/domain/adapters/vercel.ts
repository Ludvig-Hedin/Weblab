import type {
    DeploymentRequest,
    DeploymentResponse,
    HostingProviderAdapter,
    TokenValidationResult,
} from '@weblab/models';

/**
 * Vercel hosting adapter — deploys to the user's own Vercel account via the
 * Vercel REST API (v13 deployments). Requires a user-connected Vercel API
 * token stored encrypted in `hosting_provider_connections`.
 *
 * Phase 2b: real implementation pending. Vercel builds from source, so the
 * publish pipeline must ship source files + a framework preset rather than
 * Weblab's pre-built Next standalone output.
 */
export class VercelAdapter implements HostingProviderAdapter {
    constructor(private readonly token?: string) {}

    async deploy(_request: DeploymentRequest): Promise<DeploymentResponse> {
        if (!this.token) {
            throw new Error('Vercel deployment requires a connected account token.');
        }
        throw new Error('Vercel deployment is not available yet (Phase 2b).');
    }

    async validateToken(token: string): Promise<TokenValidationResult> {
        // Vercel: GET https://api.vercel.com/v2/user → { user: { username, email } }
        try {
            const res = await fetch('https://api.vercel.com/v2/user', {
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(8000),
            });
            if (!res.ok) {
                return { ok: false, message: `Vercel rejected the token (HTTP ${res.status}).` };
            }
            const data = (await res.json()) as {
                user?: { username?: string; email?: string; id?: string };
            };
            return {
                ok: true,
                accountLabel: data.user?.username ?? data.user?.email ?? 'Vercel account',
                accountId: data.user?.id,
            };
        } catch (err) {
            return {
                ok: false,
                message: err instanceof Error ? err.message : 'Failed to reach Vercel.',
            };
        }
    }
}
