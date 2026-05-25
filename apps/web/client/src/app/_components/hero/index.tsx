'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons';

import { useAuthContext } from '@/app/auth/auth-context';
import { PROJECT_SUGGESTIONS } from '@/app/projects/_components/select';
import { useHasAuthCookie } from '@/hooks/use-has-auth-cookie';
import { Routes } from '@/utils/constants';
import { vujahdayScript } from '../../fonts';
import { JustShippedStrip } from '../landing-page/just-shipped-strip';
import { Create } from './create';
import { HighDemand } from './high-demand';
import { UnicornBackground } from './unicorn-background';

function GetStarted() {
    const router = useRouter();
    // Gate the protected query on the cookie heuristic so anonymous landing
    // visitors don't fire a guaranteed-401 `user.get` round-trip on every
    // page load (previously logged a `TRPCClientError: UNAUTHORIZED` to the
    // console and wasted a request).
    const hasAuthCookie = useHasAuthCookie();
    const user = useQuery(api.users.me, hasAuthCookie === true ? {} : 'skip');
    const { setIsAuthModalOpen } = useAuthContext();
    const t = useTranslations('landing.hero');

    const handleClick = () => {
        if (!user?._id) {
            setIsAuthModalOpen(true);
            return;
        }
        router.push(Routes.NEW_PROJECT);
    };

    return (
        <button
            onClick={handleClick}
            className="text-foreground-secondary hover:text-foreground flex items-center gap-2 text-sm transition-colors duration-200"
        >
            <Icons.ArrowRight className="h-4 w-4" />
            {t('getStarted')}
        </button>
    );
}

export function Hero() {
    const hasAuthCookie = useHasAuthCookie();
    const user = useQuery(api.users.me, hasAuthCookie === true ? {} : 'skip');
    const [isCreatingProject, setIsCreatingProject] = useState(false);
    const t = useTranslations('landing.hero');

    return (
        <div className="relative flex h-full w-full flex-col items-center text-center text-lg">
            <UnicornBackground />
            {/* pointer-events-none allows mouse events to pass through to the canvas behind */}
            <div className="pointer-events-none mb-42 flex h-full w-full flex-col items-center justify-center gap-10 px-4 pt-12 sm:px-6">
                <div className="relative z-20 flex flex-col items-center gap-3 pt-8 pb-2">
                    {/* Changelog tag — moved above the h1 so the latest ship is the
                        first thing a returning visitor sees. */}
                    <JustShippedStrip />
                    <motion.h1
                        className="heading-style-h1 text-center text-balance"
                        initial={{ opacity: 0, filter: 'blur(4px)' }}
                        animate={{ opacity: 1, filter: 'blur(0px)' }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                        style={{
                            willChange: 'opacity, filter',
                            transform: 'translateZ(0)',
                        }}
                    >
                        {t('headline')} <br />
                        <span
                            className={`font-normal italic ${vujahdayScript.className} ml-1 text-[2.4rem] leading-[1.1] sm:text-[4.6rem] sm:leading-[1.0]`}
                        >
                            {t('headlineScript')}
                        </span>
                    </motion.h1>
                    <motion.p
                        className="text-foreground-secondary mt-2 max-w-xl text-center text-lg leading-snug text-balance"
                        initial={{ opacity: 0, filter: 'blur(4px)' }}
                        animate={{ opacity: 1, filter: 'blur(0px)' }}
                        transition={{ duration: 0.6, delay: 0.15, ease: 'easeOut' }}
                        style={{
                            willChange: 'opacity, filter',
                            transform: 'translateZ(0)',
                        }}
                    >
                        {t('subhead')}
                    </motion.p>
                    <HighDemand />
                </div>
                <motion.div
                    className="pointer-events-auto relative z-20 flex w-full justify-center px-4"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.4, ease: 'easeOut' }}
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
                    className="pointer-events-auto relative z-20 flex flex-row flex-wrap items-center justify-center gap-3 text-sm sm:gap-6"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.55, ease: 'easeOut' }}
                >
                    {user?._id ? (
                        <>
                            <Link
                                href={Routes.PROJECTS}
                                className="text-foreground-secondary hover:text-foreground flex items-center gap-2 text-sm transition-colors duration-200"
                            >
                                <Icons.ArrowRight className="h-4 w-4" />
                                {t('continueProjects')}
                            </Link>
                            <span className="text-foreground-secondary/30 hidden select-none sm:inline">
                                ·
                            </span>
                            <Link
                                href={Routes.DOWNLOAD}
                                className="text-foreground-secondary hover:text-foreground flex items-center gap-2 text-sm transition-colors duration-200"
                            >
                                <Icons.Download className="h-4 w-4" />
                                {t('download')}
                            </Link>
                        </>
                    ) : (
                        // Single primary entry point + download. Secondary starting
                        // points (clone, import GitHub, local folder, blank) live
                        // on /projects/new so the hero stays focused and new users
                        // are not paralyzed by six near-equivalent links.
                        <>
                            <GetStarted />
                            <span className="text-foreground-secondary/30 hidden select-none sm:inline">
                                ·
                            </span>
                            <Link
                                href={Routes.DOWNLOAD}
                                className="text-foreground-secondary hover:text-foreground flex items-center gap-2 text-sm transition-colors duration-200"
                            >
                                <Icons.Download className="h-4 w-4" />
                                {t('download')}
                            </Link>
                        </>
                    )}
                </motion.div>
            </div>
        </div>
    );
}
