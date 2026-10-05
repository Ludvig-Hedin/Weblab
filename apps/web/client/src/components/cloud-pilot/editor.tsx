'use client';

import { useCallback, useEffect, useReducer, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@clerk/nextjs';
import { validatePilotContent } from '@convex/lib/cloudPilot';
import { useConvexConnectionState, useMutation, useQuery } from 'convex/react';

import { Button } from '@weblab/ui/button';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@weblab/ui/select';
import { Textarea } from '@weblab/ui/textarea';

import type { Id } from '@convex/_generated/dataModel';
import type { PilotContent, PilotSnapshot } from '@convex/lib/cloudPilot';
import { pilotApi } from '@/lib/cloud-pilot/api';
import { pilotErrorMessage, usePilotCopy } from '@/lib/cloud-pilot/copy';
import { createDraft, hasConflict, isDirty, pilotDraftReducer } from '@/lib/cloud-pilot/draft';
import { draftStorageKey, restoreDraft, serializeDraft } from '@/lib/cloud-pilot/session-draft';
import { PilotBoundary, PilotSubscriptionBoundary } from './boundary';
import { PilotTemplate } from './template';

const textFields = [
    { key: 'title', maxLength: 160 },
    { key: 'imageUrl', maxLength: 2048 },
    { key: 'imageAlt', maxLength: 200 },
    { key: 'ctaLabel', maxLength: 60 },
    { key: 'ctaHref', maxLength: 2048 },
] as const;

function LoadedEditor({
    snapshot,
    unavailable,
    userId,
}: {
    snapshot: PilotSnapshot;
    unavailable: boolean;
    userId: string;
}) {
    const copy = usePilotCopy();
    const storageKey = draftStorageKey(userId, snapshot.projectId);
    const [storageFailed, setStorageFailed] = useState(false);
    const [state, dispatch] = useReducer(pilotDraftReducer, snapshot, (initial) => {
        try {
            return restoreDraft(initial, window.sessionStorage.getItem(storageKey));
        } catch {
            return createDraft(initial);
        }
    });
    const save = useMutation(pilotApi.save);
    const dirty = isDirty(state);
    const conflict = hasConflict(state);
    const pending = state.pending !== null;
    const { isWebSocketConnected: connected } = useConvexConnectionState();
    const canEdit = snapshot.enabled && snapshot.canEdit && !unavailable;

    useEffect(() => {
        dispatch({ type: 'remote', snapshot });
    }, [snapshot]);
    useEffect(() => {
        try {
            const draft = serializeDraft(state);
            if (draft) window.sessionStorage.setItem(storageKey, draft);
            else window.sessionStorage.removeItem(storageKey);
            setStorageFailed(false);
        } catch {
            setStorageFailed(true);
        }
    }, [state, storageKey]);
    useEffect(() => {
        if (!dirty && !pending && !conflict) return;
        const beforeUnload = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', beforeUnload);
        return () => window.removeEventListener('beforeunload', beforeUnload);
    }, [dirty, pending, conflict]);

    function edit(key: keyof PilotContent, value: string) {
        dispatch({
            type: 'edit',
            content: { ...state.content, [key]: value } as PilotContent,
        });
    }

    async function saveDraft() {
        if (!canEdit || !connected || pending || conflict || !dirty) return;
        try {
            const content = validatePilotContent(state.content);
            dispatch({ type: 'saving' });
            const saved = await save({
                projectId: snapshot.projectId,
                expectedRevision: state.base.revision,
                content,
            });
            dispatch({ type: 'saved', snapshot: saved });
        } catch (error) {
            dispatch({ type: 'failed', error: pilotErrorMessage(error, copy) });
        }
    }

    return (
        <main className="bg-background text-foreground flex min-h-screen flex-col">
            <header className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
                <div className="flex min-w-0 items-center gap-4">
                    <Button asChild variant="ghost">
                        <Link
                            href="/projects"
                            onClick={(event) => {
                                if ((dirty || pending || conflict) && !window.confirm(copy.leave))
                                    event.preventDefault();
                            }}
                        >
                            {copy.back}
                        </Link>
                    </Button>
                    <h1 className="truncate text-sm font-medium">{snapshot.name}</h1>
                </div>
                <div className="flex items-center gap-3">
                    <span role="status" className="text-foreground-secondary text-sm">
                        {pending
                            ? connected
                                ? copy.saving
                                : copy.waitingConnection
                            : dirty || conflict
                              ? copy.dirty
                              : copy.saved}
                    </span>
                    <Button
                        onClick={() => void saveDraft()}
                        loading={pending}
                        disabled={!canEdit || !connected || !dirty || conflict}
                    >
                        {copy.save}
                    </Button>
                </div>
            </header>
            <p className="text-foreground-secondary px-5 py-3 text-sm">{copy.intro}</p>
            {storageFailed && (dirty || conflict) && (
                <p role="alert" className="px-5 pb-3 text-sm">
                    {copy.storageError}
                </p>
            )}
            {!snapshot.enabled && (
                <p role="status" className="px-5 pb-3 text-sm">
                    {copy.paused}
                </p>
            )}
            {!snapshot.canEdit && <p className="px-5 pb-3 text-sm">{copy.readOnly}</p>}
            {!connected && (
                <p role="status" className="px-5 pb-3 text-sm">
                    {copy.offline}
                </p>
            )}
            <div className="grid flex-1 grid-cols-1 lg:grid-cols-[340px_minmax(0,1fr)]">
                <section
                    className="border-border border-t p-5 lg:border-r"
                    aria-labelledby="pilot-content-title"
                >
                    <h2 id="pilot-content-title" className="mb-5 text-sm font-medium">
                        {copy.content}
                    </h2>
                    <fieldset disabled={!canEdit} className="flex flex-col gap-4">
                        {textFields.map(({ key, maxLength }) => (
                            <div key={key} className="flex flex-col gap-2">
                                <Label htmlFor={`pilot-${key}`}>{copy.fields[key]}</Label>
                                <Input
                                    id={`pilot-${key}`}
                                    value={state.content[key]}
                                    maxLength={maxLength}
                                    type={key === 'imageUrl' || key === 'ctaHref' ? 'url' : 'text'}
                                    required={key === 'title'}
                                    onChange={(event) => edit(key, event.target.value)}
                                    aria-describedby={
                                        key === 'imageUrl' ? 'pilot-image-hint' : undefined
                                    }
                                />
                                {key === 'title' && (
                                    <>
                                        <Label htmlFor="pilot-description" className="mt-2">
                                            {copy.fields.description}
                                        </Label>
                                        <Textarea
                                            id="pilot-description"
                                            value={state.content.description}
                                            maxLength={2000}
                                            rows={4}
                                            onChange={(event) =>
                                                edit('description', event.target.value)
                                            }
                                        />
                                    </>
                                )}
                                {key === 'imageUrl' && (
                                    <p
                                        id="pilot-image-hint"
                                        className="text-foreground-tertiary text-xs"
                                    >
                                        {copy.imageHint}
                                    </p>
                                )}
                            </div>
                        ))}
                        <div className="flex flex-col gap-2">
                            <Label htmlFor="pilot-alignment">{copy.fields.alignment}</Label>
                            <Select
                                value={state.content.alignment}
                                disabled={!canEdit}
                                onValueChange={(value) => {
                                    if (value === 'left' || value === 'center')
                                        edit('alignment', value);
                                }}
                            >
                                <SelectTrigger id="pilot-alignment">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="left">{copy.left}</SelectItem>
                                    <SelectItem value="center">{copy.center}</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </fieldset>
                    {state.error && (
                        <p role="alert" className="text-destructive mt-4 text-sm">
                            {state.error}
                        </p>
                    )}
                    {conflict && (
                        <div className="mt-4 flex flex-col gap-3">
                            <p role="alert" className="text-sm">
                                {copy.conflict}
                            </p>
                            <Button
                                variant="outline"
                                disabled={pending}
                                className="h-auto py-2 whitespace-normal"
                                onClick={() => {
                                    if (window.confirm(copy.discard)) dispatch({ type: 'reload' });
                                }}
                            >
                                {copy.reload}
                            </Button>
                        </div>
                    )}
                </section>
                <section
                    className="border-border bg-background-secondary min-w-0 border-t p-5"
                    aria-labelledby="pilot-preview-title"
                >
                    <h2 id="pilot-preview-title" className="text-sm font-medium">
                        {copy.preview}
                    </h2>
                    <p className="text-foreground-secondary mt-1 mb-5 text-xs">
                        {copy.previewHint}
                    </p>
                    <PilotTemplate template={snapshot.template} content={state.content} />
                </section>
            </div>
        </main>
    );
}

function SnapshotSubscription({
    projectId,
    onSnapshot,
}: {
    projectId: Id<'projects'>;
    onSnapshot: (snapshot: PilotSnapshot) => void;
}) {
    const snapshot = useQuery(pilotApi.get, { projectId });
    useEffect(() => {
        if (snapshot) onSnapshot(snapshot);
    }, [snapshot, onSnapshot]);
    return null;
}

function PersistentEditor({ projectId, userId }: { projectId: Id<'projects'>; userId: string }) {
    const [snapshot, setSnapshot] = useState<PilotSnapshot | null>(null);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    const copy = usePilotCopy();
    const receiveSnapshot = useCallback((next: PilotSnapshot) => {
        setSnapshot(next);
        setFailed(false);
    }, []);
    return (
        <>
            <PilotSubscriptionBoundary key={attempt} onError={() => setFailed(true)}>
                <SnapshotSubscription projectId={projectId} onSnapshot={receiveSnapshot} />
            </PilotSubscriptionBoundary>
            {failed && (
                <div className="flex flex-wrap items-center gap-3 p-5">
                    <p role="alert" className="text-sm">
                        {snapshot ? copy.connectionError : copy.loadError}
                    </p>
                    <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>
                        {copy.retry}
                    </Button>
                    {!snapshot && (
                        <Button asChild variant="ghost">
                            <Link href="/projects">{copy.back}</Link>
                        </Button>
                    )}
                </div>
            )}
            {snapshot && userId ? (
                <LoadedEditor
                    key={userId}
                    snapshot={snapshot}
                    unavailable={failed}
                    userId={userId}
                />
            ) : (
                !failed && (
                    <p role="status" className="p-8">
                        {copy.loading}
                    </p>
                )
            )}
        </>
    );
}

export function CloudPilotEditor({ projectId }: { projectId: Id<'projects'> }) {
    const { userId } = useAuth();
    const copy = usePilotCopy();
    if (!userId)
        return (
            <p role="status" className="p-8">
                {copy.loading}
            </p>
        );
    return (
        <PilotBoundary key={`${projectId}:${userId}`}>
            <PersistentEditor projectId={projectId} userId={userId} />
        </PilotBoundary>
    );
}

export default CloudPilotEditor;
