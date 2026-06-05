'use client';

import type { MouseEvent, ReactNode, Ref } from 'react';
import { useCallback, useRef } from 'react';
import Link from 'next/link';

import { buttonVariants } from '@weblab/ui/button';
import { cn } from '@weblab/ui/utils';

import { StaggerText } from './stagger-text';

import './marketing-motion.css';

type AnimatedVariant = 'default' | 'outline' | 'secondary';
type AnimatedSize = 'sm' | 'default' | 'lg' | 'pill';

/**
 * Maps a resting variant to its directional-sweep tone. The sweep reveals the
 * inverse surface and the label color flips to stay readable — a restrained,
 * monochrome invert (no accent color, per brand).
 *
 *  - invert: solid resting (fg fill / bg text) → sweep reveals the background,
 *    label flips to foreground.
 *  - fill:   transparent or low-emphasis resting (fg text) → sweep fills with
 *    the foreground, label flips to background.
 */
const TONE: Record<AnimatedVariant, { sweep: string; hoverText: string }> = {
    default: { sweep: 'bg-background', hoverText: 'group-hover/sweep:text-foreground' },
    outline: { sweep: 'bg-foreground', hoverText: 'group-hover/sweep:text-background' },
    secondary: { sweep: 'bg-foreground', hoverText: 'group-hover/sweep:text-background' },
};

export interface AnimatedButtonProps {
    /** Label text. Must be a string so it can be split for the stagger effect. */
    children: string;
    /** Internal route or external URL. Omit to render a <button>. */
    href?: string;
    onClick?: () => void;
    variant?: AnimatedVariant;
    size?: AnimatedSize;
    /** Optional trailing icon rendered after the label. */
    icon?: ReactNode;
    /** Optional leading icon rendered before the label. */
    leadingIcon?: ReactNode;
    target?: string;
    rel?: string;
    type?: 'button' | 'submit';
    'aria-label'?: string;
    className?: string;
}

/**
 * Marketing CTA button with two combined hover effects: a per-character
 * roll-up ("stagger") on the label and a directional fill ("sweep") that
 * expands from the cursor. Geometry/typography are inherited from the design
 * system via `buttonVariants`, so these stay visually on-spec with `<Button>`;
 * only the animation layers are added. Both effects respect reduced motion.
 *
 * Use for filled/outlined CTAs. For plain text links, add `wl-stagger-group`
 * to the link and wrap its label in `<StaggerText>` instead.
 */
export function AnimatedButton({
    children,
    href,
    onClick,
    variant = 'default',
    size = 'default',
    icon,
    leadingIcon,
    target,
    rel,
    type = 'button',
    className,
    'aria-label': ariaLabel,
}: AnimatedButtonProps) {
    const ref = useRef<HTMLElement | null>(null);

    // Anchor the sweep circle at the cursor and size it so it always covers the
    // button from the entry point. Written straight to CSS vars (no re-render).
    const trackCursor = useCallback((event: MouseEvent) => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const x = ((event.clientX - rect.left) / rect.width) * 100;
        const y = ((event.clientY - rect.top) / rect.height) * 100;
        const offsetFromCenter = Math.abs(
            ((event.clientX - (rect.left + rect.width / 2)) / (rect.width / 2)) * 50,
        );
        el.style.setProperty('--wl-x', `${x.toFixed(1)}%`);
        el.style.setProperty('--wl-y', `${y.toFixed(1)}%`);
        el.style.setProperty('--wl-size', `${(115 + offsetFromCenter * 2).toFixed(1)}%`);
    }, []);

    const tone = TONE[variant];
    const classes = cn(
        buttonVariants({ variant, size }),
        'wl-sweep-btn wl-stagger-group group/sweep',
        // Fast label color flip so contrast holds while the slower sweep fills.
        'transition-colors duration-150',
        tone.hoverText,
        className,
    );

    const inner = (
        <>
            <span aria-hidden="true" className={cn('wl-sweep', tone.sweep)} />
            <span className="wl-sweep-label inline-flex items-center gap-1.5">
                {leadingIcon}
                <StaggerText>{children}</StaggerText>
                {icon}
            </span>
        </>
    );

    const handlers = {
        onMouseEnter: trackCursor,
        onMouseMove: trackCursor,
        onMouseLeave: trackCursor,
    };

    if (href) {
        const isExternal = href.startsWith('http') || target === '_blank';
        if (isExternal) {
            return (
                <a
                    ref={ref as Ref<HTMLAnchorElement>}
                    href={href}
                    target={target}
                    rel={rel ?? (target === '_blank' ? 'noopener noreferrer' : undefined)}
                    aria-label={ariaLabel}
                    className={classes}
                    {...handlers}
                >
                    {inner}
                </a>
            );
        }
        return (
            <Link
                ref={ref as Ref<HTMLAnchorElement>}
                href={href}
                target={target}
                rel={rel}
                aria-label={ariaLabel}
                className={classes}
                {...handlers}
            >
                {inner}
            </Link>
        );
    }

    return (
        <button
            ref={ref as Ref<HTMLButtonElement>}
            type={type}
            onClick={onClick}
            aria-label={ariaLabel}
            className={classes}
            {...handlers}
        >
            {inner}
        </button>
    );
}
