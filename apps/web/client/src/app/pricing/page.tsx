'use client';

import Link from 'next/link';

import type { IconProps } from '@weblab/ui/icons';
import { APP_NAME } from '@weblab/constants';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import { PricingTable } from '@/components/ui/pricing-table';
import { Routes } from '@/utils/constants';
import { AuthModal } from '../_components/auth-modal';
import { CTASection } from '../_components/landing-page/cta-section';
import { FAQSection } from '../_components/landing-page/faq-section';
import { WebsiteLayout } from '../_components/website-layout';

const HIGHLIGHTED_FEATURES = [
    {
        icon: 'FilePlus',
        title: 'Project Templates',
        description: 'Save and reuse your projects as templates across your team',
    },
    {
        icon: 'Branch',
        title: 'Branching & Version Control',
        description: 'Create and manage branches for your projects with full version history',
    },
    {
        icon: 'Component',
        title: 'Your Real Design system',
        description: `Bring your real components in ${APP_NAME} and use them in your projects`,
    },
    {
        icon: 'Brand',
        title: 'Theming & Branding',
        description: 'Centralized design tokens, color palettes, and typography management',
    },
    {
        icon: 'Layers',
        title: 'Built like a design tool',
        description: 'Navigate your React component tree with precise control over every element',
    },
    {
        icon: 'Sparkles',
        title: 'Unlimited AI Chat',
        description: 'Get instant help and generate code with unlimited AI-powered assistance',
    },
    {
        icon: 'GitHubLogo',
        title: 'Open Source',
        description: "Built with the community. Customize and extend for your team's needs",
    },
    {
        icon: 'Globe',
        title: 'Custom Domains',
        description: 'Deploy your projects to your own internal domain',
    },
    {
        icon: 'LockClosed',
        title: 'Advanced Security',
        description: 'SSO (SAML/OAuth), advanced security controls, audit logs, and admin controls',
    },
];

const ENTERPRISE_FEATURES = [
    'Unlimited projects',
    'Custom integrations',
    'Advanced usage analytics',
    'Early access to new features',
    'Dedicated support',
    'Account manager',
    'Dedicated Slack channel',
    'Technical onboarding',
];

export default function PricingPage() {
    const handleContactUs = () => {
        const subject = encodeURIComponent(`[Team Inquiry]: Getting Started with ${APP_NAME}`);
        const body = encodeURIComponent(`Hi,

I'm interested in setting up ${APP_NAME} for our team.

Looking forward to hearing from you.

Best regards,
[Your name]`);

        window.location.href = `mailto:support@weblab.build?subject=${subject}&body=${body}`;
    };

    return (
        <WebsiteLayout showFooter={true}>
            <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-8">
                <div className="mt-24 mb-16 w-full text-left">
                    <h1 className="text-foreground mb-4 text-5xl font-light">Pricing</h1>
                    <p className="text-muted-foreground text-regular">
                        Equip your product team with the power of AI
                    </p>
                </div>

                {/* Plan Cards */}
                <div className="mb-24 w-full">
                    <PricingTable />
                </div>

                {/* Enterprise Detail Section */}
                <div className="mx-auto w-full max-w-6xl">
                    <div className="border-border-primary rounded-lg border p-8 sm:p-12">
                        <div className="mb-8 flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
                            <div className="text-left">
                                <h2 className="text-foreground mb-3 text-3xl font-light sm:text-4xl">
                                    For Teams
                                </h2>
                                <p className="text-regular text-foreground-secondary">
                                    Custom pricing tailored to your team's needs
                                </p>
                            </div>
                            <div className="flex w-full flex-col gap-4 sm:w-auto sm:flex-row lg:flex-shrink-0">
                                <Button
                                    className="w-full sm:w-auto sm:min-w-[180px]"
                                    onClick={handleContactUs}
                                    variant="outline"
                                    size="lg"
                                >
                                    Contact us
                                </Button>
                                <Button
                                    className="w-full sm:w-auto sm:min-w-[180px]"
                                    size="lg"
                                    asChild
                                >
                                    <a href="/projects">Get Started</a>
                                </Button>
                            </div>
                        </div>

                        <div className="border-border-primary my-8 border-t" />

                        {/* Highlighted Features */}
                        <div className="mb-8 grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-3">
                            {HIGHLIGHTED_FEATURES.map((feature) => {
                                const IconComponent = Icons[
                                    feature.icon as keyof typeof Icons
                                ] as React.FC<IconProps>;
                                return (
                                    <div
                                        key={feature.title}
                                        className="flex items-start gap-4 rounded-lg p-0"
                                    >
                                        <div className="bg-foreground-weblab/10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg">
                                            <IconComponent className="text-foreground-weblab h-5 w-5" />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <h3 className="text-foreground text-base font-medium">
                                                {feature.title}
                                            </h3>
                                            <p className="text-foreground-secondary text-sm text-balance">
                                                {feature.description}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="border-border-primary my-8 border-t" />

                        {/* Standard Features */}
                        <h3 className="text-title3 text-foreground mb-4 font-light">And more...</h3>
                        <div className="mx-auto mb-8 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
                            {ENTERPRISE_FEATURES.map((feature) => (
                                <div
                                    key={feature}
                                    className="text-foreground-secondary flex items-center gap-3 text-base"
                                >
                                    <Icons.CheckCircled className="text-foreground-weblab h-5 w-5 flex-shrink-0" />
                                    <span>{feature}</span>
                                </div>
                            ))}
                        </div>

                        <div className="border-border-primary my-8 border-t" />
                        <p className="text-small text-muted-foreground/50 max-w-2xl text-balance">
                            Existing paid plan users can continue using {APP_NAME}. New users –
                            Please contact us to get your team set up. If you're looking to
                            self-host {APP_NAME}, please check out the{' '}
                            <Link
                                href="https://github.com/Ludvig-Hedin/Weblab"
                                target="_blank"
                                className="underline"
                            >
                                GitHub repository
                            </Link>{' '}
                            or reach out to us to schedule a call.
                        </p>
                    </div>
                </div>
            </div>
            <div className="mx-auto mt-16 flex w-full flex-col items-center sm:mt-20 lg:mt-28">
                <FAQSection />
            </div>
            <div className="mx-auto flex w-full max-w-6xl flex-col items-center">
                <div className="mt-16 w-full">
                    <CTASection href={Routes.PROJECTS} />
                </div>
            </div>
            <AuthModal />
        </WebsiteLayout>
    );
}
