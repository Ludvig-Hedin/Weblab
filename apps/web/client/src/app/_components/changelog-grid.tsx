import Link from 'next/link';
import { format, isValid, parseISO } from 'date-fns';

import { Reveal } from '@/components/motion/reveal';
import { CHANGELOG_ENTRIES } from '@/lib/changelog-entries';
import { Routes } from '@/utils/constants';

interface ChangelogGridProps {
    limit?: number;
}

function formatEntryDate(date: string): string {
    const parsed = parseISO(date);
    return isValid(parsed) ? format(parsed, 'MMM d, yyyy') : date;
}

export function ChangelogGrid({ limit = 4 }: ChangelogGridProps) {
    const entries = CHANGELOG_ENTRIES.slice(0, limit);

    return (
        <section className="mx-auto w-full max-w-6xl px-4 py-16 md:px-8">
            <div className="mb-6 flex items-baseline justify-between">
                <div>
                    <p className="heading-style-h6 text-foreground-tertiary mb-1">
                        What&apos;s new
                    </p>
                    <h2 className="heading-style-h4 text-foreground-primary">Changelog</h2>
                </div>
                <Link
                    href={Routes.CHANGELOG}
                    className="text-foreground-secondary hover:text-foreground-primary text-sm transition-colors"
                >
                    See all updates →
                </Link>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {entries.map((entry, idx) => (
                    <Reveal key={entry.slug} delay={idx * 0.06}>
                        <Link
                            href={Routes.CHANGELOG}
                            className="group ring-foreground-primary/10 bg-foreground-primary/[0.03] hover:bg-foreground-primary/[0.05] flex flex-col gap-3 rounded-xl p-5 ring-1 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <span className="border-foreground-primary/20 text-foreground-secondary rounded-full border px-2 py-0.5 text-xs font-medium">
                                    v{entry.version}
                                </span>
                                <span className="text-foreground-tertiary text-xs">
                                    {formatEntryDate(entry.date)}
                                </span>
                            </div>
                            <p className="text-foreground-primary text-sm leading-snug font-normal">
                                {entry.title}
                            </p>
                            {entry.tags.length > 0 && (
                                <div className="mt-auto flex flex-wrap gap-1.5">
                                    {entry.tags.slice(0, 2).map((tag) => (
                                        <span
                                            key={tag}
                                            className="text-foreground-tertiary bg-foreground-primary/[0.04] rounded px-1.5 py-0.5 text-xs"
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </Link>
                    </Reveal>
                ))}
            </div>
        </section>
    );
}
