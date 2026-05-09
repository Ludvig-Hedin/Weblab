interface FrameConnectionState {
    preloadScriptReady: boolean;
    isConnecting: boolean;
    hasTimedOut: boolean;
    isPenpalConnected: boolean;
}

interface CodeSandboxPreviewState {
    isCodeSandboxFrame: boolean;
    isPenpalConnected: boolean;
    /**
     * How many penpal handshakes have failed for this frame so far. The
     * auto-unlock only kicks in once we've definitively failed at least
     * once — otherwise every fresh project would flip to PREVIEW for the
     * 10–15 s sandbox cold-boot before penpal even has a chance to
     * connect.
     */
    connectionFailureCount: number;
    /**
     * Skip the auto-unlock entirely while the AI is still writing the
     * first version of the project. Flipping to PREVIEW mid-build hides
     * the editor chrome and gives the impression that the user landed in
     * preview, not the designer.
     */
    isFirstCreation: boolean;
}

export function isFrameBridgeReady({
    preloadScriptReady,
    isConnecting,
    hasTimedOut,
    isPenpalConnected,
}: FrameConnectionState): boolean {
    return preloadScriptReady && isPenpalConnected && !(isConnecting && !hasTimedOut);
}

// Threshold matches the failure count at which the FrameView surfaces the
// "Trouble connecting" retry banner, so the auto-unlock and the manual
// recovery affordance appear together rather than at separate moments.
const PREVIEW_UNLOCK_FAILURE_THRESHOLD = 2;

export function shouldUnlockCodeSandboxPreview({
    isCodeSandboxFrame,
    isPenpalConnected,
    connectionFailureCount,
    isFirstCreation,
}: CodeSandboxPreviewState): boolean {
    if (!isCodeSandboxFrame || isPenpalConnected || isFirstCreation) {
        return false;
    }
    return connectionFailureCount >= PREVIEW_UNLOCK_FAILURE_THRESHOLD;
}
