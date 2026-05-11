import React from 'react';
import { useTranslations } from 'next-intl';

import { APP_NAME } from '@weblab/constants';

const CARDS = ['components', 'teams', 'prs', 'layers', 'codebase', 'history'] as const;

export function FeaturesGridSection() {
    const t = useTranslations('landing.featuresGrid') as (
        key: string,
        values?: Record<string, string>,
    ) => string;

    return (
        <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 md:px-8 md:py-32">
            <div className="grid grid-cols-1 gap-x-16 gap-y-20 md:grid-cols-3">
                {CARDS.map((card) => (
                    <div key={card}>
                        <h3 className="heading-style-h6 text-foreground-secondary mb-4">
                            {t(`${card}.eyebrow`)}
                        </h3>
                        <p className="heading-style-h5 text-foreground-primary mb-6 text-balance">
                            {t(`${card}.title`)}
                        </p>
                        <p className="text-foreground-secondary text-regular leading-relaxed text-balance">
                            {card === 'history'
                                ? t(`${card}.body`, { appName: APP_NAME })
                                : t(`${card}.body`)}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}
