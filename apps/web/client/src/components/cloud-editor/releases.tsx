'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@clerk/nextjs';
import { useLocale } from 'next-intl';
import { useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { zipSync, strToU8 } from 'fflate';
import type { Id } from '@convex/_generated/dataModel';
import { Button } from '@weblab/ui/button';
import { env } from '@/env';
import { readImportedPreparation, preparationPending, saveImportedReviewSource, resumeImportedPreparation, prepareImportedPrivateReview, readImportedBuild, privateBuildIntent, requestImportedPrivateBuild, reconcileImportedPrivateBuild } from '@/lib/cloud-releases/imported-hosting-flow';
import type { ImportedHostingIO, ImportedHostingOwner, ImportedPreparation, ImportedBuild, PrivateBuildIntent } from '@/lib/cloud-releases/imported-hosting-flow';
import { cloudReleaseApi } from '@/lib/cloud-releases/api';
import { restoreBackupCopy } from '@/lib/cloud-releases/backup-restore';
import { useReleaseSession } from '@/lib/cloud-releases/use-release-session';
import type { ReleaseSession } from '@/lib/cloud-releases/session';
import { createReleaseIntent, releaseConfirmationChanged, releaseResultUncertain } from '@/lib/cloud-releases/state';
import type { ReleaseIntent } from '@/lib/cloud-releases/state';
import { CloudVersionRemoval } from './version-removal';
import en from '../../../messages/cloud-releases/en.json';
import sv from '../../../messages/cloud-releases/sv.json';

type Props = { projectId: Id<'projects'>; branchId: Id<'branches'>; captureDisabled?: boolean; hideTitle?: boolean };
export function CloudReleases(props: Props) {
    const { session } = useSession();
    return session ? <ReleaseList key={`${props.projectId}/${props.branchId}/${session.id}`} {...props} /> : null;
}

function ReleaseList({ projectId, branchId, captureDisabled = false, hideTitle = false }: Props) {
    const locale = useLocale(), copy = locale.startsWith('sv') ? sv : en;
    const { session: clerkSession } = useSession();
    const captureSession = useReleaseSession(`${projectId}/${branchId}`);
    const status = useQuery(cloudReleaseApi.status, { projectId, branchId });
    const [pending, setPending] = useState(false), [error, setError] = useState<string | null>(null);
    const [restoredId, setRestoredId] = useState<Id<'projects'> | null>(null);
    const [confirmation, setConfirmation] = useState<ReleaseIntent | null>(null);
    const [privateConfirmation, setPrivateConfirmation] = useState<{ request: PrivateBuildIntent; hash: string } | null>(null);
    const [preparation, setPreparation] = useState<ImportedPreparation | null>(null);
    const [buildRequests, setBuildRequests] = useState<Record<string, ImportedBuild>>({});
    const [storageFailed, setStorageFailed] = useState(false), [storageEpoch, setStorageEpoch] = useState(0);
    const operationKeys = useRef(new Map<string, string>()), running = useRef<string | null>(null);
    const captureBlocked = useRef(captureDisabled); captureBlocked.current = captureDisabled;
    const identity = `${projectId}/${branchId}/${status?.actorId ?? ''}`;
    const currentIdentity = useRef(identity); currentIdentity.current = identity;
    useEffect(() => {
        running.current = null; operationKeys.current.clear();
        setPending(false); setError(null); setRestoredId(null); setConfirmation(null); setPrivateConfirmation(null);
    }, [identity]);
    const owner: ImportedHostingOwner | null = status && clerkSession && env.NEXT_PUBLIC_CONVEX_URL ? {
        workspaceId: status.workspaceId, projectId, branchId, actorId: status.actorId,
        clerkUserId: clerkSession.user.id, backend: env.NEXT_PUBLIC_CONVEX_URL,
    } : null;
    const ownerKey = owner ? JSON.stringify(owner) : '';
    const releaseIds = status?.releases.map(row => row.id).join('/') ?? '';
    useEffect(() => {
        setPreparation(null); setBuildRequests({}); setStorageFailed(false);
        if (!ownerKey || status?.profile !== 'imported-next-v1') return;
        try {
            const captured = JSON.parse(ownerKey) as ImportedHostingOwner;
            setPreparation(readImportedPreparation(window.sessionStorage, captured));
            const saved: Record<string, ImportedBuild> = {};
            for (const releaseId of releaseIds.split('/').filter(Boolean)) {
                const record = readImportedBuild(window.sessionStorage, captured, releaseId as Id<'cloudReleases'>);
                if (record) saved[releaseId] = record;
            }
            setBuildRequests(saved);
        } catch { setStorageFailed(true); }
    }, [ownerKey, releaseIds, storageEpoch, status?.profile]);
    function hostingIO(session: ReleaseSession, freshCapture = false): ImportedHostingIO {
        if (!owner) throw new Error('CLOUD_RELEASE_SESSION_CHANGED');
        const captured = Object.freeze({ ...owner });
        return { owner: captured, storage: window.sessionStorage, session,
            status: () => session.call(client => client.query(cloudReleaseApi.status, { projectId: captured.projectId, branchId: captured.branchId })),
            capture: args => session.call(client => {
                // Saved requests reconcile at their original revision even if today's source is dirty.
                if (freshCapture && captureBlocked.current) throw new Error('CLOUD_CONFLICT');
                return client.mutation(cloudReleaseApi.capture, args);
            }),
            prepare: args => session.call(client => client.action(cloudReleaseApi.prepare, args)),
            prepareHosting: args => session.call(client => client.action(cloudReleaseApi.prepareHosting, args)),
            request: args => session.call(client => client.mutation(cloudReleaseApi.request, args)),
        };
    }
    const key = (purpose: string) => {
        const scoped = `${identity}/${purpose}`;
        const value = operationKeys.current.get(scoped) ?? crypto.randomUUID();
        operationKeys.current.set(scoped, value); return value;
    };
    async function run(work: (session: ReleaseSession) => Promise<void>) {
        if (running.current) return;
        const runId = crypto.randomUUID();
        running.current = runId; setPending(true); setError(null);
        const startedIdentity = identity;
        let session: ReleaseSession | null = null;
        try {
            if (!status) return;
            session = captureSession();
            await session.verifyActor(status.actorId, client => client.query(cloudReleaseApi.status, { projectId, branchId }));
            await work(session);
        }
        catch (cause) {
            if (currentIdentity.current !== startedIdentity || (session && !session.current)) return;
            const code = String(cause);
            setError(code.includes('CLOUD_RELEASE_REMOVED') ? copy.privateVersionRemoved : code.includes('CLOUD_HOSTING_RECOVERY_UNAVAILABLE') ? copy.privateRecoveryUnavailable : code.includes('CLOUD_HOSTING_PREVIOUS_REQUEST') ? copy.privatePreviousRequest : cause instanceof ConvexError && cause.data === 'CLOUD_BACKUP_RESTORE_REMOVED' ? copy.restoreRemoved : code.includes('RESTORE_STORAGE_FAILED') ? copy.restoreStorageFailed : code.includes('REVIEW_POPUP_BLOCKED') ? copy.popupBlocked : code.includes('RETENTION_LIMIT') ? copy.limit : code.includes('LIVE_CHANGED') ? copy.liveChanged : code.includes('CONFLICT') ? copy.conflict
                : code.includes('SESSION_CHANGED') || code.includes('ACTOR_CHANGED') || code.includes('NOT_ALLOWED') || code.includes('FORBIDDEN') ? copy.noAccess : copy.failed);
        } finally {
            if (running.current === runId) running.current = null;
            if (currentIdentity.current === startedIdentity && (!session || session.current)) { setPending(false); setStorageEpoch(value => value + 1); }
        }
    }
    async function snapshot(session: ReleaseSession, purpose: 'release' | 'backup') {
        if (!status || captureDisabled) return;
        const releaseId = await session.call(client => client.mutation(cloudReleaseApi.capture, { projectId, branchId, expectedRevision: status.revision, operationKey: key(`${purpose}/${status.revision}`), purpose, expectedActorId: status.actorId }));
        await session.call(client => client.action(cloudReleaseApi.prepare, { releaseId, expectedActorId: status.actorId }));
    }
    async function submit(session: ReleaseSession, intent: ReleaseIntent) {
        if (!status || status.busy || releaseResultUncertain(status.operations)) return;
        if (releaseConfirmationChanged(intent, status.liveReleaseId)) {
            setError(copy.liveChanged);
            return;
        }
        await session.call(client => client.mutation(cloudReleaseApi.request, intent));
        session.guard();
        setConfirmation(null);
    }
    async function download(session: ReleaseSession, backupId: Id<'cloudReleases'>) {
        const manifest = await session.call(client => client.query(cloudReleaseApi.backupManifest, { backupId }));
        if (manifest.version !== 1) throw new Error('CLOUD_BACKUP_DOWNLOAD_UNAVAILABLE');
        const archive: Record<string, Uint8Array> = { 'backup.json': strToU8(JSON.stringify(manifest, null, 2)) };
        for (const file of manifest.files) {
            session.guard();
            if (file.kind === 'directory') continue;
            const bytes = file.text !== null ? strToU8(file.text) : new Uint8Array(await session.call(client => client.action(cloudReleaseApi.backupFile, { backupId, path: file.path })));
            const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(bytes).buffer));
            if (bytes.byteLength !== file.bytes || [...digest].map(value => value.toString(16).padStart(2, '0')).join('') !== file.hash) throw new Error('Backup verification failed');
            archive[`source/${file.path}`] = bytes;
        }
        session.guard();
        const output = zipSync(archive, { level: 0 });
        const url = URL.createObjectURL(new Blob([Uint8Array.from(output).buffer], { type: 'application/zip' }));
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = `site-backup-${backupId}.zip`; anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
    }
    if (!status) return <p className="text-sm text-muted-foreground">{copy.loading}</p>;
    const imported = status.profile === 'imported-next-v1';
    const title = imported ? copy.importedVersionsTitle : copy.title;
    const releases = status.releases;
    const uncertain = releaseResultUncertain(status.operations);
    const liveChanged = confirmation !== null && releaseConfirmationChanged(confirmation, status.liveReleaseId);
    const publicationBlocked = status.busy || uncertain;
    const preparingPrivate = preparationPending(preparation);
    const privateReasons = { 'not-configured': copy.privateNotConfigured, paused: copy.privatePaused, 'no-builds': copy.privateNoBuilds, busy: copy.privateBusy, unknown: copy.privateUnknown };
    const privateReason = status.privateBuildReason;
    return <section className="space-y-4 text-sm" aria-label={title}>
        {(!hideTitle || status.liveUrl) && <div className="flex flex-wrap items-center justify-between gap-2">
            {!hideTitle && <h2 className="font-medium">{title}</h2>}
            {status.liveUrl && <a href={status.liveUrl} target="_blank" rel="noreferrer" className="underline">{uncertain ? copy.openSite : copy.openLive}</a>}</div>}
        {!imported && !status.enabled && <p className="text-muted-foreground">{copy.paused}</p>}
        {imported && !status.canBackup && !status.canRestoreBackup && releases.some(row => row.kind === 'backup') && <p className="text-muted-foreground">{copy.backupsPaused}</p>}
        {!imported && status.drifted && <p role="alert">{copy.drifted}</p>}
        {!imported && (uncertain ? <p role="alert">{copy.unknown}</p> : status.busy && <p role="status">{copy.busy}</p>)}
        {imported && privateReason && <p role={privateReason === 'unknown' ? 'alert' : 'status'}>{privateReasons[privateReason]}</p>}
        <div className="flex flex-wrap gap-2">
            {imported && status.canFreezePrivateArtifact && <Button size="sm" variant="outline" disabled={pending || captureDisabled || preparingPrivate || storageFailed} onClick={() => void run(async session => { if (captureBlocked.current) throw new Error('CLOUD_CONFLICT'); await saveImportedReviewSource(hostingIO(session, true), status.revision); })}>{copy.saveReviewVersion}</Button>}
            {status.canPublish && <Button size="sm" variant="outline" disabled={pending || publicationBlocked || captureDisabled} onClick={() => void run(session => snapshot(session, 'release'))}>{copy.prepare}</Button>}
            {status.canBackup && <Button size="sm" variant="outline" disabled={pending || publicationBlocked || captureDisabled} onClick={() => void run(session => snapshot(session, 'backup'))}>{copy.backup}</Button>}
        </div>
        {(status.buildEnabled || imported) && <p className="text-muted-foreground">{copy.buildsLeft}: {status.remainingBuilds}</p>}
        {imported && storageFailed && <p role="alert">{copy.privateRecoveryUnavailable}</p>}
        {imported && preparingPrivate && <div className="space-y-2"><p>{copy.privatePreviousRequest}</p><Button size="sm" variant="outline" disabled={pending || storageFailed} onClick={() => void run(async session => { await resumeImportedPreparation(hostingIO(session)); })}>{copy.checkPreviousRemoval}</Button></div>}
        {imported && preparation?.stage === 'refused' && <p role="status">{copy.privateCaptureChanged}</p>}
        {imported && preparation?.stage === 'removed' && <p role="status">{copy.privateVersionRemoved}</p>}
        {error && !(imported && storageFailed && error === copy.privateRecoveryUnavailable) && <p role="alert">{error}</p>}
        {pending && <p role="status">{copy.preparing}</p>}
        {restoredId && <Link href={`/project/${restoredId}`} className="underline">{copy.openRestored}</Link>}
        {imported && privateConfirmation && <div className="space-y-2" role="group" aria-label={copy.confirmPrivateBuild}>
            <p>{copy.confirmPrivateBuild}</p>
            {privateConfirmation.request.expectedLiveReleaseId !== status.liveReleaseId && <p role="alert">{copy.liveChanged}</p>}
            <div className="flex gap-2"><Button size="sm" disabled={pending || !status.canBuildPrivateReview || storageFailed || !!buildRequests[privateConfirmation.request.releaseId] || privateConfirmation.request.expectedLiveReleaseId !== status.liveReleaseId}
                onClick={() => void run(async session => {
                    await requestImportedPrivateBuild(hostingIO(session), privateConfirmation.request, privateConfirmation.hash);
                    session.guard(); setPrivateConfirmation(null);
                })}>{copy.confirm}</Button><Button size="sm" variant="ghost" disabled={pending} onClick={() => setPrivateConfirmation(null)}>{copy.cancel}</Button></div>
        </div>}
        {confirmation && <div className="space-y-2" role="group" aria-label={copy.confirm}>
            <p>{confirmation.kind === 'rollback' ? copy.confirmRollback : copy.confirmPublish}</p>
            {liveChanged && <p role="alert">{copy.liveChanged}</p>}
            <div className="flex gap-2"><Button size="sm" disabled={pending || publicationBlocked || liveChanged || !status.enabled} onClick={() => void run(session => submit(session, confirmation))}>{copy.confirm}</Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => setConfirmation(null)}>{copy.cancel}</Button></div>
        </div>}
        {!releases.length && <p className="text-muted-foreground">{copy.empty}</p>}
        <ol className="divide-y divide-border">
            {releases.map(release => <li key={release.id} className="space-y-2 py-3">
                <div className="flex flex-wrap justify-between gap-2"><span>{release.kind === 'backup' ? copy.backupLabel : release.kind === 'private-artifact' ? copy.savedReviewSource : release.kind === 'protected-version' ? copy.privateReview : copy.version} {release.revision}</span>
                    <span className="text-muted-foreground">{release.removal ? copy.removalPaused : status.operations.some(op => op.releaseId === release.id && op.stage === 'unknown') ? imported ? copy.privateUnverified : copy.unverified
                        : status.liveReleaseId === release.id ? uncertain ? copy.lastConfirmed : copy.live
                        : imported && release.kind === 'private-artifact' && release.status === 'frozen' ? copy.savedReviewSource : release.purpose === 'backup' && release.status === 'frozen' ? copy.backupReady : copy[release.status]}</span></div>
                <p className="text-xs text-muted-foreground">{new Date(release.createdAt).toLocaleString(locale)}</p>
                <div className="flex flex-wrap gap-2">
                    {imported && release.preparationOwnerRequired && <span className="text-muted-foreground">{copy.privateCreatorRequired}</span>}
                    {imported && release.canFinishPreparing && <Button size="sm" variant="outline" disabled={pending || preparingPrivate || storageFailed} onClick={() => void run(async session => {
                        await saveImportedReviewSource(hostingIO(session), release.revision, release.id);
                    })}>{copy.finishPrivatePreparing}</Button>}
                    {imported && release.canPreparePrivateReview && <Button size="sm" variant="outline" disabled={pending || preparingPrivate || storageFailed} onClick={() => void run(async session => {
                        await prepareImportedPrivateReview(hostingIO(session), { releaseId: release.id, hash: release.hash! }, status.liveReleaseId);
                    })}>{copy.preparePrivateReview}</Button>}
                    {imported && release.canBuildPrivateReview && !buildRequests[release.id] && <Button size="sm" variant="outline" disabled={pending || storageFailed || !owner} onClick={() => {
                        if (owner && release.hash) setPrivateConfirmation({ request: privateBuildIntent(owner, release.id, status.liveReleaseId), hash: release.hash });
                    }}>{copy.buildPrivateReview}</Button>}
                    {imported && buildRequests[release.id] && buildRequests[release.id]!.stage !== 'terminal' && !release.removal && <Button size="sm" variant="outline" disabled={pending || storageFailed} onClick={() => void run(async session => {
                        await reconcileImportedPrivateBuild(hostingIO(session), release.id);
                    })}>{copy.checkPrivateBuild}</Button>}
                    {imported && release.kind === 'protected-version' && !release.removal && release.reviewUrl && <Button size="sm" variant="outline" asChild><a href={`/cloud-review/${release.id}`} target="_blank" rel="noopener noreferrer">{copy.openReview}</a></Button>}
                    {!release.removal && release.purpose !== 'private-artifact' && release.kind !== 'protected-version' && release.status === 'captured' && <Button size="sm" variant="outline" disabled={pending} onClick={() => void run(async session => { await session.call(client => client.action(cloudReleaseApi.prepare, { releaseId: release.id, expectedActorId: status.actorId })); })}>{copy.resume}</Button>}
                    {!release.removal && release.purpose === 'backup' && release.status === 'frozen' && (imported || status.canRestoreBackup || release.canDownload) && <>
                        {release.canDownload ? <Button size="sm" variant="outline" disabled={pending} onClick={() => void run(session => download(session, release.id))}>{copy.download}</Button> : imported ? <span className="text-muted-foreground">{copy.downloadUnavailable}</span> : null}
                        <Button size="sm" variant="outline" disabled={pending || !status.canRestoreBackup} onClick={() => void run(async session => {
                            const result = await restoreBackupCopy(window.sessionStorage, {
                                workspaceId: status.workspaceId, actorId: status.actorId, backupId: release.id,
                            }, copy.restoredName, args => session.call(client => client.mutation(cloudReleaseApi.restoreCopy, { ...args, expectedActorId: status.actorId })));
                            session.guard();
                            if (currentIdentity.current === identity) setRestoredId(result.projectId);
                        })}>{copy.restore}</Button>
                    </>}
                    {!imported && !release.removal && release.purpose === 'release' && release.status === 'frozen' && status.canPublish && <Button size="sm" variant="outline" disabled={pending || !status.buildEnabled || publicationBlocked || status.remainingBuilds < 1} onClick={() => void run(session => submit(session, createReleaseIntent(release.id, 'build', status.liveReleaseId, key)))}>{copy.build}</Button>}
                    {!imported && !release.removal && release.status === 'ready' && <>
                        {release.reviewUrl ? <Button size="sm" variant="outline" asChild><a href={`/cloud-review/${release.id}`} target="_blank" rel="noopener noreferrer">{copy.openReview}</a></Button> : <span className="text-muted-foreground">{copy.reviewUnavailable}</span>}
                        {status.canPublish && release.reviewUrl && !release.reviewed && <Button size="sm" variant="outline" disabled={pending} onClick={() => void run(async session => { await session.call(client => client.mutation(cloudReleaseApi.review, { releaseId: release.id, hash: release.hash! })); })}>{copy.reviewed}</Button>}
                        {status.canPublish && release.reviewed && status.liveReleaseId !== release.id && <Button size="sm" disabled={pending || publicationBlocked || !status.enabled} onClick={() => setConfirmation(createReleaseIntent(release.id,
                            status.operations.some(op => op.releaseId === release.id && op.kind !== 'build' && op.stage === 'confirmed') ? 'rollback' : 'publish', status.liveReleaseId, key))}>{status.operations.some(op => op.releaseId === release.id && op.kind !== 'build' && op.stage === 'confirmed') ? copy.rollback : copy.publish}</Button>}
                    </>}
                    {release.canManageVersions && <CloudVersionRemoval releaseId={release.id} actorId={status.actorId} scope={`${projectId}/${branchId}`} removing={!!release.removal} disabled={pending} />}
                </div>
            </li>)}
        </ol>
    </section>;
}
