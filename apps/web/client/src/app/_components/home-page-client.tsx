'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';

import { CreateManagerProvider } from '@/components/store/create';
import { Routes } from '@/utils/constants';
import { HeroV2 } from './hero-v2';
import { ResponsiveMockupSection } from './landing-page/responsive-mockup-section';
import { WebsiteLayout } from './website-layout';

// Below-the-fold sections — split into their own chunks so they don't block
// hydration of the hero. SSR is preserved (default) so the marketing copy
// stays in the initial HTML for SEO.
// const DigitalSolutionsSection = dynamic(
//     () => import('./landing-page/digital-solutions-section').then((m) => m.DigitalSolutionsSection),
//     { loading: () => null },
// );
const WhatCanWeblabDoSectionV2 = dynamic(
    () =>
        import('./landing-page/what-can-weblab-do-section-v2').then(
            (m) => m.WhatCanWeblabDoSectionV2,
        ),
    { loading: () => null },
);
const FeatureTrioSection = dynamic(
    () => import('./landing-page/feature-trio-section').then((m) => m.FeatureTrioSection),
    { loading: () => null },
);
const FAQSection = dynamic(() => import('./landing-page/faq-section').then((m) => m.FAQSection), {
    loading: () => null,
});
const ChangelogGrid = dynamic(() => import('./changelog-grid').then((m) => m.ChangelogGrid), {
    loading: () => null,
});
const CTASection = dynamic(() => import('./landing-page/cta-section').then((m) => m.CTASection), {
    loading: () => null,
});

// Modals are inert until opened from elsewhere — skip SSR to keep them out of
// the initial HTML and hydration bundle.
const AuthModal = dynamic(() => import('./auth-modal').then((m) => m.AuthModal), {
    ssr: false,
    loading: () => null,
});
const NonProjectSettingsModal = dynamic(
    () =>
        import('@/components/ui/settings-modal/non-project').then((m) => m.NonProjectSettingsModal),
    { ssr: false, loading: () => null },
);
const SubscriptionModal = dynamic(
    () => import('@/components/ui/pricing-modal').then((m) => m.SubscriptionModal),
    { ssr: false, loading: () => null },
);

export function HomePageClient() {
    return (
        <CreateManagerProvider>
            {/* Smooth scroll is mounted globally via SmoothScrollGate in the
                root layout (gated to public routes), so no per-page provider. */}
            <WebsiteLayout showFooter={true}>
                {/* Crawlable internal links to primary keyword landing pages */}
                <nav className="sr-only" aria-label="Solutions">
                    <Link href="/website-builder">Website builder for React and Next.js teams</Link>
                    <Link href="/visual-site-builder">Visual site builder for React</Link>
                    <Link href="/ai-website-builder">AI website builder for your codebase</Link>
                </nav>
                <div className="flex w-full items-center justify-center pt-24" id="hero">
                    <HeroV2 />
                </div>
                <ResponsiveMockupSection />
                {/* <DigitalSolutionsSection /> */}
                {/*  <UseCasesSection /> */}
                <WhatCanWeblabDoSectionV2 />
                <FeatureTrioSection />
                {/* <ScrollingVelocitySection /> */}
                <FAQSection />
                <ChangelogGrid limit={4} />
                <CTASection href={Routes.PROJECTS} />
                <AuthModal />
                <NonProjectSettingsModal />
                <SubscriptionModal />
            </WebsiteLayout>
        </CreateManagerProvider>
    );
}
