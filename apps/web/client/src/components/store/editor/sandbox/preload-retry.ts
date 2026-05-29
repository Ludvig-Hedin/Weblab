/**
 * Retry policy for preload-script injection.
 *
 * Split out from `SandboxManager` so the decision is unit-testable without
 * constructing the whole MobX engine (sessions, providers, fs, git).
 */

export const PRELOAD_RETRY_DELAY_MS = 2000;

/** Cap for genuine (non-transient) injection failures — fail fast + loud. */
export const MAX_PRELOAD_RETRY_ATTEMPTS = 5;

/**
 * Cap for the expected cold-boot race: the sandbox file system hasn't synced
 * the router directory (app/ or pages/) yet, so detection returns
 * `__missing_router_config__`. On Vercel Sandbox a cold resume can take
 * 30–60s before the FS surfaces those files. The old 5-attempt (~10s) budget
 * gave up far too early and left the editor on a forever spinner because the
 * preload script never injected (no canvas tools, penpal never useful). Retry
 * patiently up to ~60s (30 * PRELOAD_RETRY_DELAY_MS) instead.
 */
export const MAX_PRELOAD_TRANSIENT_RETRY_ATTEMPTS = 30;

export interface PreloadRetryPlan {
    /** Attempt ceiling for this error class. */
    maxAttempts: number;
    /** Whether another retry should be scheduled. */
    willRetry: boolean;
    /** How loudly to log this failure. */
    logLevel: 'debug' | 'error';
}

/**
 * Decide whether to retry preload injection and how loudly to log it.
 *
 * - Transient (router not synced yet): retry patiently, always log at `debug`.
 *   It is expected on every healthy slow cold-boot, so it must never escalate
 *   to `console.error`.
 * - Non-transient: retry up to the small cap, then surface a real error.
 *
 * @param isTransient   true when the failure is `__missing_router_config__`.
 * @param attemptCount  retries already consumed (0 on the first failure).
 */
export function planPreloadRetry(isTransient: boolean, attemptCount: number): PreloadRetryPlan {
    const maxAttempts = isTransient
        ? MAX_PRELOAD_TRANSIENT_RETRY_ATTEMPTS
        : MAX_PRELOAD_RETRY_ATTEMPTS;
    const willRetry = attemptCount < maxAttempts;
    const logLevel: 'debug' | 'error' = isTransient || willRetry ? 'debug' : 'error';
    return { maxAttempts, willRetry, logLevel };
}
