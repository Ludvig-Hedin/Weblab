import type { VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cva } from 'class-variance-authority';

import { cn } from '../utils';

const inputVariants = cva(
    'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex w-full min-w-0 rounded-md border shadow-xs transition-[color,background-color,border-color,box-shadow] duration-150 outline-none file:inline-flex file:border-0 file:bg-transparent file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
    {
        variants: {
            /**
             * Visual surface style.
             * - `primary` (default) — solid bg, clearly visible on any app surface.
             * - `ghost` — transparent bg, just a border; use for search/filter fields.
             */
            variant: {
                primary: 'border-[#e0e0e0] bg-white dark:border-[#2d2d2d] dark:bg-[#232323]',
                ghost: 'border-[#e0e0e0] bg-transparent dark:border-[#232323] dark:bg-transparent',
            },
            size: {
                xs: 'text-mini file:text-mini h-7 px-4 py-1 file:h-5',
                sm: 'text-small file:text-small h-8 px-4 py-1 file:h-6',
                default: 'text-regular file:text-small h-9 px-4 py-1 file:h-7',
                lg: 'text-regular file:text-small h-10 px-4 py-2 file:h-8',
            },
        },
        defaultVariants: {
            variant: 'primary',
            size: 'default',
        },
    },
);

type InputProps = Omit<React.ComponentProps<'input'>, 'size'> & VariantProps<typeof inputVariants>;

function Input({ className, type, size, variant, ...props }: InputProps) {
    return (
        <input
            type={type}
            data-slot="input"
            data-size={size ?? 'default'}
            data-variant={variant ?? 'primary'}
            className={cn(inputVariants({ size, variant }), className)}
            {...props}
            data-oid="eeefa768a4"
        />
    );
}

export { Input, inputVariants };
export type { InputProps };
