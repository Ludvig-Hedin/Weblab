'use client';

import { type ReactNode } from 'react';
import Link from 'next/link';

import { Button } from '@weblab/ui/button';

import { Reveal } from '@/components/motion/reveal';
import { SplitText } from '@/components/motion/split-text';
import { cn } from '@/lib/utils';

interface Hero7Button {
    text: string;
    href: string;
    icon?: ReactNode;
    variant?: 'primary' | 'ghost';
}

interface Hero7Props {
    eyebrow?: string;
    eyebrowIcon?: ReactNode;
    heading: string;
    description?: string;
    primaryButton?: Hero7Button;
    secondaryButton?: Hero7Button;
    /** Optional decorative slot rendered behind the hero copy at low opacity. */
    backdrop?: ReactNode;
    className?: string;
}

/**
 * Weblab-themed hero block. Designed to sit at the top of marketing pages
 * (security, compliance, downloads) where the page does not have its own
 * full landing-page hero. Restrained typography, eyebrow pill, two CTAs,
 * optional decorative backdrop slot (e.g. a giant brand watermark).
 */
const Hero7 = ({
    eyebrow,
    eyebrowIcon,
    heading,
    description,
    primaryButton,
    secondaryButton,
    backdrop,
    className,
}: Hero7Props) => {
    return (
        <section className={cn('relative overflow-hidden', className)}>
            {backdrop ? (
                <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.04]"
                >
                    {backdrop}
                </div>
            ) : null}
            <div className="relative mx-auto w-full max-w-6xl px-4 py-24 text-center sm:px-6 md:px-8 md:py-32">
                {eyebrow ? (
                    <Reveal as="div" delay={0} y={12}>
                        <span className="text-foreground-tertiary border-foreground-primary/15 bg-background-primary text-small inline-flex items-center gap-2 rounded-full border px-3 py-1">
                            {eyebrowIcon}
                            {eyebrow}
                        </span>
                    </Reveal>
                ) : null}
                <SplitText
                    as="h1"
                    delay={0.1}
                    className="heading-style-h2 text-foreground-primary mt-6 text-balance"
                >
                    {heading}
                </SplitText>
                {description ? (
                    <Reveal
                        as="p"
                        delay={0.3}
                        y={16}
                        className="text-foreground-secondary text-regularPlus mx-auto mt-6 max-w-2xl text-balance"
                    >
                        {description}
                    </Reveal>
                ) : null}
                {primaryButton || secondaryButton ? (
                    <Reveal
                        as="div"
                        delay={0.4}
                        y={12}
                        className="mt-10 flex flex-wrap items-center justify-center gap-3"
                    >
                        {primaryButton ? (
                            <Button asChild size="lg" className="rounded-full px-6">
                                <Link href={primaryButton.href} className="gap-2">
                                    {primaryButton.text}
                                    {primaryButton.icon}
                                </Link>
                            </Button>
                        ) : null}
                        {secondaryButton ? (
                            <Button
                                asChild
                                size="lg"
                                variant="outline"
                                className="rounded-full px-6"
                            >
                                <Link href={secondaryButton.href} className="gap-2">
                                    {secondaryButton.text}
                                    {secondaryButton.icon}
                                </Link>
                            </Button>
                        ) : null}
                    </Reveal>
                ) : null}
            </div>
        </section>
    );
};

export { Hero7 };
export type { Hero7Props, Hero7Button };
