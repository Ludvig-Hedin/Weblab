'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { motion } from 'motion/react';

import { APP_NAME } from '@weblab/constants';
import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import { ExternalRoutes } from '@/utils/constants';
import { WebsiteLayout } from '../_components/website-layout';

type Platform = 'mac' | 'win' | 'linux' | 'ios' | 'other';

function detectPlatform(): Platform {
    if (typeof navigator === 'undefined') return 'other';
    const ua = navigator.userAgent.toLowerCase();
    const isIPadOS =
        ua.includes('macintosh') &&
        typeof navigator.maxTouchPoints === 'number' &&
        navigator.maxTouchPoints > 1;
    if (ua.includes('iphone') || ua.includes('ipad') || isIPadOS) return 'ios';
    if (ua.includes('macintosh') || ua.includes('mac os x')) return 'mac';
    if (ua.includes('windows')) return 'win';
    if (ua.includes('linux') && !ua.includes('android')) return 'linux';
    return 'other';
}

interface DownloadOption {
    id: Platform;
    title: string;
    subtitle: string;
    cta: string;
    href: string;
    available: boolean;
    badge?: string;
}

function Preview({ platform }: { platform: Platform }) {
    return (
        <div className="border-foreground-secondary/10 from-background-tertiary/40 to-background-secondary/20 relative overflow-hidden border-b bg-gradient-to-b">
            <div className="aspect-[16/10] w-full">
                {platform === 'mac' && (
                    <div className="flex h-full w-full items-center justify-center p-8">
                        <div className="border-foreground-secondary/15 bg-background-primary/60 w-full max-w-[80%] overflow-hidden rounded-md border shadow-2xl backdrop-blur-sm">
                            <div className="border-foreground-secondary/10 flex items-center gap-1.5 border-b px-3 py-2">
                                <span className="bg-foreground-secondary/30 h-2 w-2 rounded-full" />
                                <span className="bg-foreground-secondary/20 h-2 w-2 rounded-full" />
                                <span className="bg-foreground-secondary/20 h-2 w-2 rounded-full" />
                            </div>
                            <div className="flex aspect-[16/9] items-center justify-center">
                                <span className="text-foreground-primary text-lg font-light tracking-tight">
                                    {APP_NAME}
                                </span>
                            </div>
                        </div>
                    </div>
                )}
                {platform === 'ios' && (
                    <div className="flex h-full w-full items-center justify-center p-6">
                        <div className="border-foreground-secondary/15 bg-background-primary/60 relative h-[85%] w-32 overflow-hidden rounded-2xl border shadow-2xl backdrop-blur-sm">
                            <div className="bg-background-primary absolute top-1.5 left-1/2 z-10 h-3 w-12 -translate-x-1/2 rounded-full" />
                            <div className="flex h-full items-center justify-center">
                                <span className="text-foreground-primary text-sm font-light tracking-tight">
                                    {APP_NAME}
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function DownloadPage() {
    const t = useTranslations('downloadPage') as (
        key: string,
        values?: Record<string, string>,
    ) => string;
    const [detected, setDetected] = useState<Platform>('other');

    useEffect(() => {
        setDetected(detectPlatform());
    }, []);

    const options = useMemo<DownloadOption[]>(
        () => [
            {
                id: 'mac',
                title: t('mac.title'),
                subtitle: t('mac.subtitle'),
                cta: t('mac.cta'),
                href: ExternalRoutes.DOWNLOAD_MAC,
                available: true,
                badge: t('beta'),
            },
            {
                id: 'ios',
                title: t('ios.title'),
                subtitle: t('ios.subtitle'),
                cta: t('ios.cta'),
                href: ExternalRoutes.DOWNLOAD_IOS,
                available: false,
            },
        ],
        [t],
    );

    return (
        <WebsiteLayout>
            <div className="relative mx-auto flex min-h-screen w-full max-w-4xl flex-col items-center px-6 pt-28 pb-20">
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className="mb-12 flex flex-col items-center gap-2 text-center"
                >
                    <h1 className="text-foreground-primary text-4xl !leading-[1.05] font-light tracking-tight">
                        {t('heading', { appName: APP_NAME })}
                    </h1>
                    <p className="text-foreground-secondary max-w-md text-sm leading-relaxed">
                        {t('subhead', { appName: APP_NAME })}
                    </p>
                </motion.div>

                <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
                    {options.map((option, index) => {
                        const isRecommended = option.id === detected && option.available;
                        return (
                            <motion.div
                                key={option.id}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{
                                    duration: 0.4,
                                    delay: 0.08 + index * 0.05,
                                    ease: 'easeOut',
                                }}
                                className={cn(
                                    'border-foreground-secondary/10 bg-background-secondary/30 group relative flex flex-col overflow-hidden rounded-xl border backdrop-blur-sm transition-colors',
                                    isRecommended &&
                                        'border-foreground-primary/30 bg-background-secondary/60',
                                )}
                            >
                                <Preview platform={option.id} />
                                <div className="flex flex-1 flex-col gap-5 p-6">
                                    <div className="flex flex-col gap-1.5">
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-foreground-primary text-lg font-medium tracking-tight">
                                                {option.title}
                                            </h2>
                                            {option.badge && (
                                                <span className="text-foreground-primary border-foreground-primary/30 rounded-full border px-1.5 py-px text-[9px] font-medium tracking-wider uppercase">
                                                    {option.badge}
                                                </span>
                                            )}
                                            {isRecommended && (
                                                <span className="text-foreground-primary border-foreground-primary/30 rounded-full border px-1.5 py-px text-[9px] font-medium tracking-wider uppercase">
                                                    {t('recommended')}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-foreground-secondary text-sm leading-relaxed">
                                            {option.subtitle}
                                        </p>
                                    </div>
                                    {option.available ? (
                                        <a
                                            href={option.href}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="bg-foreground-primary text-background-primary hover:bg-foreground-hover inline-flex w-fit items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
                                        >
                                            <Icons.Download className="h-3.5 w-3.5" />
                                            {option.cta}
                                        </a>
                                    ) : (
                                        <span className="border-foreground-secondary/15 text-foreground-tertiary inline-flex w-fit items-center rounded-lg border px-4 py-2 text-sm font-medium">
                                            {t('comingSoon')}
                                        </span>
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>

                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                    className="text-foreground-tertiary mt-10 max-w-xl text-center text-[11px] leading-relaxed"
                >
                    {t('footnotePart1')}
                    <a
                        href={ExternalRoutes.DOWNLOAD_PAGE}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-foreground-secondary hover:text-foreground-primary underline underline-offset-2"
                    >
                        {t('footnoteLink')}
                    </a>
                    {t('footnotePart2')}
                </motion.div>
            </div>
        </WebsiteLayout>
    );
}
