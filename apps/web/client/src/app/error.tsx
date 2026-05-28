'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { Button } from '@weblab/ui/button';

import { env } from '@/env';
import { Routes } from '@/utils/constants';
import { isChunkLoadError, reloadOnceForChunkError } from './_components/chunk-error-reloader';

export default function RootErrorBoundary({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const isChunkError = isChunkLoadError(error);
    // Hide the error card while a chunk-load failure is being recovered so the
    // reload doesn't flash "Something went wrong" first.
    const [recovering, setRecovering] = useState(isChunkError);

    useEffect(() => {
        // A chunk-load failure reaching the render boundary means a stale module
        // graph (HMR rebuild / deploy). Recover with a guarded one-time reload
        // instead of stranding the user on a dead-end error card.
        if (isChunkError && reloadOnceForChunkError()) {
            return;
        }
        // Reload was guarded (already retried → broken build) — reveal the card.
        setRecovering(false);
        if (env.NODE_ENV !== 'production') {
            console.error('Root error boundary:', error);
        }
    }, [error, isChunkError]);

    const reference = error?.digest ?? null;

    if (recovering) {
        return <div className="bg-background min-h-screen" aria-hidden="true" />;
    }

    return (
        <div className="bg-background flex min-h-screen items-center justify-center px-6">
            <div className="border-border bg-card w-full max-w-md rounded-2xl border p-8 text-center shadow-2xl">
                <p className="text-foreground-tertiary text-sm">Unexpected error</p>
                <h1 className="text-foreground mt-3 text-3xl font-semibold">
                    Something went wrong
                </h1>
                <p className="text-foreground-secondary mt-4 text-sm leading-6">
                    We hit an unexpected error. Try again or return home.
                </p>
                {reference && (
                    <div className="border-border bg-background mt-4 rounded-md border p-3 text-left">
                        <p className="text-foreground-tertiary text-xs">Error reference</p>
                        <p className="text-foreground-secondary mt-1 font-mono text-xs break-all">
                            {reference}
                        </p>
                    </div>
                )}
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <Button onClick={() => reset()}>Try again</Button>
                    <Button variant="outline" asChild>
                        <Link href={Routes.HOME}>Go home</Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}
