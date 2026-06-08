import { useEffect, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useAction } from 'convex/react';

import type { Id } from '@convex/_generated/dataModel';

export type SandboxLivenessState = 'unknown' | 'alive' | 'gone' | 'notFound' | 'error';

/**
 * Server-side liveness probe for a sandbox preview URL. CodeSandbox recycles
 * inactive sandboxes and starts returning `410 Gone` for their URLs. Browsers
 * can't read the response status of a cross-origin iframe load, so the editor
 * has no client-only way to distinguish "cold-booting, give it time" from
 * "this URL will never come back". This hook previously called the server
 * `sandbox.checkAlive` tRPC procedure (which did the HEAD with full status
 * access) and exposed a typed state the editor could branch on to surface a
 * restore CTA instead of an infinite "Initializing development environment..."
 * spinner.
 *
 * The probe fires once `enabled` flips true (typically after the boot-time
 * soft hint timer trips), so we don't spam the network during normal cold
 * boots.
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
        void checkLiveness({ branchId, previewUrl })
            .then((result) => {
                if (!cancelled) {
                    setState(result.state);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setState('error');
                }
            });

        return () => {
            cancelled = true;
        };
    }, [branchId, checkLiveness, previewUrl, enabled]);

    return state;
}
