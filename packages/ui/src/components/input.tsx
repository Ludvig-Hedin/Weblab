import type { VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cva } from 'class-variance-authority';

import { cn } from '../utils';

const inputVariants = cva(
    'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex w-full min-w-0 rounded-md border bg-transparent shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:border-0 file:bg-transparent file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
    {
        variants: {
            size: {
                xs: 'h-7 px-2 py-1 text-xs file:h-5 file:text-xs',
                sm: 'h-8 px-3 py-1 text-sm file:h-6 file:text-sm',
                default: 'h-9 px-3 py-1 text-base file:h-7 file:text-sm md:text-sm',
                lg: 'h-10 px-3.5 py-2 text-base file:h-8 file:text-sm',
            },
        },
        defaultVariants: {
            size: 'default',
        },
    },
);

type InputProps = Omit<React.ComponentProps<'input'>, 'size'> & VariantProps<typeof inputVariants>;

function Input({ className, type, size, ...props }: InputProps) {
    return (
        <input
            type={type}
            data-slot="input"
            data-size={size ?? 'default'}
            className={cn(inputVariants({ size }), className)}
            {...props}
            data-oid="eeefa768a4"
        />
    );
}

export { Input, inputVariants };
export type { InputProps };
