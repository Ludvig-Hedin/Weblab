'use client';

import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@weblab/ui/dialog';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';

import type { ConflictRecord, DeadLetterRecord, QueueRecord } from '@/services/offline/write-queue';
import { useEditorEngine } from '@/components/store/editor';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { pingOnlineStatus, useOnlineStatus } from '@/services/offline/online-status';
import { replayQueue } from '@/services/offline/replay-controller';
import {
    clearDeadLetter,
    dismissConflict,
    listConflicts,
    listDeadLetter,
    listQueueForProject,
    retryDeadLetterRecord,
} from '@/services/offline/write-queue';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

function bytes(content?: string | Uint8Array): number {
    if (!content) return 0;
    if (typeof content === 'string') return content.length;
    return content.byteLength;
}

export const OfflinePanel = observer(({ open, onOpenChange }: Props) => {
    const t = useTranslations('editor.offlinePanel');
    const editorEngine = useEditorEngine();
    const online = useOnlineStatus();
    const { confirm, dialog: confirmDialog } = useConfirm();
    const [pending, setPending] = useState<QueueRecord[]>([]);
    const [dead, setDead] = useState<DeadLetterRecord[]>([]);
    const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
    const [busy, setBusy] = useState(false);

    const refresh = async () => {
        const [p, d, c] = await Promise.all([
            listQueueForProject(editorEngine.projectId),
            listDeadLetter(),
            listConflicts(editorEngine.projectId),
        ]);
        setPending(p);
        setDead(d);
        setConflicts(c);
    };

    useEffect(() => {
        if (!open) return;
        void refresh();
        const interval = setInterval(refresh, 2_000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, editorEngine.projectId]);

    const handleSyncNow = async () => {
        setBusy(true);
        try {
            const isOnline = await pingOnlineStatus();
            if (!isOnline) {
                toast.error(t('toastStillOffline'));
                return;
            }
            const sandbox = editorEngine.activeSandbox;
            const provider = sandbox.session.provider;
            if (!provider) {
                toast.error(t('toastNotConnected'));
                return;
            }
            if (sandbox.session.isOffline) {
                // Replay against the offline shim would silently drain the
                // queue (writeFile is a no-op). Defer and tell the user.
                toast.error(t('toastOfflineMode'));
                return;
            }
            // Pause sync engine init for the same reason the auto reconnect
            // path does (see SandboxManager.suppressSyncInitForReplay): a
            // concurrent `pullFromSandbox` would race the manual replay and
            // can overwrite local-only edits with stale CSB content.
            sandbox.suppressSyncInitForReplay();
            try {
                const result = await replayQueue(provider, editorEngine.projectId);
                toast.success(t('toastSyncSuccess', { count: result.drained }));
            } finally {
                await sandbox.resumeSyncInit();
            }
            await refresh();
        } catch (err) {
            toast.error(t('toastSyncFailed'), {
                description: err instanceof Error ? err.message : 'Unknown error',
            });
        } finally {
            setBusy(false);
        }
    };

    const handleRetry = async (record: DeadLetterRecord) => {
        try {
            await retryDeadLetterRecord(record);
            toast.success(t('toastRequeued'));
            await refresh();
        } catch (err) {
            toast.error(t('toastRetryFailed'), {
                description: err instanceof Error ? err.message : 'Unknown error',
            });
        }
    };

    const handleClearDead = async () => {
        const ok = await confirm({
            title: t('discardDeadLetterTitle'),
            description: t('discardDeadLetterDesc'),
            confirmLabel: t('discardConfirm'),
            destructive: true,
        });
        if (!ok) return;
        await clearDeadLetter();
        toast.success(t('toastDeadLetterCleared'));
        await refresh();
    };

    return (
        <>
            <Dialog open={open} onOpenChange={onOpenChange}>
                <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{t('dialogTitle')}</DialogTitle>
                    </DialogHeader>

                    <div className="flex items-center justify-between text-xs">
                        <div className="text-muted-foreground">
                            {online ? t('online') : t('offline')} ·{' '}
                            {t('statusPending', { count: pending.length })} ·{' '}
                            {t('statusDeadLetter', { count: String(dead.length) })} ·{' '}
                            {t('statusConflict', { count: conflicts.length })}
                        </div>
                        <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy || !online}
                            onClick={() => void handleSyncNow()}
                        >
                            {busy && <Icons.LoadingSpinner className="mr-2 h-3 w-3 animate-spin" />}
                            {t('syncNow')}
                        </Button>
                    </div>

                    <section className="mt-4">
                        <h3 className="text-sm font-medium">{t('pendingTitle')}</h3>
                        {pending.length === 0 ? (
                            <p className="text-muted-foreground mt-1 text-xs">{t('noPending')}</p>
                        ) : (
                            <ul className="border-border/50 mt-2 max-h-64 divide-y overflow-y-auto rounded-md border text-xs">
                                {pending.map((r) => (
                                    <li
                                        key={r.id}
                                        className="flex justify-between gap-3 px-3 py-1.5"
                                    >
                                        <span className="text-foreground/80 truncate font-mono">
                                            {r.op} · {r.path}
                                        </span>
                                        <span className="text-muted-foreground shrink-0">
                                            {new Date(r.enqueuedAt).toLocaleTimeString()}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <section className="mt-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-medium">{t('deadLetterTitle')}</h3>
                            {dead.length > 0 && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => void handleClearDead()}
                                >
                                    Clear all
                                </Button>
                            )}
                        </div>
                        {dead.length === 0 ? (
                            <p className="text-muted-foreground mt-1 text-xs">
                                {t('noDeadLetter')}
                            </p>
                        ) : (
                            <ul className="border-border/50 mt-2 divide-y rounded-md border text-xs">
                                {dead.map((r) => (
                                    <li key={r.id} className="flex flex-col gap-1 px-3 py-2">
                                        <div className="flex justify-between gap-3">
                                            <span className="text-foreground/80 truncate font-mono">
                                                {r.op} · {r.path}
                                            </span>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => void handleRetry(r)}
                                            >
                                                {t('retry')}
                                            </Button>
                                        </div>
                                        {r.lastError && (
                                            <p className="text-red-300/80">{r.lastError}</p>
                                        )}
                                        <p className="text-muted-foreground">
                                            {bytes(r.content)} bytes ·{' '}
                                            {new Date(r.enqueuedAt).toLocaleString()}
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <section className="mt-4">
                        <h3 className="text-sm font-medium">{t('conflictsTitle')}</h3>
                        {conflicts.length === 0 ? (
                            <p className="text-muted-foreground mt-1 text-xs">
                                {t('noConflicts')}
                            </p>
                        ) : (
                            <ul className="border-border/50 mt-2 divide-y rounded-md border text-xs">
                                {conflicts.map((c) => (
                                    <li key={c.id} className="flex flex-col gap-1 px-3 py-2">
                                        <div className="flex justify-between gap-3">
                                            <span className="text-foreground/80 truncate font-mono">
                                                {c.path}
                                            </span>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => {
                                                    void dismissConflict(c.id).then(refresh);
                                                }}
                                            >
                                                {t('dismiss')}
                                            </Button>
                                        </div>
                                        <p className="text-muted-foreground">
                                            {t('yourVersionKept', {
                                                date: new Date(c.detectedAt).toLocaleString(),
                                            })}
                                        </p>
                                        <details className="text-muted-foreground/80">
                                            <summary className="cursor-pointer">
                                                {t('showRemoteVersion')}
                                            </summary>
                                            <pre className="bg-muted/30 mt-1 max-h-48 overflow-auto p-2 text-tiny break-words whitespace-pre-wrap">
                                                {typeof c.remoteContent === 'string'
                                                    ? c.remoteContent
                                                    : t('binaryContent')}
                                            </pre>
                                        </details>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => onOpenChange(false)}>
                            {t('close')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {confirmDialog}
        </>
    );
});
