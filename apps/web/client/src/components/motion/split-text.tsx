'use client';

import {
    motion,
    type Transition,
    type Variants,
} from 'motion/react';
import {
    Children,
    Fragment,
    type ElementType,
    type ReactNode,
} from 'react';

import { useReducedMotion } from '@weblab/ui/hooks';

const EASE = [0.25, 0.46, 0.45, 0.94] as const;

type Mode = 'mount' | 'whileInView';

interface SplitTextProps {
    children: ReactNode;
    as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span' | 'div';
    mode?: Mode;
    /** Per-token delay in seconds. Default 0.04. */
    stagger?: number;
    /** Initial delay before the stagger starts. Default 0. */
    delay?: number;
    /** Per-token animation duration. Default 0.55. */
    duration?: number;
    /** Viewport amount threshold (0–1) for whileInView mode. Default 0.3. */
    amount?: number;
    className?: string;
    style?: React.CSSProperties;
}

/**
 * Splits a ReactNode tree into atomic tokens.
 * - Strings split on whitespace (whitespace preserved as its own token).
 * - Non-string children (e.g. styled <span>) stay indivisible.
 */
function tokenize(children: ReactNode): ReactNode[] {
    const tokens: ReactNode[] = [];
    Children.forEach(children, (child) => {
        if (typeof child === 'string') {
            const parts = child.split(/(\s+)/);
            for (const part of parts) {
                if (part.length === 0) continue;
                tokens.push(part);
            }
        } else if (child != null && child !== false) {
            tokens.push(child);
        }
    });
    return tokens;
}

export function SplitText({
    children,
    as = 'h2',
    mode = 'whileInView',
    stagger = 0.04,
    delay = 0,
    duration = 0.55,
    amount = 0.3,
    className,
    style,
}: SplitTextProps) {
    const prefersReducedMotion = useReducedMotion();
    const Tag = as as ElementType;

    if (prefersReducedMotion) {
        return (
            <Tag className={className} style={style}>
                {children}
            </Tag>
        );
    }

    const tokens = tokenize(children);

    const containerVariants: Variants = {
        hidden: {},
        show: {
            transition: {
                staggerChildren: stagger,
                delayChildren: delay,
            },
        },
    };

    const tokenTransition: Transition = { duration, ease: EASE };

    const tokenVariants: Variants = {
        hidden: { y: '110%', opacity: 0 },
        show: { y: '0%', opacity: 1, transition: tokenTransition },
    };

    const MotionTag = motion[as as keyof typeof motion] as typeof motion.h2;

    const viewportProps =
        mode === 'whileInView'
            ? { whileInView: 'show' as const, viewport: { once: true, amount } }
            : { animate: 'show' as const };

    return (
        <MotionTag
            className={className}
            style={style}
            initial="hidden"
            variants={containerVariants}
            {...viewportProps}
        >
            {tokens.map((token, i) => {
                if (typeof token === 'string' && /^\s+$/.test(token)) {
                    return <Fragment key={`s-${i}`}>{token}</Fragment>;
                }
                return (
                    <span
                        key={`t-${i}`}
                        style={{
                            display: 'inline-block',
                            overflow: 'hidden',
                            verticalAlign: 'top',
                        }}
                    >
                        <motion.span
                            style={{ display: 'inline-block', willChange: 'transform, opacity' }}
                            variants={tokenVariants}
                        >
                            {token}
                        </motion.span>
                    </span>
                );
            })}
        </MotionTag>
    );
}
