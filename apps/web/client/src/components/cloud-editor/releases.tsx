'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { useConvex, useMutation, useAction, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { zipSync, strToU8 } from 'fflate';
import type { Id } from '@convex/_generated/dataModel';
import { Button } from '@weblab/ui/button';
import { cloudReleaseApi } from '@/lib/cloud-releases/api';
import { restoreBackupCopy } from '@/lib/cloud-releases/backup-restore';
import { createReleaseIntent, releaseConfirmationChanged, releaseResultUncertain } from '@/lib/cloud-releases/state';
import type { ReleaseIntent } from '@/lib/cloud-releases/state';
import en from '../../../messages/cloud-releases/en.json';
import sv from '../../../messages/cloud-releases/sv.json';

export function CloudReleases({ projectId, branchId, captureDisabled = false }: { projectId: Id<'projects'>; branchId: Id<'branches'>; captureDisabled?: boolean }) {
    const locale = useLocale(), copy = locale.startsWith('sv') ? sv : en;
    const convex = useConvex();
    const status = useQuery(cloudReleaseApi.status, { projectId, branchId });
    const capture = useMutation(cloudReleaseApi.capture), prepare = useAction(cloudReleaseApi.prepare);
    const review = useMutation(cloudReleaseApi.review), request = useMutation(cloudReleaseApi.request), restore = useMutation(cloudReleaseApi.restoreCopy);
    const [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null);
    const [restoredId, setRestoredId] = useState<Id<'projects'> | null>(null);
    const [confirmation, setConfirmation] = useState<ReleaseIntent | null>(null);
    const operationKeys = useRef(new Map<string, string>()), running = useRef<string | null>(null);
    const identity = `${projectId}/${branchId}/${status?.actorId ?? ''}`;
    const currentIdentity = useRef(identity); currentIdentity.current = identity;
    useEffect(() => {
        running.current = null; operationKeys.current.clear();
        setPending(false); setError(null); setRestoredId(null); setConfirmation(null);
    }, [identity]);
    const key = (purpose: string) => {
        const scoped = `${identity}/${purpose}`;
        const value = operationKeys.current.get(scoped) ?? crypto.randomUUID();
        operationKeys.current.set(scoped, value); return value;
    };
    async function run(work: () => Promise<void>) {
        if (running.current) return;
        const runId = crypto.randomUUID();
        running.current = runId; setPending(true); setError(null);
        const startedIdentity = identity;
        try { await work(); }
        catch (cause) {
            if (currentIdentity.current !== startedIdentity) return;
            const code = String(cause);
            setError(cause instanceof ConvexError && cause.data === 'CLOUD_BACKUP_RESTORE_REMOVED' ? copy.restoreRemoved : code.includes('RESTORE_STORAGE_FAILED') ? copy.restoreStorageFailed : code.includes('REVIEW_POPUP_BLOCKED') ? copy.popupBlocked : code.includes('RETENTION_LIMIT') ? copy.limit : code.includes('LIVE_CHANGED') ? copy.liveChanged : code.includes('CONFLICT') ? copy.conflict
                : code.includes('NOT_ALLOWED') || code.includes('FORBIDDEN') ? copy.noAccess : copy.failed);
        } finally {
            if (running.current === runId) running.current = null;
            if (currentIdentity.current === startedIdentity) setPending(false);
        }
    }
    async function snapshot(purpose: 'release' | 'backup') {
        if (!status || captureDisabled) return;
        const releaseId = await capture({ projectId, branchId, expectedRevision: status.revision, operationKey: key(`${purpose}/${status.revision}`), purpose });
        await prepare({ releaseId });
    }
    async function submit(intent: ReleaseIntent) {
        if (!status || status.busy || releaseResultUncertain(status.operations)) return;
        if (releaseConfirmationChanged(intent, status.liveReleaseId)) {
            setError(copy.liveChanged);
            return;
        }
        await request(intent);
        setConfirmation(null);
    }
    async function download(backupId: Id<'cloudReleases'>) {
        const manifest = await convex.query(cloudReleaseApi.backupManifest, { backupId });
        const archive: Record<string, Uint8Array> = { 'backup.json': strToU8(JSON.stringify(manifest, null, 2)) };
        for (const file of manifest.files) {
            if (currentIdentity.current !== identity) throw new Error('Account changed');
            if (file.kind === 'directory') continue;
            const bytes = file.text !== null ? strToU8(file.text) : new Uint8Array(await convex.action(cloudReleaseApi.backupFile, { backupId, path: file.path }));
            const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer));
            if (bytes.byteLength !== file.bytes || [...digest].map(value => value.toString(16).padStart(2, '0')).join('') !== file.hash) throw new Error('Backup verification failed');
            archive[`source/${file.path}`] = bytes;
        }
        if (currentIdentity.current !== identity) return;
        const output = zipSync(archive, { level: 0 });
        const url = URL.createObjectURL(new Blob([Uint8Array.from(output).buffer], { type: 'application/zip' }));
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = `site-backup-${backupId}.zip`; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
    if (!status) return <p className="text-sm text-muted-foreground">{copy.loading}</p>;
    const uncertain = releaseResultUncertain(status.operations);
    const liveChanged = confirmation !== null && releaseConfirmationChanged(confirmation, status.liveReleaseId);
    const publicationBlocked = status.busy || uncertain;
    return <section className="space-y-4 text-sm" aria-label={copy.title}>
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-medium">{copy.title}</h2>
            {status.liveUrl && <a href={status.liveUrl} target="_blank" rel="noreferrer" className="underline">{uncertain ? copy.openSite : copy.openLive}</a>}</div>
        {!status.enabled && <p className="text-muted-foreground">{copy.paused}</p>}
        {status.drifted && <p role="alert">{copy.drifted}</p>}
        {uncertain ? <p role="alert">{copy.unknown}</p> : status.busy && <p role="status">{copy.busy}</p>}
        <div className="flex flex-wrap gap-2">
            {status.canPublish && <Button size="sm" variant="outline" disabled={pending || publicationBlocked || captureDisabled} onClick={() => void run(() => snapshot('release'))}>{copy.prepare}</Button>}
            {status.canBackup && <Button size="sm" variant="outline" disabled={pending || publicationBlocked || captureDisabled} onClick={() => void run(() => snapshot('backup'))}>{copy.backup}</Button>}
        </div>
        {status.buildEnabled && <p className="text-muted-foreground">{copy.buildsLeft}: {status.remainingBuilds}</p>}
        {error && <p role="alert">{error}</p>}
        {pending && <p role="status">{copy.preparing}</p>}
        {restoredId && <Link href={`/project/${restoredId}`} className="underline">{copy.openRestored}</Link>}
        {confirmation && <div className="space-y-2" role="group" aria-label={copy.confirm}>
            <p>{confirmation.kind === 'rollback' ? copy.confirmRollback : copy.confirmPublish}</p>
            {liveChanged && <p role="alert">{copy.liveChanged}</p>}
            <div className="flex gap-2"><Button size="sm" disabled={pending || publicationBlocked || liveChanged || !status.enabled} onClick={() => void run(() => submit(confirmation))}>{copy.confirm}</Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirmation(null)}>{copy.cancel}</Button></div>
        </div>}
        {!status.releases.length && <p className="text-muted-foreground">{copy.empty}</p>}
        <ol className="divide-y divide-border">
            {status.releases.map(release => <li key={release.id} className="space-y-2 py-3">
                <div className="flex flex-wrap justify-between gap-2"><span>{release.purpose === 'backup' ? copy.backupLabel : copy.version} {release.revision}</span>
                    <span className="text-muted-foreground">{status.operations.some(op => op.releaseId === release.id && op.stage === 'unknown') ? copy.unverified
                        : status.liveReleaseId === release.id ? uncertain ? copy.lastConfirmed : copy.live
                        : release.purpose === 'backup' && release.status === 'frozen' ? copy.backupReady : copy[release.status]}</span></div>
                <p className="text-xs text-muted-foreground">{new Date(release.createdAt).toLocaleString(locale)}</p>
                <div className="flex flex-wrap gap-2">
                    {release.status === 'captured' && <Button size="sm" variant="outline" disabled={pending} onClick={() => void run(async () => { await prepare({ releaseId: release.id }); })}>{copy.resume}</Button>}
                    {release.purpose === 'backup' && release.status === 'frozen' && status.canBackup && <>
                        <Button size="sm" variant="outline" disabled={pending} onClick={() => void run(() => download(release.id))}>{copy.download}</Button>
                        <Button size="sm" variant="outline" disabled={pending} onClick={() => void run(async () => {
                            const result = await restoreBackupCopy(window.sessionStorage, {
                                workspaceId: status.workspaceId, actorId: status.actorId, backupId: release.id,
                            }, copy.restoredName, restore);
                            if (currentIdentity.current === identity) setRestoredId(result.projectId);
                        })}>{copy.restore}</Button>
                    </>}
                    {release.purpose === 'release' && release.status === 'frozen' && status.canPublish && <Button size="sm" variant="outline" disabled={pending || !status.buildEnabled || publicationBlocked || status.remainingBuilds < 1} onClick={() => void run(() => submit(createReleaseIntent(release.id, 'build', status.liveReleaseId, key)))}>{copy.build}</Button>}
                    {release.status === 'ready' && <>
                        {release.reviewUrl ? <Button size="sm" variant="outline" asChild><a href={`/cloud-review/${release.id}`} target="_blank" rel="noopener noreferrer">{copy.openReview}</a></Button> : <span className="text-muted-foreground">{copy.reviewUnavailable}</span>}
                        {status.canPublish && release.reviewUrl && !release.reviewed && <Button size="sm" variant="outline" disabled={pending} onClick={() => void run(async () => { await review({ releaseId: release.id, hash: release.hash! }); })}>{copy.reviewed}</Button>}
                        {status.canPublish && release.reviewed && status.liveReleaseId !== release.id && <Button size="sm" disabled={pending || publicationBlocked || !status.enabled} onClick={() => setConfirmation(createReleaseIntent(release.id,
                            status.operations.some(op => op.releaseId === release.id && op.kind !== 'build' && op.stage === 'confirmed') ? 'rollback' : 'publish', status.liveReleaseId, key))}>{status.operations.some(op => op.releaseId === release.id && op.kind !== 'build' && op.stage === 'confirmed') ? copy.rollback : copy.publish}</Button>}
                    </>}
                </div>
            </li>)}
        </ol>
    </section>;
}
