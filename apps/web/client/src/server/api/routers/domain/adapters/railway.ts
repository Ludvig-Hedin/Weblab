import type {
    DeploymentRequest,
    DeploymentResponse,
    HostingProviderAdapter,
    TokenValidationResult,
} from '@weblab/models';

/**
 * Railway hosting adapter — deploys to the user's own Railway account via the
 * Railway GraphQL API. Requires a user-connected Railway API token stored
 * encrypted in `hosting_provider_connections`.
 *
 * Phase 2b: real implementation pending. Railway runs containers and builds
 * from source, so the publish pipeline must ship source files rather than
 * Weblab's pre-built Next standalone output.
 */
export class RailwayAdapter implements HostingProviderAdapter {
    constructor(private readonly token?: string) {}

    async deploy(_request: DeploymentRequest): Promise<DeploymentResponse> {
        if (!this.token) {
            throw new Error('Railway deployment requires a connected account token.');
        }
        throw new Error('Railway deployment is not available yet (Phase 2b).');
    }

    async validateToken(token: string): Promise<TokenValidationResult> {
        // Railway: POST https://backboard.railway.app/graphql/v2 with { me { id name email } }
        try {
            const res = await fetch('https://backboard.railway.app/graphql/v2', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ query: '{ me { id name email } }' }),
                signal: AbortSignal.timeout(8000),
            });
            if (!res.ok) {
                return { ok: false, message: `Railway rejected the token (HTTP ${res.status}).` };
            }
            const data = (await res.json()) as {
                data?: { me?: { id?: string; name?: string; email?: string } };
                errors?: { message?: string }[];
            };
            if (data.errors?.length || !data.data?.me) {
                return {
                    ok: false,
                    message: data.errors?.[0]?.message ?? 'Railway token is invalid.',
                };
            }
            return {
                ok: true,
                accountLabel: data.data.me.name ?? data.data.me.email ?? 'Railway account',
                accountId: data.data.me.id,
            };
        } catch (err) {
            return {
                ok: false,
                message: err instanceof Error ? err.message : 'Failed to reach Railway.',
            };
        }
    }
}
