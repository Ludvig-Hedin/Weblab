'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import { useEditorEngine } from '@/components/store/editor';

export const RestartSandboxButton = observer(({ className }: { className?: string }) => {
    const editorEngine = useEditorEngine();
    const branches = editorEngine.branches;
    const [restarting, setRestarting] = useState(false);
    const timeoutIdRef = useRef<NodeJS.Timeout | null>(null);
    const [hasSandboxError, setHasSandboxError] = useState(false);
    const mountTimeRef = useRef<number>(Date.now());
    const checkInterval = 10000;

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

    // Listen for iframe load failures dispatched from the canvas frame view —
    // a 502 from the sandbox or a network error in the iframe both fire the
    // 'weblab:sandbox-iframe-error' custom event, which trips the same error
    // state we'd otherwise discover via the polling loop below.
    useEffect(() => {
        const handler = () => {
            const timeSinceMount = Date.now() - mountTimeRef.current;
            if (timeSinceMount >= 5000) {
                setHasSandboxError(true);
            }
        };
        window.addEventListener('weblab:sandbox-iframe-error', handler);
        return () => window.removeEventListener('weblab:sandbox-iframe-error', handler);
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
            setHasSandboxError(false);
            // Reset mount time for grace period after restart
            mountTimeRef.current = Date.now();
            const sandbox = branches.getSandboxById(activeBranch.id);
            if (!sandbox?.session) {
                toast.error('Sandbox session not available');
                setRestarting(false);
                return;
            }

            if (!sandbox.session.provider) {
                await sandbox.session.start(activeBranch.sandbox.id);
            }

            const success = await sandbox.session.restartDevServer();
            if (success) {
                // Wait 5 seconds before refreshing webviews to avoid 502 errors
                setTimeout(() => {
                    const frames = editorEngine.frames.getByBranchId(activeBranch.id);
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
                }, 5000);
            } else {
                toast.error('Failed to restart sandbox');
                setRestarting(false);
            }
        } catch (error) {
            console.error('Error restarting sandbox:', error);
            toast.error('An error occurred while restarting the sandbox');
            setRestarting(false);
        }
    };

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
                            ? 'bg-amber-900 text-amber-200 hover:bg-amber-800 hover:text-amber-100'
                            : restarting
                              ? 'text-foreground-tertiary bg-accent/30'
                              : !disabled
                                ? 'hover:text-foreground-hover text-foreground-tertiary hover:bg-accent/50'
                                : 'text-foreground-disabled cursor-not-allowed opacity-50',
                        className,
                    )}
                >
                    {restarting ? (
                        <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                    ) : (
                        <Icons.RestartSandbox
                            className={cn('h-4 w-4', hasSandboxError && 'text-amber-200')}
                        />
                    )}
                </button>
            </TooltipTrigger>
            <TooltipContent sideOffset={5} hideArrow>
                Restart Sandbox
            </TooltipContent>
        </Tooltip>
    );
});
