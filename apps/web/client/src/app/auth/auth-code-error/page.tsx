import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { Button } from '@weblab/ui/button';

import { Routes } from '@/utils/constants';

const SUPPORT_EMAIL = 'support@weblab.build';

const REASON_KEYS = [
    'missing_email',
    'missing_user_id',
    'db_upsert_failed',
    'missing_code',
    'callback_exception',
    'oauth',
    'default',
] as const;

type ReasonKey = (typeof REASON_KEYS)[number];

function isOwnReasonKey(value: string): value is ReasonKey {
    return (REASON_KEYS as readonly string[]).includes(value);
}

function resolveReasonKey(value: string | undefined): ReasonKey {
    if (value === undefined || value === 'default') return 'default';
    if (isOwnReasonKey(value)) return value;
    if (value.startsWith('oauth_')) return 'oauth';
    return 'default';
}

function isDisplayableReason(value: string | undefined): value is string {
    if (value === undefined) return false;
    if (isOwnReasonKey(value)) return true;
    return /^oauth_[a-z0-9_]{1,40}$/.test(value);
}

interface AuthCodeErrorPageProps {
    searchParams: Promise<{ code?: string; reason?: string }>;
}

export default async function AuthCodeErrorPage({ searchParams }: AuthCodeErrorPageProps) {
    const { code, reason } = await searchParams;
    const t = (await getTranslations('authCodeError')) as unknown as (key: string) => string;
    const reasonKey: ReasonKey = resolveReasonKey(reason);
    const title = t(`reasons.${reasonKey}.title`);
    const body = t(`reasons.${reasonKey}.body`);
    const displayReason = isDisplayableReason(reason) ? reason : reasonKey;

    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
        t('supportSubject'),
    )}&body=${encodeURIComponent(
        `Reason: ${displayReason}\nError code: ${code ?? 'unknown'}\n\n`,
    )}`;

    const showCode = !!code;

    return (
        <div className="bg-background flex min-h-screen items-center justify-center px-6">
            <div className="border-border bg-card w-full max-w-md rounded-2xl border p-8 text-center shadow-2xl">
                <p className="text-foreground-tertiary text-sm ">
                    {t('eyebrow')}
                </p>
                <h1 className="text-foreground mt-3 text-3xl font-semibold">{title}</h1>
                <p className="text-foreground-secondary mt-4 text-sm leading-6">{body}</p>
                {showCode && (
                    <div className="border-border bg-background mt-4 rounded-md border p-3 text-left">
                        <p className="text-foreground-tertiary text-xs tracking-wide uppercase">
                            {t('errorCodeLabel')}
                        </p>
                        <p className="text-foreground-secondary mt-1 font-mono text-xs break-all">
                            {code}
                        </p>
                    </div>
                )}
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                    <Button asChild>
                        <Link href={Routes.LOGIN}>{t('backToLogin')}</Link>
                    </Button>
                    <Button variant="outline" asChild>
                        <Link href={Routes.HOME}>{t('goHome')}</Link>
                    </Button>
                </div>
                <div className="text-foreground-secondary mt-4 text-xs">
                    <a
                        href={mailto}
                        className="hover:text-foreground-primary underline transition-colors"
                    >
                        {t('getHelp')}
                    </a>
                </div>
            </div>
        </div>
    );
}
