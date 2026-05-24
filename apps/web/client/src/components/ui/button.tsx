import type { VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cva } from 'class-variance-authority';
import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';

/**
 * Local shadcn button (used by pricing/marketing/onboarding pages).
 * MIRRORS the @weblab/ui canonical button — same tokens, radius, variants,
 * font-size/weight/tracking. Prefer `import { Button } from '@weblab/ui/button'`;
 * this copy stays only because a handful of legacy call sites still import it.
 *
 * Locked: 12px text · weight 400 · tracking -0.01em · rounded-md (12px) ·
 * size variants differ only by height/padding/icon (never font).
 */
const buttonVariants = cva(
    'focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-normal tracking-[-0.01em] whitespace-nowrap transition-colors duration-150 outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
    {
        variants: {
            variant: {
                default:
                    'bg-[#0d0d0d] text-white hover:bg-[#141414] dark:bg-white dark:text-[#181818] dark:hover:bg-white/90',
                destructive:
                    'bg-[#FDEBEB] text-[#C23730] hover:bg-[#FBD9D9] dark:bg-[#321F20] dark:text-[#FF595D] dark:hover:bg-[#3a2326]',
                outline:
                    'border-border-secondary dark:border-[#3a3a3a] text-foreground hover:bg-background-secondary border bg-transparent',
                secondary:
                    'bg-secondary text-secondary-foreground hover:bg-background-tertiary border-border-secondary border',
                ghost: 'hover:text-foreground hover:bg-background-hover text-[#939393] dark:text-[#999999]',
                link: 'text-foreground-brand px-0 underline-offset-4 hover:underline',
            },
            size: {
                default:
                    "text-small h-9 px-3.5 has-[>svg]:px-3 [&_svg:not([class*='size-'])]:size-4",
                xs: "text-mini h-6 px-2 has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
                sm: "text-mini h-7 px-2.5 has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3.5",
                lg: "text-regular h-11 px-4 has-[>svg]:px-3.5 [&_svg:not([class*='size-'])]:size-[18px]",
                pill: "text-regular h-11 rounded-full px-5 has-[>svg]:px-4 [&_svg:not([class*='size-'])]:size-[18px]",
                icon: "size-9 [&_svg:not([class*='size-'])]:size-4",
                'icon-xs': "size-6 [&_svg:not([class*='size-'])]:size-3",
                'icon-sm': "size-7 [&_svg:not([class*='size-'])]:size-3.5",
                'icon-lg': "size-11 [&_svg:not([class*='size-'])]:size-[18px]",
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    },
);

function Button({
    className,
    variant = 'default',
    size = 'default',
    asChild = false,
    ...props
}: React.ComponentProps<'button'> &
    VariantProps<typeof buttonVariants> & {
        asChild?: boolean;
    }) {
    const Comp = asChild ? Slot.Root : 'button';

    return (
        <Comp
            data-slot="button"
            data-variant={variant}
            data-size={size}
            className={cn(buttonVariants({ variant, size, className }))}
            {...props}
        />
    );
}

export { Button, buttonVariants };
