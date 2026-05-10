'use client';

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
import React, { useRef } from 'react';

import { cn } from '@weblab/ui/utils';

interface ParallaxProps {
    children: string;
    baseVelocity: number;
    className?: string;
}

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

    const x = useTransform(baseX, (v) => `${wrap(-25, 0, v)}%`);

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
                {Array.from({ length: 6 }).map((_, i) => (
                    <span key={i} className="mr-12 block">
                        {children}
                    </span>
                ))}
            </motion.div>
        </div>
    );
}

export function ScrollingVelocitySection() {
    return (
        <section className="relative w-full overflow-hidden py-24 md:py-32">
            <div className="-rotate-[3deg]">
                <ParallaxText
                    baseVelocity={1.5}
                    className="text-foreground-primary text-6xl leading-[1.1] font-light tracking-tight md:text-8xl"
                >
                    Design without limits.
                </ParallaxText>
                <ParallaxText
                    baseVelocity={-1.5}
                    className="text-foreground-tertiary text-6xl leading-[1.1] font-light tracking-tight md:text-8xl"
                >
                    Ship without rebuilding.
                </ParallaxText>
            </div>
        </section>
    );
}
