'use client';

import { motion } from 'motion/react';

import { APP_NAME } from '@weblab/constants';
import { Icons } from '@weblab/ui/icons';

import { CreateManagerProvider } from '@/components/store/create';
import { SubscriptionModal } from '@/components/ui/pricing-modal';
import { NonProjectSettingsModal } from '@/components/ui/settings-modal/non-project';
import { Routes } from '@/utils/constants';
import { CodexHero } from '../../_components/hero/codex-hero';
import { CTASection } from '../../_components/landing-page/cta-section';
import { FAQSection } from '../../_components/landing-page/faq-section';
import { WeblabInterfaceMockup } from '../../_components/landing-page/weblab-interface-mockup';
import { WebsiteLayout } from '../../_components/website-layout';

const codexFaqs = [
    {
        question: `How does ${APP_NAME} work with Codex?`,
        answer: `Codex handles the terminal and code generation. ${APP_NAME} provides the visual canvas. Together, they give you a complete design-to-code workflow — Codex builds, ${APP_NAME} lets you visually iterate and refine.`,
    },
    {
        question: `Do I need to know code to use ${APP_NAME} with Codex?`,
        answer: `No. ${APP_NAME} gives you a visual canvas where you can drag, resize, and arrange elements. The code runs underneath — you don't need to touch it unless you want to.`,
    },
    {
        question: `Can I use my existing components with ${APP_NAME}?`,
        answer: `Yes. ${APP_NAME} connects to your existing codebase and lets you design with your real components — the buttons, cards, and layouts your engineers already built.`,
    },
    {
        question: 'How do I share my work with my team?',
        answer: `${APP_NAME} has built-in team collaboration. Share your canvas, leave spatial comments, and work together in real-time. Changes sync to code and can be submitted as PRs.`,
    },
    {
        question: `What makes ${APP_NAME} different from using Codex alone?`,
        answer: `Codex is terminal-based and works best for building. ${APP_NAME} adds the visual layer designers need — an infinite canvas, team collaboration, and visual iteration on AI-generated UIs.`,
    },
    {
        question: `Does ${APP_NAME} constrain AI to my design system?`,
        answer: `Yes. Unlike raw AI code generation, ${APP_NAME} constrains AI to your existing components, colors, and tokens. This means outputs match your design system — no drift, no off-brand results.`,
    },
];

// Helper function for blur animations
const getBlurAnimationProps = (delay = 0) => ({
    initial: { opacity: 0, filter: 'blur(4px)' },
    whileInView: { opacity: 1, filter: 'blur(0px)' },
    viewport: { once: true, margin: '-100px 0px -100px 0px', amount: 0.3 },
    transition: {
        duration: 0.6,
        delay,
        ease: [0.25, 0.46, 0.45, 0.94] as const,
    },
    style: {
        willChange: 'opacity, filter',
        transform: 'translateZ(0)',
    },
});

