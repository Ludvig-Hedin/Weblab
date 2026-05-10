'use client';

import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';

import { Button } from '@weblab/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@weblab/ui/dialog';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';

import type { ConflictRecord, DeadLetterRecord, QueueRecord } from '@/services/offline/write-queue';
import { useEditorEngine } from '@/components/store/editor';
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
    const editorEngine = useEditorEngine();
    const online = useOnlineStatus();
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
                toast.error('Still offline. Reconnect and try again.');
                return;
            }
            const sandbox = editorEngine.activeSandbox;
            const provider = sandbox.session.provider;
            if (!provider) {
                toast.error('Sandbox not connected yet. Wait a moment and retry.');
                return;
            }
            // Pause sync engine init for the same reason the auto reconnect
            // path does (see SandboxManager.suppressSyncInitForReplay): a
            // concurrent `pullFromSandbox` would race the manual replay and
            // can overwrite local-only edits with stale CSB content.
            sandbox.suppressSyncInitForReplay();
            try {
                const result = await replayQueue(provider, editorEngine.projectId);
                toast.success(
                    `Synced ${result.drained} change${result.drained === 1 ? '' : 's'}.${
                        result.deadLettered > 0
                            ? ` ${result.deadLettered} moved to dead letter.`
                            : ''
                    }`,
                );
            } finally {
                await sandbox.resumeSyncInit();
            }
            await refresh();
        } catch (err) {
            toast.error('Sync failed', {
                description: err instanceof Error ? err.message : 'Unknown error',
            });
        } finally {
            setBusy(false);
        }
    };

    const handleRetry = async (record: DeadLetterRecord) => {
        try {
            await retryDeadLetterRecord(record);
            toast.success('Re-queued for sync.');
            await refresh();
        } catch (err) {
            toast.error('Retry failed', {
                description: err instanceof Error ? err.message : 'Unknown error',
            });
        }
    };

    const handleClearDead = async () => {
        if (!confirm('Discard all dead-letter records? Their content will be lost.')) return;
        await clearDeadLetter();
        toast.success('Dead letter cleared.');
        await refresh();
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Offline sync</DialogTitle>
                </DialogHeader>

                <div className="flex items-center justify-between text-xs">
                    <div className="text-muted-foreground">
                        {online ? 'Online' : 'Offline'} · {pending.length} pending · {dead.length}{' '}
                        dead-letter · {conflicts.length} conflict
                        {conflicts.length === 1 ? '' : 's'}
                    </div>
                    <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy || !online}
                        onClick={() => void handleSyncNow()}
                    >
                        {busy && <Icons.LoadingSpinner className="mr-2 h-3 w-3 animate-spin" />}
                        Sync now
                    </Button>
                </div>

                <section className="mt-4">
                    <h3 className="text-sm font-medium">Pending writes</h3>
                    {pending.length === 0 ? (
                        <p className="text-muted-foreground mt-1 text-xs">No queued changes.</p>
                    ) : (
                        <ul className="border-border/50 mt-2 max-h-64 divide-y overflow-y-auto rounded-md border text-xs">
                            {pending.map((r) => (
                                <li key={r.id} className="flex justify-between gap-3 px-3 py-1.5">
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
                        <h3 className="text-sm font-medium">Dead letter</h3>
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
                            No records have failed past retry.
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
                                            Retry
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
                    <h3 className="text-sm font-medium">Conflicts</h3>
                    {conflicts.length === 0 ? (
                        <p className="text-muted-foreground mt-1 text-xs">
                            No remote changes were overwritten by your offline edits.
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
                                            Dismiss
                                        </Button>
                                    </div>
                                    <p className="text-muted-foreground">
                                        Your version was kept. Detected{' '}
                                        {new Date(c.detectedAt).toLocaleString()}.
                                    </p>
                                    <details className="text-muted-foreground/80">
                                        <summary className="cursor-pointer">
                                            Show remote version
                                        </summary>
                                        <pre className="bg-muted/30 mt-1 max-h-48 overflow-auto p-2 text-[10px] break-words whitespace-pre-wrap">
                                            {typeof c.remoteContent === 'string'
                                                ? c.remoteContent
                                                : '[binary content]'}
                                        </pre>
                                    </details>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        Close
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
});
