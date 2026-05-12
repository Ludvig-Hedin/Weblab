'use client';

import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons';

import { Compare7, type Compare7Row } from '@/components/compare7';

const rowKeys = ['code', 'source', 'export', 'aiOptOut', 'standards', 'region'] as const;

export function SecurityCompare() {
    const tFn = useTranslations('security.compare');
    const t = tFn as unknown as (key: string) => string;

    const rows: Compare7Row[] = rowKeys.map((row) => ({
        feature: t(`rows.${row}.label`),
        primary: t(`rows.${row}.weblab`),
        secondary: t(`rows.${row}.typical`),
        primaryIcon: <Icons.Check className="text-foreground-primary h-4 w-4 shrink-0" />,
    }));

    return (
        <Compare7
            eyebrow={t('eyebrow') ?? 'Comparison'}
            heading={t('title')}
            description={t('subtitle')}
            featureColumnLabel={t('columns.feature')}
            primaryLabel={t('columns.weblab')}
            secondaryLabel={t('columns.typical')}
            rows={rows}
        />
    );
}
