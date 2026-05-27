import type { VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';

import { cn } from '../utils';

function ButtonSpinner({ className }: { className?: string }) {
    return (
        <svg
            className={cn('size-4 animate-spin', className)}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
    );
}

/**
 * Button design tokens — single source of truth for geometry/typography
 * shared across every variant. Edit here once; all variants pick it up.
 *
 * Locked decisions (2026-05-23 button-resize pass):
 *   - Radius: `rounded-md` (12px) on every size EXCEPT `pill` (fully round).
 *     No more `rounded-full` overrides at call sites.
 *   - Font weight: 400 (`font-normal`) across all variants. No bold/medium.
 *   - Tracking: `-0.01em` for tight, modern label rhythm.
 *   - Gap: 6px (`gap-1.5`) for label+icon spacing.
 *   - Icon: scales with size (12→14→16→18px).
 *
 * Size scale (height / padding / font):
 *   - compact      → 24px (`h-6`), 8px pad, text-mini (12px)        — chips, tags
 *   - sm           → 28px (`h-7`), 10px pad, text-mini              — toolbars, dense rows
 *   - default      → 36px (`h-9`), 14px pad, text-small (13px)      — primary app use
 *   - lg           → 44px (`h-11`), 16px pad, text-regular (15px)   — hero/secondary CTA
 *   - pill         → 44px (`h-11`), 20px pad, text-regular, FULLY ROUND — marketing CTAs
 *   - toolbar      → 28px square, kept tight for editor chrome
 *   - icon{,xs,sm,lg} → square icon buttons matching adjacent text-button sizes
 *
 * Color variants:
 *   - default      → primary fill (near-black/white), inverted text (high emphasis)
 *   - secondary    → secondary surface + visible border
 *   - outline      → transparent + visible border (low emphasis)
 *   - muted        → bg `#242424` + text `#DEDEDE` dark / mirrors light
 *   - ghost        → text `#717171` resting → foreground on hover
 *   - link         → brand-blue text, no fill, underline on hover
 *   - destructive  → soft bg + bright destructive text, no border
 *   - danger       → low-emphasis destructive tint
 *   - accent       → brand-blue solid fill + white text
 *   - warning      → orange solid fill + white text
 *   - chip         → minimal pill, smaller radius
 */
const BUTTON_BASE =
    'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive font-normal tracking-[-0.01em] inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md whitespace-nowrap transition-colors duration-150 outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0';

const buttonVariants = cva(BUTTON_BASE, {
    variants: {
        variant: {
            // Explicit colors avoid CSS-variable resolution failures in dark mode (white-on-white).
            default:
                'bg-[#0d0d0d] text-white hover:bg-[#141414] dark:bg-white dark:text-[#181818] dark:hover:bg-white/90',
            destructive:
                'bg-[#FDEBEB] text-[#C23730] hover:bg-[#FBD9D9] dark:bg-[#321F20] dark:text-[#FF595D] dark:hover:bg-[#3a2326]',
            outline:
                'border-border-secondary text-foreground hover:bg-background-secondary border bg-transparent dark:border-[#3a3a3a]',
            secondary:
                'bg-secondary text-secondary-foreground hover:bg-background-tertiary border-border-secondary border',
            muted: 'bg-[#F3F3F3] text-[#0E0E0E] hover:bg-[#E8E8E8] dark:bg-[#242424] dark:text-[#DEDEDE] dark:hover:bg-[#2a2a2a]',
            ghost: 'hover:text-foreground hover:bg-background-hover dark:hover:text-foreground text-[#939393] dark:text-[#999999]',
            link: 'text-foreground-brand px-0 underline-offset-4 hover:underline',
            // Solid brand-blue accent: matches link color, applied as fill + white text.
            accent: 'bg-foreground-brand hover:bg-foreground-brand/90 text-white',
            chip: 'bg-background-secondary text-foreground-secondary hover:bg-background-tertiary rounded-sm',
            // Solid orange warning matches the accent pattern (solid + white).
            warning: 'bg-foreground-warning hover:bg-foreground-warning/90 text-white',
            // Same style as destructive — soft red surface for error/offline status.
            danger: 'bg-[#FDEBEB] text-[#C23730] hover:bg-[#FBD9D9] dark:bg-[#321F20] dark:text-[#FF595D] dark:hover:bg-[#3a2326]',
        },
        size: {
            // Heights + padding + font scale together. Icon sizes scale with text.
            default: "text-small h-9 px-3.5 has-[>svg]:px-3 [&_svg:not([class*='size-'])]:size-4",
            sm: "text-mini h-7 px-2.5 has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3.5",
            xs: "text-mini h-6 px-2 has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
            lg: "text-regular h-11 px-4 has-[>svg]:px-3.5 [&_svg:not([class*='size-'])]:size-[18px]",
            // Marketing / hero CTAs — fully round, generous padding, bigger label.
            pill: "text-regular h-11 rounded-full px-5 has-[>svg]:px-4 [&_svg:not([class*='size-'])]:size-[18px]",
            icon: "size-9 [&_svg:not([class*='size-'])]:size-4",
            'icon-xs': "size-6 [&_svg:not([class*='size-'])]:size-3",
            'icon-sm': "size-7 [&_svg:not([class*='size-'])]:size-3.5",
            'icon-lg': "size-11 [&_svg:not([class*='size-'])]:size-[18px]",
            // Editor toolbar buttons stay tight (28px) to preserve chrome density.
            toolbar:
                "text-mini h-7 min-w-[28px] px-1.5 py-1.5 [&_svg:not([class*='size-'])]:size-3.5",
            // Inline compact rows / chips — 24px tall. rounded-sm overrides base rounded-md (12px on 24px = pill).
            compact:
                "text-mini h-6 rounded-sm px-2 has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        },
    },
    defaultVariants: {
        variant: 'default',
        size: 'default',
    },
});

type ButtonProps = React.ComponentProps<'button'> &
    VariantProps<typeof buttonVariants> & {
        asChild?: boolean;
        loading?: boolean;
    };

function Button({
    className,
    variant,
    size,
    asChild = false,
    loading = false,
    disabled,
    children,
    ...props
}: ButtonProps) {
    const Comp = asChild ? Slot : 'button';
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- intentional: treat false || true as true
    const isDisabled = disabled || loading;

    return (
        <Comp
            data-slot="button"
            className={cn(buttonVariants({ variant, size, className }))}
            disabled={isDisabled}
            aria-busy={loading || undefined}
            {...props}
            data-oid="5ff2fb4f27"
        >
            {loading && !asChild ? (
                <>
                    <ButtonSpinner />
                    {children}
                </>
            ) : (
                children
            )}
        </Comp>
    );
}

export { Button, buttonVariants };
export type { ButtonProps };
