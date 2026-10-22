'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useClerk, useSession } from '@clerk/nextjs';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ConvexHttpClient } from 'convex/browser';
import type { Id } from '@convex/_generated/dataModel';
import { Button } from '@weblab/ui/button';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { env } from '@/env';
import { cloudImportApi, type ImportAccess } from '@/lib/cloud-imports/api';
import { useCloudImportCopy } from '@/lib/cloud-imports/copy';
import { reviewImportFolder, safeImportCode, type FolderReview } from '@/lib/cloud-imports/manifest';
import { CloudImportSession, type ImportSessionState } from '@/lib/cloud-imports/session';

type Props = { workspaceId: Id<'workspaces'>; workspaceSlug: string };
export function CloudImportProject(props: Props) {
    const { isLoaded, session } = useSession();
    const copy = useCloudImportCopy();
    return <main className="mx-auto flex w-full max-w-lg flex-col gap-5 p-8">
        <Button asChild variant="link" className="self-start"><Link href={`/w/${encodeURIComponent(props.workspaceSlug)}/cloud-pilot`}>{copy.back}</Link></Button>
        <header><h1 className="text-xl font-medium">{copy.title}</h1><p className="text-foreground-secondary mt-2 text-sm">{copy.intro}</p></header>
        {!isLoaded ? <p role="status">{copy.loading}</p> : !session ? <Link href="/sign-in" className="underline">{copy.signIn}</Link>
            : <ImportForm key={`${props.workspaceId}/${session.id}`} {...props} />}
    </main>;
}

