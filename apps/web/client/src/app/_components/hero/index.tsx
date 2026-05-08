'use client';

import { useState } from 'react';
import { motion } from 'motion/react';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import { useAuthContext } from '@/app/auth/auth-context';
import { api } from '@/trpc/react';
import { vujahdayScript } from '../../fonts';
import { Create } from './create';
import { CreateError } from './create-error';
import { DownloadButton } from './download-button';
import { HighDemand } from './high-demand';
import { Import } from './import';
import { UnicornBackground } from './unicorn-background';

export function Hero() {
    const { data: user } = api.user.get.useQuery();
    const { setIsAuthModalOpen } = useAuthContext();
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
                        AI visual website builder
                        <br />
                        <span
                            className={`font-normal italic ${vujahdayScript.className} ml-1 text-[3rem] leading-[1.1] sm:text-[4.6rem] sm:leading-[1.0]`}
                        >
                            for React teams
                        </span>
                    </motion.h1>
                    <motion.p
                        className="text-foreground-secondary mt-2 max-w-xl text-center text-lg text-balance"
                        initial={{ opacity: 0, filter: 'blur(4px)' }}
                        animate={{ opacity: 1, filter: 'blur(0px)' }}
                        transition={{ duration: 0.6, delay: 0.15, ease: 'easeOut' }}
                        style={{ willChange: 'opacity, filter', transform: 'translateZ(0)' }}
                    >
                        Design with your real components on an infinite canvas. Keep the Cursor for
                        Designers speed, but ship production pull requests instead of prototypes.
                    </motion.p>
                    <HighDemand />
                    <CreateError />
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
                <div className="pointer-events-auto relative z-20 flex flex-row items-center gap-4">
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.55, ease: 'easeOut' }}
                    >
                        <DownloadButton />
                    </motion.div>
                    {!user?.id && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.6, delay: 0.6, ease: 'easeOut' }}
                        >
                            <Button
                                variant="outline"
                                className="border-foreground-secondary/30 text-foreground-primary hover:bg-foreground-secondary/10"
                                onClick={() => setIsAuthModalOpen(true)}
                            >
                                <Icons.Person className="h-4 w-4" />
                                Sign in
                            </Button>
                        </motion.div>
                    )}
                </div>
                <motion.div
                    className="text-foreground-secondary pointer-events-auto relative z-20 hidden items-center gap-4 text-sm sm:flex"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.6, ease: 'easeOut' }}
                >
                    <Import />
                </motion.div>
            </div>
        </div>
    );
}
