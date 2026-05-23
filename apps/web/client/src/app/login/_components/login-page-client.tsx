'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { BrandLogo } from '@weblab/ui/brand';

import { transKeys } from '@/i18n/keys';
import { Routes } from '@/utils/constants';
import { AuthForm } from '../../_components/auth-form';
import pkg from '../../../../package.json';

interface WeblabDesktopBridge {
    target?: string;
    version?: string;
}

interface LoginPageClientProps {
    returnUrl: string | null;
    initialEmailError: string | null;
}

export function LoginPageClient({ returnUrl, initialEmailError }: LoginPageClientProps) {
    const t = useTranslations();

    // In the desktop shell, clicking the logo to `/` triggers the middleware
    // redirect back to `/login` (extra hop + URL bar flash). And the in-app
    // version that matters to the user is the Electron build, not the bundled
    // web `pkg.version`. Read both from the preload bridge after mount so SSR
    // output stays identical for normal browser visitors.
    const [desktop, setDesktop] = useState<{ isDesktop: boolean; version: string | null }>({
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
            {/* Invisible drag strip so the window is movable in desktop mode. Uses an
                absolute overlay instead of adding desktop-drag-region to the outer div,
                which would apply the macOS traffic-light padding-left and shift the
                centered content off-axis. */}
            <div className="desktop-drag-region pointer-events-none absolute inset-x-0 top-0 h-10" />
            <div className="flex h-full w-full flex-col justify-between space-y-8 overflow-auto px-6 py-10 sm:max-w-xl sm:px-16 sm:py-16">
                <div className="flex items-center space-x-2">
                    {desktop.isDesktop ? (
                        <BrandLogo className="h-5" />
                    ) : (
                        <Link href={Routes.HOME} className="transition-opacity hover:opacity-80">
                            <BrandLogo className="h-5" />
                        </Link>
                    )}
                </div>
                <div className="space-y-8">
                    <div className="space-y-4">
                        <h1 className="text-title1 leading-tight">{t(transKeys.welcome.title)}</h1>
                        <p className="text-foreground-weblab text-regular">
                            {t(transKeys.welcome.description)}
                        </p>
                    </div>
                    <AuthForm
                        returnUrl={returnUrl}
                        initialEmailError={initialEmailError}
                        providerLayout="row"
                    />
                    <p className="text-small text-foreground-weblab">
                        {t(transKeys.welcome.terms.agreement)}{' '}
                        <Link
                            href="https://weblab.build/privacy-policy"
                            target="_blank"
                            className="text-foreground-secondary hover:text-foreground-primary underline transition-colors duration-200"
                        >
                            {t(transKeys.welcome.terms.privacy)}
                        </Link>{' '}
                        {t(transKeys.welcome.terms.and)}{' '}
                        <Link
                            href="https://weblab.build/terms-of-service"
                            target="_blank"
                            className="text-foreground-secondary hover:text-foreground-primary underline transition-colors duration-200"
                        >
                            {t(transKeys.welcome.terms.tos)}
                        </Link>
                    </p>
                </div>
                <div className="text-small text-foreground-tertiary flex flex-row space-x-1">
                    <p>
                        {t(transKeys.welcome.version, {
                            version: desktop.version ?? pkg.version,
                        })}
                    </p>
                </div>
            </div>
        </div>
    );
}
