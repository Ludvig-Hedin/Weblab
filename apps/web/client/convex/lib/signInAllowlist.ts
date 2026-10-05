/**
 * Invite-only sign-in while the site runs in local-app mode
 * (docs/guides/local-app-mode.md). Pure helpers, shared by Convex and Next.
 *
 * The allowlist is a comma-separated list of emails. An empty or unset list
 * means "no restriction" so a missing env var never locks anyone out by
 * surprise; the Next side decides when the restriction applies.
 */

export function parseSignInAllowlist(raw: string | undefined | null): string[] {
    if (!raw) return [];
    return raw
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.length > 0);
}

export function isEmailOnAllowlist(
    email: string | undefined | null,
    allowlist: readonly string[],
): boolean {
    if (!email) return false;
    return allowlist.includes(email.trim().toLowerCase());
}

/**
 * Convex-side gate. Reads `WEBLAB_SIGN_IN_ALLOWLIST` from the Convex
 * deployment env. Unset or empty = everyone allowed (cloud mode).
 */
export function isAllowedByConvexAllowlist(email: string | undefined | null): boolean {
    const allowlist = parseSignInAllowlist(process.env.WEBLAB_SIGN_IN_ALLOWLIST);
    if (allowlist.length === 0) return true;
    return isEmailOnAllowlist(email, allowlist);
}
