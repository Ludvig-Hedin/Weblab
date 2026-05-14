'use client';

import { useEffect } from 'react';
import Link from 'next/link';

import { Button } from '@weblab/ui/button';

import { Routes } from '@/utils/constants';

export default function ProjectErrorBoundary({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        if (process.env.NODE_ENV !== 'production') {
            console.error('Project route error:', error);
        }
    }, [error]);

    const reference = error?.digest ?? null;

    return (
        <div className="bg-background flex min-h-screen items-center justify-center px-6">
            <div className="border-border bg-card w-full max-w-md rounded-2xl border p-8 text-center shadow-2xl">
                <p className="text-foreground-tertiary text-sm ">
                    Project error
                </p>
                <h1 className="text-foreground mt-3 text-3xl font-semibold">
                    We couldn&apos;t open this project
                </h1>
                <p className="text-foreground-secondary mt-4 text-sm leading-6">
                    The editor failed to load. Try again, or head back to your dashboard.
                </p>
                {reference && (
                    <div className="border-border bg-background mt-4 rounded-md border p-3 text-left">
                        <p className="text-foreground-tertiary text-xs tracking-wide uppercase">
                            Error reference
                        </p>
                        <p className="text-foreground-secondary mt-1 font-mono text-xs break-all">
                            {reference}
                        </p>
                    </div>
                )}
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <Button onClick={() => reset()}>Try again</Button>
                    <Button variant="outline" asChild>
                        <Link href={Routes.PROJECTS}>Back to projects</Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}
