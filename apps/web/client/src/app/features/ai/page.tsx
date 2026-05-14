'use client';

import { CreateManagerProvider } from '@/components/store/create';
import { SubscriptionModal } from '@/components/ui/pricing-modal';
import { NonProjectSettingsModal } from '@/components/ui/settings-modal/non-project';
import { Routes } from '@/utils/constants';
import { AiFeaturesHero } from '../../_components/hero/ai-features-hero';
import { AiBenefitsSection } from '../../_components/landing-page/ai-benefits-section';
import { AiFeaturesGridSection } from '../../_components/landing-page/ai-features-grid-section';
import { AiFeaturesIntroSection } from '../../_components/landing-page/ai-features-intro-section';
import { CTASection } from '../../_components/landing-page/cta-section';
import { FAQSection } from '../../_components/landing-page/faq-section';
import { ResponsiveMockupSection } from '../../_components/landing-page/responsive-mockup-section';
import { WebsiteLayout } from '../../_components/website-layout';

const aiFaqs = [
    {
        question: 'What is Weblab?',
        answer: 'Weblab is an open-source, visual editor for websites. It allows anyone to create and style their own websites without any coding knowledge.',
    },
    {
        question: 'What can I use Weblab to do?',
        answer: 'Weblab is great for creating websites, prototypes, user interfaces, and designs. Whether you need a quick mockup or a full-fledged website, ask Weblab to craft it for you.',
    },
    {
        question: 'How do I get started?',
        answer: 'Getting started with Weblab is easy. Simply sign up for an account, create a new project, and follow our step-by-step guide to deploy your first application.',
    },
    {
        question: 'Is Weblab free to use?',
        answer: "Weblab is free for your first prompt, but you're limited by the number of messages you can send. Please see our Pricing page for more details.",
    },
    {
        question: 'What is the difference between Weblab and other design tools?',
        answer: "Weblab is a visual editor for code. It allows you to create and style your own creations with code as the source of truth. While it is best suited for creating websites, it can be used for anything visual – presentations, mockups, and more. Because Weblab uses code as the source of truth, the types of designs you can create are unconstrained by Weblab's interface.",
    },
    {
        question: 'Why is Weblab open-source?',
        answer: 'Developers have historically been second-rate citizens in the design process. Weblab was founded to bridge the divide between design and development, and we wanted to make developers first-class citizens alongside designers. We chose to be open-source to give developers transparency into how we are building Weblab and how the work created through Weblab will complement the work of developers.',
    },
];

export default function AiFeaturesPage() {
    return (
        <CreateManagerProvider>
            <WebsiteLayout showFooter={true}>
                {/* AI-Friendly Summary Section */}
                <section className="sr-only" aria-label="AI Features Summary">
                    <h2>Weblab AI Visual Editor: Build UIs with AI Using Your Design System</h2>
                    <p>
                        Weblab is an AI-powered visual editor that builds frontend UIs using your
                        real React, Vue, or Angular components. Unlike generic AI code generators,
                        Weblab constrains AI to your design system — your buttons, cards, and
                        layouts. Changes become mergeable PRs, not throwaway prototypes.
                    </p>
                    <h3>Key AI Features</h3>
                    <ul>
                        <li>
                            AI constrained to your design system — no brand drift, no off-brand
                            results
                        </li>
                        <li>Visual canvas with real code running underneath</li>
                        <li>Works with React, Next.js, Vue, Angular, Svelte</li>
                        <li>Supports Tailwind, CSS Modules, styled-components</li>
                        <li>
                            Compatible with shadcn/ui, Material UI, Chakra UI, Mantine, Radix UI
                        </li>
                        <li>Direct GitHub PR output — changes become mergeable pull requests</li>
                        <li>Real-time team collaboration</li>
                        <li>No coding required for designers</li>
                    </ul>
                </section>

                <div className="flex w-full items-center justify-center py-32 md:py-40" id="hero">
                    <AiFeaturesHero />
                </div>
                <ResponsiveMockupSection />
                <AiBenefitsSection />
                <AiFeaturesIntroSection />
                <AiFeaturesGridSection />
                <CTASection
                    ctaText={`Start Building with AI Today`}
                    buttonText="Get Started for Free"
                    href={Routes.PROJECTS}
                />
                <FAQSection faqs={aiFaqs} />
                <NonProjectSettingsModal />
                <SubscriptionModal />
            </WebsiteLayout>
        </CreateManagerProvider>
    );
}
