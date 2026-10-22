'use client';

import { useEffect, useRef, useState } from 'react';
import { useLocale } from 'next-intl';
import type { Id } from '@convex/_generated/dataModel';
import { Button } from '@weblab/ui/button';
import { cloudReleaseApi } from '@/lib/cloud-releases/api';
import { useReleaseSession } from '@/lib/cloud-releases/use-release-session';
import { checkPreviousRemoval, guardVersionRemoval, inspectVersionRemoval, isDefiniteRemovalRefusal, previousRemovalNeedsCheck, removeVersion } from '@/lib/cloud-releases/version-removal';
import type { CloudRemovalInspection, CloudRemovalProgress } from '@/lib/cloud-releases/version-removal';
import type { ReleaseSession } from '@/lib/cloud-releases/session';
import en from '../../../messages/cloud-releases/en.json';
import sv from '../../../messages/cloud-releases/sv.json';

type Props = { releaseId: Id<'cloudReleases'>; actorId: Id<'users'>; scope: string; removing?: boolean; disabled?: boolean };
export function CloudVersionRemoval(props: Props) {
    return <RemovalControl key={`${props.scope}/${props.actorId}/${props.releaseId}`} {...props} />;
}
function RemovalControl({ releaseId, actorId, scope, removing, disabled }: Props) {
    const locale = useLocale(), copy = locale.startsWith('sv') ? sv : en;
    const captureSession = useReleaseSession(`${scope}/${actorId}/${releaseId}/removal`);
    const [open, setOpen] = useState(false), [pending, setPending] = useState(false);
    const [selection, setSelection] = useState<CloudRemovalInspection['result'] | null>(null);
    const [progress, setProgress] = useState<CloudRemovalProgress | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [previous, setPrevious] = useState(false);
    const mounted = useRef(false), generation = useRef(0), running = useRef(false);
    const session = useRef<ReleaseSession | null>(null);
    useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; }; }, []);
    function close() {
        generation.current++; running.current = false; session.current = null;
        setOpen(false); setPending(false); setSelection(null); setProgress(null); setError(null); setPrevious(false);
    }
    function failure(cause: unknown) {
        const code = String(cause);
        setError(code.includes('SESSION_CHANGED') || code.includes('ACTOR_CHANGED') || code.includes('FORBIDDEN') || code.includes('NOT_ALLOWED') ? copy.noAccess
            : code.includes('RECOVERY_UNAVAILABLE') ? copy.removalStorageFailed : copy.removalUncertain);
    }
    async function readSelection(captured: ReleaseSession, current: () => boolean) {
        const guard = { session: captured, current, actorId };
        const result = await inspectVersionRemoval({ ...guard, releaseId, inspect: () => captured.call(client => {
            guardVersionRemoval(guard);
            return client.query(cloudReleaseApi.inspectRemoval, { releaseId, expectedActorId: actorId });
        }) });
        const needsCheck = result.result.state === 'available' && previousRemovalNeedsCheck(window.sessionStorage, actorId, result.result.confirmation);
        setPrevious(needsCheck); setSelection(result.result);
        if (result.result.state === 'removed') setProgress(result.result.progress);
    }
    async function inspect() {
        if (running.current || disabled) return;
        const run = ++generation.current;
        running.current = true; setOpen(true); setPending(true); setError(null); setSelection(null); setProgress(null);
        let captured: ReleaseSession | null = null;
        const current = () => mounted.current && generation.current === run;
        try {
            captured = captureSession(); session.current = captured;
            await readSelection(captured, current);
        } catch (cause) { if (current() && (!captured || captured.current)) failure(cause); }
        finally { if (current()) { running.current = false; setPending(false); } }
    }
    async function checkPrevious() {
        if (running.current || !session.current || !previous || disabled) return;
        const run = generation.current, captured = session.current;
        const current = () => mounted.current && generation.current === run;
        const guard = { session: captured, current, actorId };
        running.current = true; setPending(true); setError(null);
        try {
            try {
                const checked = await checkPreviousRemoval({ ...guard, releaseId, storage: window.sessionStorage,
                    begin: args => captured.call(client => { guardVersionRemoval(guard); return client.mutation(cloudReleaseApi.beginRemoval, args); }),
                });
                if (checked.phase === 'done') { setProgress(checked); setPrevious(false); return; }
            } catch (cause) {
                if (!isDefiniteRemovalRefusal(cause)) throw cause;
                guardVersionRemoval(guard);
            }
            // A new inspection can offer a new confirmation; never submit it here.
            await readSelection(captured, current);
        } catch (cause) { if (current() && captured.current) failure(cause); }
        finally { if (current()) { running.current = false; setPending(false); } }
    }
    async function confirm() {
        if (running.current || previous || !session.current || !selection || (selection.state !== 'available' && selection.state !== 'removing')) return;
        const run = generation.current, captured = session.current;
        const current = () => mounted.current && generation.current === run;
        const guard = { session: captured, current, actorId };
        running.current = true; setPending(true); setError(null);
        try {
            await removeVersion({ ...guard, storage: window.sessionStorage, selection,
                begin: args => captured.call(client => { guardVersionRemoval(guard); return client.mutation(cloudReleaseApi.beginRemoval, args); }),
                continueRemoval: args => captured.call(client => { guardVersionRemoval(guard); return client.mutation(cloudReleaseApi.continueRemoval, args); }),
                onProgress: value => { setProgress(value); if (value.phase !== 'done') setSelection({ state: 'removing', version: selection.version, progress: value }); },
            });
        } catch (cause) {
            if (current() && captured.current) {
                if (isDefiniteRemovalRefusal(cause) && selection.state === 'available') {
                    setSelection(null); setProgress(null); setError(copy.removalCheckAgain);
                } else failure(cause);
            }
        }
        finally { if (current()) { running.current = false; setPending(false); } }
    }
    if (!open) return <Button variant="ghost" size="sm" disabled={disabled} onClick={() => void inspect()}>{removing ? copy.resumeRemoval : copy.removeVersion}</Button>;
    const blocked = selection?.state === 'blocked' ? selection : null;
    const reasons = { 'live-version': copy.removalLive, 'release-operation-pending': copy.removalPending, 'required-by-version': copy.removalRequired, building: copy.removalBuilding, 'version-changed': copy.conflict, 'version-unavailable': copy.removalUnavailable };
    return <div className="w-full space-y-2 rounded border border-border p-3" role="group" aria-label={copy.removeVersion}>
        {progress?.phase === 'done' ? <p role="status">{copy.removalDone}</p> : <>
            {previous && <p>{copy.previousRemovalRequest}</p>}
            {selection && !blocked && !previous && <p>{selection.state === 'removing' ? copy.confirmResumeRemoval : copy.confirmRemoval}</p>}
            {blocked && <p>{reasons[blocked.reason]}{blocked.dependentVersion && <> {copy.version} {blocked.dependentVersion.revision} · {new Date(blocked.dependentVersion.createdAt).toLocaleString(locale)}</>}</p>}
            {pending && <p role="status">{copy.preparing}</p>}
            {error && <p role="alert">{error}</p>}
        </>}
        <div className="flex flex-wrap gap-2">
            {progress?.phase !== 'done' && previous && <Button variant="outline" size="sm" disabled={pending || disabled} onClick={() => void checkPrevious()}>{copy.checkPreviousRemoval}</Button>}
            {progress?.phase !== 'done' && !previous && (selection?.state === 'available' || selection?.state === 'removing') && <Button variant="destructive" size="sm" disabled={pending || disabled} onClick={() => void confirm()}>{selection.state === 'removing' ? copy.resumeRemoval : copy.removeVersion}</Button>}
            {!selection && !pending && <Button size="sm" variant="outline" onClick={() => void inspect()}>{copy.retryReview}</Button>}
            <Button size="sm" variant="ghost" onClick={close}>{copy.closeRemoval}</Button>
        </div>
    </div>;
}
