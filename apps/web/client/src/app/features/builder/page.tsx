'use client';

import { APP_NAME } from '@weblab/constants';

import { CreateManagerProvider } from '@/components/store/create';
import { SubscriptionModal } from '@/components/ui/pricing-modal';
import { NonProjectSettingsModal } from '@/components/ui/settings-modal/non-project';
import { Routes } from '@/utils/constants';
import { BuilderFeaturesHero } from '../../_components/hero/builder-features-hero';
import { BuilderBenefitsSection } from '../../_components/landing-page/builder-benefits-section';
import { BuilderFeaturesGridSection } from '../../_components/landing-page/builder-features-grid-section';
import { BuilderFeaturesIntroSection } from '../../_components/landing-page/builder-features-intro-section';
import { CTASection } from '../../_components/landing-page/cta-section';
import { FAQSection } from '../../_components/landing-page/faq-section';
import { ResponsiveMockupSection } from '../../_components/landing-page/responsive-mockup-section';
import { WebsiteLayout } from '../../_components/website-layout';

const builderFaqs = [
    {
        question: `What is ${APP_NAME}?`,
        answer: `${APP_NAME} is an open-source, visual editor for websites. It allows anyone to create and style their own websites without any coding knowledge.`,
    },
    {
        question: `What can I use ${APP_NAME} to do?`,
        answer: `${APP_NAME} is great for creating websites, prototypes, user interfaces, and designs. Whether you need a quick mockup or a full-fledged website, ask ${APP_NAME} to craft it for you.`,
    },
    {
        question: 'How do I get started?',
        answer: `Getting started with ${APP_NAME} is easy. Simply sign up for an account, create a new project, and follow our step-by-step guide to deploy your first application.`,
    },
    {
        question: `Is ${APP_NAME} free to use?`,
        answer: `${APP_NAME} is free for your first prompt, but you\'re limited by the number of messages you can send. Please see our Pricing page for more details.`,
    },
    {
        question: `What is the difference between ${APP_NAME} and other design tools?`,
        answer: `${APP_NAME} is a visual editor for code. It allows you to create and style your own creations with code as the source of truth. While it is best suited for creating websites, it can be used for anything visual – presentations, mockups, and more. Because ${APP_NAME} uses code as the source of truth, the types of designs you can create are unconstrained by ${APP_NAME}\'s interface.`,
    },
    {
        question: `Why is ${APP_NAME} open-source?`,
        answer: `Developers have historically been second-rate citizens in the design process. ${APP_NAME} was founded to bridge the divide between design and development, and we wanted to make developers first-class citizens alongside designers. We chose to be open-source to give developers transparency into how we are building ${APP_NAME} and how the work created through ${APP_NAME} will complement the work of developers.`,
    },
];

export default function BuilderFeaturesPage() {
    return (
        <CreateManagerProvider>
            <WebsiteLayout showFooter={true}>
                {/* AI-Friendly Summary Section */}
                <section className="sr-only" aria-label="Visual Builder Summary">
                    <h2>{APP_NAME} Visual Builder: Design with Your Real React Components</h2>
                    <p>
                        {APP_NAME} is a visual builder that works with your existing codebase.
                        Design with your real React, Vue, or Angular components on an infinite
                        canvas. What you design IS the code — changes become mergeable pull
                        requests, not static mockups.
                    </p>
                    <h3>Key Builder Features</h3>
                    <ul>
                        <li>Infinite canvas for visual design with real code underneath</li>
                        <li>Works with your existing codebase — no rebuild required</li>
                        <li>Design with real React, Vue, Angular components</li>
                        <li>Drag-and-drop interface familiar to designers</li>
                        <li>Visual styling controls for colors, spacing, typography</li>
                        <li>Real-time preview of changes</li>
                        <li>Direct GitHub PR output</li>
                        <li>No coding required for designers</li>
                        <li>Supports Tailwind, CSS Modules, styled-components</li>
                        <li>Compatible with shadcn/ui, Material UI, Chakra UI</li>
                    </ul>
                </section>

                <div className="flex h-screen w-screen items-center justify-center" id="hero">
                    <BuilderFeaturesHero />
                </div>
                <ResponsiveMockupSection />
                <BuilderBenefitsSection />
                <BuilderFeaturesIntroSection />
                <BuilderFeaturesGridSection />
                <CTASection
                    ctaText={`Bring your team \nto ${APP_NAME} today`}
                    buttonText="Get Started"
                    href={Routes.PROJECTS}
                />
                <FAQSection faqs={builderFaqs} />
                <NonProjectSettingsModal />
                <SubscriptionModal />
            </WebsiteLayout>
        </CreateManagerProvider>
    );
}
