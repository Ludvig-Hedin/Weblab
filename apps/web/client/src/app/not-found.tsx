'use client';

import type { MotionValue } from 'framer-motion';
import { useRef } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

import { Button } from '@weblab/ui/button';

import { WebsiteLayout } from './_components/website-layout';

function PlayfulDigit({ char, delay }: { char: string; delay: number }) {
    const ref = useRef<HTMLSpanElement>(null);
    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const springConfig = { stiffness: 180, damping: 14, mass: 0.6 };
    const sx: MotionValue<number> = useSpring(x, springConfig);
    const sy: MotionValue<number> = useSpring(y, springConfig);
    const rotate = useTransform(sx, [-80, 80], [-10, 10]);
    const skewX = useTransform(sy, [-80, 80], [4, -4]);

    const handleMove = (e: React.MouseEvent<HTMLSpanElement>) => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        x.set((e.clientX - cx) / 3);
        y.set((e.clientY - cy) / 3);
    };

    const reset = () => {
        x.set(0);
        y.set(0);
    };

    return (
        <motion.span
            ref={ref}
            onMouseMove={handleMove}
            onMouseLeave={reset}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.85 }}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay, ease: 'easeOut' }}
            style={{ x: sx, y: sy, rotate, skewX, display: 'inline-block' }}
            className="cursor-grab select-none active:cursor-grabbing"
        >
            {char}
        </motion.span>
    );
}

export default function NotFound() {
    const t = useTranslations('notFound');
    return (
        <WebsiteLayout>
            <main className="relative min-h-screen w-full overflow-hidden">
                <div className="relative z-10 flex min-h-screen w-full flex-col items-center justify-center p-4 text-center">
                    <div className="max-w-md space-y-6">
                        <h1 className="text-foreground-primary flex justify-center gap-2 text-8xl font-light tracking-tight md:text-9xl">
                            <PlayfulDigit char="4" delay={0} />
                            <PlayfulDigit char="0" delay={0.08} />
                            <PlayfulDigit char="4" delay={0.16} />
                        </h1>
                        <motion.p
                            className="text-foreground-tertiary text-xl"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }}
                        >
                            {t('body')}
                        </motion.p>
                        <motion.div
                            className="flex justify-center pt-4"
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.45, ease: 'easeOut' }}
                        >
                            <Button
                                asChild
                                variant="secondary"
                                size="lg"
                                className="hover:bg-foreground-primary hover:text-background-primary cursor-pointer p-6 transition-colors"
                            >
                                <Link href="/">{t('backHome')}</Link>
                            </Button>
                        </motion.div>
                    </div>
                </div>
            </main>
        </WebsiteLayout>
    );
}
