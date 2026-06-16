// Cross-navigation sentinel that lets the root error boundary tell "the app
// threw because the user is signing out" apart from a genuine crash.
//
// During sign-out Clerk clears the session, which immediately re-renders the
// still-mounted, auth-gated route in a signed-out state. Any auth-required
// Convex `useQuery` in that tree then throws `UNAUTHORIZED`, which lands in the
// root error boundary BEFORE the sign-out handler's navigation to /sign-in
// completes. Without this marker the boundary shows a dead-end "Something went
// wrong" card — and its Retry just re-renders the same signed-out tree and
// throws again, so only a hard reload escaped.
//
// Stored in sessionStorage (not a module variable) so it survives the hard
// navigation the boundary performs, and timestamped + short-lived so a stale
// flag can never suppress a real, unrelated error minutes later. Every access
// is wrapped so a missing `sessionStorage` (SSR import, private mode, disabled
// storage) degrades to a no-op instead of throwing.

const SIGNING_OUT_KEY = 'weblab:signing-out-at';
const SIGNING_OUT_TTL_MS = 15_000;

export function markSigningOut(): void {
    try {
        sessionStorage.setItem(SIGNING_OUT_KEY, String(Date.now()));
    } catch {
        // sessionStorage unavailable — the boundary's signed-out heuristic
        // (Clerk `isSignedIn === false`) still covers the common case.
    }
}

export function isSigningOut(): boolean {
    try {
        const raw = sessionStorage.getItem(SIGNING_OUT_KEY);
        if (!raw) return false;
        const at = Number(raw);
        if (!Number.isFinite(at) || at <= 0) return false;
        return Date.now() - at < SIGNING_OUT_TTL_MS;
    } catch {
        return false;
    }
}

export function clearSigningOut(): void {
    try {
        sessionStorage.removeItem(SIGNING_OUT_KEY);
    } catch {
        // ignored
    }
}
