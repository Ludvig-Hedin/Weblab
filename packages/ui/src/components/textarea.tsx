import * as React from 'react';

import { cn } from '../utils';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
    return (
        <textarea
            data-slot="textarea"
            className={cn(
                'placeholder:text-muted-foreground aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive flex field-sizing-content min-h-16 w-full rounded-md border border-[#e0e0e0] bg-white px-3 py-2 text-base shadow-xs transition-[color,background-color,border-color,box-shadow] duration-150 outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:border-[#2d2d2d] dark:bg-[#232323]',
                className,
            )}
            {...props}
            data-oid="bda2744393"
        />
    );
}

export { Textarea };
