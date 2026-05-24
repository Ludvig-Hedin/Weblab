'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

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
    { icon: 'FilePlus', key: 'projectTemplates' },
    { icon: 'Branch', key: 'branching' },
    { icon: 'Component', key: 'designSystem' },
    { icon: 'Brand', key: 'theming' },
    { icon: 'Layers', key: 'layers' },
    { icon: 'Sparkles', key: 'models' },
    { icon: 'GitHubLogo', key: 'openSource' },
    { icon: 'Globe', key: 'domains' },
    { icon: 'LockClosed', key: 'security' },
] as const;

const ENTERPRISE_FEATURES = [
    'unlimited',
    'customIntegrations',
    'analytics',
    'earlyAccess',
    'dedicatedSupport',
    'accountManager',
    'slack',
    'onboarding',
] as const;

export default function PricingPage() {
    const t = useTranslations('pricingPage') as (
        key: string,
        values?: Record<string, string>,
    ) => string;

    const handleContactUs = () => {
        const subject = encodeURIComponent(t('mailto.subject', { appName: APP_NAME }));
        const body = encodeURIComponent(t('mailto.body', { appName: APP_NAME }));
        window.location.href = `mailto:support@weblab.build?subject=${subject}&body=${body}`;
    };

    return (
        <WebsiteLayout showFooter={true}>
            <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-8">
                <div className="mt-24 mb-16 w-full text-left">
                    <h1 className="text-foreground mb-4 heading-style-h1">{t('heading')}</h1>
                    <p className="text-muted-foreground text-regular">{t('subhead')}</p>
                </div>

                <div className="mb-24 w-full">
                    <PricingTable />
                </div>

                <div className="mx-auto w-full max-w-6xl">
                    <div className="border-border-primary rounded-lg border p-8 sm:p-12">
                        <div className="mb-8 flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
                            <div className="text-left">
                                <h2 className="text-foreground mb-3 heading-style-h2">
                                    {t('forTeamsHeading')}
                                </h2>
                                <p className="text-regular text-foreground-secondary">
                                    {t('forTeamsSub')}
                                </p>
                            </div>
                            <div className="flex w-full flex-col gap-4 sm:w-auto sm:flex-row lg:flex-shrink-0">
                                <Button
                                    className="w-full sm:w-auto sm:min-w-[180px]"
                                    onClick={handleContactUs}
                                    variant="outline"
                                    size="lg"
                                >
                                    {t('contactUs')}
                                </Button>
                                <Button
                                    className="w-full sm:w-auto sm:min-w-[180px]"
                                    size="lg"
                                    asChild
                                >
                                    <a href="/projects">{t('getStarted')}</a>
                                </Button>
                            </div>
                        </div>

                        <div className="border-border-primary my-8 border-t" />

                        <div className="mb-8 grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-3">
                            {HIGHLIGHTED_FEATURES.map((feature) => {
                                const IconComponent = Icons[
                                    feature.icon as keyof typeof Icons
                                ] as React.FC<IconProps>;
                                return (
                                    <div
                                        key={feature.key}
                                        className="flex items-start gap-4 rounded-lg p-0"
                                    >
                                        <div className="bg-foreground-weblab/10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg">
                                            <IconComponent className="text-foreground-weblab h-5 w-5" />
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <h3 className="text-foreground text-regularPlus">
                                                {t(`features.${feature.key}.title`)}
                                            </h3>
                                            <p className="text-foreground-secondary text-small text-balance">
                                                {t(`features.${feature.key}.description`, {
                                                    appName: APP_NAME,
                                                })}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="border-border-primary my-8 border-t" />

                        <h3 className="text-title3 text-foreground mb-4 font-light">
                            {t('andMore')}
                        </h3>
                        <div className="mx-auto mb-8 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
                            {ENTERPRISE_FEATURES.map((feature) => (
                                <div
                                    key={feature}
                                    className="text-foreground-secondary flex items-center gap-3 text-regular"
                                >
                                    <Icons.CheckCircled className="text-foreground-weblab h-5 w-5 flex-shrink-0" />
                                    <span>{t(`enterpriseFeatures.${feature}`)}</span>
                                </div>
                            ))}
                        </div>

                        <div className="border-border-primary my-8 border-t" />
                        <p className="text-small text-muted-foreground/50 max-w-2xl text-balance">
                            {t('disclaimerPart1', { appName: APP_NAME })}
                            <Link
                                href="https://github.com/Ludvig-Hedin/Weblab"
                                target="_blank"
                                className="underline"
                            >
                                {t('disclaimerLink')}
                            </Link>
                            {t('disclaimerPart2')}
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
