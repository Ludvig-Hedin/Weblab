import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

import { cn } from '../utils';

function TooltipProvider({
    delayDuration = 0,
    disableHoverableContent = false,
    ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
    return (
        <TooltipPrimitive.Provider
            data-slot="tooltip-provider"
            delayDuration={delayDuration}
            disableHoverableContent={disableHoverableContent}
            {...props}
            data-oid="c6cf4c47bb"
        />
    );
}

function Tooltip({
    delayDuration,
    disableHoverableContent,
    ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root> & {
    delayDuration?: number;
    disableHoverableContent?: boolean;
}) {
    return (
        <TooltipProvider
            delayDuration={delayDuration}
            disableHoverableContent={disableHoverableContent}
            data-oid="0cab4532c6"
        >
            <TooltipPrimitive.Root data-slot="tooltip" {...props} data-oid="28ba506950" />
        </TooltipProvider>
    );
}

function TooltipTrigger({ ...props }: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
    return (
        <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} data-oid="5842b0d6fe" />
    );
}

function TooltipContent({
    className,
    sideOffset = 5,
    children,
    hideArrow = false,
    ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content> & { hideArrow?: boolean }) {
    return (
        <TooltipPrimitive.Portal data-oid="97acd034a5">
            <TooltipPrimitive.Content
                data-slot="tooltip-content"
                sideOffset={sideOffset}
                className={cn(
                    'bg-popover text-popover-foreground border-border animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-fit origin-(--radix-tooltip-content-transform-origin) rounded-md border px-2.5 py-1.5 text-xs text-balance shadow-md',
                    className,
                )}
                {...props}
                data-oid="e1194cb0e6"
            >
                {children}
                {!hideArrow && (
                    <TooltipPrimitive.Arrow
                        className="bg-popover fill-popover z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px]"
                        data-oid="7f1cb1409c"
                    />
                )}
            </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
    );
}

const TooltipPortal = TooltipPrimitive.Portal;

export { Tooltip, TooltipContent, TooltipPortal, TooltipProvider, TooltipTrigger };
