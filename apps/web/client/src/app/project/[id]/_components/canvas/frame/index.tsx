import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useAction, useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';

import type { Frame } from '@weblab/models';
import { APP_NAME } from '@weblab/constants';
import { EditorMode } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';
import { colors } from '@weblab/ui/tokens';
import { cn } from '@weblab/ui/utils';

import type { SandboxLivenessState } from './use-sandbox-liveness';
import type { IFrameView } from './view';
import type { Id } from '@convex/_generated/dataModel';
import { useEditorEngine } from '@/components/store/editor';
import { PreloadScriptState } from '@/components/store/editor/sandbox';
import { installCodeSandboxNoiseSuppression } from '@/components/store/editor/sandbox/global-error-suppress';
import { RightClickMenu } from '../../right-click-menu';
import { FIX_ERRORS_EVENT } from '../../right-panel/chat-tab/error';
import { isCodeSandboxPreviewUrl } from './codesandbox-preview';
import { isFrameBridgeReady, shouldUnlockCodeSandboxPreview } from './frame-connection';
import { GestureScreen } from './gesture';
import { ResizeHandles } from './resize-handles';
import { TopBar } from './top-bar';
import { BOOT_RESTART_HINT_MS, BOOT_SOFT_HINT_MS, useFrameReload } from './use-frame-reload';
import { isLocalPreviewUrl, useSandboxLiveness } from './use-sandbox-liveness';
import { useSandboxTimeout } from './use-sandbox-timeout';
import { FrameComponent } from './view';

// CodeSandbox preview proxy returns 404 (not 502) for fresh sandboxes
// while the dev server is still binding port 3000. Treating 404 as a
// permanent "recycled forever" signal during cold-boot fires the
// Restore CTA on perfectly healthy projects. Only escalate notFound to
// "gone" once enough wall-clock has passed that the dev server should
// realistically have come up. 410 stays definitive — CSB only returns
// it for sandboxes that have actually been reaped.
const NOTFOUND_GRACE_MS = 90_000;

// Tips shown during very long cold-boots (>60s). Keeps the loader
// useful instead of just repeating "still booting" forever. Cycles
// every 12s after the soft hint mark passes.
const LONG_WAIT_TIPS = [
    `${APP_NAME} tip: SHIFT+Click adds multiple elements to your prompt.`,
    `${APP_NAME} tip: Double-click text on the canvas to edit it in place.`,
    `${APP_NAME} tip: Click the Branch icon to fork a new version of your project.`,
    `${APP_NAME} tip: Drag-select a region to grab multiple elements at once.`,
];

interface LoadingStage {
    primary: string;
    secondary: string;
}

function getLoadingStage(input: {
    bootElapsedMs: number;
    livenessState: SandboxLivenessState;
    preloadScriptReady: boolean;
    isPenpalConnected: boolean;
}): LoadingStage {
    const { bootElapsedMs, livenessState, preloadScriptReady, isPenpalConnected } = input;
    if (isPenpalConnected && !preloadScriptReady) {
        return {
            primary: 'Almost ready',
            secondary: 'Loading the canvas tools…',
        };
    }
    if (livenessState === 'alive') {
        return {
            primary: 'Compiling your preview',
            secondary: 'Your preview is almost ready…',
        };
    }
    if (bootElapsedMs < 5_000) {
        return {
            primary: 'Starting your preview',
            secondary: 'Connecting to your project…',
        };
    }
    if (bootElapsedMs < 20_000) {
        return {
            primary: 'Starting your workspace',
            secondary: 'This usually takes 10–30 seconds…',
        };
    }
    return {
        primary: 'Still starting up',
        secondary: 'Taking a bit longer than usual — almost there.',
    };
}

