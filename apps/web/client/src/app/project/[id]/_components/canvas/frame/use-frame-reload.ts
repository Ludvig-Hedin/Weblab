import { useEffect, useMemo, useRef, useState } from 'react';
import { debounce } from 'lodash';

import { planReload } from './frame-reload-policy';

// First-attempt timeout. Vercel Sandbox cold-boot regularly takes 10–15s
// before the dev server responds (502 until then). 5s was too aggressive — the
// handshake fired, timed out, and dumped a noisy error to the console for
// every freshly-created project. 12s gives the sandbox a realistic window
// while still failing fast on a genuinely-broken handshake.
const PENPAL_BASE_TIMEOUT_MS = 12000;
const PENPAL_TIMEOUT_INCREMENT_MS = 2000;
const PENPAL_MAX_TIMEOUT_MS = 30000;

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
    // Wall-clock anchor for the CURRENT boot-wait window. Set when we start
    // waiting (mount / first disconnect after a healthy period), cleared only
    // when penpal connects. Intentionally NOT reset on reload attempts —
    // auto reloads are part of the same wait, and re-anchoring per attempt
    // made the 60s restart hint / 90s notFound-grace escalations unreachable.
    const bootStartedAtRef = useRef<number | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [isPenpalConnected, setIsPenpalConnected] = useState(false);
    // Mirror reloadCountRef into state so consumers can react to repeated
    // handshake failures (e.g. surface a Retry banner). The ref still drives
    // the auto-retry loop; this is read-only for the UI.
    const [connectionFailureCount, setConnectionFailureCount] = useState(0);
    const [reloadCapped, setReloadCapped] = useState(false);
    // Cumulative ms the frame has been waiting for the current boot, across
    // auto reload attempts. Updated every BOOT_TIMER_TICK_MS while the frame
    // isn't ready, frozen on connect. Uncapped — escalation thresholds
    // (BOOT_RESTART_HINT_MS, NOTFOUND_GRACE_MS) compare against the raw
    // value; cap only at display time if a consumer ever renders it.
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

        const plan = planReload(reloadCountRef.current);
        // `capped` surfaces the manual "Retry preview" / "Restart sandbox"
        // panel. Past the fast budget we keep scheduling gentle background
        // self-heal reloads (long interval) so a late-booting sandbox
        // reconnects on its own — `useSandboxLiveness` is a no-op today, so
        // this is the only signal that re-arms the iframe once the dev server
        // finally serves.
        setReloadCapped(plan.capped);
        if (!plan.shouldReload) {
            return;
        }

        reloadTimeoutRef.current = setTimeout(() => {
            setReloadKey((prev) => prev + 1);
            reloadTimeoutRef.current = null;
        }, plan.delayMs);
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

    // Reset connection state on reload. The boot-elapsed anchor is
    // deliberately left alone here — see bootStartedAtRef above.
    useEffect(() => {
        setIsPenpalConnected(false);
    }, [reloadKey]);

    // Tick the boot-elapsed timer while we're waiting. Stop ticking the
    // moment penpal connects so the value freezes at "time-to-ready"
    // (useful diagnostic) and doesn't keep climbing in the background.
    useEffect(() => {
        if (isPenpalConnected) {
            clearBootTimer();
            // Healthy — close the boot-wait window. The next disconnect
            // starts a fresh cumulative anchor.
            bootStartedAtRef.current = null;
            return;
        }
        // Anchor once per wait window (mount, or first disconnect after a
        // healthy period). Auto reloads re-run the reload effect above but
        // not this anchor, so elapsed time accumulates across attempts.
        if (bootStartedAtRef.current === null) {
            bootStartedAtRef.current = Date.now();
            setBootElapsedMs(0);
        }
        if (bootTimerRef.current) return;
        bootTimerRef.current = setInterval(() => {
            const anchor = bootStartedAtRef.current;
            setBootElapsedMs(anchor === null ? 0 : Date.now() - anchor);
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
