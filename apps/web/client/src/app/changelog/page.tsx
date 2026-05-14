import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { format, isValid, parseISO } from 'date-fns';

import { WebsiteLayout } from '@/app/_components/website-layout';
import { breadcrumbSchema } from '@/app/seo';
import { CHANGELOG_ENTRIES } from '@/lib/changelog-entries';
import { buildPageMetadata } from '@/lib/seo-metadata';

const breadcrumbsJsonLd = breadcrumbSchema([
    { name: 'Home', path: '/' },
    { name: 'Changelog', path: '/changelog' },
]);

export async function generateMetadata(): Promise<Metadata> {
    return buildPageMetadata({
        pageKey: 'changelog',
        path: '/changelog',
    });
}

function formatEntryDate(date: string): string {
    const parsed = parseISO(date);
    return isValid(parsed) ? format(parsed, 'MMM d, yyyy') : date;
}

export default async function ChangelogPage() {
    const t = await getTranslations('changelogPage');
    return (
        <WebsiteLayout showFooter>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbsJsonLd) }}
            />
            <main className="mx-auto w-full max-w-6xl px-4 pt-28 pb-24 md:px-8 md:pt-32">
                <header className="mb-16">
                    <p className="text-foreground-tertiary mb-2 text-xs font-medium">
                        {t('eyebrow')}
                    </p>
                    <h1 className="text-foreground-primary text-3xl font-light tracking-tight md:text-4xl">
                        {t('heading')}
                    </h1>
                </header>

                <div className="flex flex-col">
                    {CHANGELOG_ENTRIES.map((entry, index) => (
                        <div key={entry.slug}>
                            {index > 0 && (
                                <div className="border-foreground-primary/10 my-12 border-t" />
                            )}
                            <div className="flex flex-col md:flex-row md:gap-16">
                                {/* Left: version + date */}
                                <div className="mb-4 md:mb-0 md:w-40 md:shrink-0 md:pt-1">
                                    <span className="border-foreground-primary/20 text-foreground-secondary mb-2 inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium">
                                        v{entry.version}
                                    </span>
                                    <p className="text-foreground-tertiary text-sm">
                                        {formatEntryDate(entry.date)}
                                    </p>
                                </div>

                                {/* Right: content */}
                                <div className="flex-1">
                                    <h2 className="text-foreground-primary mb-3 text-xl leading-tight font-normal md:text-2xl">
                                        {entry.title}
                                    </h2>
                                    <p className="text-foreground-secondary mb-5 max-w-2xl text-sm leading-relaxed">
                                        {entry.description}
                                    </p>
                                    {entry.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-2">
                                            {entry.tags.map((tag) => (
                                                <span
                                                    key={tag}
                                                    className="text-foreground-tertiary bg-foreground-primary/[0.04] border-foreground-primary/10 rounded-full border px-2.5 py-1 text-xs"
                                                >
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </main>
        </WebsiteLayout>
    );
}
