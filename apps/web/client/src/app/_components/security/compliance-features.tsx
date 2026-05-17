'use client';

import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons';

import type { Feature43Item } from '@/components/feature43';
import { Feature43 } from '@/components/feature43';

export function SecurityComplianceFeatures() {
    const tFn = useTranslations('security.compliance');
    const t = tFn as unknown as (key: string) => string;

    const items: Feature43Item[] = [
        {
            title: t('items.gdpr.title'),
            description: t('items.gdpr.body'),
            icon: <Icons.CheckCircled className="h-4 w-4" />,
            eyebrow: 'EU',
        },
        {
            title: t('items.ccpa.title'),
            description: t('items.ccpa.body'),
            icon: <Icons.CheckCircled className="h-4 w-4" />,
            eyebrow: 'California',
        },
        {
            title: t('items.iso.title'),
            description: t('items.iso.body'),
            icon: <Icons.CheckCircled className="h-4 w-4" />,
            eyebrow: 'ISO 27001',
        },
        {
            title: t('items.soc.title'),
            description: t('items.soc.body'),
            icon: <Icons.CheckCircled className="h-4 w-4" />,
            eyebrow: 'SOC 2',
        },
        {
            title: t('items.oss.title'),
            description: t('items.oss.body'),
            icon: <Icons.CheckCircled className="h-4 w-4" />,
            eyebrow: 'Apache-2.0',
        },
        {
            title: t('items.disclosure.title'),
            description: t('items.disclosure.body'),
            icon: <Icons.CheckCircled className="h-4 w-4" />,
            eyebrow: 'CVD',
        },
    ];

    return (
        <section>
            <Feature43
                eyebrow={t('eyebrow') ?? 'Compliance'}
                heading={t('title')}
                description={t('subtitle')}
                items={items}
            />
            {/* Disclaimer sits in its own wrapper so the Feature43 grid stays clean */}
            <div className="mx-auto w-full max-w-6xl px-4 pb-12 sm:px-6 md:px-8">
                <p className="text-foreground-tertiary text-small max-w-3xl leading-relaxed">
                    {t('disclaimer')}
                </p>
            </div>
        </section>
    );
}
