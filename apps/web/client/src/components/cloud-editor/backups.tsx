'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import type { FunctionReturnType } from 'convex/server';
import type { Id } from '@convex/_generated/dataModel';
import { Button } from '@weblab/ui/button';
import { cloudReleaseApi } from '@/lib/cloud-releases/api';
import { restoreBackupCopy } from '@/lib/cloud-releases/backup-restore';
import en from '../../../messages/cloud-releases/en.json';
import sv from '../../../messages/cloud-releases/sv.json';

export function CloudBackups({ workspaceId }: { workspaceId: Id<'workspaces'> }) {
    return <WorkspaceBackups key={workspaceId} workspaceId={workspaceId} />;
}

function WorkspaceBackups({ workspaceId }: { workspaceId: Id<'workspaces'> }) {
    const [cursor, setCursor] = useState<string | null>(null);
    const result = useQuery(cloudReleaseApi.backups, { workspaceId, paginationOpts: { cursor, numItems: 20 } });
    if (!result) return null;
    return <BackupList key={`${workspaceId}/${result.actorId}`} workspaceId={workspaceId} result={result} cursor={cursor} onCursor={setCursor} />;
}

function BackupList({ workspaceId, result, cursor, onCursor }: {
    workspaceId: Id<'workspaces'>; result: FunctionReturnType<typeof cloudReleaseApi.backups>;
    cursor: string | null; onCursor: (cursor: string | null) => void;
}) {
    const locale = useLocale(), copy = locale.startsWith('sv') ? sv : en;
    const restore = useMutation(cloudReleaseApi.restoreCopy);
    const [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null);
    const [restored, setRestored] = useState<{ backupId: Id<'cloudReleases'>; projectId: Id<'projects'> } | null>(null);
    const running = useRef(false);
    const identity = `${workspaceId}/${result?.actorId ?? ''}`;
    const currentIdentity = useRef(identity); currentIdentity.current = identity;

    async function restoreBackup(backupId: Id<'cloudReleases'>) {
        if (running.current) return;
        running.current = true; setPending(true); setError(null);
        try {
            const saved = await restoreBackupCopy(window.sessionStorage, { workspaceId, actorId: result.actorId, backupId }, copy.restoredName, restore);
            if (currentIdentity.current === identity) setRestored({ backupId, projectId: saved.projectId });
        } catch (cause) {
            const removed = cause instanceof ConvexError && cause.data === 'CLOUD_BACKUP_RESTORE_REMOVED';
            if (currentIdentity.current !== identity) return;
            const code = String(cause);
            setError(removed ? copy.restoreRemoved : code.includes('RESTORE_STORAGE_FAILED') ? copy.restoreStorageFailed : code.includes('CLOUD_PROJECT_LIMIT') ? copy.restoreLimit
                : code.includes('FORBIDDEN') || code.includes('NOT_ALLOWED') ? copy.noAccess : copy.failed);
        } finally {
            running.current = false;
            if (currentIdentity.current === identity) setPending(false);
        }
    }

    if (!result.page.length && result.isDone && cursor === null) return null;
    return <section className="space-y-3 text-sm" aria-label={copy.backupsTitle}>
        <h2 className="font-medium">{copy.backupsTitle}</h2>
        <p className="text-foreground-secondary">{copy.backupsIntro}</p>
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <ul className="divide-border divide-y">
            {result.page.map(backup => <li key={backup.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>{backup.projectName ?? copy.deletedProject}</span>
                    <span className="text-foreground-secondary">{copy.version} {backup.revision}</span>
                </div>
                <p className="text-foreground-secondary text-xs">{new Date(backup.createdAt).toLocaleString(locale)}</p>
                {restored?.backupId === backup.id ? <Button asChild variant="outline" size="sm">
                    <Link href={`/project/${restored.projectId}`}>{copy.openRestored}</Link>
                </Button> : <Button variant="outline" size="sm" disabled={pending} onClick={() => void restoreBackup(backup.id)}>
                    {pending ? copy.preparing : copy.restore}
                </Button>}
            </li>)}
        </ul>
        <div className="flex gap-2">
            {cursor !== null && <Button size="sm" variant="ghost" disabled={pending} onClick={() => onCursor(null)}>{copy.newestBackups}</Button>}
            {!result.isDone && <Button size="sm" variant="ghost" disabled={pending} onClick={() => onCursor(result.continueCursor)}>{copy.olderBackups}</Button>}
        </div>
    </section>;
}
