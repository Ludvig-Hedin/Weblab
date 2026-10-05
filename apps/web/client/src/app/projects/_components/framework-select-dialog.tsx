'use client';

import { useTranslations } from 'next-intl';

import type { FrameworkId } from '@weblab/framework';
import { listReadyFrameworkAdapters } from '@weblab/framework';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@weblab/ui/dialog';
import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

interface FrameworkSelectDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelect: (framework: FrameworkId) => void;
}

const FRAMEWORK_ICONS: Record<string, { icon: React.ReactNode; recommended?: boolean }> = {
    nextjs: { icon: <Icons.Globe className="h-4 w-4" />, recommended: true },
    'static-html': { icon: <Icons.Code className="h-4 w-4" /> },
};

/** Frameworks the desktop app can scaffold to a selected local folder. */
const LOCAL_FRAMEWORK_IDS = new Set<string>(['nextjs', 'static-html']);

export function FrameworkSelectDialog({
    open,
    onOpenChange,
    onSelect,
}: FrameworkSelectDialogProps) {
    const t = useTranslations('projects.frameworkSelect');

    const frameworkDescriptions: Record<string, string> = {
        nextjs: t('frameworkNextjs'),
        'static-html': t('frameworkStaticHtml'),
    };

    const adapters = listReadyFrameworkAdapters().filter((adapter) =>
        LOCAL_FRAMEWORK_IDS.has(adapter.id),
    );

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle>{t('title')}</DialogTitle>
                    <DialogDescription>{t('localRunsInfo')}</DialogDescription>
                </DialogHeader>

                {/* Framework rows — compact, one per line. */}
                <div className="grid grid-cols-1 gap-2">
                    {adapters.map((adapter) => {
                        const meta = FRAMEWORK_ICONS[adapter.id];
                        return (
                            <button
                                key={adapter.id}
                                type="button"
                                onClick={() => onSelect(adapter.id)}
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
