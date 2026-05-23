import * as React from 'react';
import * as HoverCardPrimitive from '@radix-ui/react-hover-card';

import { cn } from '../utils';

function HoverCard({ ...props }: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
    return <HoverCardPrimitive.Root data-slot="hover-card" {...props} data-oid="3853fc7a30" />;
}

function HoverCardTrigger({ ...props }: React.ComponentProps<typeof HoverCardPrimitive.Trigger>) {
    return (
        <HoverCardPrimitive.Trigger
            data-slot="hover-card-trigger"
            {...props}
            data-oid="7bb792b1dc"
        />
    );
}

function HoverCardContent({
    className,
    align = 'center',
    sideOffset = 4,
    ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content>) {
    return (
        <HoverCardPrimitive.Portal data-slot="hover-card-portal" data-oid="586f560a47">
            <HoverCardPrimitive.Content
                data-slot="hover-card-content"
                align={align}
                sideOffset={sideOffset}
                className={cn(
                    'bg-popover text-popover-foreground border-border-popover data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-64 origin-(--radix-hover-card-content-transform-origin) rounded-md border p-4 shadow-md outline-hidden data-[state=closed]:duration-150 data-[state=closed]:ease-in data-[state=open]:duration-200 data-[state=open]:ease-out',
                    className,
                )}
                {...props}
                data-oid="14c5969b3d"
            />
        </HoverCardPrimitive.Portal>
    );
}

export { HoverCard, HoverCardContent, HoverCardTrigger };
