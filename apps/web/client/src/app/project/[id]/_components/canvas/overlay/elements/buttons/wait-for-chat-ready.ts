/** Default budget for {@link waitForChatReady}. */
export const CHAT_READY_TIMEOUT_MS = 2500;

interface ChatReadiness {
    chat: { isChatActionReady: boolean };
}

interface WaitForChatReadyOptions {
    /** Current time in ms. Defaults to `performance.now()`; injected in tests. */
    now?: () => number;
    /** Schedules the next poll. Defaults to `requestAnimationFrame`; injected in tests. */
    schedule?: (callback: () => void) => void;
}

/**
 * Resolve once `chat.isChatActionReady` is true (polling on each animation
 * frame), or reject after `timeoutMs`.
 *
 * The in-canvas chat pipeline (`useChat`) only wires its send action while the
 * Chat tab is mounted. A caller that reveals the panel and immediately sends
 * must therefore wait for the action to attach — otherwise `chat.sendMessage`
 * throws `'Chat actions not initialized'`.
 */
export function waitForChatReady(
    target: ChatReadiness,
    timeoutMs = CHAT_READY_TIMEOUT_MS,
    options: WaitForChatReadyOptions = {},
): Promise<void> {
    const now = options.now ?? defaultNow;
    const schedule = options.schedule ?? defaultSchedule;
    return new Promise((resolve, reject) => {
        const start = now();
        const tick = () => {
            if (target.chat.isChatActionReady) {
                resolve();
                return;
            }
            if (now() - start > timeoutMs) {
                reject(new Error('Chat actions not initialized'));
                return;
            }
            schedule(tick);
        };
        tick();
    });
}

function defaultNow(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function defaultSchedule(callback: () => void): void {
    if (typeof requestAnimationFrame !== 'undefined') {
        requestAnimationFrame(callback);
    } else {
        setTimeout(callback, 16);
    }
}
