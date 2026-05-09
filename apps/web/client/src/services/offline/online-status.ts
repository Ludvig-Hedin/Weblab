'use client';

import { useEffect, useSyncExternalStore } from 'react';

type Listener = (online: boolean) => void;
type VerifiedListener = (state: VerifiedOnlineState) => void;
export type VerifiedOnlineState = 'unknown' | 'online' | 'offline';

/**
 * Truth source for "is the user actually reachable?" Combines
 *   - browser `navigator.onLine`
 *   - 15s heartbeat HEAD /api/health
 *
 * `navigator.onLine` lies — connecting to a wifi router with no internet
 * still reports `true` and would route the app down doomed cloud paths
 * for 5+ seconds per call. The heartbeat overrides the flag when the
 * server is unreachable and recovers it as soon as the next ping succeeds.
 */

const HEALTH_URL = '/api/health';
const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 4_000;

let currentOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
let verifiedState: VerifiedOnlineState = 'unknown';
const listeners = new Set<Listener>();
const verifiedListeners = new Set<VerifiedListener>();
let attached = false;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let lastPingAt = 0;

function setOnline(next: boolean): void {
    const verified: VerifiedOnlineState = next ? 'online' : 'offline';
    if (verified !== verifiedState) {
        verifiedState = verified;
        for (const l of verifiedListeners) l(verifiedState);
    }
    if (next === currentOnline) return;
    currentOnline = next;
    for (const l of listeners) l(currentOnline);
}

function notifyFromBrowser(): void {
    const browserOnline = typeof navigator === 'undefined' ? true : navigator.onLine;
    if (!browserOnline) {
        setOnline(false);
        return;
    }
    // Browser thinks we're online — verify with a heartbeat before flipping.
    void heartbeat({ allowFlipUp: true });
}

async function heartbeat(opts: { allowFlipUp?: boolean } = {}): Promise<void> {
    if (typeof window === 'undefined') return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setOnline(false);
        return;
    }
    const since = Date.now() - lastPingAt;
    if (since < 1_000) return; // dedupe rapid triggers
    lastPingAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), HEARTBEAT_TIMEOUT_MS);
    try {
        const response = await fetch(HEALTH_URL, {
            method: 'HEAD',
            cache: 'no-store',
            signal: controller.signal,
            credentials: 'omit',
        });
        if (response.ok) {
            if (opts.allowFlipUp || currentOnline) setOnline(true);
        } else if (response.status >= 500) {
            setOnline(false);
        } else if (opts.allowFlipUp) {
            // 4xx still indicates the server is reachable — heartbeat path
            // didn't return 2xx but the network leg works. Treat as online.
            setOnline(true);
        }
    } catch {
        setOnline(false);
    } finally {
        clearTimeout(timeout);
    }
}

function attach(): void {
    if (attached || typeof window === 'undefined') return;
    attached = true;
    window.addEventListener('online', notifyFromBrowser);
    window.addEventListener('offline', notifyFromBrowser);
    // Kick off a verification ping so the initial state isn't blindly trusting
    // navigator.onLine.
    void heartbeat({ allowFlipUp: false });
    if (heartbeatTimer === null) {
        heartbeatTimer = setInterval(() => {
            // Skip when document is hidden — we'll re-verify on visibility change.
            if (typeof document !== 'undefined' && document.hidden) return;
            void heartbeat({ allowFlipUp: true });
        }, HEARTBEAT_INTERVAL_MS);
    }
    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                void heartbeat({ allowFlipUp: true });
            }
        });
    }
}

export function isOnline(): boolean {
    return currentOnline;
}

export function subscribeOnline(listener: Listener): () => void {
    attach();
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/**
 * Force a heartbeat now — useful after the user clicks "Sync now" or when
 * the app needs to verify state before kicking off a multi-step flow.
 */
export async function pingOnlineStatus(): Promise<boolean> {
    await heartbeat({ allowFlipUp: true });
    return currentOnline;
}

/**
 * React hook that returns the current online state and re-renders when it
 * changes. Drives offline-mode gating in providers, AI clients, and banners.
 */
export function useOnlineStatus(): boolean {
    return useSyncExternalStore(
        (cb) => subscribeOnline(cb),
        () => currentOnline,
        () => true,
    );
}

function subscribeVerified(listener: VerifiedListener): () => void {
    attach();
    verifiedListeners.add(listener);
    return () => {
        verifiedListeners.delete(listener);
    };
}

/**
 * Returns the heartbeat-verified online state, including an `unknown` value
 * during the first ping window after mount. Use this when gating
 * destructive flows (e.g., manual replay, hard refresh): treat `unknown`
 * as "wait, don't act yet" instead of optimistically flipping into a
 * cloud path that may instantly fail.
 */
export function useVerifiedOnlineStatus(): VerifiedOnlineState {
    return useSyncExternalStore(
        (cb) => subscribeVerified(cb),
        () => verifiedState,
        () => 'unknown' as VerifiedOnlineState,
    );
}

export function getVerifiedOnlineState(): VerifiedOnlineState {
    return verifiedState;
}

/**
 * Best-effort heartbeat — bumps a state change on `online` events even when
 * the browser thinks we're online but tRPC requests are timing out. Caller
 * decides what action to take (refetch, replay queue, etc.).
 */
export function useOnlineEffect(onTransition: (online: boolean) => void): void {
    useEffect(() => {
        return subscribeOnline(onTransition);
    }, [onTransition]);
}
