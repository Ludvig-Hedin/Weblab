'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';

import { Icons } from '@weblab/ui/icons';

import { useAuthContext } from '@/app/auth/auth-context';
import { SplitText } from '@/components/motion/split-text';
import { useHasAuthCookie } from '@/hooks/use-has-auth-cookie';
import { api } from '@/trpc/react';
import { Routes } from '@/utils/constants';
import { vujahdayScript } from '../fonts';
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
    const cls = `${PILL_BASE} border-border text-foreground hover:bg-background-secondary border`;
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
    const { data: user } = api.user.get.useQuery(undefined, {
        enabled: hasAuthCookie === true,
    });
    const { setIsAuthModalOpen } = useAuthContext();
    const [isCreatingProject, setIsCreatingProject] = useState(false);

    const handleGetStarted = () => {
        if (!user?.id) {
            setIsAuthModalOpen(true);
            return;
        }
        router.push(Routes.NEW_PROJECT);
    };

    return (
        <motion.div
            className="flex w-full flex-col items-center gap-38 px-4 py-2 sm:px-6 md:px-8 lg:pt-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
        >
            <section className="grid w-full max-w-6xl grid-cols-1 items-start gap-10 md:grid-cols-2 lg:gap-12">
                <div className="flex w-full max-w-[545px] flex-col items-start gap-5 lg:justify-self-start">
                    <SplitText
                        as="h1"
                        mode="mount"
                        stagger={0.06}
                        duration={0.6}
                        className="heading-style-h1 text-left"
                    >
                        {'AI visual website builder '}
                        <span
                            className={`font-normal italic ${vujahdayScript.className} leading-[0.95]`}
                        >
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
                            user={user ?? null}
                            variant="hero"
                        />
                    </motion.div>

                    <motion.div
                        className="flex flex-wrap items-center justify-start gap-2"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.45, ease: 'easeOut' }}
                    >
                        {user?.id ? (
                            // Signed-in users already see a "Projects" pill in
                            // the top-right nav; surfacing "Continue to
                            // projects" here too is redundant. Keep just the
                            // Download CTA so signed-in visitors get a single
                            // hero-level action.
                            <SecondaryButton href={Routes.DOWNLOAD}>
                                <Icons.Download className="h-4 w-4" />
                                Download
                            </SecondaryButton>
                        ) : (
                            <>
                                <PrimaryButton onClick={handleGetStarted}>
                                    Get started
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

            <motion.div
                className="w-full max-w-6xl overflow-x-clip min-[1400px]:max-w-[1320px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
            >
                {/* Editor chrome has fixed pixel offsets (rail w-12, panels
                    w-56/w-72, EditorBar 268/288 insets) that get cramped
                    below ~1280px wide. Pin to native desktop width and clip
                    overflow on anything smaller than 1400px viewport so the
                    mockup stays readable instead of squished at every step
                    from phone to small desktop. */}
                <div className="relative min-w-[1280px] pt-10 min-[1400px]:min-w-0">
                    <WeblabInterfaceMockup />
                </div>
            </motion.div>
        </motion.div>
    );
}
