export interface StopButtonState {
    /**
     * The composer-wide disabled flag. Tracks AI availability: viewer /
     * read-only projects, exhausted quota, and the offline heartbeat
     * (`useAiAvailability` → `useOnlineStatus`).
     */
    composerDisabled: boolean;
    /** Stream-abort handler. Absent means there is nothing to stop. */
    onStop?: () => void | Promise<void>;
}

/**
 * Decides whether the composer's Stop button is disabled.
 *
 * The Stop button is only rendered while a stream is in flight, and aborting is
 * a LOCAL action (it cancels the in-flight fetch + clears the tool-execution
 * spinner — see `hardStop` in `use-chat`). It must therefore stay clickable
 * even when the composer is otherwise disabled.
 *
 * The original bug: the Stop button inherited the composer `disabled` flag, so
 * a single failed `/api/health` heartbeat during a long stream (transient
 * network blip, 5xx, or a 4s timeout) flipped the app "offline", set
 * `canUseAi = false`, and disabled Stop — making it a dead button at the exact
 * moment the user wanted to bail out of a stuck stream. The symptom was
 * intermittent ("sometimes I can't stop the AI") because it depended on a
 * heartbeat happening to fail mid-stream.
 *
 * Stop is disabled ONLY when there is no handler to call.
 */
export function isStopButtonDisabled(state: StopButtonState): boolean {
    // Intentionally ignores `state.composerDisabled`: AI availability must never
    // gate a local stream-abort.
    return !state.onStop;
}
