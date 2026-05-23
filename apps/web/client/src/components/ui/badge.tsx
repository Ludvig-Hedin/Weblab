import type { VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cva } from 'class-variance-authority';
import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
    'text-micro focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sm border border-transparent px-2 py-0.5 font-medium whitespace-nowrap transition-colors duration-150 focus-visible:ring-2 [&>svg]:pointer-events-none [&>svg]:size-3',
    {
        variants: {
            variant: {
                default: 'bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
                secondary:
                    'bg-secondary text-secondary-foreground [a&]:hover:bg-background-tertiary',
                destructive:
                    'bg-destructive text-destructive-foreground focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90',
                outline:
                    'border-border-secondary text-foreground [a&]:hover:bg-background-secondary',
                ghost: '[a&]:hover:bg-background-secondary [a&]:hover:text-foreground',
                link: 'text-foreground-brand underline-offset-4 [a&]:hover:underline',
            },
        },
        defaultVariants: {
            variant: 'default',
        },
    },
);

function Badge({
    className,
    variant = 'default',
    asChild = false,
    ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
    const Comp = asChild ? Slot.Root : 'span';

    return (
        <Comp
            data-slot="badge"
            data-variant={variant}
            className={cn(badgeVariants({ variant }), className)}
            {...props}
        />
    );
}

export { Badge, badgeVariants };
