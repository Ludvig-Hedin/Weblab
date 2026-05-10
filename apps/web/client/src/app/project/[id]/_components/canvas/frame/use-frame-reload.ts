import { useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from 'lodash';

// Reload timing constants
const RELOAD_BASE_DELAY_MS = 2000;
const RELOAD_INCREMENT_MS = 1000;
// First-attempt timeout. CodeSandbox cold-boot regularly takes 10–15s before
// the dev server responds (502 until then). 5s was too aggressive — the
// handshake fired, timed out, and dumped a noisy error to the console for
// every freshly-created project. 12s gives the sandbox a realistic window
// while still failing fast on a genuinely-broken handshake.
const PENPAL_BASE_TIMEOUT_MS = 12000;
const PENPAL_TIMEOUT_INCREMENT_MS = 2000;
const PENPAL_MAX_TIMEOUT_MS = 30000;
// Hard cap on automatic reloads. Past this point the loader UI takes
// over with a "Restart sandbox" affordance — auto-reloading forever
// would just thrash a permanently-dead sandbox and waste resources.
// 6 attempts ≈ 27 s of waiting plus the per-attempt penpal timeouts,
// covering the realistic boot window with margin.
const RELOAD_MAX_ATTEMPTS = 6;

// Boot-elapsed escalation thresholds. Drive the loader's UI escalation
// (soft caption at 30s, "Restart sandbox" panel at 60s) without
// coupling them to the (separate) penpal-failure counter — a sandbox
// can be slow to boot without any single handshake having timed out
// yet, and we still want the user to see progress messaging.
const BOOT_TIMER_TICK_MS = 1000;
export const BOOT_SOFT_HINT_MS = 30_000;
export const BOOT_RESTART_HINT_MS = 60_000;

export function useFrameReload() {
    const reloadCountRef = useRef(0);
    const reloadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const bootTimerRef = useRef<NodeJS.Timeout | null>(null);
    const bootStartedAtRef = useRef<number>(Date.now());
    const [reloadKey, setReloadKey] = useState(0);
    const [isPenpalConnected, setIsPenpalConnected] = useState(false);
    // Mirror reloadCountRef into state so consumers can react to repeated
    // handshake failures (e.g. surface a Retry banner). The ref still drives
    // the auto-retry loop; this is read-only for the UI.
    const [connectionFailureCount, setConnectionFailureCount] = useState(0);
    const [reloadCapped, setReloadCapped] = useState(false);
    // ms since the iframe started its current boot attempt. Updated
    // every BOOT_TIMER_TICK_MS while the frame isn't ready, frozen on
    // connect, reset on reload.
    const [bootElapsedMs, setBootElapsedMs] = useState(0);

    const clearScheduledReload = () => {
        if (reloadTimeoutRef.current) {
            clearTimeout(reloadTimeoutRef.current);
            reloadTimeoutRef.current = null;
        }
    };

    const clearBootTimer = () => {
        if (bootTimerRef.current) {
            clearInterval(bootTimerRef.current);
            bootTimerRef.current = null;
        }
    };

    // Stable ref to the latest scheduleReload so the memoized debounced
    // failure handler can call the current implementation without itself
    // being recreated each render (which would defeat lodash's debounce
    // — every render would mint a fresh, un-pending function).
    const scheduleReloadRef = useRef<() => void>(() => {});

    const immediateReload = () => {
        clearScheduledReload();
        // Cancel any in-flight debounced failure callback so a stale
        // invocation cannot re-increment the counter we just reset.
        handleConnectionFailed.cancel();
        // Manual retry resets the cap — the user explicitly asked us
        // to try again, so let the auto-retry loop have another full
        // budget before giving up.
        reloadCountRef.current = 0;
        setConnectionFailureCount(0);
        setReloadCapped(false);
        setReloadKey((prev) => prev + 1);
    };

    const scheduleReload = () => {
        clearScheduledReload();

        reloadCountRef.current += 1;
        setConnectionFailureCount(reloadCountRef.current);

        if (reloadCountRef.current > RELOAD_MAX_ATTEMPTS) {
            // Stop scheduling new reloads. The escalation UI surfaces a
            // Restart sandbox button so the user can recover deliberately
            // instead of us thrashing in the background.
            setReloadCapped(true);
            return;
        }

        const reloadDelay =
            RELOAD_BASE_DELAY_MS + RELOAD_INCREMENT_MS * (reloadCountRef.current - 1);

        reloadTimeoutRef.current = setTimeout(() => {
            setReloadKey((prev) => prev + 1);
            reloadTimeoutRef.current = null;
        }, reloadDelay);
    };

    // Keep the ref pointing at the latest scheduleReload closure so the
    // debounced handler — which is intentionally created once — always
    // invokes the current implementation.
    scheduleReloadRef.current = scheduleReload;

    // Created once per hook lifetime. Recreating the debounced fn each
    // render produced a new pending timer per render and meant `cancel()`
    // calls during cleanup/success only cancelled the latest one,
    // leaking older timers that could still fire stale state updates.
    const handleConnectionFailed = useMemo(
        () =>
            debounce(
                () => {
                    setIsPenpalConnected(false);
                    scheduleReloadRef.current();
                },
                1000,
                { leading: true },
            ),
        [],
    );

    const handleConnectionSuccess = () => {
        handleConnectionFailed.cancel();
        clearScheduledReload();
        setIsPenpalConnected(true);
    };

    const getPenpalTimeout = () => {
        return Math.min(
            PENPAL_BASE_TIMEOUT_MS + reloadCountRef.current * PENPAL_TIMEOUT_INCREMENT_MS,
            PENPAL_MAX_TIMEOUT_MS,
        );
    };

    // Reset reload counter on successful connection
    useEffect(() => {
        if (isPenpalConnected && reloadCountRef.current > 0) {
            reloadCountRef.current = 0;
            setConnectionFailureCount(0);
            setReloadCapped(false);
        }
    }, [isPenpalConnected]);

    // Reset connection state on reload
    useEffect(() => {
        setIsPenpalConnected(false);
        bootStartedAtRef.current = Date.now();
        setBootElapsedMs(0);
    }, [reloadKey]);

    // Tick the boot-elapsed timer while we're waiting. Stop ticking the
    // moment penpal connects so the value freezes at "time-to-ready"
    // (useful diagnostic) and doesn't keep climbing in the background.
    useEffect(() => {
        if (isPenpalConnected) {
            clearBootTimer();
            return;
        }
        if (bootTimerRef.current) return;
        bootTimerRef.current = setInterval(() => {
            setBootElapsedMs(Date.now() - bootStartedAtRef.current);
        }, BOOT_TIMER_TICK_MS);
        return clearBootTimer;
    }, [isPenpalConnected]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            handleConnectionFailed.cancel();
            clearScheduledReload();
            clearBootTimer();
        };
    }, [handleConnectionFailed]);

    return {
        reloadKey,
        isPenpalConnected,
        immediateReload,
        handleConnectionFailed,
        handleConnectionSuccess,
        getPenpalTimeout,
        connectionFailureCount,
        reloadCapped,
        bootElapsedMs,
    };
}
