import { getDomain } from 'tldts';

/** Shared by the gateway and ticket issuer. Deployment must additionally verify all auth cookie domains. */
export function isolatedReleaseReviewHost(appOrigin: string, suffix: string, clerkIssuer?: string) {
    try {
        const app = new URL(appOrigin);
        if (app.protocol !== 'https:' || app.origin !== appOrigin || !/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(suffix)) return false;
        const reviewDomain = getDomain(suffix, { allowPrivateDomains: true });
        const appDomain = getDomain(app.hostname, { allowPrivateDomains: true });
        if (!reviewDomain || !appDomain || reviewDomain === appDomain) return false;
        if (clerkIssuer) {
            const issuer = new URL(clerkIssuer);
            const authDomain = getDomain(issuer.hostname, { allowPrivateDomains: true });
            if (issuer.protocol !== 'https:' || !authDomain || authDomain === reviewDomain) return false;
        }
        return true;
    } catch { return false; }
}
