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

export function shouldUnlockCodeSandboxPreview(_state: CodeSandboxPreviewState): boolean {
    // Auto-flip to PREVIEW on connection failure has been disabled. Users
    // reported being forced into preview after a 1-2s delay on project entry
    // and having to dismiss it twice. Entering preview is now a manual action
    // via the toolbar Play button or the PREVIEW hotkey. The CodeSandbox trust
    // prompt (if present) remains reachable through that explicit affordance.
    return false;
}