export default function CodexWorkflowPage() {
    return (
        <CreateManagerProvider>
            <WebsiteLayout showFooter={true}>
                {/* AI-Friendly Summary Section */}
                <section className="sr-only" aria-label="Codex Workflow Summary">
                    <h2>Codex for Designers: Add a Visual Canvas to Your AI Coding Workflow</h2>
                    <p>
                        OpenAI Codex is amazing for building — but designers need to see, arrange,
                        and refine visually. {APP_NAME} adds the visual layer. Design with Codex,
                        refine on an infinite canvas, ship PRs. Together, they give you a complete
                        design-to-code workflow.
                    </p>
                    <h3>The Challenge with Codex Alone</h3>
                    <ul>
                        <li>Terminal-based — not a visual environment designers are used to</li>
                        <li>Solo workflow — hard to share work-in-progress with teammates</li>
                        <li>AI drift — raw AI generation doesn't know your design system</li>
                        <li>No canvas — can't spatially arrange ideas or see the full picture</li>
                    </ul>
                    <h3>{APP_NAME} Solves This</h3>
                    <ul>
                        <li>
                            Infinite canvas — visual environment with real code running underneath
                        </li>
                        <li>
                            Your real components — design with buttons, cards, layouts engineers
                            already built
                        </li>
                        <li>
                            Team collaboration — share canvas, leave spatial comments, work in
                            real-time
                        </li>
                        <li>PR output — changes become real pull requests engineers can review</li>
                        <li>AI constrained — outputs match your design system, no drift</li>
                    </ul>
                    <h3>Coming Soon: {APP_NAME} MCP for Codex</h3>
                    <p>
                        Use /weblab directly in Codex to open your UI in a visual canvas, iterate
                        with your design system, and push changes back — all without leaving the
                        terminal.
                    </p>
                </section>

                {/* Hero Section */}
                <div
                    className="flex w-full items-center justify-center pt-20 pb-10 md:pt-24 md:pb-12"
                    id="hero"
                >
                    <CodexHero />
                </div>

                {/* The Problem Section */}
                <section className="bg-background w-full py-32">
                    <div className="mx-auto max-w-6xl px-8">
                        <motion.h2
                            className="text-foreground-secondary mb-6 text-sm font-medium"
                            {...getBlurAnimationProps()}
                        >
                            The Challenge
                        </motion.h2>
                        <motion.p
                            className="mb-16 max-w-3xl text-4xl leading-tight font-light text-balance md:text-5xl"
                            {...getBlurAnimationProps(0.1)}
                        >
                            Codex is amazing for building. But designers need to see, arrange, and
                            refine. Together.
                        </motion.p>

                        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
                            {[
                                {
                                    icon: Icons.Terminal,
                                    title: 'Terminal-based',
                                    description:
                                        'Codex works in the terminal — not a visual environment designers are used to.',
                                },
                                {
                                    icon: Icons.Person,
                                    title: 'Solo workflow',
                                    description:
                                        'Hard to share work-in-progress with teammates or stakeholders.',
                                },
                                {
                                    icon: Icons.Component,
                                    title: 'AI drift',
                                    description:
                                        "Raw AI generation doesn't know your design system — outputs drift off-brand.",
                                },
                                {
                                    icon: Icons.Layers,
                                    title: 'No canvas',
                                    description:
                                        "Can't spatially arrange ideas or see the full picture at once.",
                                },
                            ].map((item, index) => (
                                <motion.div
                                    key={item.title}
                                    className="flex flex-col gap-4"
                                    {...getBlurAnimationProps(0.2 + index * 0.1)}
                                >
                                    <item.icon className="text-foreground-secondary h-5 w-5" />
                                    <h3 className="text-base font-medium text-balance">
                                        {item.title}
                                    </h3>
                                    <p className="text-foreground-secondary text-base text-balance">
                                        {item.description}
                                    </p>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* The Solution Section */}
                <section className="bg-background w-full pt-32 pb-16">
                    <div className="mx-auto max-w-6xl px-8">
                        <motion.h2
                            className="text-foreground-secondary mb-6 text-sm font-medium"
                            {...getBlurAnimationProps()}
                        >
                            The Solution
                        </motion.h2>
                        <motion.p
                            className="mb-24 max-w-3xl text-4xl leading-tight font-light text-balance md:text-5xl"
                            {...getBlurAnimationProps(0.1)}
                        >
                            {APP_NAME} adds the visual layer. Design with Codex, refine on the
                            canvas, ship PRs.
                        </motion.p>
                    </div>

                    {/* Editor Mockup - Desktop */}
                    <motion.div
                        className="mb-24 hidden h-[44rem] w-screen items-center justify-center md:block"
                        {...getBlurAnimationProps(0.2)}
                    >
                        <WeblabInterfaceMockup />
                    </motion.div>

                    {/* Editor Mockup - Mobile */}
                    <motion.div
                        className="relative h-[880px] w-screen overflow-hidden md:hidden"
                        {...getBlurAnimationProps(0.2)}
                    >
                        <div className="absolute top-1/2 right-10 h-[800px] w-[1000px] -translate-y-1/2 transform">
                            <WeblabInterfaceMockup />
                        </div>
                    </motion.div>

                    <div className="mx-auto max-w-6xl px-8">
                        <div className="grid gap-8 md:grid-cols-4">
                            {[
                                {
                                    icon: Icons.Layers,
                                    title: 'Infinite canvas',
                                    description:
                                        'A visual environment that feels intuitive, with real code running underneath.',
                                },
                                {
                                    icon: Icons.Component,
                                    title: 'Your real components',
                                    description:
                                        'Design with the buttons, cards, and layouts your engineers already built.',
                                },
                                {
                                    icon: Icons.Person,
                                    title: 'Team collaboration',
                                    description:
                                        'Share your canvas, leave spatial comments, work together in real-time.',
                                },
                                {
                                    icon: Icons.Branch,
                                    title: 'PR output',
                                    description:
                                        'Changes become a real pull request. Engineers review and merge.',
                                },
                            ].map((item, index) => (
                                <motion.div
                                    key={item.title}
                                    className="flex flex-col gap-3"
                                    {...getBlurAnimationProps(0.3 + index * 0.1)}
                                >
                                    <item.icon className="text-foreground-secondary h-5 w-5" />
                                    <h3 className="text-base font-medium text-balance">
                                        {item.title}
                                    </h3>
                                    <p className="text-foreground-secondary text-sm text-balance">
                                        {item.description}
                                    </p>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </section>

                {/* Coming Soon: MCP Integration */}
                <section className="bg-background w-full py-32">
                    <div className="mx-auto max-w-6xl px-8">
                        <div className="border-foreground-primary/10 rounded-2xl border bg-gradient-to-b from-white/5 to-transparent p-12 md:p-16">
                            <motion.div
                                className="flex flex-col items-center text-center"
                                {...getBlurAnimationProps()}
                            >
                                <span className="text-foreground-warning border-foreground-warning/50 bg-foreground-warning/10 text-microPlus mb-6 rounded-full border px-3 py-1 font-medium">
                                    Coming Soon
                                </span>
                                <h2 className="mb-6 max-w-2xl text-3xl leading-tight font-light text-balance md:text-5xl">
                                    {APP_NAME} MCP for Codex
                                </h2>
                                <p className="text-foreground-secondary mb-8 max-w-xl text-lg text-balance">
                                    Use{' '}
                                    <code className="bg-foreground-primary/10 rounded px-2 py-0.5 font-mono text-base">
                                        /weblab
                                    </code>{' '}
                                    directly in Codex to open your UI in a visual canvas, iterate
                                    with your design system, and push changes back — all without
                                    leaving the terminal.
                                </p>
                                <div className="bg-background-secondary/50 border-foreground-primary/20 rounded-lg border p-6 font-mono text-sm">
                                    <span className="text-foreground-tertiary">$</span>{' '}
                                    <span className="text-foreground-secondary">codex</span>{' '}
                                    <span className="text-foreground-primary">
                                        /weblab open ./src/components/Hero.tsx
                                    </span>
                                </div>
                            </motion.div>
                        </div>
                    </div>
                </section>

                {/* FAQ Section */}
                <FAQSection faqs={codexFaqs} title="Frequently asked questions" />

                {/* CTA Section */}
                <CTASection
                    ctaText={`Try ${APP_NAME} with your\nCodex project`}
                    buttonText="Get Started"
                    href={Routes.PROJECTS}
                />

                <NonProjectSettingsModal />
                <SubscriptionModal />
            </WebsiteLayout>
        </CreateManagerProvider>
    );
}
