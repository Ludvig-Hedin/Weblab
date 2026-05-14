'use client';

import { motion } from 'motion/react';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import { Routes } from '@/utils/constants';
import { DownloadButton } from './download-button';

export function FeaturesHero() {
    return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-12 p-8 text-center text-lg">
            <div className="relative z-20 flex max-w-3xl flex-col items-center gap-6 pt-4 pb-2">
                <motion.p
                    className="heading-style-h6 text-foreground-secondary mb-4"
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
                    className="text-foreground-secondary mx-auto max-w-xl text-center text-lg text-balance"
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
                    <Button
                        asChild
                        variant="outline"
                        size="lg"
                        className="border-foreground-secondary/30 text-foreground-primary hover:bg-foreground-secondary/10 cursor-pointer p-6 transition-all duration-300"
                    >
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
