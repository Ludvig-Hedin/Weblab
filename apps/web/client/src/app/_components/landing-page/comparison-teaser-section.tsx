'use client';

import Link from 'next/link';
import { motion } from 'motion/react';

import { Icons } from '@weblab/ui/icons';

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

const COMPETITORS = [
    { label: 'Lovable', slug: 'lovable' },
    { label: 'Bolt', slug: 'bolt' },
    { label: 'v0', slug: 'v0' },
    { label: 'Webflow', slug: 'webflow' },
    { label: 'Claude Code', slug: 'claude-code' },
] as const;

export function ComparisonTeaserSection() {
    return (
        <section className="w-full py-24">
            <div className="mx-auto max-w-6xl px-8">
                <motion.div
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.2 }}
                    transition={{ duration: 0.6, ease: EASE }}
                    className="flex flex-col gap-8"
                >
                    {/* Eyebrow */}
                    <p className="text-foreground-secondary text-sm font-medium">
                        Compare
                    </p>

                    {/* Heading + subtext */}
                    <div className="flex flex-col gap-4">
                        <h2 className="text-4xl font-light text-balance md:text-5xl">
                            See how Weblab stacks up
                        </h2>
                        <p className="text-foreground-secondary max-w-xl text-lg leading-relaxed font-light">
                            Built for teams that care about design quality. See how Weblab compares
                            to every alternative.
                        </p>
                    </div>

                    {/* Competitor chips */}
                    <div className="flex flex-wrap gap-3">
                        {COMPETITORS.map(({ label, slug }) => (
                            <Link
                                key={slug}
                                href={`/compare/${slug}`}
                                className="border-foreground-primary/20 text-foreground-secondary hover:border-foreground-primary/60 hover:text-foreground-primary rounded-full border px-4 py-2 text-sm transition-colors"
                            >
                                {label}
                            </Link>
                        ))}
                    </div>

                    {/* View all link */}
                    <Link
                        href="/compare"
                        className="text-foreground-primary flex w-fit items-center gap-2 text-sm transition-opacity hover:opacity-70"
                    >
                        View all comparisons
                        <Icons.ArrowRight className="h-4 w-4" />
                    </Link>
                </motion.div>
            </div>
        </section>
    );
}
