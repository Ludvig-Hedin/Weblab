import React from 'react';
import { useTranslations } from 'next-intl';

export function AiFeaturesIntroSection() {
    const t = useTranslations('landing.aiFeaturesIntro');
    return (
        <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 md:px-8 md:py-32 text-center">
            <div className="mx-auto max-w-3xl">
                <h2 className="heading-style-h6 text-foreground-secondary mb-6">{t('eyebrow')}</h2>
                <p className="heading-style-h3 text-foreground-primary mb-8 text-balance">
                    {t('headline')}
                </p>
                <p className="text-foreground-secondary mx-auto max-w-xl text-lg text-balance">
                    {t('body')}
                </p>
            </div>
        </div>
    );
}
