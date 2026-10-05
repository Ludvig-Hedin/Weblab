export const MAX_RELEASES = 12;
export const MAX_RELEASE_INPUT_BYTES = 700_000;
export const MAX_RELEASE_BUILD_FILES_BYTES = 12_000_000;

export type ReleaseKind = 'build' | 'publish' | 'rollback';
export type ReleaseStage = 'queued' | 'sending' | 'observing' | 'confirmed' | 'failed' | 'unknown';

export function destinationKey(teamId: string, projectId: string, hostname: string): string {
    if (!/^team_[A-Za-z0-9]+$/.test(teamId) || !/^prj_[A-Za-z0-9]+$/.test(projectId) ||
        !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/.test(hostname)) {
        throw new Error('CLOUD_RELEASE_INVALID_DESTINATION');
    }
    return `${teamId}/${projectId}/${hostname}`;
}

/** Only a positive response from the original request is completion evidence. */
export function aliasReceiptMatches(input: {
    expectedPrevious: string | null; observedPrevious: string | null;
    expectedTarget: string; observedTarget: string; expectedHostname: string; observedHostname: string;
}): boolean {
    return input.expectedPrevious === input.observedPrevious && input.expectedTarget === input.observedTarget &&
        input.expectedHostname === input.observedHostname;
}

export function canReleaseDestination(stage: ReleaseStage, schedulerState: string): boolean {
    return (stage === 'confirmed' || stage === 'failed') &&
        (schedulerState === 'success' || schedulerState === 'failed' || schedulerState === 'canceled');
}

const OMIT = /(?:^|\/)(?:\.git|\.env[^/]*|\.next|node_modules|\.vercel|\.codex|\.claude|\.ssh|\.aws)(?:\/|$)|\.(?:db|sqlite|sqlite3|pem|key)$/i;
const SECRET = /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----|\bAKIA[A-Z0-9]{16}\b|\bsk_(?:live|test)_[A-Za-z0-9]{12,}|\bsk-(?:ant-|proj-)[A-Za-z0-9_-]{12,}|\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}/;

export function releasePath(path: string): void {
    if (!path || path.length > 240 || path.startsWith('/') || path.includes('\\') || /[\u0000-\u001f\u007f]/.test(path) ||
        path.split('/').some(part => !part || part === '.' || part === '..') || OMIT.test(path)) {
        throw new Error('CLOUD_RELEASE_UNSAFE_PATH');
    }
}

export function assertReleaseText(path: string, text: string): void {
    releasePath(path);
    if (SECRET.test(text)) throw new Error('CLOUD_RELEASE_SECRET');
}

export function releaseRequestMatches(
    previous: { kind: ReleaseKind; releaseId: string; sourceHash: string; expectedLiveReleaseId?: string | null },
    next: { kind: ReleaseKind; releaseId: string; sourceHash: string; expectedLiveReleaseId: string | null },
): boolean {
    return previous.kind === next.kind && previous.releaseId === next.releaseId && previous.sourceHash === next.sourceHash &&
        previous.expectedLiveReleaseId === next.expectedLiveReleaseId;
}
