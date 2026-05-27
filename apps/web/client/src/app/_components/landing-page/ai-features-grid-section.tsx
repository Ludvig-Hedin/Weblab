import React from 'react';
import { useTranslations } from 'next-intl';

const CARDS = ['feedback', 'library', 'globalStyles', 'responsive', 'layers', 'templates'] as const;

export function AiFeaturesGridSection() {
    const t = useTranslations('landing.aiFeaturesGrid') as (key: string) => string;
    return (
        <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 md:px-8 md:py-32">
            <div className="grid grid-cols-1 gap-x-16 gap-y-20 md:grid-cols-3">
                {CARDS.map((card) => (
                    <div key={card}>
                        <h2 className="text-style-tagline mb-4">{t(`${card}.eyebrow`)}</h2>
                        <p className="heading-style-h5 text-foreground-primary mb-6 text-balance">
                            {t(`${card}.title`)}
                        </p>
                        <p className="text-foreground-secondary text-regular leading-[1.4] text-balance">
                            {t(`${card}.body`)}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}
