// Allow only same-origin relative paths to prevent open-redirect attacks
// through `?returnUrl=...`. A null/undefined input or any value that isn't a
// simple `/path/...` returns null so callers fall back to a default.

export function sanitizeReturnUrl(input: string | null | undefined): string | null {
    if (!input) return null;
    // Reject absolute URLs (http://, https://, //, etc.) and anything with a
    // colon before the first slash (e.g. `javascript:alert(1)`).
    if (!input.startsWith('/')) return null;
    if (input.startsWith('//')) return null;
    if (input.includes('\\')) return null;
    return input;
}
