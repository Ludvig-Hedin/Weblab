'use client';

import { useEffect, useState } from 'react';

import type { FrameworkId } from '@weblab/framework';
import { listReadyFrameworkAdapters } from '@weblab/framework';
import { Button } from '@weblab/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@weblab/ui/dialog';
import { Icons } from '@weblab/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

/** Where a new blank project lives. */
export type CreateDestination = 'cloud' | 'local';

interface FrameworkSelectDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Fires with the chosen framework + destination, then the dialog closes. */
    onSelect: (framework: FrameworkId, destination: CreateDestination) => void;
    /** Whether on-disk (local) projects are available — desktop app only. */
    localAvailable?: boolean;
}

const FRAMEWORK_META: Record<
    string,
    { icon: React.ReactNode; description: string; recommended?: boolean }
> = {
    nextjs: {
        icon: <Icons.Globe className="h-4 w-4" />,
        description: 'React, Tailwind, and shadcn/ui — recommended for most projects.',
        recommended: true,
    },
    'static-html': {
        icon: <Icons.Code className="h-4 w-4" />,
        description: 'Vanilla HTML, CSS, and JS — no build step.',
    },
    'vite-react': {
        icon: <Icons.Globe className="h-4 w-4" />,
        description: 'React with Vite — fast HMR, no server-side rendering.',
    },
    remix: {
        icon: <Icons.Globe className="h-4 w-4" />,
        description: 'Full-stack React with server loaders and nested routes.',
    },
    astro: {
        icon: <Icons.Globe className="h-4 w-4" />,
        description: 'Content-first sites with islands and zero JS by default.',
    },
    'tanstack-start': {
        icon: <Icons.Globe className="h-4 w-4" />,
        description: 'Full-stack React with type-safe routing and server functions.',
    },
};

/** Frameworks we can scaffold to local disk today (Cloud supports the rest). */
const LOCAL_FRAMEWORK_IDS = new Set<string>(['nextjs', 'static-html']);

export function FrameworkSelectDialog({
    open,
    onOpenChange,
    onSelect,
    localAvailable = false,
}: FrameworkSelectDialogProps) {
    const [destination, setDestination] = useState<CreateDestination>('cloud');

    // Reset to Cloud each time the dialog opens so a previous Local pick never
    // sticks across opens (and Local is only valid on desktop anyway).
    useEffect(() => {
        if (open) setDestination('cloud');
    }, [open]);

    // Local is desktop-only; never let it be the effective choice on web.
    const effectiveDestination: CreateDestination = localAvailable ? destination : 'cloud';

    const ready = listReadyFrameworkAdapters();
    const adapters =
        effectiveDestination === 'local'
            ? ready.filter((a) => LOCAL_FRAMEWORK_IDS.has(a.id))
            : ready;

    const segBase =
        'flex-1 gap-1.5 data-[active=true]:bg-background data-[active=true]:text-foreground data-[active=true]:shadow-sm';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle>Start a blank project</DialogTitle>
                    <DialogDescription>Choose where it runs, then pick a stack.</DialogDescription>
                </DialogHeader>

                {/* Destination: Cloud vs Local (desktop only). */}
                <div className="border-border-secondary bg-foreground/[0.03] flex gap-0.5 rounded-lg border p-0.5">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        data-active={effectiveDestination === 'cloud'}
                        onClick={() => setDestination('cloud')}
                        className={segBase}
                    >
                        <Icons.Globe className="h-3.5 w-3.5" />
                        Cloud
                    </Button>
                    {localAvailable ? (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            data-active={effectiveDestination === 'local'}
                            onClick={() => setDestination('local')}
                            className={segBase}
                        >
                            <Icons.Laptop className="h-3.5 w-3.5" />
                            Local
                        </Button>
                    ) : (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span
                                    className="text-foreground-tertiary text-mini flex flex-1 cursor-not-allowed items-center justify-center gap-1.5 rounded-md px-2.5 opacity-60"
                                    aria-disabled
                                >
                                    <Icons.Laptop className="h-3.5 w-3.5" />
                                    Local
                                </span>
                            </TooltipTrigger>
                            <TooltipContent>Available in the desktop app</TooltipContent>
                        </Tooltip>
                    )}
                </div>

                <p className="text-foreground-tertiary -mt-1 text-xs">
                    {effectiveDestination === 'cloud'
                        ? 'Runs in Weblab Cloud — nothing to install.'
                        : 'Runs on your machine, saved straight to disk.'}
                </p>

                {/* Framework rows — compact, one per line. */}
                <div className="grid grid-cols-1 gap-2">
                    {adapters.map((adapter) => {
                        const meta = FRAMEWORK_META[adapter.id];
                        return (
                            <button
                                key={adapter.id}
                                type="button"
                                onClick={() => onSelect(adapter.id, effectiveDestination)}
                                className={cn(
                                    'group border-border-secondary hover:bg-background-secondary',
                                    'flex items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                                )}
                            >
                                <div className="border-border-secondary bg-background text-foreground-secondary flex h-8 w-8 shrink-0 items-center justify-center rounded-md border">
                                    {meta?.icon ?? <Icons.Globe className="h-4 w-4" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-foreground text-sm font-medium">
                                            {adapter.displayName}
                                        </span>
                                        {meta?.recommended && (
                                            <span className="border-border-secondary text-foreground-tertiary text-tiny rounded-full border px-1.5 py-0.5">
                                                Recommended
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-foreground-tertiary truncate text-xs">
                                        {meta?.description ?? adapter.displayName}
                                    </p>
                                </div>
                                <Icons.ArrowRight className="text-foreground-tertiary group-hover:text-foreground-secondary h-4 w-4 shrink-0" />
                            </button>
                        );
                    })}
                </div>
            </DialogContent>
        </Dialog>
    );
}
