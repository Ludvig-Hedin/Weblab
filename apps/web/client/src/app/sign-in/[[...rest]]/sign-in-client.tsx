'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { BrandLogo } from '@weblab/ui/brand';

import { transKeys } from '@/i18n/keys';
import { Routes } from '@/utils/constants';
import { ClerkAuthForm } from '../_components/clerk-auth-form';
import pkg from '../../../../package.json';

interface WeblabDesktopBridge {
    target?: string;
    version?: string;
}

interface SignInClientProps {
    returnUrl: string | null;
}

/**
 * Custom Clerk-powered sign-in layout. Visually identical to /login so users
 * never see the Clerk migration as a UI change. The OAuth + email flows are
 * driven by Clerk's `useSignIn` hook (see <ClerkAuthForm />); there is no
 * Clerk-branded UI on the page.
 */
export function SignInClient({ returnUrl }: SignInClientProps) {
    const t = useTranslations();

    // Same desktop-bridge handling as /login so the in-app build hides the
    // home link and reads the Electron version instead of the bundled web one.
    const [desktop, setDesktop] = useState<{
        isDesktop: boolean;
        version: string | null;
    }>({
        isDesktop: false,
        version: null,
    });
    useEffect(() => {
        const bridge = (window as unknown as { weblabDesktop?: WeblabDesktopBridge }).weblabDesktop;
        if (bridge?.target === 'desktop') {
            setDesktop({ isDesktop: true, version: bridge.version ?? null });
        }
    }, []);

    return (
        <div className="relative flex h-screen w-screen items-center justify-center">
            {/* Invisible drag strip so the window is movable in desktop mode. */}
            <div className="desktop-drag-region pointer-events-none absolute inset-x-0 top-0 h-10" />
            <div className="flex h-full w-full flex-col items-center justify-between overflow-auto px-6 py-10 sm:max-w-xl sm:px-16 sm:py-16">
                <div className="flex items-center space-x-2">
                    {desktop.isDesktop ? (
                        <BrandLogo className="h-5" />
                    ) : (
                        <Link href={Routes.HOME} className="transition-opacity hover:opacity-80">
                            <BrandLogo className="h-5" />
                        </Link>
                    )}
                </div>
                <div className="flex w-full flex-col items-center space-y-8 text-center">
                    {/* Tight title → description spacing (space-y-2) keeps the
                        two lines reading as one block. `text-balance` shifts
                        the line break so we never strand a single word like
                        "required" on the second line at sm/md widths. */}
                    <div className="space-y-2">
                        <h1 className="text-title1 leading-tight">{t(transKeys.welcome.title)}</h1>
                        <p className="text-foreground-weblab text-regular text-balance">
                            {t(transKeys.welcome.description)}
                        </p>
                    </div>
                    <ClerkAuthForm returnUrl={returnUrl} />
                </div>
                {/* Footer row: version label on the left, terms on the right,
                    both rendered in the same muted tertiary color so they
                    read as one piece of metadata at the bottom of the page.
                    On narrow viewports the terms wrap below the version. */}
                <div className="text-small text-foreground-tertiary flex w-full flex-col items-center justify-between gap-2">
                    <p>
                        {t(transKeys.welcome.version, {
                            version: desktop.version ?? pkg.version,
                        })}
                    </p>
                    <p>
                        {t(transKeys.welcome.terms.agreement)}{' '}
                        <Link
                            href="/privacy-policy"
                            className="hover:text-foreground-primary underline transition-colors duration-200"
                        >
                            {t(transKeys.welcome.terms.privacy)}
                        </Link>{' '}
                        {t(transKeys.welcome.terms.and)}{' '}
                        <Link
                            href="/terms-of-service"
                            className="hover:text-foreground-primary underline transition-colors duration-200"
                        >
                            {t(transKeys.welcome.terms.tos)}
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}