function ErrorLine({ line, index }: { line: string; index: number }) {
    // File error reference: × ./file.tsx
    if (/^[×✗]\s+/.test(line)) {
        return (
            <div key={index} className="flex gap-1.5">
                <span className="text-destructive shrink-0">×</span>
                <span className="text-foreground-secondary">{line.replace(/^[×✗]\s+/, '')}</span>
            </div>
        );
    }
    // Error description: Error:   × Unexpected eof
    if (/^Error:\s/.test(line)) {
        return (
            <div key={index} className="text-destructive">
                {line}
            </div>
        );
    }
    // Line number with pipe: " 13 │  content"
    const lineNumMatch = /^(\s{0,5}\d{1,5}\s*│)(.*)$/.exec(line);
    if (lineNumMatch) {
        return (
            <div key={index} className="flex">
                <span className="text-foreground-tertiary shrink-0 select-none">
                    {lineNumMatch[1]}
                </span>
                <span className="text-foreground-primary">{lineNumMatch[2]}</span>
            </div>
        );
    }
    // Error underline pointer line (·      ────)
    if (/·\s+[─]+/.test(line)) {
        return (
            <div key={index} className="text-destructive/50">
                {line}
            </div>
        );
    }
    // Box drawing / frame lines
    if (/[╭╰│]/.test(line)) {
        return (
            <div key={index} className="text-foreground-tertiary">
                {line}
            </div>
        );
    }
    // "Caused by:" header
    if (line.startsWith('Caused by:')) {
        return (
            <div key={index} className="text-foreground-secondary mt-2 font-medium">
                {line}
            </div>
        );
    }
    // Import trace
    if (line.startsWith('Import trace')) {
        return (
            <div key={index} className="text-foreground-tertiary mt-2">
                {line}
            </div>
        );
    }
    if (line.trim() === '') return <div key={index} className="h-px" />;
    return (
        <div key={index} className="text-foreground-secondary">
            {line}
        </div>
    );
}

function HighlightedError({ content }: { content: string }) {
    const lines = content.split('\n');
    return (
        <div className="font-mono text-[11px] leading-[1.6]">
            {lines.map((line, i) => (
                <ErrorLine key={i} line={line} index={i} />
            ))}
        </div>
    );
}

