/**
 * Maps a thrown editor-bootstrap error to the right `ProjectLoadError`
 * variant. Extracted from `page.tsx` so the branch ordering is unit-testable
 * — the classification is pure string matching and easy to get subtly wrong
 * (e.g. an `ArgumentValidationError` leaking through the generic `unknown`
 * fallback and showing the raw validator string to the user — F-131).
 *
 * Branch order matters: the most specific signals are checked first.
 */
export type ProjectLoadErrorVariant =
    | 'invalid-id'
    | 'forbidden'
    | 'unauthorized'
    | 'not-found'
    | 'unknown';

export function classifyProjectLoadError(message: string): ProjectLoadErrorVariant {
    const lower = message.toLowerCase();

    // A malformed Convex document id (typo'd / stale share link / bad
    // bookmark) makes `v.id('projects')` reject with an
    // ArgumentValidationError. Checked first because such an id can never
    // have an offline cache entry and must never fall through to the generic
    // `unknown` branch, which would leak the raw validator string.
    if (lower.includes('does not match validator') || lower.includes('argumentvalidationerror')) {
        return 'invalid-id';
    }

    // FORBIDDEN is split from the unauthorized/session bucket: a signed-in
    // user with no access should not be told "session expired" and given a
    // sign-in CTA — that loops them right back here.
    if (lower.includes('forbidden')) {
        return 'forbidden';
    }

    if (lower.includes('unauth') || lower.includes('session')) {
        return 'unauthorized';
    }

    if (lower.includes('not found') || lower.includes('not_found')) {
        return 'not-found';
    }

    return 'unknown';
}
