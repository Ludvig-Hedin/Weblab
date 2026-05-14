'use client';

import { useTranslations } from 'next-intl';

import { Reveal } from '@/components/motion/reveal';

const rows = [
    { id: 'supabase', optional: false },
    { id: 'openrouter', optional: false },
    { id: 'stripe', optional: false },
    { id: 'railway', optional: false },
    { id: 'github', optional: false },
    { id: 'posthog', optional: true },
    { id: 'gleap', optional: true },
    { id: 'resend', optional: true },
] as const;

const REGION_TONE: Record<string, string> = {
    EU: 'bg-foreground-primary/5 text-foreground-primary',
    'US / EU': 'bg-foreground-primary/5 text-foreground-primary',
    US: 'bg-foreground-primary/5 text-foreground-primary',
};

export function SecuritySubprocessors() {
    const tFn = useTranslations('security.subprocessors');
    const t = tFn as unknown as ((key: string) => string) & {
        (key: string, values: Record<string, string | number>): string;
    };

    return (
        <section id="subprocessors" className="scroll-mt-24">
            <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 md:px-8 md:py-32">
                <div className="mb-12 max-w-3xl">
                    <Reveal as="p" delay={0} y={12} className="heading-style-h6 text-foreground-secondary mb-4">
                        {t('eyebrow') ?? 'Vendors'}
                    </Reveal>
                    <Reveal as="h2" delay={0.1} y={16} className="heading-style-h3 text-foreground-primary mb-4 text-balance">
                        {t('title')}
                    </Reveal>
                    <Reveal as="p" delay={0.2} y={12} className="text-foreground-secondary text-regularPlus text-balance">
                        {t('subtitle')}
                    </Reveal>
                </div>
                <Reveal delay={0.3} y={20}>
                    <div className="border-foreground-primary/10 overflow-hidden rounded-lg border">
                        <table className="w-full border-collapse text-left">
                            <thead>
                                <tr className="border-foreground-primary/10 border-b">
                                    <th className="text-foreground-tertiary text-small w-[28%] px-5 py-4 font-normal ">
                                        {t('columns.name')}
                                    </th>
                                    <th className="text-foreground-tertiary text-small px-5 py-4 font-normal ">
                                        {t('columns.purpose')}
                                    </th>
                                    <th className="text-foreground-tertiary text-small w-[20%] px-5 py-4 font-normal ">
                                        {t('columns.region')}
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row, i) => {
                                    const region = t(`rows.${row.id}.region`);
                                    return (
                                        <tr
                                            key={row.id}
                                            className={
                                                i !== rows.length - 1
                                                    ? 'border-foreground-primary/10 border-b'
                                                    : ''
                                            }
                                        >
                                            <td className="px-5 py-4">
                                                <span className="text-foreground-primary text-regular font-mono">
                                                    {t(`rows.${row.id}.name`)}
                                                </span>
                                                {row.optional ? (
                                                    <span className="text-foreground-tertiary ml-1.5">
                                                        *
                                                    </span>
                                                ) : null}
                                            </td>
                                            <td className="text-foreground-secondary text-regular px-5 py-4">
                                                {t(`rows.${row.id}.purpose`)}
                                            </td>
                                            <td className="px-5 py-4">
                                                <span
                                                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-micro r ${
                                                        REGION_TONE[region] ??
                                                        'bg-foreground-primary/5 text-foreground-primary'
                                                    }`}
                                                >
                                                    {region}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Reveal>
                <div className="text-foreground-tertiary mt-6 flex flex-col gap-1 text-small">
                    <p>{t('note')}</p>
                    <p>{t('lastUpdated', { date: '2026-05-12' })}</p>
                </div>
            </div>
        </section>
    );
}
