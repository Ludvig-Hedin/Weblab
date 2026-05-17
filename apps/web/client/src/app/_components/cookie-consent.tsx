'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import CookieConsentLib, { getCookieConsentValue } from 'react-cookie-consent';

import { env } from '@/env';

const COOKIE_NAME = 'weblab.consent';
const ACCEPTED = 'accepted';
const REJECTED = 'rejected';

export function CookieConsent() {
    const analyticsConfigured = Boolean(
        env.NEXT_PUBLIC_POSTHOG_KEY || env.NEXT_PUBLIC_GLEAP_API_KEY,
    );
    const t = useTranslations('security.cookies');
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!analyticsConfigured || !mounted) {
        return null;
    }

    const existing = getCookieConsentValue(COOKIE_NAME);
    if (existing === ACCEPTED || existing === REJECTED) {
        return null;
    }

    return (
        <CookieConsentLib
            cookieName={COOKIE_NAME}
            cookieValue={ACCEPTED}
            declineCookieValue={REJECTED}
            buttonText={t('accept')}
            declineButtonText={t('reject')}
            enableDeclineButton
            flipButtons
            location="none"
            disableStyles
            disableButtonStyles
            containerClasses="border-foreground-primary/10 bg-background-primary fixed bottom-4 left-4 z-50 w-[min(360px,calc(100vw-2rem))] rounded-md border p-4 shadow-sm"
            contentClasses="text-foreground-primary text-regularPlus"
            buttonWrapperClasses="mt-4 flex items-center gap-2"
            buttonClasses="text-foreground-primary border-foreground-primary/15 hover:bg-background-secondary inline-flex items-center rounded-md border px-3 py-1.5 text-regular transition-colors"
            declineButtonClasses="text-foreground-secondary hover:text-foreground-primary inline-flex items-center px-3 py-1.5 text-regular transition-colors"
            ariaAcceptLabel={t('accept')}
            ariaDeclineLabel={t('reject')}
            onAccept={() => {
                if (typeof window !== 'undefined') {
                    window.location.reload();
                }
            }}
        >
            <span className="block">{t('title')}</span>
            <span className="text-foreground-secondary text-small mt-1 block leading-relaxed">
                {t('body')}
            </span>
        </CookieConsentLib>
    );
}
