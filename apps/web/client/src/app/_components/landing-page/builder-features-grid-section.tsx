import React from 'react';
import { useTranslations } from 'next-intl';

const CARDS = ['liveCode', 'layers', 'components', 'tailwind', 'responsive', 'templates'] as const;

export function BuilderFeaturesGridSection() {
    const t = useTranslations('landing.builderFeaturesGrid') as (key: string) => string;

    return (
        <div className="mx-auto w-full max-w-6xl px-8 py-16">
            <div className="grid grid-cols-1 gap-x-16 gap-y-20 md:grid-cols-3">
                {CARDS.map((card) => (
                    <div key={card}>
                        <h3 className="text-style-tagline mb-4">
                            {t(`${card}.eyebrow`)}
                        </h3>
                        <p className="heading-style-h5 text-foreground-primary mb-6 text-balance">
                            {t(`${card}.body`)}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}