function ImportForm({ workspaceId }: Props) {
    const { session } = useSession(), clerk = useClerk(), router = useRouter(), copy = useCloudImportCopy();
    const [access, setAccess] = useState<ImportAccess | null>(null);
    const [state, setState] = useState<ImportSessionState | null>(null);
    const [review, setReview] = useState<FolderReview | null>(null), [name, setName] = useState('');
    const [analyzing, setAnalyzing] = useState(false), [currentFile, setCurrentFile] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null), [directorySupported, setDirectorySupported] = useState<boolean | null>(null);
    const controller = useRef<CloudImportSession | null>(null), analysis = useRef<AbortController | null>(null);
    const input = useRef<HTMLInputElement>(null), heading = useRef<HTMLHeadingElement>(null), errorElement = useRef<HTMLParagraphElement>(null);
    const inputId = useId(), nameId = useId();
    const identity = `${workspaceId}/${session?.id ?? ''}/${session?.user.id ?? ''}`;
    const current = useRef<string | null>(identity); current.current = identity;

    useEffect(() => {
        if (!session) return;
        const captured = session, backend = env.NEXT_PUBLIC_CONVEX_URL;
        let live = true;
        const owns = () => live && current.current === identity && clerk.session?.id === captured.id && clerk.user?.id === captured.user.id;
        const guard = () => { if (!owns()) throw new Error('CLOUD_IMPORT_SESSION_CHANGED'); };
        async function client() {
            guard(); if (!backend) throw new Error('CLOUD_IMPORT_DISABLED');
            const token = await captured.getToken({ template: 'convex' }); guard();
            if (!token) throw new Error('CLOUD_IMPORT_SESSION_CHANGED');
            const bound = new ConvexHttpClient(backend); bound.setAuth(token); return bound;
        }
        async function call<T>(work: (bound: ConvexHttpClient) => Promise<T>): Promise<T> {
            const bound = await client(); guard(); return work(bound);
        }
        setDirectorySupported('webkitdirectory' in document.createElement('input'));
        input.current?.setAttribute('webkitdirectory', '');
        void (async () => {
            try {
                const access = await call(bound => bound.query(cloudImportApi.access, { workspaceId })); guard(); setAccess(access);
                if (!backend) throw new Error('CLOUD_IMPORT_DISABLED');
                const value = new CloudImportSession({ backend, workspaceId, actorId: access.actorId, sessionId: captured.id, userId: captured.user.id }, {
                    storage: window.sessionStorage, current: owns, enabled: () => access.enabled,
                    begin: args => call(bound => bound.mutation(cloudImportApi.begin, args)),
                    status: args => call(bound => bound.query(cloudImportApi.status, args)),
                    findAttempt: args => call(bound => bound.query(cloudImportApi.findAttempt, args)),
                    finalize: args => call(bound => bound.mutation(cloudImportApi.finalize, args)),
                    cancel: args => call(bound => bound.mutation(cloudImportApi.cancel, args)),
                    upload: async ({ attemptId, index, file, hash, signal }) => {
                        guard(); const token = await captured.getToken(); guard(); signal.throwIfAborted();
                        if (!token) throw new Error('CLOUD_IMPORT_SESSION_CHANGED');
                        const response = await fetch(`/api/cloud-imports/${encodeURIComponent(attemptId)}/${index}`, {
                            method: 'POST', body: file, signal, credentials: 'omit', cache: 'no-store', redirect: 'error',
                            headers: { 'Content-Type': 'application/octet-stream', 'X-Weblab-Content-Sha256': hash, Authorization: `Bearer ${token}` },
                        });
                        guard(); if (!response.ok) throw new Error('CLOUD_IMPORT_UPLOAD_UNCONFIRMED');
                    },
                    changed: next => { if (owns()) setState(next); },
                    completed: projectId => { guard(); router.push(`/project/${projectId}`); },
                });
                controller.current = value; await value.initialize();
            } catch (cause) { if (owns()) setError(safeImportCode(cause)); }
        })();
        return () => { live = false; controller.current?.dispose(); controller.current = null; analysis.current?.abort(); };
    }, [identity, workspaceId, session, clerk, router]);

    const shownError = error ?? state?.error;
    useEffect(() => { if (shownError) errorElement.current?.focus(); }, [shownError]);
    useEffect(() => { if (review) heading.current?.focus(); }, [review]);
    const recovery = state?.recovery;
    const blocked = analyzing || state?.busy || !controller.current || (!state?.recovery && state?.error?.startsWith('CLOUD_IMPORT_RECOVERY_'));
    const canSelect = !blocked && !!directorySupported && (recovery ? !recovery.cancelRequested && state?.phase !== 'complete' && state?.phase !== 'canceled' : access?.enabled);
    async function choose(files: File[]) {
        if (!controller.current || !canSelect) return;
        analysis.current?.abort(); const abort = new AbortController(); analysis.current = abort;
        setAnalyzing(true); setError(null);
        const captured = controller.current;
        try {
            const result = await reviewImportFolder(files, abort.signal, path => { if (!abort.signal.aborted) setCurrentFile(path); });
            abort.signal.throwIfAborted(); if (captured !== controller.current) return;
            const chosenName = recovery?.name ?? result.folderName.slice(0, 80);
            if (result.manifest) captured.attach(result, chosenName);
            setName(chosenName); setReview(result);
        } catch (cause) { if (!abort.signal.aborted && captured === controller.current) setError(safeImportCode(cause)); }
        finally { if (!abort.signal.aborted && captured === controller.current) { setAnalyzing(false); setCurrentFile(null); } }
    }
    function submit() {
        if (!review?.manifest || !controller.current || blocked) return;
        try { controller.current.attach(review, name); void controller.current.start(name); }
        catch (cause) { setError(safeImportCode(cause)); }
    }
    const completed = state?.phase === 'complete' && recovery?.projectId;
    const acknowledged = state?.status?.files.filter(file => file.state === 'received' && file.valid) ?? [];
    const phaseCopy = state?.phase === 'checking' ? copy.checking : state?.phase === 'importing' ? copy.importing
        : state?.phase === 'needs-folder' ? copy.needsFolder : state?.phase === 'uncertain' ? copy.uncertain
            : state?.phase === 'canceled' ? copy.canceled : state?.phase === 'complete' ? copy.complete : null;
    return <>
        {!access && !error && <p role="status">{copy.loading}</p>}
        {access && !access.enabled && <p className="text-foreground-secondary text-sm">{copy.unavailable}</p>}
        {shownError && <p ref={errorElement} tabIndex={-1} role="alert" className="text-destructive text-sm">
            {shownError.includes('RECOVERY_') ? copy.recoveryStorage : shownError.includes('RETRY_CHANGED') ? copy.changed : copy.failed}
            <span className="block text-xs">{shownError}</span>
        </p>}
        {!completed && <>
            <p className="text-foreground-secondary text-sm">{copy.sharing}</p>
            <div className="space-y-2">
                <Label htmlFor={inputId}>{recovery ? copy.chooseSame : copy.choose}</Label>
                <input ref={input} id={inputId} type="file" multiple className="hidden" onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ''; void choose(files); }} />
                <Button variant="outline" disabled={!canSelect} onClick={() => input.current?.click()}>{recovery ? copy.chooseSame : copy.choose}</Button>
                {directorySupported === false && <p className="text-sm">{copy.unsupported}</p>}
            </div>
        </>}
        {analyzing && <p role="status" className="break-all text-sm">{copy.analyzing} {currentFile}</p>}
        {review && <section className="space-y-3 text-sm">
            <h2 ref={heading} tabIndex={-1} className="font-medium">{copy.review}</h2>
            <p>{copy.folder}: {review.folderName}</p>
            <p>{review.included.length} {copy.files} · {review.included.reduce((sum, file) => sum + file.bytes, 0).toLocaleString()} {copy.bytes}</p>
            <p className="text-foreground-secondary">{copy.limits}</p>
            <div className="space-y-2"><Label htmlFor={nameId}>{copy.name}</Label>
                <Input id={nameId} value={recovery?.name ?? name} maxLength={80} disabled={!!recovery || !!blocked} onChange={event => setName(event.target.value)} /></div>
            <details><summary className="cursor-pointer">{copy.included} ({review.included.length})</summary><ul className="mt-2 space-y-1">
                {review.included.map(file => <li key={file.path} className="break-all" title={file.path}>{file.path} · {file.bytes.toLocaleString()} {copy.bytes}</li>)}
            </ul></details>
            <details><summary className="cursor-pointer">{copy.excluded} ({review.excluded.length})</summary><ul className="mt-2 space-y-1">
                {review.excluded.map(file => <li key={file.path} className="break-all" title={file.path}>{file.path} · {copy[file.reason]}</li>)}
            </ul></details>
            {!!review.problems.length && <div role="alert"><p>{copy.blocked}</p><ul className="mt-2 space-y-1">
                {review.problems.map((problem, i) => <li key={`${problem.path}/${i}`} className="break-all">{problem.path} · {problem.code}</li>)}
            </ul></div>}
            {!recovery && <Button disabled={!!blocked || !access?.enabled || !review.manifest || !name.trim()} onClick={submit}>{copy.start}</Button>}
        </section>}
        {recovery && <section className="space-y-3 text-sm">
            <p role="status">{recovery.cancelRequested && !completed && state?.phase !== 'canceled' ? copy.cancelPending : phaseCopy}</p>
            {state?.currentPath && <p className="break-all">{state.currentPath}</p>}
            <p>{copy.acknowledged}: {acknowledged.length}/{recovery.files.length} · {acknowledged.reduce((sum, file) => sum + file.bytes, 0).toLocaleString()} {copy.bytes}</p>
            <div className="flex flex-wrap gap-2">
                {completed ? <Button asChild><Link href={`/project/${recovery.projectId}`}>{copy.open}</Link></Button>
                    : state?.phase === 'canceled' ? <Button onClick={() => { controller.current?.resetCanceled(); setReview(null); setName(''); }}>{copy.reset}</Button>
                        : <>
                            <Button variant="outline" disabled={!!blocked} onClick={() => void controller.current?.check()}>{copy.check}</Button>
                            {!recovery.cancelRequested && <Button disabled={!!blocked || !access?.enabled} onClick={() => void controller.current?.resume()}>{copy.resume}</Button>}
                            <Button variant="ghost" disabled={recovery.cancelRequested} onClick={() => void controller.current?.cancel()}>{copy.cancel}</Button>
                        </>}
            </div>
        </section>}
    </>;
}
