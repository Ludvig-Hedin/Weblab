/**
 * Iframe reload schedule for sandbox cold-boot recovery.
 *
 * Split out from `useFrameReload` so the schedule is unit-testable without a
 * React render. Two phases:
 *
 *  1. Fast auto-retry (attempts 1..RELOAD_MAX_ATTEMPTS): escalating short
 *     delays that cover a normal Vercel cold-boot.
 *  2. Gentle self-heal (the next SELF_HEAL_MAX_ATTEMPTS): once the fast budget
 *     is spent we surface the manual "Retry preview" panel (`capped`), but keep
 *     re-fetching on a long interval. `useSandboxLiveness` is currently a no-op
 *     (the server probe was not ported to Convex), so without this the editor
 *     has no signal to re-arm the iframe when a slow sandbox finally serves —
 *     the user would be stranded on the panel even after the dev server is up.
 */

export const RELOAD_BASE_DELAY_MS = 2000;
export const RELOAD_INCREMENT_MS = 1000;
// Fast auto-retry budget. ~27s of waiting plus per-attempt penpal timeouts,
// covering a typical Vercel Sandbox cold boot (502 until the dev server binds).
export const RELOAD_MAX_ATTEMPTS = 6;

// Background self-heal past the fast budget: gentle re-fetch every
// SELF_HEAL_INTERVAL_MS, continuing indefinitely (no hard ceiling) so a
// late-booting sandbox reconnects on its own instead of being stranded.
// SELF_HEAL_MAX_ATTEMPTS is retained only as the reference point at which the
// manual Retry/Restart panel has been shown for a while (used by tests); it no
// longer terminates the self-heal loop.
export const SELF_HEAL_INTERVAL_MS = 15_000;
export const SELF_HEAL_MAX_ATTEMPTS = 12;

export interface ReloadPlan {
    /** Whether to schedule another iframe reload. */
    shouldReload: boolean;
    /** Delay before the reload fires (ms). */
    delayMs: number;
    /** Whether the fast budget is spent — drives the manual Retry panel. */
    capped: boolean;
}

/**
 * Decide whether/when to reload the preview iframe for a given attempt number.
 *
 * @param attempt 1-based failure count (1 on the first connection failure).
 */
export function planReload(attempt: number): ReloadPlan {
    if (attempt <= RELOAD_MAX_ATTEMPTS) {
        return {
            shouldReload: true,
            delayMs: RELOAD_BASE_DELAY_MS + RELOAD_INCREMENT_MS * (attempt - 1),
            capped: false,
        };
    }
    // Past the fast budget: surface the manual Retry/Restart panel (`capped`)
    // but keep gently re-fetching on the long interval INDEFINITELY. A fixed
    // ceiling stranded users whose Vercel cold boot (npm install + next dev on a
    // fresh sandbox) ran past the budget — and since `useSandboxLiveness` is a
    // no-op, this gentle reload is the ONLY signal that re-arms the iframe once
    // the dev server finally serves. On success the loop stops (cleared by
    // `handleConnectionSuccess`), and the editor unmount clears the timer, so
    // "indefinite" is bounded by the editor staying open on a still-dead sandbox
    // (where the user also has the explicit "Restart sandbox" CTA).
    return { shouldReload: true, delayMs: SELF_HEAL_INTERVAL_MS, capped: true };
}
