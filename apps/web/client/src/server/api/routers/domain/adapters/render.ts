import type {
    DeploymentRequest,
    DeploymentResponse,
    HostingProviderAdapter,
    TokenValidationResult,
} from '@weblab/models';

/**
 * Render hosting adapter — deploys to the user's own Render account via the
 * Render REST API. Requires a user-connected Render API token stored
 * encrypted in `hosting_provider_connections`.
 *
 * Phase 2b: real implementation pending. Render runs containers and builds
 * from source, so the publish pipeline must ship source files rather than
 * Weblab's pre-built Next standalone output.
 */
export class RenderAdapter implements HostingProviderAdapter {
    constructor(private readonly token?: string) {}

    async deploy(_request: DeploymentRequest): Promise<DeploymentResponse> {
        if (!this.token) {
            throw new Error('Render deployment requires a connected account token.');
        }
        throw new Error('Render deployment is not available yet (Phase 2b).');
    }

    async validateToken(token: string): Promise<TokenValidationResult> {
        // Render: GET https://api.render.com/v1/owners → [{ owner: { id, name, email } }]
        try {
            const res = await fetch('https://api.render.com/v1/owners?limit=1', {
                headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
                signal: AbortSignal.timeout(8000),
            });
            if (!res.ok) {
                return { ok: false, message: `Render rejected the token (HTTP ${res.status}).` };
            }
            const data = (await res.json()) as Array<{
                owner?: { id?: string; name?: string; email?: string };
            }>;
            const first = data[0]?.owner;
            return {
                ok: true,
                accountLabel: first?.name ?? first?.email ?? 'Render account',
                accountId: first?.id,
            };
        } catch (err) {
            return {
                ok: false,
                message: err instanceof Error ? err.message : 'Failed to reach Render.',
            };
        }
    }
}
