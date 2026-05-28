'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';
import { waitForSandboxReady } from '../canvas/frame/wait-for-sandbox-ready';

// Ceiling for the post-restart readiness poll. Real cold-boot times
// run 30–60s on CodeSandbox; the previous hardcoded 5s wait either
// fired a 502 (too short) or made fast restarts feel sluggish. We
// poll up to this ceiling and then reload anyway as a fallback.
const RESTART_READY_CEILING_MS = 60_000;

export const RestartSandboxButton = observer(({ className }: { className?: string }) => {
    const editorEngine = useEditorEngine();
    const branches = editorEngine.branches;
    const [restarting, setRestarting] = useState(false);
    const [restartElapsedSec, setRestartElapsedSec] = useState(0);
    const restartingRef = useRef(false);
    const timeoutIdRef = useRef<NodeJS.Timeout | null>(null);
    const restartAbortRef = useRef<AbortController | null>(null);
    const [hasSandboxError, setHasSandboxError] = useState(false);
    const mountTimeRef = useRef<number>(Date.now());
    const restartGraceUntilRef = useRef<number | null>(null);
    const checkInterval = 10000;

    // Keep a ref in sync with the `restarting` state so event listeners
    // registered via `addEventListener` see the live value rather than the
    // value captured at registration time.
    useEffect(() => {
        restartingRef.current = restarting;
    }, [restarting]);

    // Abort any in-flight readiness poll on unmount so we don't leak
    // a fetch loop if the user navigates away mid-restart.
    useEffect(() => {
        return () => {
            restartAbortRef.current?.abort();
            restartAbortRef.current = null;
        };
    }, []);

    // Extract error checking logic with proper dependencies
    const checkForError = useCallback(() => {
        const activeBranch = branches.activeBranch;
        if (!activeBranch) {
            setHasSandboxError(false);
            return false; // Stop checking
        }

        const branchData = branches.getBranchDataById(activeBranch.id);
        const sandbox = branchData?.sandbox;

        if (!sandbox?.session) {
            setHasSandboxError(false);
            return false; // Stop checking if no session
        }

        if (sandbox.session.provider) {
            setHasSandboxError(false);
        } else {
            // Only show error after initial grace period
            const timeSinceMount = Date.now() - mountTimeRef.current;
            if (timeSinceMount >= 5000) {
                setHasSandboxError(true);
            }
        }

        return true; // Continue checking
    }, [branches]);

    // External trigger: command palette dispatches `weblab:restart-sandbox`
    // when the user picks "Restart Sandbox". Reuse the same handler so the
    // grace-window / abort plumbing is identical to the button click.
    const handleRestartSandboxRef = useRef<() => void>(() => undefined);

    // Listen for iframe load failures dispatched from the canvas frame view —
    // a 502 from the sandbox or a network error in the iframe both fire the
    // 'weblab:sandbox-iframe-error' custom event, which trips the same error
    // state we'd otherwise discover via the polling loop below.
    useEffect(() => {
        const handler = () => {
            // Suppress iframe-error events fired while the dev server is
            // restarting (and for a grace window after restart completes) —
            // a port rebind during restart will fire spurious errors that
            // would otherwise flash the red error icon right after a
            // successful restart.
            if (restartingRef.current) return;
            if (
                restartGraceUntilRef.current !== null &&
                Date.now() < restartGraceUntilRef.current
            ) {
                return;
            }
            const timeSinceMount = Date.now() - mountTimeRef.current;
            if (timeSinceMount >= 5000) {
                setHasSandboxError(true);
            }
        };
        window.addEventListener('weblab:sandbox-iframe-error', handler);
        return () => window.removeEventListener('weblab:sandbox-iframe-error', handler);
    }, []);

    // External trigger: command palette → `weblab:restart-sandbox`. Routed
    // through the ref so the listener always invokes the latest closure
    // (which captures `restarting` state correctly).
    useEffect(() => {
        const handler = () => handleRestartSandboxRef.current();
        window.addEventListener('weblab:restart-sandbox', handler);
        return () => window.removeEventListener('weblab:restart-sandbox', handler);
    }, []);

    useEffect(() => {
        // Clear any existing timer first
        if (timeoutIdRef.current) {
            clearTimeout(timeoutIdRef.current);
            timeoutIdRef.current = null;
        }

        const scheduleNextCheck = () => {
            const shouldContinue = checkForError();
            if (shouldContinue) {
                timeoutIdRef.current = setTimeout(scheduleNextCheck, checkInterval);
            }
        };

        // Initial delay for grace period if needed
        const timeSinceMount = Date.now() - mountTimeRef.current;
        const initialDelay = timeSinceMount < 5000 ? 5000 - timeSinceMount : 0;

        timeoutIdRef.current = setTimeout(scheduleNextCheck, initialDelay);

        return () => {
            if (timeoutIdRef.current) {
                clearTimeout(timeoutIdRef.current);
                timeoutIdRef.current = null;
            }
        };
    }, [checkForError, checkInterval]); // Re-run when checker or interval changes

    const handleRestartSandbox = async () => {
        try {
            if (restarting) {
                return;
            }
            const activeBranch = branches.activeBranch;
            if (!activeBranch) return;
            if (restarting) {
                return;
            }

            setRestarting(true);
            setRestartElapsedSec(0);
            setHasSandboxError(false);
            // Reset mount time for grace period after restart
            mountTimeRef.current = Date.now();
            // Suppress sandbox-iframe-error events while the readiness
            // poll is running (and a small grace window after). We
            // base this on the actual ceiling so it doesn't expire
            // before the dev server has had a chance to come back.
            restartGraceUntilRef.current = Date.now() + RESTART_READY_CEILING_MS;
            const sandbox = branches.getSandboxById(activeBranch.id);
            if (!sandbox?.session) {
                toast.error('Sandbox session not available');
                setRestarting(false);
                restartGraceUntilRef.current = null;
                return;
            }

            if (!sandbox.session.provider) {
                await sandbox.session.start(activeBranch.sandbox.id);
            }

            const success = await sandbox.session.restartDevServer();
            if (!success) {
                toast.error('Failed to restart sandbox');
                setRestarting(false);
                setRestartElapsedSec(0);
                restartGraceUntilRef.current = null;
                return;
            }

            // Pick any frame on the active branch to use as the
            // readiness probe target. All frames on a branch share
            // the same dev server, so a HEAD response on one is
            // sufficient evidence that the port is rebound. If the
            // canvas has no frames, skip polling and reload (no-op).
            const frames = editorEngine.frames.getByBranchId(activeBranch.id);
            const probeUrl = frames[0]?.frame.url;

            // Defensive: abort any prior in-flight readiness poll.
            restartAbortRef.current?.abort();
            const abortController = new AbortController();
            restartAbortRef.current = abortController;

            if (probeUrl) {
                await waitForSandboxReady({
                    url: probeUrl,
                    ceilingMs: RESTART_READY_CEILING_MS,
                    onTick: (elapsedMs) => {
                        setRestartElapsedSec(Math.floor(elapsedMs / 1000));
                    },
                    signal: abortController.signal,
                });
            }

            if (abortController.signal.aborted) {
                // Reset UI state on abort — without this the button stays
                // stuck in the `restarting` spinner (and thus permanently
                // `disabled`) until the component remounts.
                setRestarting(false);
                setRestartElapsedSec(0);
                restartGraceUntilRef.current = null;
                return;
            }
            restartAbortRef.current = null;

            frames.forEach((frame) => {
                try {
                    editorEngine.frames.reloadView(frame.frame.id);
                } catch (frameError) {
                    console.error('Failed to reload frame:', frame.frame.id, frameError);
                }
            });
            toast.success('Sandbox restarted successfully', {
                icon: <Icons.Cube className="h-4 w-4" />,
            });
            setRestarting(false);
            setRestartElapsedSec(0);
            // Anchor the post-reload grace window to "now" so any
            // transient errors fired during the iframe reload itself
            // are still swallowed.
            restartGraceUntilRef.current = Date.now() + 5_000;
        } catch (error) {
            console.error('Error restarting sandbox:', error);
            toast.error('An error occurred while restarting the sandbox');
            setRestarting(false);
            setRestartElapsedSec(0);
            restartGraceUntilRef.current = null;
        }
    };

    // Keep the ref pointing at the latest closure so the
    // `weblab:restart-sandbox` window listener (registered once) always
    // invokes the current handler with up-to-date state.
    handleRestartSandboxRef.current = () => void handleRestartSandbox();

    const disabled = !branches.activeBranch || restarting;

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <button
                    onClick={() => void handleRestartSandbox()}
                    disabled={disabled}
                    className={cn(
                        'flex h-9 w-9 items-center justify-center rounded-md border border-transparent transition-colors',
                        hasSandboxError
                            ? 'bg-destructive/10 text-destructive hover:bg-destructive/15'
                            : restarting
                              ? 'text-foreground-tertiary bg-background-bar-active'
                              : !disabled
                                ? 'hover:text-foreground-hover text-foreground-tertiary hover:bg-background-bar-active'
                                : 'text-foreground-disabled cursor-not-allowed opacity-50',
                        className,
                    )}
                >
                    {restarting ? (
                        <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                    ) : (
                        <Icons.RestartSandbox
                            className={cn('h-4 w-4', hasSandboxError && 'text-destructive')}
                        />
                    )}
                </button>
            </TooltipTrigger>
            <TooltipContent sideOffset={5} hideArrow>
                {restarting ? `Restarting (${restartElapsedSec}s)…` : 'Restart Sandbox'}
            </TooltipContent>
        </Tooltip>
    );
});
