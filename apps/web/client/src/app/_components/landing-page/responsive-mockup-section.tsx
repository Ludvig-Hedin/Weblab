import React from 'react';
import { useTranslations } from 'next-intl';

import { WeblabInterfaceMockup } from './weblab-interface-mockup';

export function ResponsiveMockupSection() {
    const t = useTranslations('landing.responsiveMockup');
    return (
        <>
            {/* Desktop/Tablet anchor target only — the hero already renders the
                full editor mockup, so we avoid showing it a second time here.
                Keep the id so existing #features deep links still scroll
                cleanly to this region. */}
            <div className="hidden h-0 w-full md:block" id="features" aria-hidden />

            {/* Mobile View - Split into two sections */}
            <div className="md:hidden">
                <div
                    className="relative flex w-screen flex-col items-center justify-center overflow-hidden py-14"
                    id="features-mobile-1"
                >
                    <div className="absolute top-1/2 right-10 h-[800px] w-[1000px] -translate-y-1/2 transform">
                        <WeblabInterfaceMockup />
                    </div>

                    <div className="mt-[700px] px-8 text-left">
                        <h2 className="heading-style-h4 text-foreground-primary mb-4 text-balance">
                            {t('panel1.title')}
                        </h2>
                        <p className="text-large text-foreground-secondary leading-relaxed text-balance">
                            {t('panel1.body')}
                        </p>
                    </div>
                </div>

                <div
                    className="relative flex w-screen flex-col items-center justify-center overflow-hidden py-14"
                    id="features-mobile-2"
                >
                    <div className="absolute top-1/2 left-10 h-[800px] w-[1000px] -translate-y-1/2 transform">
                        <WeblabInterfaceMockup />
                    </div>

                    <div className="mt-[700px] px-8 text-left">
                        <h2 className="heading-style-h4 text-foreground-primary mb-4 text-balance">
                            {t('panel2.title')}
                        </h2>
                        <p className="text-large text-foreground-secondary leading-relaxed text-balance">
                            {t('panel2.body')}
                        </p>
                    </div>
                </div>
            </div>
        </>
    );
}
