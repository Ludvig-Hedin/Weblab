import { useEffect, useMemo, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';

import type { Frame } from '@weblab/models';
import { APP_NAME } from '@weblab/constants';
import { EditorMode } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';
import { colors } from '@weblab/ui/tokens';

import type { IFrameView } from './view';
import { useEditorEngine } from '@/components/store/editor';
import { PreloadScriptState } from '@/components/store/editor/sandbox';
import { api } from '@/trpc/react';
import { RightClickMenu } from '../../right-click-menu';
import { isCodeSandboxPreviewUrl } from './codesandbox-preview';
import { isFrameBridgeReady, shouldUnlockCodeSandboxPreview } from './frame-connection';
import { GestureScreen } from './gesture';
import { ResizeHandles } from './resize-handles';
import { TopBar } from './top-bar';
import { BOOT_RESTART_HINT_MS, BOOT_SOFT_HINT_MS, useFrameReload } from './use-frame-reload';
import { useSandboxTimeout } from './use-sandbox-timeout';
import { FrameComponent } from './view';
import { waitForSandboxReady } from './wait-for-sandbox-ready';

// Ceiling for the post-restart readiness poll. Real cold-boot times
// run 30–60s on CodeSandbox; the previous hardcoded 5s wait either
// fired a 502 (too short) or made fast restarts feel sluggish.
const RESTART_READY_CEILING_MS = 60_000;

const LOADING_MESSAGES = [
    'Starting up your project...',
    'This may take a minute or two...',
    'Initializing development environment...',
    'Tip: Use SHIFT+Click to add multiple elements on the canvas to your prompt',
    'If you have a large project, it may take a while...',
    'Tip: Click the "Branch" icon to create a new version of your project on the canvas',
    'Preparing the visual editor...',
    'Tip: Double-click text to edit it directly on the canvas',
    'Hang in there... seems like a large project...',
    'Thanks for your patience... standby...',
    'Loading your components and assets...',
    'Tip: Select multiple windows by clicking and dragging on the canvas',
    'Getting everything ready for you...',
    'Give it another minute...',
    'Hmmmmm...',
    'You may want to try refreshing your tab...',
    'Still not loading? Try refreshing your browser...',
    "If you're seeing this message, it's probably because your project is large...",
    `${APP_NAME} is still working on it...`,
    "If it's still not loading, contact support with the ? button in the bottom left corner",
];

export const FrameView = observer(
    ({ frame, isInDragSelection = false }: { frame: Frame; isInDragSelection?: boolean }) => {
        const editorEngine = useEditorEngine();
        const iFrameRef = useRef<IFrameView>(null);
        const [isResizing, setIsResizing] = useState(false);
        const [messageIndex, setMessageIndex] = useState(0);
        const MESSAGE_INTERVAL = 12000;
        const autoPreviewRestoreModeRef = useRef<EditorMode | null>(null);

        // Read the pending create request from the tRPC cache. When this is set
        // the user just submitted a prompt — swap the generic "Starting up"
        // copy for a creation-aware message so they understand the wait isn't
        // an error.
        const { data: creationRequest } = api.project.createRequest.getPendingRequest.useQuery({
            projectId: editorEngine.projectId,
        });
        const isFirstCreation = !!creationRequest;

        const {
            reloadKey,
            isPenpalConnected,
            immediateReload,
            handleConnectionFailed,
            handleConnectionSuccess,
            getPenpalTimeout,
            connectionFailureCount,
            reloadCapped,
            bootElapsedMs,
        } = useFrameReload();
        const [isRestarting, setIsRestarting] = useState(false);
        // Track the post-restart reload timer so we can clear it if the
        // FrameView unmounts (e.g. user navigates away) before the
        // 5s window elapses. Without this, the queued setState would
        // fire on an unmounted component and warn in dev.
        const restartReloadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

        useEffect(() => {
            return () => {
                if (restartReloadTimeoutRef.current) {
                    clearTimeout(restartReloadTimeoutRef.current);
                    restartReloadTimeoutRef.current = null;
                }
            };
        }, []);

        const { hasTimedOut, isConnecting } = useSandboxTimeout(frame, handleConnectionFailed);

        const isSelected = editorEngine.frames.isSelected(frame.id);
        const branchData = editorEngine.branches.getBranchDataById(frame.branchId);
        const preloadScriptReady =
            branchData?.sandbox?.preloadScriptState === PreloadScriptState.INJECTED;
        const isCodeSandboxFrame = useMemo(() => isCodeSandboxPreviewUrl(frame.url), [frame.url]);
        const isFrameReady = isFrameBridgeReady({
            preloadScriptReady,
            isConnecting,
            hasTimedOut,
            isPenpalConnected,
        });
        // CodeSandbox can insert a trust prompt before the app boots, which
        // leaves Penpal disconnected. We unlock the iframe by switching to
        // PREVIEW so the user can dismiss it. But this must NOT fire on the
        // initial sandbox cold-boot (before penpal has had a chance to
        // connect) or during a fresh AI creation (where the user is meant
        // to wait in DESIGN mode while the loader is up). See
        // shouldUnlockCodeSandboxPreview for the gating policy.
        const shouldTemporarilyUnlockPreview = shouldUnlockCodeSandboxPreview({
            isCodeSandboxFrame,
            isPenpalConnected,
            connectionFailureCount,
            isFirstCreation,
        });

        useEffect(() => {
            if (!shouldTemporarilyUnlockPreview) {
                const previousMode = autoPreviewRestoreModeRef.current;
                autoPreviewRestoreModeRef.current = null;

                if (previousMode && editorEngine.state.editorMode === EditorMode.PREVIEW) {
                    editorEngine.state.setEditorMode(previousMode);
                }
                return;
            }

            if (
                autoPreviewRestoreModeRef.current === null &&
                editorEngine.state.editorMode !== EditorMode.PREVIEW
            ) {
                autoPreviewRestoreModeRef.current = editorEngine.state.editorMode;
                editorEngine.state.setEditorMode(EditorMode.PREVIEW);
            }
        }, [editorEngine.state.editorMode, shouldTemporarilyUnlockPreview]);

        useEffect(() => {
            if (isFrameReady) {
                setMessageIndex(0);
                return;
            }

            const interval = setInterval(() => {
                setMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
            }, MESSAGE_INTERVAL);

            return () => clearInterval(interval);
        }, [isFrameReady]);

        const showSoftHint =
            !isFrameReady &&
            bootElapsedMs >= BOOT_SOFT_HINT_MS &&
            bootElapsedMs < BOOT_RESTART_HINT_MS;
        const showRestartPanel =
            !isFrameReady && (bootElapsedMs >= BOOT_RESTART_HINT_MS || reloadCapped);
        const showRetryOnlyPanel =
            !isFrameReady && !showRestartPanel && connectionFailureCount >= 2;

        const handleRestartSandbox = async () => {
            if (isRestarting) return;
            const branch = editorEngine.branches.activeBranch;
            const sandbox = branch ? editorEngine.branches.getSandboxById(branch.id) : null;
            if (!sandbox?.session) {
                toast.error('Sandbox session not available');
                return;
            }
            setIsRestarting(true);
            try {
                if (!sandbox.session.provider) {
                    await sandbox.session.start(branch.sandbox.id);
                }
                const success = await sandbox.session.restartDevServer();
                if (!success) {
                    toast.error("Couldn't restart the sandbox", {
                        description:
                            "We tried to restart the dev server but it didn't come back. Try again, or refresh the page.",
                    });
                    return;
                }
                // Brief delay so the dev server has time to bind its
                // port — reloading the iframe immediately after restart
                // would just trip a fresh 502. The timeout is tracked
                // so we can cancel it on unmount.
                if (restartReloadTimeoutRef.current) {
                    clearTimeout(restartReloadTimeoutRef.current);
                }
                restartReloadTimeoutRef.current = setTimeout(() => {
                    restartReloadTimeoutRef.current = null;
                    immediateReload();
                }, 5000);
            } catch (error) {
                console.error('Restart sandbox failed', error);
                toast.error("Couldn't restart the sandbox", {
                    description: error instanceof Error ? error.message : String(error),
                });
            } finally {
                setIsRestarting(false);
            }
        };

        return (
            <div
                className="fixed flex flex-col"
                style={{ transform: `translate(${frame.position.x}px, ${frame.position.y}px)` }}
            >
                <RightClickMenu>
                    <TopBar frame={frame} isInDragSelection={isInDragSelection} />
                </RightClickMenu>
                <div
                    className="relative"
                    style={{
                        outline: isSelected
                            ? `2px solid ${colors.teal[400]}`
                            : isInDragSelection
                              ? `2px solid ${colors.teal[500]}`
                              : 'none',
                        borderRadius: '4px',
                    }}
                >
                    <ResizeHandles frame={frame} setIsResizing={setIsResizing} />
                    <FrameComponent
                        key={reloadKey}
                        frame={frame}
                        reloadIframe={immediateReload}
                        onConnectionFailed={handleConnectionFailed}
                        onConnectionSuccess={handleConnectionSuccess}
                        penpalTimeoutMs={getPenpalTimeout()}
                        isInDragSelection={isInDragSelection}
                        connectionFailureCount={connectionFailureCount}
                        ref={iFrameRef}
                    />
                    <GestureScreen frame={frame} isResizing={isResizing} />

                    {!isFrameReady && !shouldTemporarilyUnlockPreview && (
                        <div
                            // Fully opaque so a still-booting sandbox (HTTP 502
                            // until the dev server is up) never bleeds through.
                            // The 502 is real — but it's expected during boot,
                            // not something the user should see.
                            className="bg-background absolute inset-0 z-50 flex items-center justify-center rounded-md"
                            style={{
                                width: frame.breakpoint?.width ?? frame.dimension.width,
                                height:
                                    editorEngine.frames.get(frame.id)?.contentHeight ??
                                    frame.dimension.height,
                            }}
                        >
                            <div
                                className="text-foreground flex flex-col items-center gap-4"
                                style={{
                                    transform: `scale(${1 / editorEngine.canvas.scale})`,
                                    width: `${(frame.breakpoint?.width ?? frame.dimension.width) * editorEngine.canvas.scale}px`,
                                    maxWidth: `${(frame.breakpoint?.width ?? frame.dimension.width) * editorEngine.canvas.scale}px`,
                                    padding: '0 16px',
                                }}
                            >
                                <Icons.LoadingSpinner className="h-8 w-8 animate-spin" />
                                {isFirstCreation ? (
                                    <div className="flex flex-col items-center gap-1.5 text-center">
                                        <p className="text-foreground text-base font-medium">
                                            Building your site
                                        </p>
                                        <p className="text-foreground-tertiary text-small max-w-sm">
                                            Your preview will appear here once the AI finishes the
                                            first version. This usually takes 30–60 seconds.
                                        </p>
                                    </div>
                                ) : (
                                    <p className="animate-shimmer text-small bg-gradient-to-l from-white/20 via-white/90 to-white/20 bg-[length:200%_100%] bg-clip-text text-center text-transparent drop-shadow-[0_0_10px_rgba(255,255,255,0.4)] filter">
                                        {LOADING_MESSAGES[messageIndex]}
                                    </p>
                                )}
                                {showSoftHint && (
                                    <p className="text-foreground-tertiary max-w-sm text-center text-xs">
                                        This is taking a little longer than usual.
                                    </p>
                                )}
                                {showRestartPanel ? (
                                    <div className="border-foreground/10 bg-background-secondary mt-2 flex flex-col items-center gap-3 rounded-lg border p-4 text-center">
                                        <p className="text-foreground text-small max-w-sm font-medium">
                                            Sandbox is taking longer than usual
                                        </p>
                                        <p className="text-foreground-tertiary max-w-sm text-xs">
                                            Your sandbox may be stuck. Try retrying the preview, or
                                            restart the sandbox to start fresh.
                                        </p>
                                        <div className="flex flex-wrap items-center justify-center gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={immediateReload}
                                                disabled={isRestarting}
                                            >
                                                <Icons.Reload className="h-3.5 w-3.5" />
                                                Retry preview
                                            </Button>
                                            <Button
                                                size="sm"
                                                onClick={() => void handleRestartSandbox()}
                                                disabled={isRestarting}
                                            >
                                                {isRestarting ? (
                                                    <Icons.LoadingSpinner className="h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <Icons.Cube className="h-3.5 w-3.5" />
                                                )}
                                                {isRestarting ? 'Restarting…' : 'Restart sandbox'}
                                            </Button>
                                        </div>
                                    </div>
                                ) : showRetryOnlyPanel ? (
                                    <div className="border-foreground/10 bg-background-secondary mt-2 flex flex-col items-center gap-3 rounded-lg border p-4 text-center">
                                        <p className="text-foreground-secondary text-small max-w-sm">
                                            Trouble connecting to your preview. Your sandbox may
                                            still be waking up.
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={immediateReload}
                                            >
                                                <Icons.Reload className="h-3.5 w-3.5" />
                                                Retry preview
                                            </Button>
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    },
);
