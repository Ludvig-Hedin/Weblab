/**
 * Some hosts inject a consent/warning dialog when embedded in an iframe
 * (e.g. CodeSandbox preview domains) and others actively refuse with
 * `X-Frame-Options: DENY` (e.g. vercel.com marketing pages). Skip iframes for
 * these and fall back to links or placeholders.
 */
export function isNonEmbeddable(url: string): boolean {
    try {
        const { hostname } = new URL(url);
        return (
            hostname.endsWith('.csb.app') ||
            hostname.endsWith('.codesandbox.io') ||
            // Vercel Sandbox dev-server URLs 502 until the dev server binds and
            // are not meant to be embedded as static thumbnails.
            hostname.endsWith('.vercel.run') ||
            hostname === 'vercel.com' ||
            hostname.endsWith('.vercel.com')
        );
    } catch {
        return false;
    }
}
