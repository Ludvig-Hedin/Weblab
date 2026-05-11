'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { observer } from 'mobx-react-lite';

import { Icons } from '@weblab/ui/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';

import { useEditorEngine } from '@/components/store/editor';
import { useOnlineStatus } from '@/services/offline/online-status';
import { getDeadLetterDepth, getQueueDepth } from '@/services/offline/write-queue';

/**
 * Persistent connection indicator in the editor topbar. Surfaces three
 * states: green dot when online + nothing pending, amber when syncing
 * queued offline writes, red when fully offline. Click is owned by the
 * adjacent OfflineBanner — this chip is read-only signal density.
 */
export const ConnectionChip = observer(() => {
    const t = useTranslations('editor.topBar.connection') as (
        key: string,
        values?: Record<string, number>,
    ) => string;
    const editorEngine = useEditorEngine();
    const online = useOnlineStatus();
    const isOfflineSession = editorEngine.activeSandbox.session.isOffline;
    const [pending, setPending] = useState(0);
    const [dead, setDead] = useState(0);

    useEffect(() => {
        let cancelled = false;
        const tick = async () => {
            const [p, d] = await Promise.all([
                getQueueDepth(editorEngine.projectId).catch(() => 0),
                getDeadLetterDepth().catch(() => 0),
            ]);
            if (cancelled) return;
            setPending(p);
            setDead(d);
        };
        void tick();
        const interval = setInterval(tick, 4_000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [editorEngine.projectId]);

    const offline = !online || isOfflineSession;
    const syncing = online && pending > 0;

    let label: string;
    let dotClass: string;
    let labelClass: string;
    if (offline) {
        label = pending > 0 ? t('offlinePending', { count: pending }) : t('offline');
        dotClass = 'bg-red-400';
        labelClass = 'text-red-300';
    } else if (syncing) {
        label = t('syncing', { count: pending });
        dotClass = 'bg-amber-400';
        labelClass = 'text-amber-200';
    } else if (dead > 0) {
        label = t('syncErrors', { count: dead });
        dotClass = 'bg-amber-400';
        labelClass = 'text-amber-200';
    } else {
        return null;
    }

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <span className="bg-background-tertiary/40 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium">
                    <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
                    <span className={labelClass}>{label}</span>
                </span>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="mt-1" hideArrow>
                {offline
                    ? t('offlineTooltip')
                    : syncing
                      ? t('syncingTooltip')
                      : t('syncErrorsTooltip')}
            </TooltipContent>
        </Tooltip>
    );
});

// Hook proxy: components that need to react to the chip's effective state
// can consume `useOnlineStatus()` directly. Exporting Icons just keeps the
// import surface honest for tooling that scans for unused imports.
export const _ConnectionChipIcons = Icons;
