import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import { Button } from '@weblab/ui/button';

import { Routes } from '@/utils/constants';

const SUPPORT_EMAIL = 'support@weblab.build';

interface AuthCodeErrorPageProps {
    searchParams: Promise<{ code?: string }>;
}

export default async function AuthCodeErrorPage({ searchParams }: AuthCodeErrorPageProps) {
    const { code } = await searchParams;
    const t = await getTranslations();
    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
        t('welcome.error.authCode.eyebrow'),
    )}&body=${encodeURIComponent(`${t('welcome.error.authCode.errorCodeLabel')}: ${code ?? 'unknown'}\n\n`)}`;

    return (
        <div className="bg-background flex min-h-screen items-center justify-center px-6">
            <div className="border-border bg-card w-full max-w-md rounded-2xl border p-8 text-center shadow-2xl">
                <p className="text-foreground-tertiary text-sm tracking-[0.2em] uppercase">
                    {t('welcome.error.authCode.eyebrow')}
                </p>
                <h1 className="text-foreground mt-3 text-3xl font-semibold">{t('welcome.error.authCode.title')}</h1>
                <p className="text-foreground-secondary mt-4 text-sm leading-6">{t('welcome.error.authCode.body')}</p>
                {code && (
                    <div className="border-border bg-background mt-4 rounded-md border p-3 text-left">
                        <p className="text-foreground-tertiary text-xs tracking-wide uppercase">
                            {t('welcome.error.authCode.errorCodeLabel')}
                        </p>
                        <p className="text-foreground-secondary mt-1 font-mono text-xs break-all">
                            {code}
                        </p>
                    </div>
                )}
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <Button asChild>
                        <Link href={Routes.LOGIN}>{t('welcome.error.backToLogin')}</Link>
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href={Routes.HOME}>{t('welcome.error.authCode.goHome')}</Link>
                    </Button>
                </div>
                <div className="text-foreground-secondary mt-4 text-xs">
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
