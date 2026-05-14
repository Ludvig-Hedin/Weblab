import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { APP_NAME } from '@weblab/constants';
import { Button } from '@weblab/ui/button';

import { CTASection } from '../_components/landing-page/cta-section';
import { WebsiteLayout } from '../_components/website-layout';
import { ComparisonMatrixSection } from './_components/comparison-matrix-section';

const COMPETITORS = [
    { slug: 'lovable', name: 'Lovable', key: 'lovable' },
    { slug: 'bolt', name: 'Bolt', key: 'bolt' },
    { slug: 'v0', name: 'v0 by Vercel', key: 'v0' },
    { slug: 'webflow', name: 'Webflow', key: 'webflow' },
    { slug: 'framer', name: 'Framer', key: 'framer' },
    { slug: 'replit', name: 'Replit', key: 'replit' },
    { slug: 'claude-code', name: 'Claude Code', key: 'claudeCode' },
    { slug: 'emergent', name: 'Emergent', key: 'emergent' },
    { slug: 'wix', name: 'Wix', key: 'wix' },
    { slug: 'one-com', name: 'one.com', key: 'oneCom' },
    { slug: 'onlook', name: 'Onlook', key: 'onlook' },
] as const;

export default async function CompareIndexPage() {
    const t = (await getTranslations('comparePage')) as unknown as (
        key: string,
        values?: Record<string, string>,
    ) => string;

    return (
        <WebsiteLayout showFooter={true}>
            <section className="sr-only" aria-label="Compare Weblab to AI design tools">
                <p>{t('srBody', { appName: APP_NAME })}</p>
            </section>

            <main className="bg-background text-foreground-primary">
                <section className="bg-background py-40">
                    <div className="mx-auto max-w-6xl px-8">
                        <h1 className="mb-8 text-5xl leading-tight font-light md:text-6xl">
                            {t('heroHeading', { appName: APP_NAME })}
                        </h1>
                        <p className="text-foreground-secondary max-w-2xl text-lg md:text-xl">
                            {t('heroBody', { appName: APP_NAME })}
                        </p>
                        <div className="mt-12">
                            <Button asChild>
                                <Link href="/projects">{t('tryButton', { appName: APP_NAME })}</Link>
                            </Button>
                        </div>
                    </div>
                </section>

                <ComparisonMatrixSection />

                <section className="border-foreground-tertiary/10 border-t py-32">
                    <div className="mx-auto max-w-6xl px-8">
                        <h2 className="mb-16 text-4xl font-light md:text-5xl">
                            {t('pickHeading')}
                        </h2>
                        <ul className="grid gap-6 md:grid-cols-2">
                            {COMPETITORS.map((c) => (
                                <li key={c.slug}>
                                    <Link
                                        href={`/compare/${c.slug}`}
                                        className="border-foreground-tertiary/30 hover:border-foreground-primary/60 group block rounded border p-8 transition-colors"
                                    >
                                        <p className="text-foreground-tertiary mb-2 text-sm tracking-wide uppercase">
                                            {t(`competitors.${c.key}.tagline`)}
                                        </p>
                                        <h3 className="mb-3 text-2xl font-light md:text-3xl">
                                            {t('vs', { appName: APP_NAME, name: c.name })}
                                        </h3>
                                        <p className="text-foreground-secondary text-base">
                                            {t(`competitors.${c.key}.oneLiner`, {
                                                appName: APP_NAME,
                                            })}
                                        </p>
                                        <p className="text-foreground-primary mt-4 text-sm">
                                            {t('readComparison')}
                                        </p>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                <CTASection
                    href="/projects"
                    ctaText={`${t('ctaLine1')}\n${t('ctaLine2', { appName: APP_NAME })}`}
                    buttonText={t('ctaButton')}
                />
            </main>
        </WebsiteLayout>
    );
}
