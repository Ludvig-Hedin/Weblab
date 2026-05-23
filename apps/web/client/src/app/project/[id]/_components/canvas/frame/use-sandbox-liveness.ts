import { useEffect, useState } from 'react';

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
export function useSandboxLiveness(previewUrl: string, enabled: boolean): SandboxLivenessState {
    const [state, _setState] = useState<SandboxLivenessState>('unknown');

    // TODO(convex-migration): sandbox.checkAlive belonged to the legacy forward
    // router (calls the apps/web/server fastify service). It hasn't been ported to
    // Convex yet — until then, return 'unknown' so the editor falls back to its
    // pre-probe behavior rather than spuriously claiming the sandbox is dead.
    useEffect(() => {
        if (!enabled || !previewUrl) return;
    }, [previewUrl, enabled]);

    return state;
}
