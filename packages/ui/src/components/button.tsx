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

const buttonVariants = cva(
    "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive focus-visible:outline-foreground/40 inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors duration-150 outline-none focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    {
        variants: {
            variant: {
                default: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs',
                destructive:
                    'bg-destructive hover:bg-destructive/90 dark:bg-destructive/60 text-white shadow-xs',
                outline:
                    'bg-background text-foreground hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:text-foreground dark:border-input dark:hover:bg-input/50 border shadow-xs',
                secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 shadow-xs',
                ghost: 'hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50',
                link: 'text-primary underline-offset-4 hover:underline',
                accent: 'bg-background-positive text-foreground-positive border-border-success hover:bg-background-positive/80 border shadow-xs',
                chip: 'bg-background-secondary text-foreground-secondary hover:bg-background-tertiary rounded-sm shadow-xs',
                warning:
                    'bg-background-warning text-foreground-warning border-border-warning hover:bg-background-warning/80 border shadow-xs',
                danger: 'bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/15 border shadow-xs',
            },
            size: {
                default: 'h-9 px-3 py-2 has-[>svg]:px-3',
                sm: 'h-8 gap-1.5 rounded-full px-3 has-[>svg]:px-2.5',
                lg: 'h-10 rounded-full px-6 has-[>svg]:px-4',
                icon: 'size-9',
                toolbar: 'h-8 min-w-[28px] rounded-full px-1.5 py-1.5',
                compact: 'h-7 gap-1 rounded-full px-2 text-xs has-[>svg]:px-2',
            },
        },
        defaultVariants: {
            variant: 'default',
            size: 'default',
        },
    },
);

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
