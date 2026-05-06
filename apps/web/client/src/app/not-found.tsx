'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

import { Illustrations } from './_components/landing-page/illustrations';
import { WebsiteLayout } from './_components/website-layout';

export default function NotFound() {
    return (
        <WebsiteLayout>
            <main className="relative min-h-screen w-full overflow-hidden">
                {/* Giant Weblab Seal - positioned to overflow top */}
                <motion.div
                    className="pointer-events-none absolute -top-[35vh] left-1/2 -translate-x-1/2"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 1, delay: 0.7, ease: 'easeOut' }}
                >
                    <Illustrations.WeblabLogoSeal className="text-foreground-primary/10 h-[90vw] max-h-[1000px] w-[90vw] max-w-[1000px]" />
                </motion.div>

                {/* Content - centered in viewport */}
                <div className="relative z-10 flex min-h-screen w-full flex-col items-center justify-center p-4 pt-24 text-center">
                    <div className="mt-[15vh] max-w-md space-y-6">
                        {/* Title and subtitle */}
                        <motion.div
                            className="space-y-3"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, ease: 'easeOut' }}
                        >
                            <h1 className="text-foreground-primary text-6xl font-light tracking-tight">
                                404
                            </h1>
                            <p className="text-foreground-tertiary text-xl">
                                Seems like you ventured somewhere unknown on your journey. Let us
                                help you find your way.
                            </p>
                        </motion.div>

                        {/* Home button */}
                        <motion.div
                            className="flex justify-center pt-4"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.2, ease: 'easeOut' }}
                        >
                            <Link
                                href="/"
                                className="border-foreground-primary/20 text-foreground-primary hover:bg-foreground-primary/5 focus-visible:outline-primary inline-flex items-center rounded-md border px-6 py-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
                            >
                                Back to home
                            </Link>
                        </motion.div>
                    </div>
                </div>
            </main>
        </WebsiteLayout>
    );
}
