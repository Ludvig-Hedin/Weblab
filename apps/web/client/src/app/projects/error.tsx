'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';

import { Routes } from '@/utils/constants';

// Segment-scoped error boundary for the projects dashboard. The /projects pages
// read the current user via `useQuery(api.users.me, {})` with no fallback — if
// Convex returns a Server Error (e.g. the backend is mid-deploy or briefly
// unreachable), that query THROWS and, without this boundary, bubbles to the
// framework's bare "This page couldn't load" crash screen. Catching it here lets
// a transient blip degrade into a retryable state instead of a hard crash.
export default function ProjectsErrorBoundary({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const t = useTranslations('projects.errorPage');

    useEffect(() => {
        if (process.env.NODE_ENV !== 'production') {
            console.error('Projects route error:', error);
        }
    }, [error]);

    const reference = error?.digest ?? null;

    return (
        <div className="bg-background flex min-h-screen items-center justify-center px-6">
            <div className="border-border bg-card w-full max-w-md rounded-2xl border p-8 text-center shadow-2xl">
                <p className="text-foreground-tertiary text-sm">{t('dashboardError')}</p>
                <h1 className="text-foreground mt-3 text-3xl font-semibold">
                    {t('title')}
                </h1>
                <p className="text-foreground-secondary mt-4 text-sm leading-6">
                    {t('description')}
                </p>
                {reference && (
                    <div className="border-border bg-background mt-4 rounded-md border p-3 text-left">
                        <p className="text-foreground-tertiary text-xs">{t('errorReference')}</p>
                        <p className="text-foreground-secondary mt-1 font-mono text-xs break-all">
                            {reference}
                        </p>
                    </div>
                )}
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <Button onClick={() => reset()}>{t('tryAgain')}</Button>
                    <Button variant="outline" asChild>
                        <Link href={Routes.HOME}>{t('goHome')}</Link>
                    </Button>
                </div>
            </div>
        </div>
    );
}
