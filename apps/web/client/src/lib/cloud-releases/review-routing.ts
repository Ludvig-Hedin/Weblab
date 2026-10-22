/** Middleware must override app headers before Next sends the rewritten route response. */
export function secureReleaseReviewResponse<T extends Response>(response: T, rejected = false): T {
    response.headers.set('Cache-Control', 'private, no-store');
    response.headers.set('Referrer-Policy', 'no-referrer');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('Content-Security-Policy', rejected
        ? "default-src 'none'; frame-ancestors 'none'"
        : "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'none'; frame-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'none'");
    return response;
}

export function isReleaseReviewHost(hostname: string, suffix: string | undefined): boolean {
    return !!suffix && /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(suffix)
        && (hostname === suffix || hostname.endsWith(`.${suffix}`));
}

/** Dedicated review hosts serve only a single immutable release through the authenticated proxy. */
export function releaseReviewPath(hostname: string, pathname: string, suffix: string | undefined): string | null {
    if (!suffix || !isReleaseReviewHost(hostname, suffix) || hostname === suffix) return null;
    const releaseId = hostname.slice(0, -(suffix.length + 1));
    if (!/^[a-z0-9-]+$/.test(releaseId)) return null;
    // Never route a review host to the application's own pages, scripts or APIs.
    return `/api/cloud-releases/review/${releaseId}${pathname.startsWith('/') ? pathname : '/'}`;
}

type ReviewRouting = { kind: 'app' | 'reject' } | {
    kind: 'review'; hostname: string; pathname: string; publicUrl: URL;
};

/** Next's server URL can use its internal bind address. Only Host is public authority. */
export function resolveReleaseReviewRequest(request: Pick<Request, 'headers' | 'url'>, suffix: string | undefined): ReviewRouting {
    const authority = request.headers.get('host');
    // Reject lists, userinfo, URL syntax, escapes and ambiguous/noncanonical ports.
    const match = authority?.match(/^(\[[0-9a-f:.]+\]|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*)(?::([1-9][0-9]{0,4}))?$/i);
    if (!match || (match[2] && Number(match[2]) > 65535)) return { kind: 'reject' };
    let hostname: string;
    try {
        hostname = new URL(`https://${authority}`).hostname;
        if (hostname !== match[1]!.toLowerCase()) return { kind: 'reject' };
    } catch { return { kind: 'reject' }; }
    if (!isReleaseReviewHost(hostname, suffix)) return { kind: 'app' };
    if (match[2] && match[2] !== '443') return { kind: 'reject' };
    const publicUrl = new URL(request.url);
    const pathname = releaseReviewPath(hostname, publicUrl.pathname, suffix);
    if (!pathname) return { kind: 'reject' };
    // This URL is only for public review redirects. Internal rewrites retain Next's origin.
    publicUrl.protocol = 'https:';
    publicUrl.hostname = hostname;
    publicUrl.port = '';
    return { kind: 'review', hostname, pathname, publicUrl };
}
