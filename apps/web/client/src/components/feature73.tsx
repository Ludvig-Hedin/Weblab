'use client';

import { type ReactNode } from 'react';
import Link from 'next/link';

import { Reveal } from '@/components/motion/reveal';
import { cn } from '@/lib/utils';

interface Feature73Item {
    title: string;
    description: string;
    icon?: ReactNode;
    /** Decorative element rendered above the title (replaces stock image). */
    visual?: ReactNode;
    href?: string;
    learnMoreLabel?: string;
}

interface Feature73Button {
    text: string;
    href: string;
    icon?: ReactNode;
}

interface Feature73Props {
    eyebrow?: string;
    heading: string;
    description?: string;
    items: Feature73Item[];
    button?: Feature73Button;
    className?: string;
}

/**
 * Weblab-themed card grid. Each card has a generative visual block at the
 * top (geometric pattern or icon stamp) instead of stock imagery, followed
 * by title + body. Borders only, no card backgrounds.
 */
const Feature73 = ({
    eyebrow,
    heading,
    description,
    items,
    button,
    className,
}: Feature73Props) => {
    return (
        <section className={cn(className)}>
            <div className="mx-auto w-full max-w-6xl px-4 py-24 sm:px-6 md:px-8 md:py-32">
                <div className="mb-16 max-w-3xl">
                    {eyebrow ? (
                        <Reveal as="p" delay={0} y={12} className="heading-style-h6 text-foreground-secondary mb-4">
                            {eyebrow}
                        </Reveal>
                    ) : null}
                    <Reveal as="h2" delay={0.1} y={16} className="heading-style-h3 text-foreground-primary mb-4 text-balance">
                        {heading}
                    </Reveal>
                    {description ? (
                        <Reveal as="p" delay={0.2} y={12} className="text-foreground-secondary text-regularPlus text-balance">
                            {description}
                        </Reveal>
                    ) : null}
                </div>
                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {items.map((item, i) => (
                        <Reveal
                            key={i}
                            delay={0.1 + i * 0.05}
                            y={20}
                            className="border-foreground-primary/10 hover:border-foreground-primary/25 group flex flex-col overflow-hidden rounded-lg border transition-colors"
                        >
                            <div className="border-foreground-primary/10 bg-background-secondary/40 relative flex aspect-[4/3] items-center justify-center border-b">
                                {item.visual ?? (
                                    <div className="text-foreground-primary/30 [&_svg]:h-12 [&_svg]:w-12">
                                        {item.icon}
                                    </div>
                                )}
                            </div>
                            <div className="flex flex-col gap-3 p-6">
                                {item.icon ? (
                                    <div className="text-foreground-primary [&_svg]:h-5 [&_svg]:w-5">
                                        {item.icon}
                                    </div>
                                ) : null}
                                <h3 className="text-foreground-primary text-regularPlus">
                                    {item.title}
                                </h3>
                                <p className="text-foreground-secondary text-regular leading-relaxed">
                                    {item.description}
                                </p>
                                {item.href ? (
                                    <Link
                                        href={item.href}
                                        className="text-foreground-tertiary group-hover:text-foreground-primary mt-2 inline-flex items-center gap-1 text-small transition-colors"
                                    >
                                        {item.learnMoreLabel ?? 'Learn more'}
                                        <span aria-hidden="true">→</span>
                                    </Link>
                                ) : null}
                            </div>
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

export { Feature73 };
export type { Feature73Props, Feature73Item };
