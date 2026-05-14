'use client';

import { motion } from 'motion/react';

import { APP_NAME } from '@weblab/constants';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import { Routes } from '@/utils/constants';
import { DownloadButton } from './download-button';

export function CodexHero() {
    return (
        <div className="flex w-full flex-col items-center justify-center px-8 py-4 text-center text-lg">
            <div className="relative z-20 flex max-w-5xl flex-col items-center gap-4 pt-4 pb-2">
                <motion.p
                    className="text-foreground-secondary text-xs font-medium mb-2"
                    initial={{ opacity: 0, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    style={{ willChange: 'opacity, filter', transform: 'translateZ(0)' }}
                >
                    Workflows
                </motion.p>
                <motion.h1
                    className="heading-style-h1 text-center text-balance"
                    initial={{ opacity: 0, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    transition={{ duration: 0.6, delay: 0.1, ease: 'easeOut' }}
                    style={{ willChange: 'opacity, filter', transform: 'translateZ(0)' }}
                >
                    Codex for Designers
                </motion.h1>
                <motion.h2
                    className="text-foreground-secondary mx-auto max-w-2xl text-center text-lg text-balance"
                    initial={{ opacity: 0, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, filter: 'blur(0px)' }}
                    transition={{ duration: 0.6, delay: 0.15, ease: 'easeOut' }}
                    style={{ willChange: 'opacity, filter', transform: 'translateZ(0)' }}
                >
                    The visual canvas your AI workflow is missing. OpenAI Codex builds it.{' '}
                    {APP_NAME} lets you design it.
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
                        size="lg"
                        className="cursor-pointer"
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
