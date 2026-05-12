'use client';

import { useTranslations } from 'next-intl';

import { Compliance1, type ComplianceFeature } from '@/components/compliance1';

export function SecurityDataFeatures() {
    const tFn = useTranslations('security.data');
    const t = tFn as unknown as (key: string) => string;

    const features: ComplianceFeature[] = [
        { title: t('items.tls.title'), description: t('items.tls.body'), badgeAlt: 'TLS' },
        { title: t('items.oauth.title'), description: t('items.oauth.body'), badgeAlt: 'OAuth' },
        { title: t('items.aiTraining.title'), description: t('items.aiTraining.body'), badgeAlt: 'AI' },
        { title: t('items.oss.title'), description: t('items.oss.body'), badgeAlt: 'OSS' },
    ];

    return (
        <Compliance1
            tagline={t('eyebrow') ?? 'Your data'}
            heading={t('title')}
            description={t('subtitle')}
            badges={[
                { alt: 'GDPR-aligned' },
                { alt: 'CCPA-aligned' },
                { alt: 'Apache-2.0' },
            ]}
            features={features}
        />
    );
}
