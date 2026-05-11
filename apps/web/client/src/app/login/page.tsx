'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { BrandLogo } from '@weblab/ui/brand';

import { transKeys } from '@/i18n/keys';
import { LocalForageKeys, Routes } from '@/utils/constants';
import { AuthForm } from '../_components/auth-form';
import pkg from '../../../package.json';

export default function LoginPage() {
    const t = useTranslations();
    const searchParams = useSearchParams();
    const returnUrl = searchParams.get(LocalForageKeys.RETURN_URL);
    const missingEmail = searchParams.get('missing') === 'email';
    const initialEmailError = missingEmail ? t('loginPage.verificationExpired') : null;

    return (
        <div className="flex h-screen w-screen items-center justify-center">
            <div className="flex h-full w-full max-w-xl flex-col justify-between space-y-8 overflow-auto p-16">
                <div className="flex items-center space-x-2">
                    <Link href={Routes.HOME} className="transition-opacity hover:opacity-80">
                        <BrandLogo className="h-5" />
                    </Link>
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
                    <p>{t(transKeys.welcome.version, { version: pkg.version })}</p>
                </div>
            </div>
        </div>
    );
}
