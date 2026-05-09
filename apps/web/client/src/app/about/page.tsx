'use client';

import { motion } from 'motion/react';

import { useReducedMotion } from '@weblab/ui/hooks';
import { Icons } from '@weblab/ui/icons';

import { WebsiteLayout } from '@/app/_components/website-layout';
import { CTASection } from '../_components/landing-page/cta-section';
import { Illustrations } from '../_components/landing-page/illustrations';
import { vujahdayScript } from '../fonts';

export default function AboutPage() {
    const prefersReducedMotion = useReducedMotion();

    // Helper function to conditionally apply blur animations based on reduced motion preference
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
            {/* AI-Friendly Summary Section */}
            <section className="sr-only" aria-label="About Weblab Summary">
                <h2>About Weblab: The Visual Editor for React</h2>
                <p>
                    Weblab was founded to obliterate the divide between creativity and
                    implementation. We're building a bridge between designers and developers — a
                    visual editor that works with your real React components. AI is constrained to
                    your design system. Changes become mergeable pull requests.
                </p>
                <h3>Company Facts</h3>
                <ul>
                    <li>Based in Sweden</li>
                </ul>
                <h3>Founder</h3>
                <ul>
                    <li>Ludvig Hedin — Founder.</li>
                </ul>
                <h3>Our Values</h3>
                <ul>
                    <li>
                        Speed — Setting an olympic pace, relentlessness, strategy through execution.
                    </li>
                    <li>Resilience — Enduring challenges without losing momentum.</li>
                    <li>
                        Reinvention — Creativity in approaching problems, pushing beyond
                        state-of-the-art.
                    </li>
                    <li>
                        Competence — Taking pride in work, inspiring others with taste and
                        technique.
                    </li>
                </ul>
            </section>

            <main className="bg-background text-foreground-primary">
                {/* Hero Section */}
                <section className="text-foreground-primary bg-black py-64">
                    <div className="mx-auto max-w-6xl px-8">
                        <motion.h1
                            className="mb-8 text-left text-6xl !leading-[1]"
                            {...getBlurAnimationProps()}
                        >
                            Design deserves
                            <br />
                            better tools
                        </motion.h1>

                        <motion.div className="max-w-lg text-left" {...getBlurAnimationProps(0.2)}>
                            <p className="md:text-large text-foreground-secondary max-w-lg text-left text-lg font-light text-balance md:max-w-none">
                                Weblab was founded to obliterate the divide between creativity and
                                implementation.
                                <br />
                                <br />
                                For too long, the most brilliant creative teams have been severed by
                                the complexity of tools. We're building Weblab from Sweden — a
                                bridge that will end the gap between creativity and implementation.
                            </p>
                        </motion.div>
                    </div>
                </section>

                {/* Meet the Founder Section */}
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
                                Meet the{' '}
                                <span
                                    className={
                                        vujahdayScript.className + ' ml-1 text-8xl font-normal'
                                    }
                                >
                                    founder
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
                                Frustrated with the status quo of creating software, Ludvig set out
                                to give engineers, builders, designers, and product managers a new
                                way to collaborate in code.
                            </motion.p>
                            <motion.div
                                className="mt-8 flex justify-start"
                                initial={{ opacity: 0, filter: 'blur(4px)' }}
                                whileInView={{ opacity: 1, filter: 'blur(0px)' }}
                                viewport={{
                                    once: true,
                                    margin: '-100px 0px -100px 0px',
                                    amount: 0.3,
                                }}
                                transition={{ duration: 0.6, delay: 0.5, ease: 'easeOut' }}
                                style={{
                                    willChange: 'opacity, filter',
                                    transform: 'translateZ(0)',
                                }}
                            ></motion.div>
                        </div>
                        <div className="grid grid-cols-1 gap-x-16 gap-y-12">
                            {/* Founder */}
                            <motion.div
                                className="flex items-start gap-8 rounded-2xl"
                                {...getBlurAnimationProps(0.7)}
                            >
                                <img
                                    src="/ludvig.webp"
                                    alt="Ludvig Hedin"
                                    className="aspect-square h-28 w-28 flex-shrink-0 rounded-2xl bg-neutral-800 object-cover"
                                />
                                <div className="flex flex-col">
                                    <h4 className="text-title3 md:text-largePlus mb-1">
                                        Ludvig Hedin
                                    </h4>
                                    <p className="text-foreground-secondary text-large md:text-regular mb-4">
                                        Founder
                                    </p>
                                    <div className="flex items-center gap-6 md:gap-3">
                                        <a
                                            href="https://github.com/Ludvig-Hedin"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            aria-label="Ludvig's GitHub"
                                        >
                                            <Icons.GitHubLogo className="text-foreground-secondary hover:text-foreground-primary h-6.5 w-6.5 transition-colors md:h-4.5 md:w-4.5" />
                                        </a>
                                        <a
                                            href="https://www.linkedin.com/in/ludvig-hedin-058bba194/"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            aria-label="Ludvig's LinkedIn"
                                        >
                                            <Icons.SocialLinkedIn className="text-foreground-secondary hover:text-foreground-primary h-7 w-7 transition-colors md:h-5 md:w-5" />
                                        </a>
                                    </div>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </section>

                {/* Values Section */}
                <section className="text-foreground-primary bg-black py-60">
                    <div className="mx-auto max-w-6xl px-8">
                        <motion.h2
                            className="mb-20 text-left text-7xl leading-tight font-light"
                            {...getBlurAnimationProps()}
                        >
                            What we{' '}
                            <span
                                className={vujahdayScript.className + ' ml-1 text-8xl font-normal'}
                            >
                                reward
                            </span>
                        </motion.h2>
                        <div className="mb-16 grid grid-cols-2 gap-x-12 gap-y-16 md:grid-cols-4 md:gap-x-24">
                            {/* Speed */}
                            <motion.div
                                className="flex flex-col items-start text-left"
                                {...getBlurAnimationProps(0.1)}
                            >
                                <Illustrations.AboutSpeed className="text-foreground-primary mb-6 h-20 w-26" />
                                <h3 className="mb-2 text-xl font-normal">Speed</h3>
                                <p className="text-foreground-secondary md:text-large text-lg font-light text-balance">
                                    Setting an olympic pace, relentlessness, strategy through
                                    execution.
                                </p>
                            </motion.div>
                            {/* Resilience */}
                            <motion.div
                                className="flex flex-col items-start text-left"
                                {...getBlurAnimationProps(0.2)}
                            >
                                <Illustrations.AboutResilience className="text-foreground-primary mb-6 h-20 w-20" />
                                <h3 className="mb-2 text-xl font-normal">Resilience</h3>
                                <p className="text-foreground-secondary md:text-large text-lg font-light text-balance">
                                    Enduring challenges without losing momentum – grit, stamina, and
                                    drive.
                                </p>
                            </motion.div>
                            {/* Reinvention */}
                            <motion.div
                                className="flex flex-col items-start text-left"
                                {...getBlurAnimationProps(0.3)}
                            >
                                <Illustrations.AboutReinvention className="text-foreground-primary mb-6 h-20 w-20" />
                                <h3 className="mb-2 text-xl font-normal">Reinvention</h3>
                                <p className="text-foreground-secondary md:text-large text-lg font-light text-balance">
                                    Creativity in approaching problems, pushing us beyond the
                                    state-of-the-art.
                                </p>
                            </motion.div>
                            {/* Competence */}
                            <motion.div
                                className="flex flex-col items-start text-left"
                                {...getBlurAnimationProps(0.4)}
                            >
                                <Illustrations.AboutCompetence className="text-foreground-primary mb-6 h-20 w-20 py-4 pr-3" />
                                <h3 className="mb-2 text-xl font-normal">Competence</h3>
                                <p className="text-foreground-secondary md:text-large text-lg font-light text-balance">
                                    Taking pride in one's work, inspiring others with your taste and
                                    technique.
                                </p>
                            </motion.div>
                        </div>
                    </div>
                </section>

                {/* What we look for Section */}
                <section className="text-foreground-primary bg-black py-56">
                    <div className="mx-auto max-w-6xl px-8">
                        <motion.h2
                            className="mb-20 text-left text-7xl leading-tight font-light"
                            {...getBlurAnimationProps()}
                        >
                            What we{' '}
                            <span
                                className={vujahdayScript.className + ' ml-1 text-8xl font-normal'}
                            >
                                look&nbsp;for
                            </span>
                        </motion.h2>
                        <div className="grid grid-cols-1 gap-x-24 gap-y-16 md:grid-cols-3">
                            {/* Commitment */}
                            <motion.div
                                className="flex flex-col items-start text-left"
                                {...getBlurAnimationProps(0.1)}
                            >
                                <h3 className="text-title3 mb-4 font-normal">Commitment</h3>
                                <p className="text-foreground-secondary md:text-large text-lg font-light text-balance">
                                    Have you put real time into something you cared about? We're
                                    looking for builders who've made long-term bets on themselves.
                                </p>
                            </motion.div>
                            {/* Passion */}
                            <motion.div
                                className="flex flex-col items-start text-left"
                                {...getBlurAnimationProps(0.2)}
                            >
                                <h3 className="text-title3 mb-4 font-normal">Passion</h3>
                                <p className="text-foreground-secondary md:text-large text-lg font-light text-balance">
                                    We're allergic to apathy. We want people who give a damn about
                                    design, devtools, or AI – and have receipts.
                                </p>
                            </motion.div>
                            {/* Excellence */}
                            <motion.div
                                className="flex flex-col items-start text-left"
                                {...getBlurAnimationProps(0.3)}
                            >
                                <h3 className="text-title3 mb-4 font-normal">Excellence</h3>
                                <p className="text-foreground-secondary md:text-large text-lg font-light text-balance">
                                    Bring something rare. We want people who are world-class at
                                    something and won't compromise.
                                </p>
                            </motion.div>
                        </div>
                    </div>
                </section>
            </main>
            <CTASection
                ctaText={'Ready to stop rebuilding?\nYour design system, on a canvas.'}
                buttonText="Get Started"
                showSubtext={false}
            />
        </WebsiteLayout>
    );
}
