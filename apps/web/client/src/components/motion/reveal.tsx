'use client';

import type { Transition } from 'motion/react';
import { type ReactNode } from 'react';
import { motion } from 'motion/react';

import { useReducedMotion } from '@weblab/ui/hooks';

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

type RevealTag =
    | 'div'
    | 'span'
    | 'section'
    | 'article'
    | 'header'
    | 'footer'
    | 'nav'
    | 'aside'
    | 'main'
    | 'p'
    | 'ul'
    | 'li'
    | 'h1'
    | 'h2'
    | 'h3'
    | 'h4'
    | 'h5'
    | 'h6';

interface RevealProps {
    children: ReactNode;
    /** Initial y-offset in pixels. Default 24. */
    y?: number;
    /** Animation duration in seconds. Default 0.6. */
    duration?: number;
    /** Stagger delay before this element animates. Default 0. */
    delay?: number;
    /** Viewport amount threshold (0–1). Default 0.2. */
    amount?: number;
    /** Element type to render. Default 'div'. */
    as?: RevealTag;
    className?: string;
}

export function Reveal({
    children,
    y = 24,
    duration = 0.6,
    delay = 0,
    amount = 0.2,
    as = 'div',
    className,
}: RevealProps) {
    const prefersReducedMotion = useReducedMotion();
    const MotionTag = motion[as] as typeof motion.div;

    if (prefersReducedMotion) {
        const Tag = as;
        return <Tag className={className}>{children}</Tag>;
    }

    const transition: Transition = { duration, delay, ease: EASE };

    return (
        <MotionTag
            className={className}
            initial={{ opacity: 0, y }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount }}
            transition={transition}
        >
            {children}
        </MotionTag>
    );
}
