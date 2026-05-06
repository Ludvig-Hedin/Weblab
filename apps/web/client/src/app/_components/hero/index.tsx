'use client';

import Link from 'next/link';
import { motion } from 'motion/react';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import { ExternalRoutes, Routes } from '@/utils/constants';
import { vujahdayScript } from '../../fonts';
import { CreateError } from './create-error';
import { DownloadButton } from './download-button';
import { HighDemand } from './high-demand';
import { Import } from './import';
import { MobileEmailCapture } from './mobile-email-capture';
import { UnicornBackground } from './unicorn-background';

export function Hero() {
    return (
        <div className="relative flex h-full w-full flex-col items-center text-center text-lg">
            <UnicornBackground />
            {/* pointer-events-none allows mouse events to pass through to the canvas behind */}
            <div className="pointer-events-none mb-42 flex h-full w-full flex-col items-center justify-center gap-10 pt-12">
                <div className="relative z-20 flex flex-col items-center gap-3 pt-8 pb-2">
                    <motion.h1
                        className="text-center text-6xl !leading-[0.9] leading-tight font-light"
                        initial={{ opacity: 0, filter: 'blur(4px)' }}
                        animate={{ opacity: 1, filter: 'blur(0px)' }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                        style={{ willChange: 'opacity, filter', transform: 'translateZ(0)' }}
                    >
                        Design visually,
                        <br />
                        <span
                            className={`font-normal italic ${vujahdayScript.className} ml-1 text-[4.6rem] leading-[1.0]`}
                        >
                            ship instantly
                        </span>
                    </motion.h1>
                    <motion.p
                        className="text-foreground-secondary mt-2 max-w-xl text-center text-lg text-balance"
                        initial={{ opacity: 0, filter: 'blur(4px)' }}
                        animate={{ opacity: 1, filter: 'blur(0px)' }}
                        transition={{ duration: 0.6, delay: 0.15, ease: 'easeOut' }}
                        style={{ willChange: 'opacity, filter', transform: 'translateZ(0)' }}
                    >
                        An infinite canvas to build websites and apps — what you design is what
                        ships, no handoff required.
                    </motion.p>
                    <HighDemand />
                    <CreateError />
                </div>
                <div className="pointer-events-auto relative z-20 flex flex-row items-center gap-4">
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.4, ease: 'easeOut' }}
                    >
                        <Button
                            asChild
                            className="bg-foreground-primary text-background-primary hover:bg-foreground-hover"
                        >
                            <Link href={Routes.PROJECTS}>
                                Get Started
                                <Icons.ArrowRight className="h-4 w-4" />
                            </Link>
                        </Button>
                    </motion.div>
                    <motion.div
                        className="sm:block"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.6, delay: 0.5, ease: 'easeOut' }}
                    >
                        <DownloadButton />
                    </motion.div>
                </div>
                <motion.div
                    className="text-foreground-secondary pointer-events-auto relative z-20 hidden items-center gap-4 text-sm sm:flex"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.6, ease: 'easeOut' }}
                >
                    <Import />
                </motion.div>
                <MobileEmailCapture />
            </div>
        </div>
    );
}
