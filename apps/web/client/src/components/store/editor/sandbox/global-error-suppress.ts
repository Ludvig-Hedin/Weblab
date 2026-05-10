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

export function installCodeSandboxNoiseSuppression(): void {
    if (installed || typeof window === 'undefined') return;
    installed = true;

    window.addEventListener('unhandledrejection', (event) => {
        const reason: unknown = event.reason;
        let message: string;
        if (typeof reason === 'string') {
            message = reason;
        } else if (reason instanceof Error) {
            message = reason.message;
        } else if (reason && typeof reason === 'object' && 'message' in reason) {
            message = String((reason as { message: unknown }).message);
        } else {
            message = String(reason);
        }

        if (!message) return;

        if (isShellStartupError(message)) {
            event.preventDefault();
            console.debug('[sandbox] suppressed transient CSB shell error:', message);
        }
    });
}
