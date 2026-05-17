import type {
    DeploymentRequest,
    DeploymentResponse,
    HostingProviderAdapter,
    TokenValidationResult,
} from '@weblab/models';

/**
 * Cloudflare Pages hosting adapter — deploys to the user's own Cloudflare
 * account via the Cloudflare Pages direct-upload API. Requires a
 * user-connected Cloudflare API token stored encrypted in
 * `hosting_provider_connections`.
 *
 * Phase 2b: real implementation pending. Cloudflare Pages builds from source,
 * so the publish pipeline must ship source files + a framework preset rather
 * than Weblab's pre-built Next standalone output.
 */
export class CloudflareAdapter implements HostingProviderAdapter {
    constructor(private readonly token?: string) {}

    async deploy(_request: DeploymentRequest): Promise<DeploymentResponse> {
        if (!this.token) {
            throw new Error('Cloudflare Pages deployment requires a connected account token.');
        }
        throw new Error('Cloudflare Pages deployment is not available yet (Phase 2b).');
    }

    async validateToken(token: string): Promise<TokenValidationResult> {
        // Cloudflare: GET https://api.cloudflare.com/client/v4/user/tokens/verify
        // → { success, result: { status: 'active' }, ... } + GET /accounts for label.
        try {
            const verifyRes = await fetch(
                'https://api.cloudflare.com/client/v4/user/tokens/verify',
                {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: AbortSignal.timeout(8000),
                },
            );
            if (!verifyRes.ok) {
                return {
                    ok: false,
                    message: `Cloudflare rejected the token (HTTP ${verifyRes.status}).`,
                };
            }
            const verifyData = (await verifyRes.json()) as {
                success?: boolean;
                result?: { status?: string };
                errors?: { message?: string }[];
            };
            if (!verifyData.success || verifyData.result?.status !== 'active') {
                return {
                    ok: false,
                    message: verifyData.errors?.[0]?.message ?? 'Cloudflare token is not active.',
                };
            }
            // Look up the first account for a display label.
            const accountsRes = await fetch('https://api.cloudflare.com/client/v4/accounts', {
                headers: { Authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(8000),
            });
            let accountLabel = 'Cloudflare account';
            let accountId: string | undefined;
            if (accountsRes.ok) {
                const accountsData = (await accountsRes.json()) as {
                    result?: { id?: string; name?: string }[];
                };
                const first = accountsData.result?.[0];
                if (first?.name) accountLabel = first.name;
                accountId = first?.id;
            }
            return { ok: true, accountLabel, accountId };
        } catch (err) {
            return {
                ok: false,
                message: err instanceof Error ? err.message : 'Failed to reach Cloudflare.',
            };
        }
    }
}
