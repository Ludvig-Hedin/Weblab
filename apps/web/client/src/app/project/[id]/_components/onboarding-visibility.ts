/**
 * Pure decision for whether the first-run editor tour should show.
 *
 * Split out from `OnboardingTour` so the gating is unit-testable without a
 * React render or localforage/IndexedDB. Source of truth is the per-user
 * Convex flag; localforage is only an optimistic cache to avoid a flash before
 * the `users.me` query resolves.
 */

/** Minimal shape of the `users.me` query result we depend on. */
export interface OnboardingUser {
    hasSeenEditorOnboarding?: boolean;
}

export interface OnboardingVisibilityInput {
    /** Skip the tour entirely (e.g. during the AI creation flow). */
    suppressed: boolean;
    /**
     * `users.me` result: `undefined` while the query loads, `null` when not
     * signed in, otherwise the user doc.
     */
    user: OnboardingUser | null | undefined;
    /** localforage seen-flag: `null` until the local read resolves. */
    localSeen: boolean | null;
}

/**
 * @returns `null` while undecided (still loading — render nothing yet),
 *          `true` to show the tour, `false` to keep it hidden.
 */
export function resolveOnboardingVisibility(input: OnboardingVisibilityInput): boolean | null {
    if (input.suppressed) return false;
    // Wait for the per-user flag — it's the source of truth and prevents
    // re-showing for existing users.
    if (input.user === undefined) return null;
    // Not signed in (shouldn't happen on an auth-gated editor route): never show.
    if (input.user === null) return false;
    if (input.user.hasSeenEditorOnboarding) return false;
    // New user per the server flag. Fall back to the local cache to avoid a
    // flash on the very first paint before the flag round-trips.
    if (input.localSeen === null) return null;
    return !input.localSeen;
}
