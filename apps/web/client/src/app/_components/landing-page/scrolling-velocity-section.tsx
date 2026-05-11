'use client';

import React, { useRef } from 'react';
import { useTranslations } from 'next-intl';
import {
    motion,
    useAnimationFrame,
    useMotionValue,
    useScroll,
    useSpring,
    useTransform,
    useVelocity,
    wrap,
} from 'framer-motion';

import { cn } from '@weblab/ui/utils';

interface ParallaxProps {
    children: string;
    baseVelocity: number;
    className?: string;
}

const COPIES = 8;

function ParallaxText({ children, baseVelocity, className }: ParallaxProps) {
    const baseX = useMotionValue(0);
    const { scrollY } = useScroll();
    const scrollVelocity = useVelocity(scrollY);
    const smoothVelocity = useSpring(scrollVelocity, {
        damping: 50,
        stiffness: 400,
    });
    const velocityFactor = useTransform(smoothVelocity, [0, 1000], [0, 2], {
        clamp: false,
    });

    // 100/COPIES so loop seam is invisible. With 8 copies => -12.5.
    const x = useTransform(baseX, (v) => `${wrap(-(100 / COPIES), 0, v)}%`);

    const directionFactor = useRef<number>(1);
    useAnimationFrame((_t, delta) => {
        let moveBy = directionFactor.current * baseVelocity * (delta / 1000);

        if (velocityFactor.get() < 0) {
            directionFactor.current = -1;
        } else if (velocityFactor.get() > 0) {
            directionFactor.current = 1;
        }

        moveBy += directionFactor.current * moveBy * velocityFactor.get();

        baseX.set(baseX.get() + moveBy);
    });

    return (
        <div className="flex flex-nowrap overflow-hidden whitespace-nowrap">
            <motion.div className={cn('flex whitespace-nowrap', className)} style={{ x }}>
                {Array.from({ length: COPIES }).map((_, i) => (
                    <span key={i} className="mr-12 block">
                        {children}
                    </span>
                ))}
            </motion.div>
        </div>
    );
}

export function ScrollingVelocitySection() {
    const t = useTranslations('landing.scrollingVelocity');
    const sectionRef = useRef<HTMLElement | null>(null);

    // Fade in as section enters viewport.
    const { scrollYProgress } = useScroll({
        target: sectionRef,
        offset: ['start end', 'center center'],
    });
    const opacity = useTransform(scrollYProgress, [0, 0.6, 1], [0, 0.6, 1]);
    const translateY = useTransform(scrollYProgress, [0, 1], [40, 0]);

    // Scroll-velocity-driven rotation. Resting state = 0deg. Direction swaps with scroll direction.
    const { scrollY } = useScroll();
    const scrollVelocity = useVelocity(scrollY);
    const smoothVelocity = useSpring(scrollVelocity, {
        damping: 40,
        stiffness: 200,
    });
    const rotate = useTransform(smoothVelocity, [-2000, 0, 2000], [3, 0, -3], {
        clamp: true,
    });

    return (
        <section
            ref={sectionRef}
            className="bg-background relative w-full overflow-hidden py-48 md:py-64"
        >
            <motion.div style={{ opacity, y: translateY, rotate }}>
                <ParallaxText
                    baseVelocity={1.5}
                    className="text-foreground-primary text-6xl leading-[1.1] font-medium tracking-tight md:text-8xl"
                >
                    {t('lineTop')}
                </ParallaxText>
                <ParallaxText
                    baseVelocity={-1.5}
                    className="text-foreground-tertiary text-6xl leading-[1.1] font-medium tracking-tight md:text-8xl"
                >
                    {t('lineBottom')}
                </ParallaxText>
            </motion.div>
        </section>
    );
}
