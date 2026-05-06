'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import localforage from 'localforage';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import { LocalForageKeys, Routes } from '@/utils/constants';
import { sanitizeReturnUrl } from '@/utils/url';

const MANUAL_FALLBACK_DELAY_MS = 4000;

export function ClientFallback() {
    const router = useRouter();
    const [showManual, setShowManual] = useState(false);

    useEffect(() => {
        // Legacy: prior versions stashed returnUrl in localforage. Drain it here
        // so existing in-flight sessions still resolve. New flows use URL query.
        const handleRedirect = async () => {
            try {
                const returnUrl = await localforage.getItem<string>(LocalForageKeys.RETURN_URL);
                await localforage.removeItem(LocalForageKeys.RETURN_URL);
                const sanitizedUrl = sanitizeReturnUrl(returnUrl);
                router.replace(sanitizedUrl === Routes.HOME ? Routes.PROJECTS : sanitizedUrl);
            } catch (error) {
                console.warn('[auth-redirect] Failed to read stored returnUrl', {
                    error: error instanceof Error ? error.message : String(error),
                });
                router.replace(Routes.PROJECTS);
            }
        };
        handleRedirect();

        const timer = setTimeout(() => setShowManual(true), MANUAL_FALLBACK_DELAY_MS);
        return () => clearTimeout(timer);
    }, [router]);

    return (
        <div className="flex h-screen w-screen items-center justify-center">
            {/* noscript fallback: if JS is disabled the meta-refresh ships the user to /projects */}
            <noscript>
                {}
                <meta httpEquiv="refresh" content={`0; url=${Routes.PROJECTS}`} />
            </noscript>
            <div className="flex flex-col items-center gap-4 text-center">
                <Icons.Shadow className="text-foreground-secondary h-6 w-6 animate-spin" />
                <h1 className="text-xl font-medium">Signing you in…</h1>
                <p className="text-foreground-secondary text-sm">
                    One moment while we redirect you.
                </p>
                {showManual && (
                    <Button asChild variant="outline" className="mt-2">
                        <Link href={Routes.PROJECTS}>Continue</Link>
                    </Button>
                )}
            </div>
        </div>
    );
}
