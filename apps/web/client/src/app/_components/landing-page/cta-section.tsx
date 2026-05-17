'use client';

import { Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';

import { Reveal } from '@/components/motion/reveal';
import { SplitText } from '@/components/motion/split-text';

interface CTASectionProps {
    href?: string;
    onClick?: () => void;
    ctaText?: string;
    buttonText?: string;
    showSubtext?: boolean;
}

export function CTASection({
    href,
    onClick,
    ctaText,
    buttonText,
    showSubtext = true,
}: CTASectionProps = {}) {
    const router = useRouter();
    const t = useTranslations('landing.cta');

    const headingLines = ctaText
        ? ctaText.split('\n')
        : [t('defaultHeadingLine1'), t('defaultHeadingLine2')];
    const resolvedButton = buttonText ?? t('defaultButton');

    const handleGetStartedClick = () => {
        if (onClick) {
            onClick();
        } else if (href) {
            if (href.startsWith('http')) {
                window.open(href, '_blank', 'noopener,noreferrer');
            } else {
                router.push(href);
            }
        } else {
            const heroSection = document.getElementById('hero');
            if (heroSection) {
                heroSection.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start',
                });
            }
        }
    };

    const handleHomepageNavigation = () => {
        router.push('/');
    };

    return (
        <div className="items-right mx-auto flex w-full max-w-6xl flex-col gap-16 px-4 py-24 sm:gap-24 sm:px-6 md:px-8 md:py-32">
            <div className="flex flex-1 flex-col items-end justify-center text-right">
                <h2 className="heading-style-h2 text-foreground-primary mb-8 max-w-4xl text-balance">
                    {headingLines.map((line, index) => (
                        <Fragment key={index}>
                            <SplitText as="span" delay={index * 0.08}>
                                {line}
                            </SplitText>
                            {index < headingLines.length - 1 && <br />}
                        </Fragment>
                    ))}
                </h2>
                <Reveal delay={0.2} className="flex w-full flex-row items-center justify-end gap-3">
                    <Button
                        variant="secondary"
                        size="lg"
                        className="hover:bg-foreground-primary hover:text-background-primary cursor-pointer p-6 transition-colors"
                        onClick={href === '/' ? handleHomepageNavigation : handleGetStartedClick}
                    >
                        {resolvedButton}
                    </Button>
                </Reveal>
            </div>
        </div>
    );
}
