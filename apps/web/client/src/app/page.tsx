'use client';

import { CreateManagerProvider } from '@/components/store/create';
import { SubscriptionModal } from '@/components/ui/pricing-modal';
import { NonProjectSettingsModal } from '@/components/ui/settings-modal/non-project';
import { Routes } from '@/utils/constants';
import { AuthModal } from './_components/auth-modal';
import { ChangelogGrid } from './_components/changelog-grid';
import { Hero } from './_components/hero';
import { CTASection } from './_components/landing-page/cta-section';
import { FAQSection } from './_components/landing-page/faq-section';
import { ResponsiveMockupSection } from './_components/landing-page/responsive-mockup-section';
import { WhatCanWeblabDoSection } from './_components/landing-page/what-can-weblab-do-section';
import { WebsiteLayout } from './_components/website-layout';

export default function Main() {
    return (
        <CreateManagerProvider>
            <WebsiteLayout showFooter={true}>
                <div className="flex h-screen w-screen items-center justify-center" id="hero">
                    <Hero />
                </div>
                <ResponsiveMockupSection />
                <WhatCanWeblabDoSection />
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
