'use client';

import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { useReducedMotion } from '@weblab/ui/hooks';
import { Icons } from '@weblab/ui/icons';

import { WebsiteLayout } from '@/app/_components/website-layout';
import { CTASection } from '../_components/landing-page/cta-section';
import { Illustrations } from '../_components/landing-page/illustrations';
import { vujahdayScript } from '../fonts';

const VALUES = ['speed', 'resilience', 'reinvention', 'competence'] as const;
const VALUE_ILLUSTRATIONS = {
    speed: Illustrations.AboutSpeed,
    resilience: Illustrations.AboutResilience,
    reinvention: Illustrations.AboutReinvention,
    competence: Illustrations.AboutCompetence,
} as const;

const LOOK_FOR = ['commitment', 'passion', 'excellence'] as const;

export default function AboutPage() {
    const prefersReducedMotion = useReducedMotion();
    const t = useTranslations('aboutPage') as (key: string) => string;

    const getBlurAnimationProps = (delay = 0, includeStyle = true, customViewport?: any) => {
        const baseProps = {
            initial: prefersReducedMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(4px)' },
            whileInView: prefersReducedMotion
                ? { opacity: 1 }
                : { opacity: 1, filter: 'blur(0px)' },
            viewport: customViewport || {
                once: true,
                margin: '-100px 0px -100px 0px',
                amount: 0.3,
            },
            transition: {
                duration: prefersReducedMotion ? 0.3 : 0.6,
                delay,
                ease: [0.25, 0.46, 0.45, 0.94] as const,
            },
        };

        if (includeStyle) {
            return {
                ...baseProps,
                style: {
                    willChange: prefersReducedMotion ? 'opacity' : 'opacity, filter',
                    transform: 'translateZ(0)',
                },
            };
        }

        return baseProps;
    };

    return (
        <WebsiteLayout showFooter={true}>
            <section className="sr-only" aria-label="About Weblab Summary">
                <h2>{t('srTitle')}</h2>
                <p>{t('srBody')}</p>
                <h3>{t('srCompanyFacts')}</h3>
                <ul>
                    <li>{t('srBasedSweden')}</li>
                    <li>{t('srOpenSource')}</li>
                </ul>
                <h3>{t('srFounder')}</h3>
                <ul>
                    <li>{t('srFounderItem')}</li>
                </ul>
                <h3>{t('srValues')}</h3>
                <ul>
                    <li>{t('srSpeed')}</li>
                    <li>{t('srResilience')}</li>
                    <li>{t('srReinvention')}</li>
                    <li>{t('srCompetence')}</li>
                </ul>
            </section>

            <main className="bg-background text-foreground-primary">
                <section className="text-foreground-primary bg-background py-64">
                    <div className="mx-auto max-w-6xl px-8">
                        <motion.h1
                            className="mb-8 text-left text-6xl !leading-[1]"
                            {...getBlurAnimationProps()}
                        >
                            {t('heroLine1')}
                            <br />
                            {t('heroLine2')}
                        </motion.h1>

                        <motion.div className="max-w-lg text-left" {...getBlurAnimationProps(0.2)}>
                            <p className="md:text-large text-foreground-secondary max-w-lg text-left text-lg font-light text-balance md:max-w-none">
                                {t('heroBodyPart1')}
                                <br />
                                <br />
                                {t('heroBodyPart2')}
                                <br />
                                <br />
                                {t('heroBodyPart3')}
                                <a
                                    href="https://github.com/Ludvig-Hedin/Weblab"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-foreground-primary underline underline-offset-4"
                                >
                                    {t('githubLink')}
                                </a>
                                {t('heroBodyPart4')}
                            </p>
                        </motion.div>
                    </div>
                </section>

                <section className="py-48">
                    <div className="mx-auto max-w-6xl px-8">
                        <div className="mb-24 text-left">
                            <motion.h2
                                className="mb-12 text-left text-7xl leading-tight font-light"
                                initial={{ opacity: 0, filter: 'blur(4px)' }}
                                whileInView={{ opacity: 1, filter: 'blur(0px)' }}
                                viewport={{
                                    once: true,
                                    margin: '-100px 0px -100px 0px',
                                    amount: 0.3,
                                }}
                                transition={{ duration: 0.6, ease: 'easeOut' }}
                                style={{
                                    willChange: 'opacity, filter',
                                    transform: 'translateZ(0)',
                                }}
                            >
                                {t('meetThe')}{' '}
                                <span
                                    className={
                                        vujahdayScript.className + ' ml-1 text-8xl font-normal'
                                    }
                                >
                                    {t('founderScript')}
                                </span>
                            </motion.h2>
                            <motion.p
                                className="md:text-large text-foreground-secondary mt-8 mb-12 max-w-xl text-lg font-light text-balance"
                                initial={{ opacity: 0, filter: 'blur(4px)' }}
                                whileInView={{ opacity: 1, filter: 'blur(0px)' }}
                                viewport={{
                                    once: true,
                                    margin: '-100px 0px -100px 0px',
                                    amount: 0.3,
                                }}
                                transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
                                style={{
                                    willChange: 'opacity, filter',
                                    transform: 'translateZ(0)',
                                }}
                            >
                                {t('founderBody')}
                            </motion.p>
                        </div>
                        <div className="grid grid-cols-1 gap-x-16 gap-y-12">
                            <motion.div
                                className="flex items-start gap-8 rounded-2xl"
                                {...getBlurAnimationProps(0.7)}
                            >
                                <img
                                    src="/ludvig.webp"
                                    alt={t('founderName')}
                                    className="bg-background-tertiary aspect-square h-28 w-28 flex-shrink-0 rounded-2xl object-cover"
                                />
                                <div className="flex flex-col">
                                    <h4 className="text-title3 md:text-largePlus mb-1">
                                        {t('founderName')}
                                    </h4>
                                    <p className="text-foreground-secondary text-large md:text-regular mb-4">
                                        {t('founderTitle')}
                                    </p>
                                    <div className="flex items-center gap-6 md:gap-3">
                                        <a
                                            href="https://github.com/Ludvig-Hedin"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            aria-label={t('githubAria')}
                                        >
                                            <Icons.GitHubLogo className="text-foreground-secondary hover:text-foreground-primary h-6.5 w-6.5 transition-colors md:h-4.5 md:w-4.5" />
                                        </a>
                                        <a
                                            href="https://www.linkedin.com/in/ludvig-hedin-058bba194/"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            aria-label={t('linkedinAria')}
                                        >
                                            <Icons.SocialLinkedIn className="text-foreground-secondary hover:text-foreground-primary h-7 w-7 transition-colors md:h-5 md:w-5" />
                                        </a>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </section>

                <section className="text-foreground-primary bg-background py-60">
                    <div className="mx-auto max-w-6xl px-8">
                        <motion.h2
                            className="mb-20 text-left text-7xl leading-tight font-light"
                            {...getBlurAnimationProps()}
                        >
                            {t('rewardHeading')}{' '}
                            <span
                                className={vujahdayScript.className + ' ml-1 text-8xl font-normal'}
                            >
                                {t('rewardScript')}
                            </span>
                        </motion.h2>
                        <div className="mb-16 grid grid-cols-2 gap-x-12 gap-y-16 md:grid-cols-4 md:gap-x-24">
                            {VALUES.map((value, i) => {
                                const Illustration = VALUE_ILLUSTRATIONS[value];
                                return (
                                    <motion.div
                                        key={value}
                                        className="flex flex-col items-start text-left"
                                        {...getBlurAnimationProps(0.1 * (i + 1))}
                                    >
                                        <Illustration className="text-foreground-primary mb-6 h-20 w-20" />
                                        <h3 className="mb-2 text-xl font-normal">
                                            {t(`values.${value}.title`)}
                                        </h3>
                                        <p className="text-foreground-secondary md:text-large text-lg font-light text-balance">
                                            {t(`values.${value}.body`)}
                                        </p>
                                    </motion.div>
                                );
                            })}
                        </div>
                    </div>
                </section>

                <section className="text-foreground-primary bg-background py-56">
                    <div className="mx-auto max-w-6xl px-8">
                        <motion.h2
                            className="mb-20 text-left text-7xl leading-tight font-light"
                            {...getBlurAnimationProps()}
                        >
                            {t('lookForHeading')}{' '}
                            <span
                                className={vujahdayScript.className + ' ml-1 text-8xl font-normal'}
                            >
                                {t('lookForScript')}
                            </span>
                        </motion.h2>
                        <div className="grid grid-cols-1 gap-x-24 gap-y-16 md:grid-cols-3">
                            {LOOK_FOR.map((key, i) => (
                                <motion.div
                                    key={key}
                                    className="flex flex-col items-start text-left"
                                    {...getBlurAnimationProps(0.1 * (i + 1))}
                                >
                                    <h3 className="text-title3 mb-4 font-normal">
                                        {t(`lookFor.${key}.title`)}
                                    </h3>
                                    <p className="text-foreground-secondary md:text-large text-lg font-light text-balance">
                                        {t(`lookFor.${key}.body`)}
                                    </p>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>
            </main>
            <CTASection
                ctaText={`${t('cta.line1')}\n${t('cta.line2')}`}
                buttonText={t('cta.button')}
            />
        </WebsiteLayout>
    );
}
