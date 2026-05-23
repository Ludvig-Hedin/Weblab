import { isShellStartupError } from './errors';

/**
 * The CodeSandbox SDK fires shell/pitcher promises during cold-boot that
 * we don't (and can't) `await` from our wrapper code — they're driven
 * by internal subscriptions inside `@codesandbox/sdk`'s bundle. When the
 * container hibernates or is still starting these reject with messages
 * like `Shell with id <uuid> does not exist` and surface as
 * `Uncaught (in promise) _PitcherMessageError`, polluting the console
 * even though the system already retries past them via `useFrameReload`
 * and `isShellStartupError`.
 *
 * Install a single global `unhandledrejection` filter that swallows
 * exactly the messages our existing `isShellStartupError` classifier
 * already treats as transient. Real failures still bubble up.
 *
 * Idempotent — repeated calls (e.g. from React StrictMode double-mount)
 * are no-ops after the first.
 */
let installed = false;

function extractMessage(reason: unknown): string {
    if (typeof reason === 'string') return reason;
    if (reason instanceof Error) return reason.message;
    if (reason && typeof reason === 'object' && 'message' in reason) {
        return String((reason as { message: unknown }).message);
    }
    return String(reason);
}

export function installCodeSandboxNoiseSuppression(): void {
    if (installed || typeof window === 'undefined') return;
    installed = true;

    window.addEventListener('unhandledrejection', (event) => {
        const message = extractMessage(event.reason);
        if (!message) return;

        if (isShellStartupError(message)) {
            event.preventDefault();
            console.debug('[sandbox] suppressed transient CSB shell error:', message);
        }
    });
}

/**
 * React 19.2's `react-dom` calls `document.startViewTransition()` during
 * commit. The returned transition's `finished` promise rejects with
 * `InvalidStateError: Transition was aborted because of invalid state`
 * whenever a navigation (or any update) preempts the in-flight transition
 * — which happens on essentially every route change in a navigation-heavy
 * app like ours. React's internal error handler only attaches to
 * `transition.ready`, not `transition.finished`, so the rejection escapes
 * as an unhandled promise rejection and spams the console with a benign
 * cosmetic error.
 *
 * This is correct browser behavior per the View Transitions spec: a
 * preempted transition aborts. Swallow exactly that signature globally so
 * the console stays useful. Other InvalidStateErrors still bubble.
 *
 * Implementation notes:
 *   - Match by regex (substring + case-insensitive) so cross-browser /
 *     cross-version wording drift doesn't silently break suppression and
 *     bring the spam back.
 *   - The outer `InvalidStateError` name check still gates the branch so
 *     unrelated errors keep bubbling.
 *   - Cover both the `unhandledrejection` channel (Chrome/Safari path) and
 *     the `error` event channel (React's `[EXCEPTION]` log surface). Only
 *     `unhandledrejection` was covered before and one still leaked through
 *     during QA.
 *
 * Idempotent.
 */
let viewTransitionInstalled = false;

const VIEW_TRANSITION_MESSAGE_RE =
    /transition was aborted|view transition was skipped|skipping view transition/i;

function isInvalidStateName(reason: unknown): boolean {
    const name =
        reason && typeof reason === 'object' && 'name' in reason
            ? String((reason as { name: unknown }).name)
            : '';
    return name === 'InvalidStateError';
}

export function installViewTransitionNoiseSuppression(): void {
    if (viewTransitionInstalled || typeof window === 'undefined') return;
    viewTransitionInstalled = true;

    window.addEventListener('unhandledrejection', (event) => {
        const reason: unknown = event.reason;
        if (!isInvalidStateName(reason)) return;

        const message = extractMessage(reason);
        if (VIEW_TRANSITION_MESSAGE_RE.test(message)) {
            event.preventDefault();
        }
    });

    // Mirror the same gate for the `error` event channel. React's
    // `[EXCEPTION]` log path surfaces here and was leaking past the
    // unhandledrejection-only filter.
    window.addEventListener('error', (event) => {
        const reason: unknown = event.error ?? event.message;
        if (!isInvalidStateName(reason)) return;

        const message = extractMessage(reason) || event.message || '';
        if (VIEW_TRANSITION_MESSAGE_RE.test(message)) {
            event.preventDefault();
        }
    });
}
