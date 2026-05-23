'use client';

import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import { useTranscribe } from '@/hooks/use-transcribe';

interface MicButtonProps {
    /**
     * Receives the transcribed text. Implementations should typically append
     * to existing input value (with a leading space if there's already content).
     */
    onTranscript: (text: string) => void;
    /** Optional ISO-639-1 hint (e.g. 'en', 'sv'). Whisper auto-detects when omitted. */
    language?: string;
    /** Disabled state (e.g. while a parent action is in flight). */
    disabled?: boolean;
    /** Tailwind size classes for the button itself (default `h-7 w-7`). */
    className?: string;
    /** Tailwind size classes for the icon (default `h-3.5 w-3.5`). */
    iconClassName?: string;
}

function formatElapsed(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function MicButton({
    onTranscript,
    language,
    disabled,
    className,
    iconClassName,
}: MicButtonProps) {
    const [tooltipOpen, setTooltipOpen] = useState(false);

    const { state, elapsedMs, start, stop, isSupported } = useTranscribe({
        onTranscript,
        language,
        onError: (error) => toast.error(error.message),
    });

    const handleClick = useCallback(async () => {
        setTooltipOpen(false);
        if (state === 'idle') {
            await start();
            return;
        }
        if (state === 'recording') {
            await stop();
            return;
        }
    }, [state, start, stop]);

    if (!isSupported) {
        // Hide entirely in unsupported browsers — feels cleaner than a disabled
        // affordance the user can't act on.
        return null;
    }

    const isRecording = state === 'recording';
    const isTranscribing = state === 'transcribing';
    const isError = state === 'error';
    const isBusy = isRecording || isTranscribing;

    const tooltipLabel = isRecording
        ? 'Stop and transcribe'
        : isTranscribing
          ? 'Transcribing…'
          : isError
            ? 'Voice input failed'
            : 'Voice input';

    return (
        <Tooltip open={tooltipOpen} onOpenChange={(open) => !isBusy && setTooltipOpen(open)}>
            <TooltipTrigger asChild>
                <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={tooltipLabel}
                    aria-pressed={isRecording}
                    disabled={disabled || isTranscribing}
                    onClick={() => void handleClick()}
                    className={cn(
                        'relative shrink-0 rounded-full transition-colors duration-200',
                        'h-7 w-7',
                        isRecording &&
                            'bg-destructive/15 text-destructive hover:bg-destructive/25 hover:text-destructive',
                        isTranscribing && 'text-foreground-secondary',
                        !isBusy && 'text-foreground-tertiary hover:text-foreground-primary',
                        className,
                    )}
                >
                    {/* Pulsing ring while recording — purely decorative. */}
                    {isRecording && (
                        <motion.span
                            aria-hidden
                            className="bg-destructive/30 pointer-events-none absolute inset-0 rounded-full"
                            initial={{ opacity: 0.6, scale: 1 }}
                            animate={{ opacity: 0, scale: 1.6 }}
                            transition={{
                                duration: 1.4,
                                repeat: Infinity,
                                ease: 'easeOut',
                            }}
                        />
                    )}
                    <AnimatePresence mode="wait" initial={false}>
                        {isTranscribing ? (
                            <motion.span
                                key="transcribing"
                                initial={{ opacity: 0, scale: 0.7 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.7 }}
                                transition={{ duration: 0.15 }}
                                className="relative flex items-center justify-center"
                            >
                                <Icons.LoadingSpinner
                                    className={cn('h-3.5 w-3.5 animate-spin', iconClassName)}
                                />
                            </motion.span>
                        ) : isRecording ? (
                            <motion.span
                                key="recording"
                                initial={{ opacity: 0, scale: 0.7 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.7 }}
                                transition={{ duration: 0.15 }}
                                className="relative flex items-center justify-center"
                            >
                                <span className="bg-destructive block h-2.5 w-2.5 rounded-[2px]" />
                            </motion.span>
                        ) : (
                            <motion.span
                                key="idle"
                                initial={{ opacity: 0, scale: 0.7 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.7 }}
                                transition={{ duration: 0.15 }}
                                className="relative flex items-center justify-center"
                            >
                                <Icons.Microphone className={cn('h-3.5 w-3.5', iconClassName)} />
                            </motion.span>
                        )}
                    </AnimatePresence>
                </Button>
            </TooltipTrigger>
            <TooltipPortal>
                <TooltipContent side="top" sideOffset={6}>
                    {isRecording ? (
                        <span className="flex items-center gap-1.5 tabular-nums">
                            <span className="bg-destructive inline-block h-1.5 w-1.5 animate-pulse rounded-full" />
                            Recording {formatElapsed(elapsedMs)} · click to transcribe
                        </span>
                    ) : (
                        tooltipLabel
                    )}
                </TooltipContent>
            </TooltipPortal>
        </Tooltip>
    );
}