export const FrameView = observer(
    ({ frame, isInDragSelection = false }: { frame: Frame; isInDragSelection?: boolean }) => {
        const editorEngine = useEditorEngine();
        const iFrameRef = useRef<IFrameView>(null);
        const [isResizing, setIsResizing] = useState(false);
        // Tip cycler — only kicks in after the soft-hint mark
        // (>30s) so short cold boots don't show pointless tips.
        const [tipIndex, setTipIndex] = useState(0);
        const TIP_INTERVAL_MS = 12000;
        const autoPreviewRestoreModeRef = useRef<EditorMode | null>(null);

        // Read the pending create request from Convex. When this is set
        // the user just submitted a prompt — swap the generic "Starting up"
        // copy for a creation-aware message so they understand the wait isn't
        // an error.
        const creationRequest = useQuery(api.projectCreateRequests.getPendingRequest, {
            projectId: editorEngine.projectId as Id<'projects'>,
        });
        const isFirstCreation = !!creationRequest;

        // Optimistic-creation path: when `_provisionSandbox` writes the real URL,
        // `applyFrames` updates frame.url and this effect triggers a full reload so
        // the editor boots with the correct branch sandboxId from the server.
        const wasProvisioningRef = useRef(frame.url === '');
        useEffect(() => {
            if (wasProvisioningRef.current && frame.url) {
                wasProvisioningRef.current = false;
                window.location.reload();
            }
        }, [frame.url]);

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
            // Filters CSB SDK transient cold-boot rejections that escape as
            // unhandled promise rejections. Idempotent — guarded by a module
            // flag so multiple FrameViews / StrictMode double-mounts only
            // attach the listener once.
            installCodeSandboxNoiseSuppression();
            return () => {
                if (restartReloadTimeoutRef.current) {
                    clearTimeout(restartReloadTimeoutRef.current);
                    restartReloadTimeoutRef.current = null;
                }
            };
        }, []);

        const { hasTimedOut, isConnecting } = useSandboxTimeout(frame, handleConnectionFailed);

        const isSelected = editorEngine.frames.isSelected(frame.id);
        const branchErrors = editorEngine.branches.getErrorsForBranch(frame.branchId);
        const hasBuildErrors = branchErrors.length > 0;
        const branchData = editorEngine.branches.getBranchDataById(frame.branchId);
        const restoreSandbox = useAction(api.projectActions.restoreSandbox);
        const preloadScriptReady =
            branchData?.sandbox?.preloadScriptState === PreloadScriptState.INJECTED;
        const isCodeSandboxFrame = useMemo(() => isCodeSandboxPreviewUrl(frame.url), [frame.url]);
        // Desktop LOCAL dev server (http://localhost:PORT). These run on the
        // user's own machine, so the rendered site is reachable the instant the
        // dev server binds — we don't make the user wait on the full preload +
        // penpal bridge before showing it (see `localPreviewReady` below).
        const isLocalFrame = useMemo(() => isLocalPreviewUrl(frame.url), [frame.url]);
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
                setTipIndex(0);
                return;
            }
            const interval = setInterval(() => {
                setTipIndex((prev) => (prev + 1) % LONG_WAIT_TIPS.length);
            }, TIP_INTERVAL_MS);
            return () => clearInterval(interval);
        }, [isFrameReady]);

        // Once the cold boot crosses the soft-hint mark or has been re-tried
        // a couple times, ask the server whether the underlying sandbox URL
        // is actually responding. If CodeSandbox has recycled it (410 Gone)
        // we surface a restore-from-snapshot CTA instead of letting the
        // spinner run forever.
        // Cloud sandboxes only get probed after the soft-hint mark (or a penpal
        // failure) so we don't spam the network during normal cold boots. A
        // local dev server is a cheap same-machine probe, so we poll it from the
        // start — that's what reveals the site within a second or two of the
        // port binding instead of after the 30s soft hint.
        const livenessEnabled =
            !isFrameReady &&
            (isLocalFrame || bootElapsedMs >= BOOT_SOFT_HINT_MS || connectionFailureCount >= 1);
        const livenessState = useSandboxLiveness(
            frame.branchId as Id<'branches'>,
            frame.url,
            livenessEnabled,
        );
        // For a LOCAL project the rendered site is usable the moment the dev
        // server responds — don't keep it hidden behind the opaque boot overlay
        // while the preload + penpal bridge finishes connecting in the
        // background. Build errors still own the overlay (otherwise the raw
        // Next.js error page would show through instead of our richer panel).
        const localPreviewReady = isLocalFrame && livenessState === 'alive' && !hasBuildErrors;

        const showSoftHint =
            !isFrameReady &&
            bootElapsedMs >= BOOT_SOFT_HINT_MS &&
            bootElapsedMs < BOOT_RESTART_HINT_MS;
        const loadingStage = getLoadingStage({
            bootElapsedMs,
            livenessState,
            preloadScriptReady,
            isPenpalConnected,
        });
        // While the URL is still 404 (sandbox proxy hasn't seen the dev
        // server bind a port), the "Restart sandbox" panel is just noise:
        // restarting the dev server when nothing's listening yet doesn't
        // help. The recycled CTA takes over after the 404 grace period
        // expires, so suppress this panel during that window.
        const showRestartPanel =
            !isFrameReady &&
            livenessState !== 'notFound' &&
            (bootElapsedMs >= BOOT_RESTART_HINT_MS || reloadCapped);
        const showRetryOnlyPanel =
            !isFrameReady && !showRestartPanel && connectionFailureCount >= 2;
        // 410 Gone is definitive — CSB has reaped the sandbox forever.
        // 404 is ambiguous: a freshly created sandbox returns 404 from
        // the CSB preview proxy while its dev server is still binding
        // port 3000. Only treat 404 as "gone" once the boot grace
        // period has elapsed; before that, keep waiting.
        const sandboxIsGone =
            livenessState === 'gone' ||
            (livenessState === 'notFound' && bootElapsedMs >= NOTFOUND_GRACE_MS);
        const [isRestorePending, setIsRestorePending] = useState(false);
        const restoreMutation = { isPending: isRestorePending };
        const restoreInFlightRef = useRef(false);
        const autoRestoreFiredRef = useRef(false);
        const autoRestartFiredRef = useRef(false);
        const handleRestoreSandbox = async ({ silent = false } = {}) => {
            if (restoreInFlightRef.current) return;
            restoreInFlightRef.current = true;
            setIsRestorePending(true);
            try {
                await restoreSandbox({
                    projectId: editorEngine.projectId as Id<'projects'>,
                    branchId: frame.branchId as Id<'branches'>,
                });
                if (!silent) toast.success('Project restored from snapshot');
                window.location.reload();
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Unknown error';
                // Surface failures even on the silent path — if auto-restore
                // can't fix it, the user needs to know rather than stare at
                // a stuck spinner.
                if (!silent) {
                    toast.error("Couldn't restore the sandbox", { description: message });
                }
                // Allow another manual attempt after a failure.
                autoRestoreFiredRef.current = false;
            } finally {
                restoreInFlightRef.current = false;
                setIsRestorePending(false);
            }
        };

        const handleRestartSandbox = async () => {
            if (isRestarting) return;
            // Target the FRAME's own branch, not `branches.activeBranch` —
            // this handler fires from per-frame UI and the per-frame
            // auto-restart effect, so when this frame belongs to a non-active
            // branch the old code restarted the wrong branch's sandbox.
            // `branchData` is already resolved from `frame.branchId` above.
            const sandbox = branchData?.sandbox;
            if (!sandbox?.session) {
                toast.error('Sandbox session not available');
                return;
            }
            const sandboxId = branchData?.branch.sandbox?.id;
            if (!sandboxId) {
                toast.error('Sandbox session not available');
                return;
            }
            setIsRestarting(true);
            try {
                if (!sandbox.session.provider) {
                    await sandbox.session.start(sandboxId);
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

        // Auto-recovery on genuine 410 Gone: fire restore mutation once
        // silently. If it succeeds the user never sees the panel; if it
        // fails the panel stays visible so they can retry manually.
        useEffect(() => {
            if (livenessState !== 'gone') return;
            if (autoRestoreFiredRef.current) return;
            autoRestoreFiredRef.current = true;
            void handleRestoreSandbox({ silent: true });
        }, [livenessState]);

        // Auto-recovery on cold-boot transition: when the URL flips from
        // 404/error to alive, the iframe is still pointing at the old
        // failed load (and may be cap-frozen at 6 reloads). Trigger one
        // immediateReload so the iframe re-fetches and penpal can
        // finally connect. immediateReload also clears reloadCapped, so
        // the retry budget is restored for the next attempt.
        const prevLivenessRef = useRef<SandboxLivenessState>('unknown');
        useEffect(() => {
            const prev = prevLivenessRef.current;
            prevLivenessRef.current = livenessState;
            if (
                // Cloud only: the cloud iframe gets stuck on a failed 502 load
                // and needs a re-fetch once the proxy goes live. A local iframe
                // already loaded the page (that's why it's `alive`), so reloading
                // here just flashes the freshly-revealed site for no gain —
                // penpal connects on its own once the preload script runs.
                !isLocalFrame &&
                (prev === 'notFound' || prev === 'error' || prev === 'unknown') &&
                livenessState === 'alive' &&
                !isPenpalConnected
            ) {
                immediateReload();
            }
        }, [isLocalFrame, livenessState, immediateReload, isPenpalConnected]);

        // Auto-recovery for "URL is alive but penpal can't connect":
        // restart the dev server once before surfacing the manual
        // Restart panel. Catches the case where CSB has the proxy up
        // but the dev server crashed silently on cold boot.
        useEffect(() => {
            if (isPenpalConnected) {
                autoRestartFiredRef.current = false;
                return;
            }
            if (autoRestartFiredRef.current) return;
            if (livenessState !== 'alive') return;
            if (bootElapsedMs < BOOT_RESTART_HINT_MS) return;
            autoRestartFiredRef.current = true;
            void handleRestartSandbox();
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, [livenessState, bootElapsedMs, isPenpalConnected]);

        // Only the primary frame in a branch renders the rich loading
        // panel (spinner, messages, restore/restart CTAs). Sibling
        // breakpoints render just a centered spinner so we don't show
        // the same panel 3x stacked across Desktop/Tablet/Phone frames.
        // "Primary" = lowest breakpoint.order (Desktop wins), with
        // frame.id as a stable tiebreaker.
        const isPrimaryFrameInBranch = (() => {
            const branchFrames = editorEngine.frames.getByBranchId(frame.branchId);
            if (branchFrames.length <= 1) return true;
            let primary = branchFrames[0]!;
            for (const f of branchFrames) {
                const aOrder = primary.frame.breakpoint?.order ?? 0;
                const bOrder = f.frame.breakpoint?.order ?? 0;
                if (bOrder < aOrder || (bOrder === aOrder && f.frame.id < primary.frame.id)) {
                    primary = f;
                }
            }
            return primary.frame.id === frame.id;
        })();

        // Lazy-mount sibling iframes. Cold `next dev` compiles each
        // page on first request; with 3 breakpoint siblings hitting the
        // same URL in parallel during boot, the dev server forks 3
        // concurrent compiles and triples the perceived load time. Let
        // the primary frame cold-compile alone, then sibling iframes
        // mount after its penpal handshake confirms the dev server is
        // serving — they get warm cached responses.
        const primaryFrameAlive = branchData?.sandbox?.primaryFrameAlive ?? false;
        const shouldMountIframe = isPrimaryFrameInBranch || primaryFrameAlive;

        // Promote the primary frame's penpal-connect signal into the
        // shared SandboxManager so siblings can react. Set once-and-stay
        // — a transient disconnect should not unmount sibling iframes
        // mid-edit, and the dev server stays warm regardless.
        useEffect(() => {
            if (!isPrimaryFrameInBranch) return;
            if (!isPenpalConnected) return;
            if (!branchData?.sandbox) return;
            if (branchData.sandbox.primaryFrameAlive) return;
            branchData.sandbox.setPrimaryFrameAlive(true);
        }, [isPrimaryFrameInBranch, isPenpalConnected, branchData?.sandbox]);

        const [errorCopied, setErrorCopied] = useState(false);

        const handleFixErrorsWithAI = () => {
            if (editorEngine.state.panelsHidden) {
                editorEngine.state.togglePanelsHidden();
            }
            editorEngine.chat.requestFixErrors();
            window.dispatchEvent(new CustomEvent(FIX_ERRORS_EVENT));
        };

        const handleCopyErrors = async () => {
            const text = branchErrors.map((e) => e.content).join('\n\n');
            try {
                await navigator.clipboard.writeText(text);
                setErrorCopied(true);
                setTimeout(() => setErrorCopied(false), 1500);
            } catch {
                // clipboard unavailable
            }
        };

        return (
            <div
                className="fixed flex flex-col"
                style={{
                    transform: `translate(${frame.position.x}px, ${frame.position.y}px)`,
                }}
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
                    {shouldMountIframe && frame.url && (
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
                    )}
                    <GestureScreen frame={frame} isResizing={isResizing} />

                    {(!isFrameReady || !frame.url) &&
                        !localPreviewReady &&
                        !shouldTemporarilyUnlockPreview && (
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
                            {!frame.url ? (
                                // Sandbox not yet provisioned (optimistic-creation path).
                                // The reload effect above fires when the real URL arrives.
                                isPrimaryFrameInBranch ? (
                                    <div className="flex flex-col items-center gap-3 text-center">
                                        <Icons.LoadingSpinner className="h-8 w-8 animate-spin" />
                                        <div className="flex flex-col items-center gap-1">
                                            <p className="text-foreground text-base font-medium">
                                                Setting up your workspace
                                            </p>
                                            <p className="text-foreground-tertiary text-small">
                                                Preparing your preview…
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <Icons.LoadingSpinner className="text-foreground h-8 w-8 animate-spin" />
                                )
                            ) : !isPrimaryFrameInBranch && !hasBuildErrors ? (
                                // Sibling breakpoints: just a spinner. The
                                // primary frame owns the messaging + CTAs so
                                // we don't repeat them 3x at small zoom.
                                <Icons.LoadingSpinner className="text-foreground h-8 w-8 animate-spin" />
                            ) : (
                                <div
                                    // Constrain to the frame's logical width
                                    // (with breathing room) so content never
                                    // overflows the frame at any canvas zoom.
                                    // Dropping the previous inverse-scale
                                    // hack — at zoom-out the scale-up made
                                    // the panel balloon past the frame bounds.
                                    className="text-foreground flex w-full max-w-full flex-col items-center gap-4 px-4"
                                    style={{
                                        maxWidth:
                                            (frame.breakpoint?.width ?? frame.dimension.width) - 16,
                                    }}
                                >
                                    {hasBuildErrors ? (
                                        /* Build error state — show instead of loading spinner */
                                        <div className="border-border/20 bg-background-secondary w-full max-w-sm overflow-hidden rounded-lg border">
                                            {/* Header */}
                                            <div className="flex items-center gap-2.5 px-3 py-2.5">
                                                <div className="bg-destructive/10 flex h-6 w-6 shrink-0 items-center justify-center rounded">
                                                    <Icons.ExclamationTriangle className="text-destructive h-3 w-3" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-foreground-primary text-small leading-tight font-medium">
                                                        Build error
                                                    </p>
                                                    <p className="text-foreground-tertiary text-mini mt-0.5 leading-tight">
                                                        Fix the error to see your preview
                                                    </p>
                                                </div>
                                            </div>

                                            {/* Divider */}
                                            <div className="border-border/15 border-t" />

                                            {/* Error body — same surface, no bg swap */}
                                            <div className="max-h-44 overflow-auto px-3 py-2.5">
                                                {branchErrors.slice(0, 3).map((error, i) => (
                                                    <HighlightedError
                                                        key={`${error.branchId}-${i}`}
                                                        content={error.content}
                                                    />
                                                ))}
                                            </div>

                                            {/* Divider */}
                                            <div className="border-border/15 border-t" />

                                            {/* Actions footer */}
                                            <div className="flex items-center gap-1.5 px-3 py-2">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => void handleCopyErrors()}
                                                    className="text-foreground-secondary hover:text-foreground-primary h-6 gap-1 px-1.5 text-[11px]"
                                                >
                                                    {errorCopied ? (
                                                        <Icons.Check className="h-3 w-3" />
                                                    ) : (
                                                        <Icons.Copy className="h-3 w-3" />
                                                    )}
                                                    {errorCopied ? 'Copied' : 'Copy'}
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={immediateReload}
                                                    className="text-foreground-secondary hover:text-foreground-primary h-6 gap-1 px-1.5 text-[11px]"
                                                >
                                                    <Icons.Reload className="h-3 w-3" />
                                                    Retry
                                                </Button>
                                                <div className="flex-1" />
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={handleFixErrorsWithAI}
                                                    className="text-foreground-secondary hover:text-foreground-primary h-6 gap-1 px-1.5 text-[11px]"
                                                >
                                                    <Icons.MagicWand className="h-3 w-3" />
                                                    Fix with AI
                                                </Button>
                                            </div>
                                        </div>
                                    ) : (
                                        /* Normal loading state */
                                        <>
                                            <Icons.LoadingSpinner className="h-8 w-8 animate-spin" />
                                            {isFirstCreation ? (
                                                <div className="flex flex-col items-center gap-1.5 text-center">
                                                    <p className="text-foreground text-base font-medium">
                                                        Building your site
                                                    </p>
                                                    <p className="text-foreground-tertiary text-small max-w-sm">
                                                        Your preview will appear here once the AI
                                                        finishes the first version. This usually
                                                        takes 30–60 seconds.
                                                    </p>
                                                </div>
                                            ) : (
                                                (() => {
                                                    const isLong =
                                                        bootElapsedMs / 1000 >= 15;
                                                    return (
                                                        <div className="flex flex-col items-center gap-2 text-center">
                                                            <p
                                                                className={cn(
                                                                    'text-base font-medium',
                                                                    isLong
                                                                        ? 'text-foreground-warning'
                                                                        : 'text-foreground',
                                                                )}
                                                            >
                                                                {loadingStage.primary}
                                                            </p>
                                                            <p className="text-foreground-tertiary text-small">
                                                                {loadingStage.secondary}
                                                            </p>
                                                            {isLong && !showRestartPanel && (
                                                                <p className="text-foreground-tertiary mt-1 text-xs">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            void handleRestartSandbox()
                                                                        }
                                                                        disabled={isRestarting}
                                                                        className="text-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-60"
                                                                    >
                                                                        {isRestarting
                                                                            ? 'Restarting…'
                                                                            : 'Restart preview'}
                                                                    </button>
                                                                </p>
                                                            )}
                                                        </div>
                                                    );
                                                })()
                                            )}
                                            {showSoftHint && !isFirstCreation && (
                                                <p className="text-foreground-tertiary max-w-sm text-center text-xs italic">
                                                    {LONG_WAIT_TIPS[tipIndex]}
                                                </p>
                                            )}
                                            {sandboxIsGone ? (
                                                <div className="border-foreground/10 bg-background-secondary mt-2 flex flex-col items-center gap-3 rounded-lg border p-4 text-center">
                                                    <p className="text-foreground text-small max-w-sm font-medium">
                                                        Your preview was paused
                                                    </p>
                                                    <p className="text-foreground-tertiary max-w-sm text-xs">
                                                        The sandbox was cleared after sitting idle.
                                                        Restore from the last snapshot to keep
                                                        working — your files are safe.
                                                    </p>
                                                    <div className="flex flex-wrap items-center justify-center gap-2">
                                                        <Button
                                                            size="sm"
                                                            onClick={() =>
                                                                void handleRestoreSandbox()
                                                            }
                                                            disabled={restoreMutation.isPending}
                                                        >
                                                            {restoreMutation.isPending ? (
                                                                <Icons.LoadingSpinner className="h-3.5 w-3.5 animate-spin" />
                                                            ) : (
                                                                <Icons.Cube className="h-3.5 w-3.5" />
                                                            )}
                                                            {restoreMutation.isPending
                                                                ? 'Restoring…'
                                                                : 'Restore project'}
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : showRestartPanel ? (
                                                <div className="border-foreground/10 bg-background-secondary mt-2 flex flex-col items-center gap-3 rounded-lg border p-4 text-center">
                                                    <p className="text-foreground text-small max-w-sm font-medium">
                                                        Sandbox is taking longer than usual
                                                    </p>
                                                    <p className="text-foreground-tertiary max-w-sm text-xs">
                                                        Your sandbox may be stuck. Try retrying the
                                                        preview, or restart the sandbox to start
                                                        fresh.
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
                                                            onClick={() =>
                                                                void handleRestartSandbox()
                                                            }
                                                            disabled={isRestarting}
                                                        >
                                                            {isRestarting ? (
                                                                <Icons.LoadingSpinner className="h-3.5 w-3.5 animate-spin" />
                                                            ) : (
                                                                <Icons.Cube className="h-3.5 w-3.5" />
                                                            )}
                                                            {isRestarting
                                                                ? 'Restarting…'
                                                                : 'Restart sandbox'}
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : showRetryOnlyPanel ? (
                                                <div className="border-foreground/10 bg-background-secondary mt-2 flex flex-col items-center gap-3 rounded-lg border p-4 text-center">
                                                    <p className="text-foreground-secondary text-small max-w-sm">
                                                        Trouble connecting to your preview. Your
                                                        sandbox may still be waking up.
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
                                        </>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    },
);
