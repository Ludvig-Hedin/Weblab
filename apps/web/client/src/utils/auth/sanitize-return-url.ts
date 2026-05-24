// Allow only same-origin relative paths to prevent open-redirect attacks
// through `?returnUrl=...`. A null/undefined input or any value that isn't a
// simple `/path/...` returns null so callers fall back to a default.
//
// Defense-in-depth: also reject CRLF and ASCII control characters. If a
// downstream consumer ever emits the value into a header (Location, Set-Cookie,
// custom analytics header, etc.) without re-encoding, an `\r\n`-bearing
// payload could split it. Rejecting at the trust boundary closes that path.
//
// Unit-test-ready: the following payloads MUST return null after this change.
//   '/dashboard\r\n'
//   '/dashboard\nSet-Cookie: evil=1'
//   '/dashboard\x00'
//   '/dashboard\x1b[31mred'
//   '/dashboard\x7f'

// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_RE = /[\x00-\x1F\x7F]/;

export function sanitizeReturnUrl(input: string | null | undefined): string | null {
    if (!input) return null;
    // Reject absolute URLs (http://, https://, //, etc.) and anything with a
    // colon before the first slash (e.g. `javascript:alert(1)`).
    if (!input.startsWith('/')) return null;
    if (input.startsWith('//')) return null;
    if (input.includes('\\')) return null;
    // Reject CRLF + any C0/DEL control character (header-splitting defense).
    if (CONTROL_CHAR_RE.test(input)) return null;
    return input;
}
