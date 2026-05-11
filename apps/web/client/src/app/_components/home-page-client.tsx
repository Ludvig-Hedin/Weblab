'use client';

import { CreateManagerProvider } from '@/components/store/create';
import { SubscriptionModal } from '@/components/ui/pricing-modal';
import { NonProjectSettingsModal } from '@/components/ui/settings-modal/non-project';
import { Routes } from '@/utils/constants';
import { AuthModal } from './auth-modal';
import { ChangelogGrid } from './changelog-grid';
import { Hero } from './hero';
import { CTASection } from './landing-page/cta-section';
import { DigitalSolutionsSection } from './landing-page/digital-solutions-section';
import { FAQSection } from './landing-page/faq-section';
import { ModelAgnosticSection } from './landing-page/model-agnostic-section';
import { ResponsiveMockupSection } from './landing-page/responsive-mockup-section';
import { ScrollingVelocitySection } from './landing-page/scrolling-velocity-section';
import { TerminalSection } from './landing-page/terminal-section';
import { UseCasesSection } from './landing-page/use-cases-section';
import { WhatCanWeblabDoSection } from './landing-page/what-can-weblab-do-section';
import { WebsiteLayout } from './website-layout';

export function HomePageClient() {
    return (
        <CreateManagerProvider>
            <WebsiteLayout showFooter={true}>
                <div className="flex h-screen w-screen items-center justify-center" id="hero">
                    <Hero />
                </div>
                <ResponsiveMockupSection />
                <DigitalSolutionsSection />
                <UseCasesSection />
                <WhatCanWeblabDoSection />
                <ModelAgnosticSection />
                <TerminalSection />
                <ScrollingVelocitySection />
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
