'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { motion } from 'motion/react';

import { Icons } from '@weblab/ui/icons';

import { useAuthContext } from '@/app/auth/auth-context';
import { SplitText } from '@/components/motion/split-text';
import { useHasAuthCookie } from '@/hooks/use-has-auth-cookie';
import { Routes } from '@/utils/constants';
import { Create } from './hero/create';
import { HighDemand } from './hero/high-demand';
import { WeblabInterfaceMockup } from './landing-page/weblab-interface-mockup';

const PILL_BASE =
    'inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-foreground/40 focus-visible:ring-offset-background';

function PrimaryButton({
    onClick,
    href,
    children,
}: {
    onClick?: () => void;
    href?: string;
    children: React.ReactNode;
}) {
    const cls = `${PILL_BASE} bg-foreground text-background hover:bg-foreground/90`;
    if (href) {
        return (
            <Link href={href} className={cls}>
                {children}
            </Link>
        );
    }
    return (
        <button onClick={onClick} className={cls}>
            {children}
        </button>
    );
}

function SecondaryButton({
    href,
    onClick,
    children,
}: {
    href?: string;
    onClick?: () => void;
    children: React.ReactNode;
}) {
    const cls = `${PILL_BASE} border-foreground/20 text-foreground hover:bg-background-secondary border`;
    if (href) {
        return (
            <Link href={href} className={cls}>
                {children}
            </Link>
        );
    }
    return (
        <button onClick={onClick} className={cls}>
            {children}
        </button>
    );
}

export function HeroV2() {
    const router = useRouter();
    const hasAuthCookie = useHasAuthCookie();
    // Skip the user fetch on anonymous landing visits. The CTA falls back
    // to opening the auth modal when there's no user, so we don't need to
    // pre-fetch identity until the visitor signs in.
    const user = useQuery(api.users.me, hasAuthCookie === true ? {} : 'skip');
    const { setIsAuthModalOpen } = useAuthContext();
    const [isCreatingProject, setIsCreatingProject] = useState(false);

    const handleGetStarted = () => {
        if (!user?._id) {
            setIsAuthModalOpen(true);
            return;
        }
        router.push(Routes.NEW_PROJECT);
    };

    return (
        <motion.div
            className="flex w-full flex-col items-center gap-38 py-2 lg:pt-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
        >
            <section className="grid w-full max-w-6xl grid-cols-1 items-start gap-10 px-4 sm:px-6 md:grid-cols-2 md:px-8 lg:gap-12">
                <div className="flex w-full max-w-[545px] flex-col items-start gap-5 lg:justify-self-start">
                    <SplitText
                        as="h1"
                        mode="mount"
                        stagger={0.06}
                        duration={0.6}
                        className="heading-style-h1 text-left"
                    >
                        {'AI visual website builder '}
                        <span className="font-normal leading-[0.95]">
                            {' '}
                            for builders
                        </span>
                    </SplitText>
                    <motion.p
                        className="text-foreground-secondary text-left text-sm leading-[1.4] text-balance md:text-base"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.15, ease: 'easeOut' }}
                    >
                        Design with your real components on an infinite canvas. Ship
                        production-ready websites instead of prototypes.
                    </motion.p>
                </div>

                <div className="flex w-full max-w-[450px] flex-col items-start gap-5 lg:justify-self-start">
                    <motion.div
                        className="relative z-20 w-full"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }}
                    >
                        <Create
                            cardKey={0}
                            isCreatingProject={isCreatingProject}
                            setIsCreatingProject={setIsCreatingProject}
                            user={(user ?? null) as never}
                            variant="hero"
                        />
                    </motion.div>

                    <motion.div
                        className="flex flex-wrap items-center justify-start gap-2"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.45, ease: 'easeOut' }}
                    >
                        {user?._id ? (
                            <>
                                <PrimaryButton href={Routes.PROJECTS}>
                                    Projects
                                    <Icons.ArrowRight className="h-4 w-4" />
                                </PrimaryButton>
                                <SecondaryButton href={Routes.DOWNLOAD}>
                                    <Icons.Download className="h-4 w-4" />
                                    Download
                                </SecondaryButton>
                            </>
                        ) : (
                            <>
                                <PrimaryButton onClick={handleGetStarted}>
                                    Get started
                                    <Icons.ArrowRight className="h-4 w-4" />
                                </PrimaryButton>
                                <SecondaryButton href={Routes.DOWNLOAD}>
                                    <Icons.Download className="h-4 w-4" />
                                    Download
                                </SecondaryButton>
                            </>
                        )}
                    </motion.div>

                    <HighDemand />
                </div>
            </section>

            {/* Editor demo lives inside a contained backdrop band — same
                container width as the hero text above (max-w-[1400px]
                centered, NOT viewport-bleed). 44px top + side padding
                (px-11/pt-11), no bottom so the card's flat bottom edge sits
                flush with the band. `pr-0` below 640px hands the right side
                back to the editor so the mockup scales bigger on phones. */}
            {/* Editor demo lives inside a contained backdrop band — same
                container width as the hero text above (max-w-[1400px]
                centered). 44px top + side padding, no bottom so the card's
                flat bottom edge sits flush with the band. `pr-0` below
                640px hands the right side back to the editor so the mockup
                scales bigger on phones. 12px top radius matches the inner
                card's `rounded-t-xl`. */}
            <div className="w-full px-4 sm:px-6 md:px-8">
            <motion.div
                className="relative mx-auto w-full max-w-[1400px] rounded-t-[12px] bg-[url('/assets/landing/feature-backdrops/ivory.webp')] bg-cover bg-center bg-no-repeat px-11 pt-11 max-[640px]:pr-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
            >
                {/* @container + cqw — mockup renders at native 1280px and
                    scales DOWN to fit container width. `max-w-[1280px]`
                    caps the container so when scale=1 (wide viewports) the
                    aspect-ratio height matches the mockup exactly — no
                    phantom gap below the card. */}
                <div className="@container relative mx-auto aspect-[16/10] w-full max-w-[1280px]">
                    <div className="flex h-full w-full justify-center">
                        <div
                            className="shrink-0"
                            style={{
                                width: '1280px',
                                transformOrigin: 'top center',
                                transform:
                                    'scale(min(1, calc(100cqw / 1280px)))',
                            }}
                        >
                            <WeblabInterfaceMockup />
                        </div>
                    </div>
                </div>
            </motion.div>
            </div>
        </motion.div>
    );
}
