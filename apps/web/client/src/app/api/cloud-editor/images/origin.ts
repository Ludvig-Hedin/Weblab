/** The public app origin is configured, never inferred from proxy-controlled headers. */
export function imageUploadOriginAllowed(request: Request, siteUrl: string): boolean {
    try {
        const site = new URL(siteUrl);
        const local = site.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(site.hostname);
        if ((site.protocol !== 'https:' && !local) || site.username || site.password ||
            site.pathname !== '/' || site.search || site.hash) return false;
        return request.headers.get('origin') === site.origin;
    } catch { return false; }
}
