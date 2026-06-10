'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@weblab/ui/collapsible';
import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

interface ActionsGroupProps {
    /** Stable key for this group inside the message — used so finished elapsed
     *  state survives re-renders within a session. */
    groupKey: string;
    /** Whether this group is currently being streamed (the model is still
     *  emitting parts inside it). When this transitions from true → false we
     *  freeze the elapsed time and switch the label to "Worked for …". */
    isStreaming: boolean;
    /** The number of distinct actions inside this group (tool calls + reasoning
     *  steps). Surfaced as part of the summary label. */
    actionCount: number;
    /** Wall-clock anchor for the start of this group. Used to compute the
     *  elapsed time. Defaults to the moment the component first mounts. */
    startedAt?: Date | number;
    children: ReactNode;
}

const formatElapsed = (totalSeconds: number) => {
    const safeSeconds = Math.max(0, Math.round(totalSeconds));
    if (safeSeconds < 60) return `${safeSeconds}s`;
    const minutes = Math.floor(safeSeconds / 60);
    const seconds = safeSeconds % 60;
    if (seconds === 0) return `${minutes}m`;
    return `${minutes}m ${seconds}s`;
};

export const ActionsGroup = ({
    isStreaming,
    actionCount,
    startedAt,
    children,
}: ActionsGroupProps) => {
    // Anchor the start time to the message's createdAt when provided,
    // otherwise fall back to mount time. Using a ref keeps it stable across
    // re-renders so the live timer is consistent.
    const startTimeRef = useRef<number>(
        startedAt instanceof Date
            ? startedAt.getTime()
            : typeof startedAt === 'number'
              ? startedAt
              : Date.now(),
    );

    // While streaming, tick a timer every second to drive the live label.
    const [now, setNow] = useState<number>(() => Date.now());
    useEffect(() => {
        if (!isStreaming) return;
        setNow(Date.now());
        const id = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, [isStreaming]);

    // Capture the elapsed time at the moment streaming completes so the label
    // doesn't drift after the turn ends. If the component first mounts with
    // isStreaming=false (e.g. on page reload of a finished message), we leave
    // frozenElapsed null and just show "Worked".
    const [frozenElapsed, setFrozenElapsed] = useState<number | null>(null);
    const wasStreamingRef = useRef(isStreaming);
    useEffect(() => {
        if (wasStreamingRef.current && !isStreaming) {
            setFrozenElapsed((Date.now() - startTimeRef.current) / 1000);
        }
        wasStreamingRef.current = isStreaming;
    }, [isStreaming]);

    // Collapsed by default once the work is done; expanded while streaming so
    // the user can watch the actions roll in.
    const [open, setOpen] = useState<boolean>(isStreaming);
    // Auto-collapse the group when streaming finishes, but never auto-expand
    // a manually collapsed group.
    const prevStreamingRef = useRef(isStreaming);
    useEffect(() => {
        if (prevStreamingRef.current && !isStreaming) {
            setOpen(false);
        }
        if (!prevStreamingRef.current && isStreaming) {
            setOpen(true);
        }
        prevStreamingRef.current = isStreaming;
    }, [isStreaming]);

    const elapsedSeconds = isStreaming ? (now - startTimeRef.current) / 1000 : (frozenElapsed ?? 0);
    const elapsedLabel = formatElapsed(elapsedSeconds);

    let summary: string;
    if (isStreaming) {
        summary = `Working — ${elapsedLabel}`;
    } else if (frozenElapsed !== null) {
        summary = `Worked for ${elapsedLabel}`;
    } else {
        summary = actionCount === 1 ? 'Worked · 1 action' : `Worked · ${actionCount} actions`;
    }

    return (
        <div className="my-1.5">
            <Collapsible open={open} onOpenChange={setOpen}>
                <CollapsibleTrigger asChild>
                    <button
                        type="button"
                        className={cn(
                            'text-foreground-tertiary hover:bg-background-tertiary/50 hover:text-foreground-secondary group flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 transition-colors',
                            isStreaming && 'text-foreground-secondary',
                        )}
                    >
                        {isStreaming ? (
                            <Icons.LoadingSpinner className="text-foreground-tertiary h-3 w-3 shrink-0 animate-spin" />
                        ) : (
                            <Icons.Sparkles className="text-foreground-tertiary h-3 w-3 shrink-0" />
                        )}
                        <span
                            className={cn(
                                'text-mini',
                                isStreaming &&
                                    // Theme-aware shimmer — a white gradient was
                                    // invisible against the light-mode panel.
                                    'animate-shimmer from-foreground/40 via-foreground to-foreground/40 bg-gradient-to-l bg-[length:200%_100%] bg-clip-text text-transparent',
                            )}
                        >
                            {summary}
                        </span>
                        <Icons.ChevronDown
                            className={cn(
                                'text-foreground-tertiary ml-auto h-3 w-3 shrink-0 transition-transform duration-200',
                                open && 'rotate-180',
                            )}
                        />
                    </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="overflow-hidden">
                    <div className="border-border/40 mt-1 ml-1.5 border-l-[0.5px] pl-2.5">
                        {children}
                    </div>
                </CollapsibleContent>
            </Collapsible>
        </div>
    );
};
