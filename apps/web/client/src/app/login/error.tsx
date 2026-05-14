'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import { Button } from '@weblab/ui/button';

import { Routes } from '@/utils/constants';

// TODO: move to i18n keys (welcome.error.*)
const COPY = {
    EYEBROW: 'Sign-in error',
    TITLE: 'Something went wrong',
    BODY: 'We hit an unexpected error while signing you in. Please try again.',
    TRY_AGAIN: 'Try again',
    BACK_TO_LOGIN: 'Back to login',
    GET_HELP: 'Get help',
    ERROR_DETAILS_LABEL: 'Error reference',
    COPY_ERROR_DETAILS: 'Copy error details',
    COPIED: 'Copied',
} as const;

const SUPPORT_EMAIL = 'support@weblab.build';

export default function ErrorPage({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const [copied, setCopied] = useState(false);
    const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const reference = error?.digest ?? 'unknown';

    useEffect(() => {
        return () => {
            if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
        };
    }, []);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(`Error: ${reference}`);
            setCopied(true);
            if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
            copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000);
        } catch {
            // Silently ignore — copy is a nicety, not critical.
        }
    };

    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
        'Sign-in error',
    )}&body=${encodeURIComponent(`Error reference: ${reference}\n\n`)}`;

    return (
        <div className="bg-background flex min-h-screen items-center justify-center px-6">
            <div className="border-border bg-card w-full max-w-md rounded-2xl border p-8 text-center shadow-2xl">
                <p className="text-foreground-tertiary text-sm ">
                    {COPY.EYEBROW}
                </p>
                <h1 className="text-foreground mt-3 text-3xl font-semibold">{COPY.TITLE}</h1>
                <p className="text-foreground-secondary mt-4 text-sm leading-6">{COPY.BODY}</p>
                {reference && reference !== 'unknown' && (
                    <div className="border-border bg-background mt-4 rounded-md border p-3 text-left">
                        <p className="text-foreground-tertiary text-xs">
                            {COPY.ERROR_DETAILS_LABEL}
                        </p>
                        <p className="text-foreground-secondary mt-1 font-mono text-xs break-all">
                            {reference}
                        </p>
                    </div>
                )}
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <Button onClick={() => reset()}>{COPY.TRY_AGAIN}</Button>
                    <Button variant="outline" asChild>
                        <Link href={Routes.LOGIN}>{COPY.BACK_TO_LOGIN}</Link>
                    </Button>
                </div>
                <div className="text-foreground-secondary mt-4 flex flex-col gap-2 text-xs sm:flex-row sm:justify-center">
                    <button
                        type="button"
                        onClick={handleCopy}
                        className="hover:text-foreground-primary underline transition-colors"
                    >
                        {copied ? COPY.COPIED : COPY.COPY_ERROR_DETAILS}
                    </button>
                    <span className="hidden sm:inline">·</span>
                    <a
                        href={mailto}
                        className="hover:text-foreground-primary underline transition-colors"
                    >
                        {COPY.GET_HELP}
                    </a>
                </div>
            </div>
        </div>
    );
}
