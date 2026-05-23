'use client';

import * as React from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';

import { cn } from '../utils';

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
    return (
        <SwitchPrimitive.Root
            data-slot="switch"
            className={cn(
                'peer data-[state=unchecked]:bg-background-tertiary dark:data-[state=unchecked]:bg-background-tertiary data-[state=checked]:bg-foreground-brand inline-flex h-5 w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs outline-hidden transition-all disabled:cursor-not-allowed disabled:opacity-50',
                className,
            )}
            {...props}
            data-oid="54f4ad74d8"
        >
            <SwitchPrimitive.Thumb
                data-slot="switch-thumb"
                className={cn(
                    'pointer-events-none block size-4 rounded-full bg-white ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0',
                )}
                data-oid="b2e349eded"
            />
        </SwitchPrimitive.Root>
    );
}

export { Switch };
