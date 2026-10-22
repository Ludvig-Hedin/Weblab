export type LocalStartupIssue = 'port' | 'nativeBinding' | 'dependencies' | 'unknown';
export const STARTUP_DIAGNOSIS_PREFIX = 'WEBLAB_STARTUP_DIAGNOSIS:';

export function startupDiagnosisBranch(message: string): string | null {
    const firstLine = message.split('\n', 1)[0];
    if (!firstLine?.startsWith(STARTUP_DIAGNOSIS_PREFIX)) return null;
    const branchId = firstLine.slice(STARTUP_DIAGNOSIS_PREFIX.length);
    return /^[A-Za-z0-9_-]{1,100}$/.test(branchId) ? branchId : null;
}

/** Classify startup output without sending raw logs to an AI provider. */
export function localStartupIssue(message: string): LocalStartupIssue {
    if (/library load disallowed by system policy|cannot find native binding/i.test(message)) {
        return 'nativeBinding';
    }
    if (/port \d+ is occupied|EADDRINUSE|did not bind port \d+|now uses port \d+/i.test(message)) {
        return 'port';
    }
    if (/dependencies are missing|cannot find module|module not found/i.test(message)) {
        return 'dependencies';
    }
    return 'unknown';
}

/** A short diagnostic only; local logs and absolute paths stay on this computer. */
export function startupRecoveryPrompt(
    issue: LocalStartupIssue,
    stalled: boolean,
    branchId: string,
): string {
    const observation = stalled
        ? 'Local site setup has been running for over 30 seconds.'
        : 'The local preview failed to start.';
    const clue = {
        port: 'The dev server may be listening on a different port or address from the preview.',
        nativeBinding: 'A native dependency may be blocked by macOS or missing.',
        dependencies: 'A required dependency may be missing.',
        unknown: 'The cause is not yet known.',
    }[issue];
    return `${STARTUP_DIAGNOSIS_PREFIX}${branchId}\n${observation} ${clue} Inspect this private working copy and its startup configuration. Diagnose the smallest confirmed cause. Do not edit any files yet. List the exact files you propose changing and explain the fix in plain language. Wait for my approval in chat before editing. Do not suggest removing macOS security attributes. After an approved change, tell me to use Try again in the preview.`;
}
