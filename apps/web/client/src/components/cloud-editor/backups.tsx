'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@clerk/nextjs';
import { useLocale } from 'next-intl';
import { useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import type { CloudRetainedVersionPage } from '@/lib/cloud-releases/version-removal';
import { CloudVersionRemoval } from './version-removal';
import type { Id } from '@convex/_generated/dataModel';
import { Button } from '@weblab/ui/button';
import { cloudReleaseApi } from '@/lib/cloud-releases/api';
import { restoreBackupCopy } from '@/lib/cloud-releases/backup-restore';
import { useReleaseSession } from '@/lib/cloud-releases/use-release-session';
import type { ReleaseSession } from '@/lib/cloud-releases/session';
import en from '../../../messages/cloud-releases/en.json';
import sv from '../../../messages/cloud-releases/sv.json';

export function CloudBackups({ workspaceId }: { workspaceId: Id<'workspaces'> }) {
    const { session } = useSession();
    return session ? <WorkspaceBackups key={`${workspaceId}/${session.id}`} workspaceId={workspaceId} /> : null;
}

function WorkspaceBackups({ workspaceId }: { workspaceId: Id<'workspaces'> }) {
    const actor = useQuery(cloudReleaseApi.backups, { workspaceId, paginationOpts: { cursor: null, numItems: 1 } });
    return actor ? <RetainedPages key={`${workspaceId}/${actor.actorId}`} workspaceId={workspaceId} actorId={actor.actorId} /> : null;
}
function RetainedPages({ workspaceId, actorId }: { workspaceId: Id<'workspaces'>; actorId: Id<'users'> }) {
    const [cursors, setCursors] = useState<(string | null)[]>([null]);
    const cursor = cursors[cursors.length - 1] ?? null;
    return <RetainedPage key={cursor ?? 'first'} workspaceId={workspaceId} actorId={actorId} cursor={cursor} first={cursors.length === 1}
        onOlder={next => setCursors(old => old.includes(next) ? old : [...old, next])}
        onNewer={() => setCursors(old => old.length > 1 ? old.slice(0, -1) : old)} />;
}
function RetainedPage({ workspaceId, actorId, cursor, first, onOlder, onNewer }: {
    workspaceId: Id<'workspaces'>; actorId: Id<'users'>; cursor: string | null; first: boolean;
    onOlder: (cursor: string) => void; onNewer: () => void;
}) {
    const locale = useLocale(), copy = locale.startsWith('sv') ? sv : en;
    const result = useQuery(cloudReleaseApi.retainedVersions, { workspaceId, expectedActorId: actorId, cursor });
    if (!result) return <p className="text-sm text-foreground-secondary" role="status">{copy.loading}</p>;
    if (result.actorId !== actorId || result.workspaceId !== workspaceId) return null;
    return <BackupList workspaceId={workspaceId} result={result} first={first} onOlder={onOlder} onNewer={onNewer} />;
}
function BackupList({ workspaceId, result, first, onOlder, onNewer }: {
    workspaceId: Id<'workspaces'>; result: CloudRetainedVersionPage; first: boolean;
    onOlder: (cursor: string) => void; onNewer: () => void;
}) {
    const locale = useLocale(), copy = locale.startsWith('sv') ? sv : en;
    const captureSession = useReleaseSession(`${workspaceId}/${result.actorId}`);
    const [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null);
    const [restored, setRestored] = useState<{ backupId: Id<'cloudReleases'>; projectId: Id<'projects'> } | null>(null);
    const running = useRef(false);
    const identity = `${workspaceId}/${result?.actorId ?? ''}`;
    const currentIdentity = useRef(identity); currentIdentity.current = identity;

    async function restoreBackup(backupId: Id<'cloudReleases'>) {
        if (running.current) return;
        running.current = true; setPending(true); setError(null);
        let session: ReleaseSession | null = null;
        try {
            const captured = captureSession(); session = captured;
            await captured.verifyActor(result.actorId, client => client.query(cloudReleaseApi.retainedVersions, { workspaceId, expectedActorId: result.actorId, cursor: null }));
            const saved = await restoreBackupCopy(window.sessionStorage, { workspaceId, actorId: result.actorId, backupId }, copy.restoredName, args => captured.call(client => client.mutation(cloudReleaseApi.restoreCopy, { ...args, expectedActorId: result.actorId })));
            captured.guard();
            if (currentIdentity.current === identity) setRestored({ backupId, projectId: saved.projectId });
        } catch (cause) {
            const removed = cause instanceof ConvexError && cause.data === 'CLOUD_BACKUP_RESTORE_REMOVED';
            if (currentIdentity.current !== identity || (session && !session.current)) return;
            const code = String(cause);
            setError(removed ? copy.restoreRemoved : code.includes('RESTORE_STORAGE_FAILED') ? copy.restoreStorageFailed : code.includes('CLOUD_PROJECT_LIMIT') ? copy.restoreLimit
                : code.includes('SESSION_CHANGED') || code.includes('ACTOR_CHANGED') || code.includes('FORBIDDEN') || code.includes('NOT_ALLOWED') ? copy.noAccess : copy.failed);
        } finally {
            running.current = false;
            if (currentIdentity.current === identity && (!session || session.current)) setPending(false);
        }
    }

    if (!result.page.length && result.isDone && first) return null;
    return <section className="space-y-3 text-sm" aria-label={copy.retainedVersionsTitle}>
        <h2 className="font-medium">{copy.retainedVersionsTitle}</h2>
        <p className="text-foreground-secondary">{copy.retainedVersionsIntro}</p>
        {error && <p role="alert" className="text-destructive">{error}</p>}
        <ul className="divide-border divide-y">
            {result.page.map(backup => <li key={backup.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>{backup.projectName ?? copy.deletedProject}</span>
                    <span className="text-foreground-secondary">{backup.kind === 'backup' ? copy.backupLabel : backup.kind === 'private-artifact' ? copy.privateArtifact : backup.kind === 'protected-version' ? copy.protectedVersion : copy.version} {backup.revision}</span>
                </div>
                <p className="text-foreground-secondary text-xs">{new Date(backup.createdAt).toLocaleString(locale)}</p>
                {backup.removal && <p className="text-foreground-secondary">{copy.removalPaused}</p>}
                {!backup.removal && backup.kind === 'backup' && (restored?.backupId === backup.id ? <Button asChild variant="outline" size="sm">
                    <Link href={`/project/${restored.projectId}`}>{copy.openRestored}</Link>
                </Button> : <Button variant="outline" size="sm" disabled={pending || !backup.canRestore} onClick={() => void restoreBackup(backup.id)}>
                    {pending ? copy.preparing : copy.restore}
                </Button>)}
                {backup.canManageVersions && <CloudVersionRemoval releaseId={backup.id} actorId={result.actorId} scope={workspaceId} removing={!!backup.removal} disabled={pending} />}
            </li>)}
        </ul>
        <div className="flex gap-2">
            {!first && <Button size="sm" variant="ghost" disabled={pending} onClick={onNewer}>{copy.newerVersions}</Button>}
            {!result.isDone && <Button size="sm" variant="ghost" disabled={pending} onClick={() => onOlder(result.continueCursor)}>{copy.olderVersions}</Button>}
        </div>
    </section>;
}
