'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

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

const FRAMEWORK_ICONS: Record<string, { icon: React.ReactNode; recommended?: boolean }> = {
    nextjs: { icon: <Icons.Globe className="h-4 w-4" />, recommended: true },
    'static-html': { icon: <Icons.Code className="h-4 w-4" /> },
    'vite-react': { icon: <Icons.Globe className="h-4 w-4" /> },
    remix: { icon: <Icons.Globe className="h-4 w-4" /> },
    astro: { icon: <Icons.Globe className="h-4 w-4" /> },
    'tanstack-start': { icon: <Icons.Globe className="h-4 w-4" /> },
};

/** Frameworks we can scaffold to local disk today (Cloud supports the rest). */
const LOCAL_FRAMEWORK_IDS = new Set<string>(['nextjs', 'static-html']);

export function FrameworkSelectDialog({
    open,
    onOpenChange,
    onSelect,
    localAvailable = false,
}: FrameworkSelectDialogProps) {
    const t = useTranslations('projects.frameworkSelect');
    const [destination, setDestination] = useState<CreateDestination>('cloud');

    const frameworkDescriptions: Record<string, string> = {
        nextjs: t('frameworkNextjs'),
        'static-html': t('frameworkStaticHtml'),
        'vite-react': t('frameworkViteReact'),
        remix: t('frameworkRemix'),
        astro: t('frameworkAstro'),
        'tanstack-start': t('frameworkTanstackStart'),
    };

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
                    <DialogTitle>{t('title')}</DialogTitle>
                    <DialogDescription>{t('description')}</DialogDescription>
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
                        {t('destinationCloud')}
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
                            {t('destinationLocal')}
                        </Button>
                    ) : (
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <span
                                    className="text-foreground-tertiary text-mini flex flex-1 cursor-not-allowed items-center justify-center gap-1.5 rounded-md px-2.5 opacity-60"
                                    aria-disabled
                                >
                                    <Icons.Laptop className="h-3.5 w-3.5" />
                                    {t('destinationLocal')}
                                </span>
                            </TooltipTrigger>
                            <TooltipContent>{t('localTooltip')}</TooltipContent>
                        </Tooltip>
                    )}
                </div>

                <p className="text-foreground-tertiary -mt-1 text-xs">
                    {effectiveDestination === 'cloud' ? t('cloudRunsInfo') : t('localRunsInfo')}
                </p>

                {/* Framework rows — compact, one per line. */}
                <div className="grid grid-cols-1 gap-2">
                    {adapters.map((adapter) => {
                        const meta = FRAMEWORK_ICONS[adapter.id];
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
                                                {t('recommended')}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-foreground-tertiary truncate text-xs">
                                        {frameworkDescriptions[adapter.id] ?? adapter.displayName}
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
