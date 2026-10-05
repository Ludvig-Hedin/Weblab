'use client';

import type { ReactNode } from 'react';
import { Component, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import type { Id } from '@convex/_generated/dataModel';
import { cloudEditorApi } from '@/lib/cloud-editor/api';
import { useCloudEditorCopy } from '@/lib/cloud-editor/copy';
import { authenticatedPreviewUrl, previewUrlOnRuntime } from '@/lib/cloud-editor/preview-url';

type PreviewProps = {
    projectId: Id<'projects'>;
    branchId: Id<'branches'>;
    url: string;
};

function failureMessage(error: unknown, copy: ReturnType<typeof useCloudEditorCopy>): string {
    const code = error && typeof error === 'object' && 'data' in error ? error.data : null;
    if (typeof code === 'string' && code.includes('UNAUTHORIZED')) return copy.signInRequired;
    if (typeof code === 'string' && code.includes('FORBIDDEN')) return copy.noAccess;
    return copy.previewUnavailable;
}

class PreviewBoundary extends Component<
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

/** Expire even without a query update; also recheck after a background tab wakes. */
function useExpiryClock(expiresAt: number | null | undefined): number {
    const [now, setNow] = useState(Date.now);
    useEffect(() => {
        let timer: number | null = null;
        const tick = () => {
            setNow(Date.now());
            if (timer !== null) window.clearTimeout(timer);
            const delay = typeof expiresAt === 'number' ? expiresAt - Date.now() : 0;
            timer = delay > 0 ? window.setTimeout(tick, Math.min(delay, 2_147_483_647)) : null;
        };
        tick();
        window.addEventListener('focus', tick);
        document.addEventListener('visibilitychange', tick);
        return () => {
            if (timer !== null) window.clearTimeout(timer);
            window.removeEventListener('focus', tick);
            document.removeEventListener('visibilitychange', tick);
        };
    }, [expiresAt]);
    return Math.max(now, Date.now());
}

function PreviewContent({ projectId, branchId, url }: PreviewProps) {
    const copy = useCloudEditorCopy();
    const status = useQuery(cloudEditorApi.status, { projectId, branchId });
    const ensurePreview = useMutation(cloudEditorApi.ensurePreview);
    const issuePreview = useMutation(cloudEditorApi.issuePreview);
    const now = useExpiryClock(status?.expiresAt);
    const [pending, setPending] = useState(false);
    const inFlight = useRef(false);
    const [error, setError] = useState<string | null>(null);
    const [reload, setReload] = useState(0);
    const [loaded, setLoaded] = useState(false);
    const [frameFailed, setFrameFailed] = useState(false);
    const rawUrl = previewUrlOnRuntime(url, status?.previewUrl);
    const src = authenticatedPreviewUrl(rawUrl, status, now);
    const expired =
        status?.expiresAt !== null && status?.expiresAt !== undefined && status.expiresAt <= now;

    useEffect(() => {
        setLoaded(false);
        setFrameFailed(false);
    }, [src, reload]);

    useEffect(() => {
        if (
            status?.status !== 'ready' ||
            !status.enabled ||
            status.previewToken ||
            (status.expiresAt ?? 0) <= Date.now()
        )
            return;
        let current = true;
        void issuePreview({ projectId, branchId }).catch((cause) => {
            if (current) setError(failureMessage(cause, copy));
        });
        return () => {
            current = false;
        };
    }, [
        status?.status,
        status?.enabled,
        status?.previewToken,
        status?.expiresAt,
        projectId,
        branchId,
        issuePreview,
        copy,
    ]);

    async function retry() {
        if (inFlight.current || !status?.enabled) return;
        inFlight.current = true;
        setPending(true);
        setError(null);
        try {
            // Only this explicit user action may request paid runtime work.
            if (status.status === 'ready' && (status.expiresAt ?? 0) > Date.now()) {
                await issuePreview({ projectId, branchId });
            } else {
                await ensurePreview({ projectId, branchId });
            }
            setFrameFailed(false);
            setReload((value) => value + 1);
        } catch (cause) {
            setError(failureMessage(cause, copy));
        } finally {
            inFlight.current = false;
            setPending(false);
        }
    }

    const message =
        error ??
        (!status
            ? copy.loading
            : !status.enabled
              ? copy.paused
              : status.status === 'starting'
                ? copy.previewStarting
                : expired
                  ? copy.previewExpired
                  : copy.previewUnavailable);

    if (!src || frameFailed)
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
                <p
                    role={error || frameFailed ? 'alert' : 'status'}
                    className="text-foreground-secondary max-w-md text-sm"
                >
                    {message}
                </p>
                {status?.enabled && (
                    <Button
                        variant="outline"
                        size="sm"
                        loading={pending}
                        disabled={pending}
                        onClick={() => {
                            void retry();
                        }}
                    >
                        {copy.retryPreview}
                    </Button>
                )}
            </div>
        );

    return (
        <div className="relative min-h-0 flex-1">
            {!loaded && (
                <div
                    role="status"
                    className="bg-background-canvas text-foreground-secondary absolute inset-0 flex items-center justify-center text-sm"
                >
                    {copy.privatePreview}
                </div>
            )}
            <iframe
                key={reload}
                src={src}
                title={copy.previewTitle}
                referrerPolicy="no-referrer"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
                className="h-full w-full border-0 bg-white"
                onLoad={() => setLoaded(true)}
                onError={() => setFrameFailed(true)}
            />
        </div>
    );
}

export function CloudStandalonePreview(props: PreviewProps) {
    const copy = useCloudEditorCopy();
    const { isAuthenticated, isLoading } = useConvexAuth();
    const [queryRetry, setQueryRetry] = useState(0);
    return (
        <main className="bg-background-canvas fixed inset-0 flex flex-col">
            <header className="bg-background-chrome border-border-bar flex h-12 shrink-0 items-center gap-2 border-b px-3">
                <Icons.Globe className="text-foreground-tertiary h-4 w-4" />
                <h1 className="text-foreground-secondary flex-1 text-xs">{copy.previewTitle}</h1>
                <Button asChild variant="ghost" size="sm">
                    <Link href={`/project/${props.projectId}`}>{copy.backToEditor}</Link>
                </Button>
            </header>
            {isLoading ? (
                <p role="status" className="text-foreground-secondary m-auto p-8 text-sm">
                    {copy.loading}
                </p>
            ) : !isAuthenticated ? (
                <Link
                    href="/sign-in"
                    className="text-foreground-secondary m-auto p-8 text-sm underline"
                >
                    {copy.signInRequired}
                </Link>
            ) : (
                <PreviewBoundary
                    key={`${props.projectId}:${props.branchId}:${queryRetry}`}
                    fallback={(error) => (
                        <div className="m-auto flex flex-col items-center gap-3 p-8">
                            <p role="alert" className="text-foreground-secondary text-sm">
                                {failureMessage(error, copy)}
                            </p>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setQueryRetry((value) => value + 1)}
                            >
                                {copy.retryPreview}
                            </Button>
                        </div>
                    )}
                >
                    <PreviewContent {...props} />
                </PreviewBoundary>
            )}
        </main>
    );
}
