'use client';

import { useEffect, useState } from 'react';
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
    // Check iOS first — iPadOS reports as Macintosh with TouchEvents.
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
    icon: keyof typeof Icons;
    note?: string;
}

const OPTIONS: DownloadOption[] = [
    {
        id: 'mac',
        title: 'macOS',
        subtitle: 'Universal — Apple Silicon & Intel',
        cta: 'Download .dmg',
        href: ExternalRoutes.DOWNLOAD_MAC,
        icon: 'Laptop',
        note: 'Right-click → Open the first time to bypass the Gatekeeper warning.',
    },
    {
        id: 'win',
        title: 'Windows',
        subtitle: '64-bit installer',
        cta: 'Download .exe',
        href: ExternalRoutes.DOWNLOAD_WIN,
        icon: 'Desktop',
    },
    {
        id: 'linux',
        title: 'Linux',
        subtitle: 'AppImage — works on most distros',
        cta: 'Download .AppImage',
        href: ExternalRoutes.DOWNLOAD_LINUX,
        icon: 'Desktop',
        note: 'chmod +x Weblab.AppImage  ·  ./Weblab.AppImage',
    },
    {
        id: 'ios',
        title: 'iOS',
        subtitle: 'iPhone & iPad — iOS 16 or later',
        cta: 'Get on TestFlight',
        href: ExternalRoutes.DOWNLOAD_IOS,
        icon: 'Mobile',
        note: 'Sign in with Google works through Safari, then returns you to the app.',
    },
];

export default function DownloadPage() {
    const [detected, setDetected] = useState<Platform>('other');

    useEffect(() => {
        setDetected(detectPlatform());
    }, []);

    return (
        <WebsiteLayout>
            <div className="relative mx-auto flex min-h-screen w-full max-w-5xl flex-col items-center px-6 pt-32 pb-24">
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className="mb-12 flex flex-col items-center gap-3 text-center"
                >
                    <h1 className="text-foreground-primary text-5xl !leading-[1] font-light">
                        Download {APP_NAME}
                    </h1>
                    <p className="text-foreground-secondary max-w-xl text-base">
                        The same {APP_NAME}, wrapped natively for your device. Sign in once and your
                        session syncs with the web app.
                    </p>
                </motion.div>

                <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
                    {OPTIONS.map((option, index) => {
                        const Icon = Icons[option.icon] as React.ComponentType<{
                            className?: string;
                        }>;
                        const isRecommended = option.id === detected;
                        // All native binaries are not yet published. Show a
                        // "Coming soon" pill instead of linking to dead URLs.
                        return (
                            <motion.div
                                key={option.id}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{
                                    duration: 0.4,
                                    delay: 0.1 + index * 0.05,
                                    ease: 'easeOut',
                                }}
                                className={cn(
                                    'border-foreground-secondary/15 bg-background-secondary/40 relative flex flex-col gap-5 rounded-lg border p-6 backdrop-blur-sm transition-colors',
                                    isRecommended &&
                                        'border-foreground-primary/40 bg-background-secondary/70',
                                )}
                            >
                                {isRecommended && (
                                    <span className="bg-foreground-primary text-background-primary absolute -top-2 right-4 rounded-full px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase">
                                        Recommended
                                    </span>
                                )}
                                <div className="flex items-start gap-4">
                                    <div className="bg-background-tertiary/60 flex h-10 w-10 shrink-0 items-center justify-center rounded-md">
                                        <Icon className="text-foreground-primary h-5 w-5" />
                                    </div>
                                    <div className="flex flex-col">
                                        <h2 className="text-foreground-primary text-lg font-medium">
                                            {option.title}
                                        </h2>
                                        <p className="text-foreground-secondary text-sm">
                                            {option.subtitle}
                                        </p>
                                    </div>
                                </div>
                                <div className="border-foreground-secondary/20 bg-background-tertiary/40 text-foreground-secondary mt-auto inline-flex w-full items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium">
                                    Coming soon
                                </div>
                                {option.note && (
                                    <p className="text-foreground-tertiary text-xs leading-relaxed">
                                        {option.note}
                                    </p>
                                )}
                            </motion.div>
                        );
                    })}
                </div>

                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                    className="text-foreground-tertiary mt-12 max-w-2xl text-center text-xs leading-relaxed"
                >
                    Sign-in works the same as the web app — Google, GitHub or email. The desktop and
                    iOS apps route OAuth through your system browser so providers accept the login,
                    then drop you back into the app already signed in. Looking for older versions?
                    Browse the{' '}
                    <a
                        href={ExternalRoutes.DOWNLOAD_PAGE}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-foreground-secondary hover:text-foreground-primary underline underline-offset-2"
                    >
                        full release archive
                    </a>
                    .
                </motion.div>
            </div>
        </WebsiteLayout>
    );
}
