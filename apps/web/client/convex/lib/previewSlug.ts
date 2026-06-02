// Pure, ctx-free validation for the user-chosen Weblab preview subdomain label.
//
// Kept free of Convex `ctx` so the format/reserved rules can be unit-tested with
// bun:test without a convex-test harness (the repo's CI runner is `bun test`).
// `domains.setPreviewSlug` composes this with `ctx.db` uniqueness checks.

// A single DNS label: lowercase alphanumerics + interior hyphens, 3–48 chars,
// no leading/trailing hyphen.
export const SUBDOMAIN_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;

// Labels we never let a user claim — they collide with real or routing-reserved
// hosts under the hosting domain.
export const RESERVED_SLUGS = new Set<string>([
    'www',
    'app',
    'api',
    'admin',
    'mail',
    'ftp',
    'staging',
    'preview',
    'assets',
    'cdn',
    'static',
    'weblab',
]);

export type PreviewSlugValidation =
    | { ok: true; normalized: string }
    | { ok: false; error: string };

/**
 * Normalize (trim + lowercase) and validate a requested subdomain label.
 * Returns the normalized slug on success, or a human-readable error on failure.
 */
export function validatePreviewSlug(slug: string): PreviewSlugValidation {
    const normalized = slug.trim().toLowerCase();
    if (!SUBDOMAIN_SLUG_RE.test(normalized)) {
        return {
            ok: false,
            error: 'Subdomain must be 3–48 characters using lowercase letters, numbers, and hyphens (no leading or trailing hyphen).',
        };
    }
    if (RESERVED_SLUGS.has(normalized)) {
        return { ok: false, error: 'That subdomain is reserved. Please pick another.' };
    }
    return { ok: true, normalized };
}
