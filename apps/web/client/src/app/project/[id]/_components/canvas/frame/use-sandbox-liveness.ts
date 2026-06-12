import { useEffect, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useAction } from 'convex/react';

import type { Id } from '@convex/_generated/dataModel';

export type SandboxLivenessState = 'unknown' | 'alive' | 'gone' | 'notFound' | 'error';

// How often to re-probe a LOCAL dev server while it's still cold-booting,
// and how long each probe may hang before we treat it as "not up yet".
const LOCAL_PROBE_INTERVAL_MS = 1_000;
const LOCAL_PROBE_TIMEOUT_MS = 4_000;

// How often to re-probe a CLOUD sandbox while its state is still unresolved
// (404 mid-boot / transient error). Each probe is a server-side HEAD via a
// Convex action, so keep this much gentler than the local cadence.
const CLOUD_PROBE_INTERVAL_MS = 12_000;

/**
 * True for a desktop LOCAL dev-server preview URL (http://localhost:PORT).
 * Local branches run on the user's own machine, not a Vercel sandbox, so
 * their liveness must be probed client-side (see below) rather than via the
 * Convex `checkSandboxLiveness` action.
 */
export function isLocalPreviewUrl(url: string): boolean {
    try {
        const { hostname } = new URL(url);
        return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
    } catch {
        return false;
    }
}

/**
 * Probe a LOCAL dev server from the browser. The Convex `checkSandboxLiveness`
 * action runs in Convex's cloud and (a) rejects non-https URLs and (b) cannot
 * physically reach the user's `localhost` — so for local branches we probe
 * here, on the same machine as the dev server. `no-cors` makes the response
 * opaque (status unreadable), but a *resolved* fetch means the server is
 * listening; a *thrown* fetch means it hasn't bound the port yet.
 */
async function probeLocalPreview(url: string): Promise<'alive' | 'notFound'> {
    try {
        await fetch(url, {
            method: 'GET',
            mode: 'no-cors',
            cache: 'no-store',
            signal: AbortSignal.timeout(LOCAL_PROBE_TIMEOUT_MS),
        });
        return 'alive';
    } catch {
        return 'notFound';
    }
}

/**
 * Liveness probe for a preview URL.
 *
 * CodeSandbox/Vercel recycle inactive sandboxes and start returning `410 Gone`
 * (or `404` mid-boot) for their URLs. Browsers can't read the response status
 * of a cross-origin iframe load, so the editor has no client-only way to
 * distinguish "cold-booting, give it time" from "this URL will never come
 * back" — for *cloud* branches we ask the server (`checkSandboxLiveness`),
 * which does the HEAD with full status access.
 *
 * For *local* (desktop) branches the cloud action is both wrong (it rejects
 * http) and useless (Convex can't reach localhost), so we poll the dev server
 * directly from the browser until it binds its port. This is what lets the
 * canvas reveal the rendered site as soon as the local server is up, instead
 * of waiting on the full preload + penpal handshake.
 *
 * Probing starts once `enabled` flips true, so we don't spam the network
 * during normal cold boots, and keeps re-probing on an interval until the
 * state resolves to a terminal answer (`alive` / `gone`). A one-shot probe
 * left transient `notFound`/`error` results sticky forever — which both
 * suppressed the restart panel and never noticed the dev server coming up.
 */
export function useSandboxLiveness(
    branchId: Id<'branches'>,
    previewUrl: string,
    enabled: boolean,
): SandboxLivenessState {
    const checkLiveness = useAction(api.projectActions.checkSandboxLiveness);
    const [state, setState] = useState<SandboxLivenessState>('unknown');

    useEffect(() => {
        if (!enabled || !previewUrl) {
            setState('unknown');
            return;
        }

        let cancelled = false;
        setState('unknown');

        // LOCAL desktop dev server: poll from the browser until the port binds.
        if (isLocalPreviewUrl(previewUrl)) {
            let timer: ReturnType<typeof setInterval> | null = null;
            const stop = () => {
                if (timer) {
                    clearInterval(timer);
                    timer = null;
                }
            };
            const tick = async () => {
                const result = await probeLocalPreview(previewUrl);
                if (cancelled) return;
                setState(result);
                if (result === 'alive') stop();
            };
            void tick();
            timer = setInterval(() => void tick(), LOCAL_PROBE_INTERVAL_MS);
            return () => {
                cancelled = true;
                stop();
            };
        }

        // CLOUD (Vercel sandbox): server-side HEAD with full status access.
        // Re-probe on an interval until the state resolves to a terminal
        // answer; `alive` and `gone` stop the loop, `notFound`/`error` keep it
        // running so a slow-booting dev server is eventually noticed.
        let timer: ReturnType<typeof setInterval> | null = null;
        let inFlight = false;
        const stop = () => {
            if (timer) {
                clearInterval(timer);
                timer = null;
            }
        };
        const tick = async () => {
            // Convex actions have no abort handle — skip the tick instead of
            // stacking a second probe on top of a slow in-flight one.
            if (inFlight) return;
            inFlight = true;
            let result: SandboxLivenessState = 'error';
            try {
                result = (await checkLiveness({ branchId, previewUrl })).state;
            } catch {
                result = 'error';
            } finally {
                inFlight = false;
            }
            if (cancelled) return;
            setState(result);
            if (result === 'alive' || result === 'gone') stop();
        };
        void tick();
        timer = setInterval(() => void tick(), CLOUD_PROBE_INTERVAL_MS);

        return () => {
            cancelled = true;
            stop();
        };
    }, [branchId, checkLiveness, previewUrl, enabled]);

    return state;
}
