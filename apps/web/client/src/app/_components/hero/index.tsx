'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';

import { Icons } from '@weblab/ui/icons';

import { useAuthContext } from '@/app/auth/auth-context';
import { api } from '@/trpc/react';
import { Routes } from '@/utils/constants';
import { vujahdayScript } from '../../fonts';
import { Create } from './create';
import { HighDemand } from './high-demand';
import { ImportGitHub } from './import';
import { OpenLocalFolder } from './open-local-folder';
import { StartBlank } from './start-blank';
import { UnicornBackground } from './unicorn-background';

function GetStarted() {
    const router = useRouter();
    const { data: user } = api.user.get.useQuery();
    const { setIsAuthModalOpen } = useAuthContext();

    const handleClick = () => {
        if (!user?.id) {
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
            Get started
        </button>
    );
}

export function Hero() {
    const { data: user } = api.user.get.useQuery();
    const [isCreatingProject, setIsCreatingProject] = useState(false);

    return (
        <div className="relative flex h-full w-full flex-col items-center text-center text-lg">
            <UnicornBackground />
            {/* pointer-events-none allows mouse events to pass through to the canvas behind */}
            <div className="pointer-events-none mb-42 flex h-full w-full flex-col items-center justify-center gap-10 pt-12">
                <div className="relative z-20 flex flex-col items-center gap-3 pt-8 pb-2">
                    <motion.h1
                        className="text-center text-4xl !leading-[0.9] leading-tight font-light sm:text-6xl"
                        initial={{ opacity: 0, filter: 'blur(4px)' }}
                        animate={{ opacity: 1, filter: 'blur(0px)' }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                        style={{ willChange: 'opacity, filter', transform: 'translateZ(0)' }}
                    >
                        AI visual website builder <br />
                        <span
                            className={`font-normal italic ${vujahdayScript.className} ml-1 text-[3rem] leading-[1.1] sm:text-[4.6rem] sm:leading-[1.0]`}
                        >
                            for builders
                        </span>
                    </motion.h1>
                    <motion.p
                        className="text-foreground-secondary mt-2 max-w-xl text-center text-lg leading-snug text-balance"
                        initial={{ opacity: 0, filter: 'blur(4px)' }}
                        animate={{ opacity: 1, filter: 'blur(0px)' }}
                        transition={{ duration: 0.6, delay: 0.15, ease: 'easeOut' }}
                        style={{ willChange: 'opacity, filter', transform: 'translateZ(0)' }}
                    >
                        Design with your real components on an infinite canvas. Ship
                        production-ready websites instead of prototypes.
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
                    />
                </motion.div>
                <motion.div
                    className="pointer-events-auto relative z-20 flex flex-row flex-wrap items-center justify-center gap-6 text-sm"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.55, ease: 'easeOut' }}
                >
                    {user?.id ? (
                        <>
                            <Link
                                href={Routes.PROJECTS}
                                className="text-foreground-secondary hover:text-foreground flex items-center gap-2 text-sm transition-colors duration-200"
                            >
                                <Icons.ArrowRight className="h-4 w-4" />
                                Continue to your projects
                            </Link>
                            <span className="text-foreground-secondary/30 select-none">·</span>
                            <Link
                                href={Routes.DOWNLOAD}
                                className="text-foreground-secondary hover:text-foreground flex items-center gap-2 text-sm transition-colors duration-200"
                            >
                                <Icons.Download className="h-4 w-4" />
                                Download app
                            </Link>
                        </>
                    ) : (
                        <>
                            <GetStarted />
                            <span className="text-foreground-secondary/30 select-none">·</span>
                            <ImportGitHub />
                            <span className="text-foreground-secondary/30 select-none">·</span>
                            <OpenLocalFolder />
                            <span className="text-foreground-secondary/30 select-none">·</span>
                            <StartBlank />
                            <span className="text-foreground-secondary/30 select-none">·</span>
                            <Link
                                href={Routes.DOWNLOAD}
                                className="text-foreground-secondary hover:text-foreground flex items-center gap-2 text-sm transition-colors duration-200"
                            >
                                <Icons.Download className="h-4 w-4" />
                                Download app
                            </Link>
                        </>
                    )}
                </motion.div>
            </div>
        </div>
    );
}
