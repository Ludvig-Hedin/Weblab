import type { VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cva } from 'class-variance-authority';

import { cn } from '../utils';

const inputVariants = cva(
    'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex w-full min-w-0 rounded-md border bg-transparent shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:border-0 file:bg-transparent file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
    {
        variants: {
            size: {
                xs: 'text-mini file:text-mini h-7 px-4 py-1 file:h-5',
                sm: 'text-small file:text-small h-8 px-4 py-1 file:h-6',
                default: 'text-regular file:text-small h-9 px-4 py-1 file:h-7',
                lg: 'text-regular file:text-small h-10 px-4 py-2 file:h-8',
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
