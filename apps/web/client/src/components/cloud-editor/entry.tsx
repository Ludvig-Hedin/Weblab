'use client';

import type { ReactNode } from 'react';
import { Component, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { useAction, useConvexAuth, useQuery } from 'convex/react';

import { Button } from '@weblab/ui/button';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';

import type { Id } from '@convex/_generated/dataModel';
import { cloudEditorApi } from '@/lib/cloud-editor/api';
import { useCloudEditorCopy } from '@/lib/cloud-editor/copy';

interface EntryProps {
    workspaceId: Id<'workspaces'>;
    workspaceSlug: string;
    sourcePilotId?: Id<'projects'>;
    projectName?: string;
    children?: ReactNode;
}

function failureMessage(error: unknown, copy: ReturnType<typeof useCloudEditorCopy>): string {
    const data = error && typeof error === 'object' && 'data' in error ? error.data : null;
    const message = typeof data === 'string' ? data : error instanceof Error ? error.message : '';
    if (message.includes('UNAUTHORIZED')) return copy.signInRequired;
    if (message.includes('FORBIDDEN')) return copy.noAccess;
    if (message.includes('CLOUD_DISABLED')) return copy.paused;
    if (message.includes('CLOUD_PROJECT_LIMIT')) return copy.limit;
    if (message.includes('CLOUD_CONFLICT')) return copy.migrationConflict;
    return copy.genericError;
}

class EntryBoundary extends Component<
    { children: ReactNode; fallback: (error: unknown) => ReactNode },
    { error: unknown }
> {
    state: { error: unknown } = { error: null };
    static getDerivedStateFromError(error: unknown) {
        return { error };
    }
    render() {
        return this.state.error ? this.props.fallback(this.state.error) : this.props.children;
    }
}

type CreationAttempt = { creationId: string; name: string };

function ProjectCreation(props: EntryProps & { userId: string }) {
    const copy = useCloudEditorCopy();
    const router = useRouter();
    const inputId = useId();
    const access = useQuery(cloudEditorApi.workspace, {
        workspaceId: props.workspaceId,
    });
    const create = useAction(cloudEditorApi.create);
    const storageKey = `cloud-editor:create:${props.userId}:${props.workspaceId}:${props.sourcePilotId ?? 'new'}`;
    const attempt = useRef<CreationAttempt | null>(null);
    const submitting = useRef(false);
    const [name, setName] = useState(props.projectName ?? '');
    const [pending, setPending] = useState(false);
    const [unconfirmed, setUnconfirmed] = useState(false);
    const [restored, setRestored] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        try {
            const raw = window.sessionStorage.getItem(storageKey);
            if (raw && raw.length < 2048) {
                const saved: unknown = JSON.parse(raw);
                if (
                    saved &&
                    typeof saved === 'object' &&
                    'creationId' in saved &&
                    'name' in saved &&
                    typeof saved.creationId === 'string' &&
                    /^[a-zA-Z0-9_-]{16,80}$/.test(saved.creationId) &&
                    typeof saved.name === 'string' &&
                    saved.name.trim().length > 0 &&
                    saved.name.length <= 80
                ) {
                    attempt.current = { creationId: saved.creationId, name: saved.name };
                    setName(saved.name);
                    setUnconfirmed(true);
                }
            }
        } catch {
            // A new request is sent only after its retry identifier can be saved.
            setError(copy.genericError);
        }
        setRestored(true);
    }, [storageKey, copy.genericError]);

    const allowed = restored && access?.enabled && (access.canCreate || unconfirmed);

    async function submit() {
        if (!allowed || submitting.current || !name.trim()) return;
        submitting.current = true;
        setPending(true);
        setError(null);
        const recoveringAttempt = attempt.current !== null;
        try {
            const request = attempt.current ?? {
                creationId: crypto.randomUUID(),
                name: name.trim(),
            };
            // Keep the same request across lost acknowledgements and page reloads.
            window.sessionStorage.setItem(storageKey, JSON.stringify(request));
            attempt.current = request;
            setUnconfirmed(true);
            const created = await create({
                workspaceId: props.workspaceId,
                sourcePilotId: props.sourcePilotId,
                ...request,
            });
            // Failure to clear this entry is safe: replay opens the same project.
            try {
                window.sessionStorage.removeItem(storageKey);
            } catch {
                /* Retain the retry identity. */
            }
            router.push(`/project/${created.projectId}`);
        } catch (cause) {
            setError(failureMessage(cause, copy));
            const code = cause && typeof cause === 'object' && 'data' in cause ? cause.data : null;
            // Only a first-attempt rejection proves no earlier request created
            // the project. Recovery keeps its identity even if access changed.
            if (typeof code === 'string' && !recoveringAttempt) {
                try {
                    window.sessionStorage.removeItem(storageKey);
                    attempt.current = null;
                    setUnconfirmed(false);
                } catch {
                    /* Keep the original operation until it can be resolved. */
                }
            }
        } finally {
            submitting.current = false;
            setPending(false);
        }
    }

    return (
        <>
            {!access && (
                <p role="status" className="text-foreground-secondary text-sm">
                    {copy.loading}
                </p>
            )}
            {access && !access.enabled && (
                <p role="status" className="text-foreground-secondary text-sm">
                    {copy.paused}
                </p>
            )}
            {access?.enabled && !access.canCreate && !unconfirmed && (
                <p className="text-foreground-secondary text-sm">{copy.noCreate}</p>
            )}
            {access && (
                <form
                    className="flex flex-col gap-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void submit();
                    }}
                >
                    <div className="flex flex-col gap-2">
                        <Label htmlFor={inputId}>{copy.name}</Label>
                        <Input
                            id={inputId}
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            maxLength={80}
                            required
                            autoComplete="off"
                            disabled={!allowed || pending || unconfirmed}
                        />
                    </div>
                    {error && (
                        <p role="alert" className="text-destructive text-sm">
                            {error}
                        </p>
                    )}
                    <Button
                        type="submit"
                        className="self-start"
                        loading={pending}
                        disabled={!allowed || pending || !name.trim()}
                    >
                        {pending ? copy.creating : props.sourcePilotId ? copy.upgrade : copy.create}
                    </Button>
                </form>
            )}
            {!!access?.projects.length && (
                <ul className="divide-border flex flex-col divide-y">
                    {access.projects.map((project) => (
                        <li
                            key={project.id}
                            className="flex min-w-0 items-center justify-between gap-4 py-3"
                        >
                            <span className="truncate text-sm">{project.name}</span>
                            <Button asChild variant="ghost" size="sm">
                                <Link href={`/project/${project.id}`}>{copy.open}</Link>
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
}

export function CloudProjectEntry(props: EntryProps) {
    const copy = useCloudEditorCopy();
    const { userId } = useAuth();
    const { isAuthenticated, isLoading } = useConvexAuth();
    return (
        <main className="mx-auto flex w-full max-w-lg flex-col gap-5 p-8">
            <Button asChild variant="link" className="self-start">
                <Link href={`/w/${encodeURIComponent(props.workspaceSlug)}/projects`}>
                    {copy.back}
                </Link>
            </Button>
            <header>
                <h1 className="text-xl font-medium">
                    {props.sourcePilotId ? copy.upgradeTitle : copy.title}
                </h1>
                <p className="text-foreground-secondary mt-2 text-sm">
                    {props.sourcePilotId ? copy.upgradeIntro : copy.intro}
                </p>
            </header>
            {isLoading ? (
                <p role="status">{copy.loading}</p>
            ) : !isAuthenticated || !userId ? (
                <Link className="text-foreground-brand text-sm underline" href="/sign-in">
                    {copy.signInRequired}
                </Link>
            ) : (
                <EntryBoundary
                    key={`${props.workspaceId}:${props.sourcePilotId ?? 'new'}:${userId}`}
                    fallback={(error) => (
                        <p role="alert" className="text-destructive text-sm">
                            {failureMessage(error, copy)}
                        </p>
                    )}
                >
                    <ProjectCreation {...props} userId={userId} />
                    {props.children}
                </EntryBoundary>
            )}
            {props.sourcePilotId && (
                <Button asChild variant="link" className="self-start">
                    <Link href={`/project/${props.sourcePilotId}?legacy=1`}>{copy.recover}</Link>
                </Button>
            )}
        </main>
    );
}
