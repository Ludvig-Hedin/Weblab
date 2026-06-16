// Pure, environment-agnostic detector for "the viewer is not authenticated"
// errors coming back from Convex. Two distinct shapes reach the client:
//
//   1. App-level guards throw `new Error('UNAUTHORIZED')` (convex/lib/
//      permissions.ts `requireUser` + ~40 call sites). Convex relays this to
//      the browser as an Error whose `.message` CONTAINS "UNAUTHORIZED"
//      (wrapped like "[Request ID …] Server Error … Uncaught Error:
//      UNAUTHORIZED …").
//   2. The Convex runtime itself rejects the Clerk JWT with an
//      "Unauthenticated" / OIDC-token error when the token is missing, expired,
//      or invalid.
//
// The client root error boundary uses this to bounce to /sign-in instead of
// stranding the user on a dead-end "Something went wrong" card when their
// session has gone away (sign-out, token expiry, post-OAuth bounce).
//
// NOTE: a *signed-in* user hitting a permission check that also throws
// "UNAUTHORIZED" matches here too — callers MUST gate any redirect on a
// confirmed signed-out state (Clerk `isSignedIn === false`) so they never
// bounce a legitimately signed-in user out of a forbidden resource.
//
// Mirrors (intentionally, not shared with) the narrower server-side matcher in
// `clerk-bridge.ts`: that one runs inside RSCs where the only relevant shape is
// the framework's "Unauthenticated" token rejection, and must NOT widen to the
// app-level "UNAUTHORIZED" string.

const UNAUTH_MESSAGE_RE = /\bUNAUTHORIZED\b|Unauthenticated|verify OIDC token claim|OIDC token/i;

export function isConvexUnauthenticatedError(err: unknown): boolean {
    if (!err) return false;

    const message =
        err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : typeof (err as { message?: unknown })?.message === 'string'
                ? (err as { message: string }).message
                : '';
    if (message && UNAUTH_MESSAGE_RE.test(message)) return true;

    // ConvexError surfaces a structured `.data` payload instead of `.message`.
    const data = (err as { data?: unknown })?.data;
    if (typeof data === 'string' && UNAUTH_MESSAGE_RE.test(data)) return true;

    const code = (err as { code?: unknown })?.code;
    return code === 'Unauthenticated' || code === 'UNAUTHORIZED';
}
