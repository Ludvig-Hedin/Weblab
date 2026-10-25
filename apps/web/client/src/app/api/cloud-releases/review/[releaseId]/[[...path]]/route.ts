import { randomBytes, createHash } from 'node:crypto';
import { fetchAction, fetchMutation, fetchQuery } from 'convex/nextjs';
import type { Id } from '@convex/_generated/dataModel';
import { isolatedReleaseReviewHost } from '@convex/lib/cloudReleaseReviewHost';
import { CloudReleaseVercel } from '@convex/lib/cloudReleaseVercel';
import { env } from '@/env';
import { cloudReleaseApi } from '@/lib/cloud-releases/api';
import { reviewCredentialContext } from '@/lib/cloud-releases/server-credentials';
import { sameReleaseReviewTarget } from '@convex/lib/cloudReleaseReviewTarget';
import { proxyReleaseReview, reviewOriginAllowed } from '@/lib/cloud-releases/review-proxy';
import { resolveReleaseReviewRequest } from '@/lib/cloud-releases/review-routing';
import { REVIEW_EXCHANGE_PATH, reviewCookie, reviewExchangeTicket, reviewSession } from '@/lib/cloud-releases/review-session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function serve(request: Request, context: { params: Promise<{ releaseId: string; path?: string[] }> }) {
    const { releaseId, path = [] } = await context.params;
    const suffix = env.WEBLAB_CLOUD_RELEASE_REVIEW_HOST_SUFFIX;
    const verifier = env.WEBLAB_CLOUD_RELEASE_REVIEW_SECRET, appOrigin = env.WEBLAB_CLOUD_RELEASE_APP_ORIGIN;
    const review = resolveReleaseReviewRequest(request, suffix);
    const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff' };
    if (!suffix || !verifier || !/^[a-f0-9]{64}$/.test(verifier) || !appOrigin || !isolatedReleaseReviewHost(appOrigin, suffix, env.CLERK_JWT_ISSUER_DOMAIN) || review.kind !== 'review' || !reviewOriginAllowed(review.hostname, releaseId, suffix)) return new Response(null, { status: 503, headers });
    if (request.headers.get('sec-fetch-dest') === 'serviceworker' || request.headers.has('service-worker')) return new Response(null, { status: 403, headers });
    try {
        const scope = { protocol: 2 as const, releaseId: releaseId as Id<'cloudReleases'>, verifier };
        if (request.method === 'POST') {
            if (path.length !== 1 || path[0] !== REVIEW_EXCHANGE_PATH) return new Response(null, { status: 405, headers });
            const ticket = await reviewExchangeTicket(request, appOrigin);
            const session = randomBytes(32).toString('hex');
            const allowed = await fetchMutation(cloudReleaseApi.exchangeReview, { ...scope, ticket, sessionHash: createHash('sha256').update(session).digest('hex') });
            if (!allowed) return new Response(null, { status: 403, headers });
            return new Response(null, { status: 303, headers: { ...headers, Location: '/', 'Set-Cookie': reviewCookie(session, allowed.expiresAt) } });
        }
        if (path[0] === REVIEW_EXCHANGE_PATH) return new Response(null, { status: 405, headers });
        const session = reviewSession(request.headers.get('cookie'));
        if (!session) return new Response(null, { status: 401, headers });
        const credentialContext = await fetchAction(reviewCredentialContext, { releaseId: scope.releaseId, verifier, session,
            mediaRequest: { path, search: new URL(review.publicUrl).search } });
        if (!credentialContext) return new Response(null, { status: 403, headers });
        const { target, token, bypass, media } = credentialContext;
        const reauthorize = async () => {
            const current = await fetchQuery(cloudReleaseApi.authorizeReview, { ...scope, session });
            if (!current || !sameReleaseReviewTarget(target, current)) throw new Error('Review access expired');
            return current;
        };
        await reauthorize();
        return proxyReleaseReview(new Request(review.publicUrl, request), { target, path, bypass, reauthorize, ...(media !== undefined ? { media } : {}),
            onFailure: ({ stage, reason }) => console.warn('[cloud-release-review]', { stage, reason }),
            verifyProvider: async signal => {
                const provider = new CloudReleaseVercel({ token, teamId: target.teamId, projectId: target.providerProjectId, hostname: target.hostname, bypass, expectedProof: target.providerProof,
                    ...(target.hostingProfile === undefined ? {} : { hostingProfile: target.hostingProfile }) }, signal);
                const deployment = target.hostingProfile === 'imported-next-hosting-v1' ? await provider.deploymentImported(target.deploymentId,
                    { releaseId, candidateHash: target.hash, deployHash: target.deployHash!, buildPolicyHash: target.buildPolicyHash! }) :
                    await provider.deployment(target.deploymentId, releaseId, target.hash);
                if (!deployment.ready || deployment.url !== target.deploymentUrl) throw new Error('Review deployment changed');
                await provider.verifyProject();
            },
        });
    } catch { return new Response(null, { status: 403, headers }); }
}

export const GET = serve;
export const HEAD = serve;
export const POST = serve;
