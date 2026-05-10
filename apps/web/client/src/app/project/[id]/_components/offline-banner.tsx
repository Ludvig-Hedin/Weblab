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

    if (online && !isOfflineSession && pending === 0 && dead === 0) {
        return null;
    }

    const bgClass = online ? 'bg-amber-500/10' : 'bg-red-500/10';
    const borderClass = online ? 'border-amber-500/30' : 'border-red-500/30';
    const textClass = online ? 'text-amber-200' : 'text-red-200';

    return (
        <>
            <button
                type="button"
                onClick={() => setPanelOpen(true)}
                className={`pointer-events-auto flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-xs transition hover:opacity-90 ${bgClass} ${borderClass} ${textClass}`}
            >
                <Icons.InfoCircled className="h-3.5 w-3.5 shrink-0" />
                <div className="flex flex-1 flex-col gap-0.5">
                    {!online ? (
                        <>
                            <span className="font-medium">You're offline.</span>
                            <span className="opacity-80">
                                Edits save locally and will sync when you reconnect.
                                {pending > 0 ? ` ${pending} pending.` : ''}
                            </span>
                        </>
                    ) : (
                        <>
                            <span className="font-medium">Syncing offline changes…</span>
                            <span className="opacity-80">
                                {pending} change{pending === 1 ? '' : 's'} remaining.
                                {dead > 0 ? ` ${dead} could not be synced.` : ''}
                            </span>
                        </>
                    )}
                </div>
                <span className="opacity-70">Details →</span>
            </button>
            <OfflinePanel open={panelOpen} onOpenChange={setPanelOpen} />
        </>
    );
});
