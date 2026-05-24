import { LocalForageKeys, Routes } from '@/utils/constants';

export function getReturnUrlQueryParam(returnUrl: string | null): string {
    return returnUrl ? `${LocalForageKeys.RETURN_URL}=${encodeURIComponent(returnUrl)}` : '';
}

/** True if the string contains an ASCII control char (incl. CR/LF/NUL/DEL). */
function hasControlChar(value: string): boolean {
    for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        if (code < 0x20 || code === 0x7f) return true;
    }
    return false;
}

export function sanitizeReturnUrl(
    returnUrl: string | null,
    opts: { origin?: string } = {},
): string {
    // Default to home page if no return URL
    if (!returnUrl) {
        return Routes.HOME;
    }
    try {
        // If it's a relative path, it's safe — but reject backslashes (browsers
        // treat "/\" like "//", a protocol-relative open redirect) and control
        // chars (CR/LF can enable header-splitting in downstream redirects).
        if (
            returnUrl.startsWith('/') &&
            !returnUrl.startsWith('//') &&
            !returnUrl.includes('\\') &&
            !hasControlChar(returnUrl)
        ) {
            return returnUrl;
        }
        // Resolve current origin from options or the browser (if available)
        const currentOrigin =
            opts.origin ?? (typeof window !== 'undefined' ? window.location.origin : undefined);
        // On the server (no origin), reject non-relative URLs
        if (!currentOrigin) {
            return Routes.HOME;
        }
        // Parse as URL to check if it's same-origin
        const url = new URL(returnUrl, currentOrigin);
        // Only allow same-origin URLs; return a path-only value
        if (url.origin === currentOrigin) {
            return url.pathname + url.search + url.hash;
        }
    } catch {
        // Invalid URL format, fall back to default
    }
    // Default to home page for any invalid or external URLs
    return Routes.HOME;
}
