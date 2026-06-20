'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { motion } from 'motion/react';

import { Icons } from '@weblab/ui/icons';

import { useAuthContext } from '@/app/auth/auth-context';
import { PROJECT_SUGGESTIONS } from '@/app/projects/_components/select';
import { SplitText } from '@/components/motion/split-text';
import { useHasAuthCookie } from '@/hooks/use-has-auth-cookie';
import { Routes } from '@/utils/constants';
import { Create } from './hero/create';
import { HighDemand } from './hero/high-demand';
import { AnimatedButton } from './landing-page/animated';
import { WeblabInterfaceMockup } from './landing-page/weblab-interface-mockup';

// Hero CTAs share the rounded-full pill geometry; AnimatedButton supplies the
// design-system base via buttonVariants plus the stagger + directional sweep.
const HERO_PILL = 'h-9 rounded-full px-4 text-sm';

export function HeroV2() {
    const router = useRouter();
    const hasAuthCookie = useHasAuthCookie();
    // Skip the user fetch on anonymous landing visits. The CTA falls back
    // to opening the auth modal when there's no user, so we don't need to
    // pre-fetch identity until the visitor signs in.
    const user = useQuery(api.users.me, hasAuthCookie === true ? {} : 'skip');
    const { redirectToSignIn } = useAuthContext();
    const [isCreatingProject, setIsCreatingProject] = useState(false);

    const handleGetStarted = () => {
        if (!user?._id) {
            // CTA with no in-flight state — full-page bounce to /sign-in
            // instead of an AuthModal flash before navigation.
            redirectToSignIn();
            return;
        }
        router.push(Routes.NEW_PROJECT);
    };

    return (
        <motion.div
            className="flex w-full flex-col items-center gap-16 py-2 lg:pt-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
        >
            <section className="grid w-full max-w-6xl grid-cols-1 items-start gap-10 px-4 sm:px-6 md:grid-cols-2 md:px-8 lg:gap-12">
                <div className="flex w-full max-w-[545px] flex-col items-start gap-3 lg:justify-self-start">
                    <SplitText
                        as="h1"
                        mode="mount"
                        stagger={0.06}
                        duration={0.6}
                        className="heading-style-h1 text-left text-balance"
                    >
                        AI-native visual website builder
                    </SplitText>
                    <motion.p
                        className="text-foreground-secondary text-left text-sm leading-[1.4] text-balance md:text-base"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.15, ease: 'easeOut' }}
                    >
                        Use your own codebase or build in the cloud. Import your design system, work
                        locally, or start from scratch.
                    </motion.p>
                </div>

                <div className="flex w-full max-w-[450px] flex-col items-center gap-4 lg:justify-self-center">
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
                            suggestions={PROJECT_SUGGESTIONS}
                        />
                    </motion.div>

                    <motion.div
                        className="flex w-full flex-wrap items-center justify-start gap-2"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.45, ease: 'easeOut' }}
                    >
                        {user?._id ? (
                            <>
                                <AnimatedButton
                                    href={Routes.PROJECTS}
                                    variant="default"
                                    className={HERO_PILL}
                                    icon={<Icons.ArrowRight className="h-4 w-4" />}
                                >
                                    Projects
                                </AnimatedButton>
                                <AnimatedButton
                                    href={Routes.DOWNLOAD}
                                    variant="outline"
                                    className={HERO_PILL}
                                    leadingIcon={<Icons.Download className="h-4 w-4" />}
                                >
                                    Download
                                </AnimatedButton>
                            </>
                        ) : (
                            <>
                                <AnimatedButton
                                    onClick={handleGetStarted}
                                    variant="default"
                                    className={HERO_PILL}
                                    icon={<Icons.ArrowRight className="h-4 w-4" />}
                                >
                                    Get started
                                </AnimatedButton>
                                <AnimatedButton
                                    href={Routes.DOWNLOAD}
                                    variant="outline"
                                    className={HERO_PILL}
                                    leadingIcon={<Icons.Download className="h-4 w-4" />}
                                >
                                    Download
                                </AnimatedButton>
                            </>
                        )}
                    </motion.div>

                    <HighDemand />
                </div>
            </section>

            {/* Editor demo: contained backdrop band, max-w-[1400px] centered.
                44px top + side padding, no bottom so card sits flush.
                pr-0 below 640px so mockup scales bigger on phones. */}
            <div className="w-full px-4 sm:px-6 md:px-8">
                <motion.div
                    className="relative mx-auto w-full max-w-[1400px] rounded-[12px] bg-[url('/assets/landing/feature-backdrops/ivory.webp')] bg-cover bg-center bg-no-repeat px-11 pt-11 max-[640px]:pr-0"
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
                                    transform: 'scale(min(1, calc(100cqw / 1280px)))',
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
