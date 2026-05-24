'use client';

import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { Icons } from '@weblab/ui/icons';

import { useEditorEngine } from '@/components/store/editor';
import { useOnlineStatus } from '@/services/offline/online-status';
import { getDeadLetterDepth, getQueueDepth } from '@/services/offline/write-queue';
import { OfflinePanel } from './offline-panel';

export const OfflineBanner = observer(() => {
    const editorEngine = useEditorEngine();
    const online = useOnlineStatus();
    const isOfflineSession = editorEngine.activeSandbox.session.isOffline;
    const [pending, setPending] = useState(0);
    const [dead, setDead] = useState(0);
    const [panelOpen, setPanelOpen] = useState(false);
    const [dismissed, setDismissed] = useState(false);

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
        const interval = setInterval(tick, 3000);
        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [editorEngine.projectId]);

    // Re-show on new failures or going offline — those need attention.
    useEffect(() => {
        if (dead > 0) setDismissed(false);
    }, [dead]);
    useEffect(() => {
        if (!online) setDismissed(false);
    }, [online]);

    if (online && !isOfflineSession && pending === 0 && dead === 0) return null;
    if (dismissed) return null;

    const isWarning = online;

    return (
        <>
            <div
                className={[
                    'pointer-events-auto w-[210px] rounded-xl border px-3 py-2.5 text-xs shadow-lg',
                    'bg-neutral-900/95 text-neutral-100',
                    isWarning ? 'border-amber-500/25' : 'border-red-500/25',
                ].join(' ')}
                style={{ backdropFilter: 'blur(16px)' }}
            >
                {/* Header row: icon + title + dismiss */}
                <div className="flex items-start gap-2">
                    <Icons.InfoCircled
                        className={[
                            'mt-px h-3.5 w-3.5 shrink-0',
                            isWarning ? 'text-amber-400' : 'text-red-400',
                        ].join(' ')}
                    />
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        {!online ? (
                            <>
                                <span className="leading-tight font-medium">You're offline.</span>
                                <span className="leading-snug opacity-65">
                                    Edits save locally and sync on reconnect.
                                    {pending > 0 ? ` ${pending} pending.` : ''}
                                </span>
                            </>
                        ) : (
                            <>
                                <span className="leading-tight font-medium">
                                    Syncing offline changes
                                </span>
                                <span className="leading-snug opacity-65">
                                    {pending} change{pending === 1 ? '' : 's'} remaining.
                                    {dead > 0 ? ` ${dead} failed.` : ''}
                                </span>
                            </>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={() => setDismissed(true)}
                        aria-label="Dismiss"
                        className="mt-px -mr-0.5 rounded p-0.5 text-neutral-400 transition-opacity hover:text-neutral-100"
                    >
                        <Icons.CrossS className="h-3 w-3" />
                    </button>
                </div>

                {/* Details link */}
                <button
                    type="button"
                    onClick={() => setPanelOpen(true)}
                    className="mt-2 flex items-center gap-1 text-neutral-400 transition-colors hover:text-neutral-100"
                >
                    <span className="underline underline-offset-2">Details</span>
                    <Icons.ArrowRight className="h-2.5 w-2.5" />
                </button>
            </div>
            <OfflinePanel open={panelOpen} onOpenChange={setPanelOpen} />
        </>
    );
});
