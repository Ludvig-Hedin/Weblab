import { useEffect, useState } from 'react';

import { api } from '@/trpc/react';

export type SandboxLivenessState = 'unknown' | 'alive' | 'gone' | 'notFound' | 'error';

/**
 * Server-side liveness probe for a sandbox preview URL. CodeSandbox recycles
 * inactive sandboxes and starts returning `410 Gone` for their URLs. Browsers
 * can't read the response status of a cross-origin iframe load, so the editor
 * has no client-only way to distinguish "cold-booting, give it time" from
 * "this URL will never come back". This hook calls the server `sandbox.checkAlive`
 * tRPC procedure (which does the HEAD with full status access) and exposes
 * a typed state the editor can branch on to surface a restore CTA instead of
 * an infinite "Initializing development environment..." spinner.
 *
 * The probe fires once `enabled` flips true (typically after the boot-time
 * soft hint timer trips), so we don't spam the network during normal cold
 * boots.
 */
export function useSandboxLiveness(previewUrl: string, enabled: boolean): SandboxLivenessState {
    const [state, setState] = useState<SandboxLivenessState>('unknown');
    const utils = api.useUtils();

    useEffect(() => {
        if (!enabled || !previewUrl) return;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;

        const probe = async () => {
            try {
                const res = await utils.sandbox.checkAlive.fetch({ previewUrl });
                if (cancelled) return;
                setState(res.state);
                if (res.state === 'alive') return;
                // Keep re-checking dead-looking sandboxes in case the user
                // restarts the dev server externally and the URL flips back
                // to 200 — but don't spam.
                timer = setTimeout(probe, 10_000);
            } catch {
                if (cancelled) return;
                setState('error');
                timer = setTimeout(probe, 10_000);
            }
        };
        void probe();
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [previewUrl, enabled, utils.sandbox.checkAlive]);

    return state;
}
