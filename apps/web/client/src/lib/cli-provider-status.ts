import type { ProviderStatus } from '@weblab/ai/client';

export function cliProviderStatus(result: {
    installed: boolean;
    authStatus: 'ready' | 'sign-in' | 'unknown';
    version?: string;
    blockedCode?: 'isolation-unverified';
}): ProviderStatus {
    if (result.blockedCode || result.authStatus === 'unknown') {
        return {
            kind: 'unavailable',
            unavailableReason: result.blockedCode ?? 'status-unverified',
        };
    }
    if (!result.installed) return { kind: 'install' };
    if (result.authStatus === 'sign-in') return { kind: 'sign-in' };
    return { kind: 'ready', version: result.version };
}
