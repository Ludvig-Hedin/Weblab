'use client';

import { type ReactNode } from 'react';
import Link from 'next/link';

import { Reveal } from '@/components/motion/reveal';
import { cn } from '@/lib/utils';

interface Feature43Item {
    title: string;
    description: string;
    icon?: ReactNode;
    href?: string;
    eyebrow?: string;
}

interface Feature43Button {
    text: string;
    href: string;
    icon?: ReactNode;
}

interface Feature43Props {
    eyebrow?: string;
    heading?: string;
    description?: string;
    items: Feature43Item[];
    button?: Feature43Button;
    className?: string;
}

/**
 * Weblab-themed feature grid. Three columns on desktop, single column on
 * mobile, each cell composed of: small icon · title · body · optional
 * "Learn more" link. Restrained spacing, no card backgrounds — borders only.
 */
const Feature43 = ({
    eyebrow,
    heading,
    description,
    items,
    button,
    className,
}: Feature43Props) => {
    return (
        <section className={cn(className)}>
            <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 md:px-8 md:py-32">
                {(eyebrow || heading || description) && (
                    <div className="mb-16 max-w-3xl">
                        {eyebrow ? (
                            <Reveal as="p" delay={0} y={12} className="heading-style-h6 text-foreground-secondary mb-4">
                                {eyebrow}
                            </Reveal>
                        ) : null}
                        {heading ? (
                            <Reveal as="h2" delay={0.1} y={16} className="heading-style-h3 text-foreground-primary mb-4 text-balance">
                                {heading}
                            </Reveal>
                        ) : null}
                        {description ? (
                            <Reveal as="p" delay={0.2} y={12} className="text-foreground-secondary text-regularPlus text-balance">
                                {description}
                            </Reveal>
                        ) : null}
                    </div>
                )}
                <div className="grid grid-cols-1 gap-x-12 gap-y-14 md:grid-cols-2 lg:grid-cols-3">
                    {items.map((item, i) => (
                        <Reveal
                            key={i}
                            delay={0.1 + i * 0.05}
                            y={16}
                            className="flex flex-col"
                        >
                            <div className="text-foreground-primary border-foreground-primary/15 mb-5 inline-flex h-9 w-9 items-center justify-center rounded-md border">
                                {item.icon}
                            </div>
                            {item.eyebrow ? (
                                <span className="text-foreground-tertiary text-small mb-2 uppercase tracking-wide">
                                    {item.eyebrow}
                                </span>
                            ) : null}
                            <h3 className="text-foreground-primary mb-2 text-regularPlus">
                                {item.title}
                            </h3>
                            <p className="text-foreground-secondary text-regular leading-relaxed">
                                {item.description}
                            </p>
                            {item.href ? (
                                <Link
                                    href={item.href}
                                    className="text-foreground-tertiary hover:text-foreground-primary mt-4 inline-flex items-center gap-1 text-small transition-colors"
                                >
                                    Learn more
                                    <span aria-hidden="true">→</span>
                                </Link>
                            ) : null}
                        </Reveal>
                    ))}
                </div>
                {button ? (
                    <div className="mt-16 flex justify-start">
                        <Link
                            href={button.href}
                            className="text-foreground-primary border-foreground-primary/15 hover:bg-background-secondary inline-flex items-center gap-2 rounded-md border px-4 py-2 text-regular transition-colors"
                        >
                            {button.text}
                            {button.icon}
                        </Link>
                    </div>
                ) : null}
            </div>
        </section>
    );
};

export { Feature43 };
export type { Feature43Props, Feature43Item };
