'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';

import { Routes } from '@/utils/constants';

const SUPPORT_EMAIL = 'support@weblab.build';

export default function ErrorPage({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const t = useTranslations();
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
        t('welcome.error.login.eyebrow'),
    )}&body=${encodeURIComponent(`${t('welcome.error.login.errorDetailsLabel')}: ${reference}\n\n`)}`;

    return (
        <div className="bg-background flex min-h-screen items-center justify-center px-6">
            <div className="border-border bg-card w-full max-w-md rounded-2xl border p-8 text-center shadow-2xl">
                <p className="text-foreground-tertiary text-sm tracking-[0.2em] uppercase">
                    {t('welcome.error.login.eyebrow')}
                </p>
                <h1 className="text-foreground mt-3 text-3xl font-semibold">{t('welcome.error.login.title')}</h1>
                <p className="text-foreground-secondary mt-4 text-sm leading-6">{t('welcome.error.login.body')}</p>
                {reference && reference !== 'unknown' && (
                    <div className="border-border bg-background mt-4 rounded-md border p-3 text-left">
                        <p className="text-foreground-tertiary text-xs tracking-wide uppercase">
                            {t('welcome.error.login.errorDetailsLabel')}
                        </p>
                        <p className="text-foreground-secondary mt-1 font-mono text-xs break-all">
                            {reference}
                        </p>
                    </div>
                )}
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <Button onClick={() => reset()}>{t('welcome.error.login.tryAgain')}</Button>
                    <Button variant="outline" asChild>
                        <Link href={Routes.LOGIN}>{t('welcome.error.backToLogin')}</Link>
                    </Button>
                </div>
                <div className="text-foreground-secondary mt-4 flex flex-col gap-2 text-xs sm:flex-row sm:justify-center">
                    <button
                        type="button"
                        onClick={handleCopy}
                        className="hover:text-foreground-primary underline transition-colors"
                    >
                        {copied ? t('welcome.error.login.copied') : t('welcome.error.login.copyErrorDetails')}
                    </button>
                    <span className="hidden sm:inline">·</span>
                    <a
                        href={mailto}
                        className="hover:text-foreground-primary underline transition-colors"
                    >
                        {t('welcome.error.getHelp')}
                    </a>
                </div>
            </div>
        </div>
    );
}
