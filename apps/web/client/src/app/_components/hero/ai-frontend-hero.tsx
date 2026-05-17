'use client';

import { motion } from 'motion/react';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import { Routes } from '@/utils/constants';
import { DownloadButton } from './download-button';

export function AiFrontendHero() {
    return (
        <div className="flex w-full flex-col items-center justify-center px-8 py-4 text-center text-lg">
            <div className="relative z-20 flex max-w-5xl flex-col items-center gap-4 pt-4 pb-2">
                <motion.p
                    className="text-foreground-secondary mb-2 text-xs font-medium"
                    initial={{ opacity: 0, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    style={{ willChange: 'opacity, filter', transform: 'translateZ(0)' }}
                >
                    AI for Frontend Development
                </motion.p>
                <motion.h1
                    className="heading-style-h1 text-center text-balance"
                    initial={{ opacity: 0, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    transition={{ duration: 0.6, delay: 0.1, ease: 'easeOut' }}
                    style={{ willChange: 'opacity, filter', transform: 'translateZ(0)' }}
                >
                    AI That Builds With Your Components, Not Around Them
                </motion.h1>
                <motion.p
                    className="text-foreground-secondary mx-auto max-w-lg text-center text-lg text-balance"
                    initial={{ opacity: 0, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    transition={{ duration: 0.6, delay: 0.15, ease: 'easeOut' }}
                    style={{ willChange: 'opacity, filter', transform: 'translateZ(0)' }}
                >
                    Stop generating throwaway code. Weblab's AI is constrained to your design system
                    — your buttons, your cards, your layouts. What you create is a PR your engineers
                    can merge.
                </motion.p>
                <motion.div
                    className="mt-8 flex flex-row gap-3"
                    initial={{ opacity: 0, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
                    style={{ willChange: 'opacity, filter', transform: 'translateZ(0)' }}
                >
                    <Button asChild size="lg" className="cursor-pointer">
                        <a href={Routes.PROJECTS}>
                            Get Started
                            <Icons.ArrowRight className="ml-2 h-4 w-4" />
                        </a>
                    </Button>
                    <DownloadButton />
                </motion.div>
            </div>
        </div>
    );
}
