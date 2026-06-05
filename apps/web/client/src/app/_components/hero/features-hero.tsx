'use client';

import { motion } from 'motion/react';

import { Icons } from '@weblab/ui/icons';

import { Routes } from '@/utils/constants';
import { AnimatedButton } from '../landing-page/animated';
import { DownloadButton } from './download-button';

export function FeaturesHero() {
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
                    Features
                </motion.p>
                <motion.h1
                    className="heading-style-h1 text-center text-balance"
                    initial={{ opacity: 0, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    transition={{ duration: 0.6, delay: 0.1, ease: 'easeOut' }}
                    style={{ willChange: 'opacity, filter', transform: 'translateZ(0)' }}
                >
                    Design with Your Real Components
                </motion.h1>
                <motion.h2
                    className="text-foreground-secondary mx-auto max-w-lg text-center text-lg text-balance"
                    initial={{ opacity: 0, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    transition={{ duration: 0.6, delay: 0.15, ease: 'easeOut' }}
                    style={{ willChange: 'opacity, filter', transform: 'translateZ(0)' }}
                >
                    Connect your codebase. Design on the canvas. Ship PRs.
                </motion.h2>
                <motion.div
                    className="mt-8 flex flex-row gap-3"
                    initial={{ opacity: 0, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    transition={{ duration: 0.6, delay: 0.3, ease: 'easeOut' }}
                    style={{ willChange: 'opacity, filter', transform: 'translateZ(0)' }}
                >
                    <AnimatedButton
                        href={Routes.PROJECTS}
                        size="lg"
                        className="cursor-pointer"
                        icon={<Icons.ArrowRight className="h-4 w-4" />}
                    >
                        Get Started
                    </AnimatedButton>
                    <DownloadButton />
                </motion.div>
            </div>
        </div>
    );
}
