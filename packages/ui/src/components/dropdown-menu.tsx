'use client';

import * as React from 'react';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { CheckIcon, ChevronRightIcon, CircleIcon } from 'lucide-react';

import { cn } from '../utils';

function DropdownMenu({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
    return (
        <DropdownMenuPrimitive.Root data-slot="dropdown-menu" {...props} data-oid="9df638abb8" />
    );
}

function DropdownMenuPortal({
    ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
    return (
        <DropdownMenuPrimitive.Portal
            data-slot="dropdown-menu-portal"
            {...props}
            data-oid="ce2a635830"
        />
    );
}

function DropdownMenuTrigger({
    ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
    return (
        <DropdownMenuPrimitive.Trigger
            data-slot="dropdown-menu-trigger"
            {...props}
            data-oid="560c0f3e2f"
        />
    );
}

function DropdownMenuContent({
    className,
    sideOffset = 4,
    portalled = true,
    ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content> & { portalled?: boolean }) {
    const content = (
        <DropdownMenuPrimitive.Content
            data-slot="dropdown-menu-content"
            sideOffset={sideOffset}
            className={cn(
                'bg-popover text-popover-foreground border-border-popover data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 max-h-(--radix-dropdown-menu-content-available-height) min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-lg border p-1.5 shadow-md data-[state=closed]:duration-150 data-[state=closed]:ease-in data-[state=open]:duration-200 data-[state=open]:ease-out',
                className,
            )}
            {...props}
            data-oid="c4ba11e56a"
        />
    );

    // If portalled=false, render directly to keep within parent stacking context
    if (!portalled) return content;
    return (
        <DropdownMenuPrimitive.Portal data-oid="d9651371f4">{content}</DropdownMenuPrimitive.Portal>
    );
}

function DropdownMenuGroup({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Group>) {
    return (
        <DropdownMenuPrimitive.Group
            data-slot="dropdown-menu-group"
            {...props}
            data-oid="781fa27063"
        />
    );
}

function DropdownMenuItem({
    className,
    inset,
    variant = 'default',
    ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
    inset?: boolean;
    variant?: 'default' | 'destructive';
}) {
    return (
        <DropdownMenuPrimitive.Item
            data-slot="dropdown-menu-item"
            data-inset={inset}
            data-variant={variant}
            className={cn(
                "focus:bg-accent focus:text-accent-foreground data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive [&_svg:not([class*='text-'])]:text-muted-foreground text-mini relative flex cursor-pointer items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 outline-hidden transition-colors duration-150 select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                className,
            )}
            {...props}
            data-oid="dc9c671f01"
        />
    );
}

function DropdownMenuCheckboxItem({
    className,
    children,
    checked,
    ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.CheckboxItem>) {
    return (
        <DropdownMenuPrimitive.CheckboxItem
            data-slot="dropdown-menu-checkbox-item"
            className={cn(
                "focus:bg-accent focus:text-accent-foreground text-mini relative flex cursor-default items-center gap-1.5 rounded-[10px] py-1.5 pr-2 pl-8 outline-hidden transition-colors duration-150 select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                className,
            )}
            checked={checked}
            {...props}
            data-oid="405abceaef"
        >
            <span
                className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center"
                data-oid="6e3eea8472"
            >
                <DropdownMenuPrimitive.ItemIndicator data-oid="4af01668bf">
                    <CheckIcon className="size-4" data-oid="374aae5adc" />
                </DropdownMenuPrimitive.ItemIndicator>
            </span>
            {children}
        </DropdownMenuPrimitive.CheckboxItem>
    );
}

function DropdownMenuRadioGroup({
    ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioGroup>) {
    return (
        <DropdownMenuPrimitive.RadioGroup
            data-slot="dropdown-menu-radio-group"
            {...props}
            data-oid="3b99763f3f"
        />
    );
}

function DropdownMenuRadioItem({
    className,
    children,
    ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.RadioItem>) {
    return (
        <DropdownMenuPrimitive.RadioItem
            data-slot="dropdown-menu-radio-item"
            className={cn(
                "focus:bg-accent focus:text-accent-foreground text-mini relative flex cursor-default items-center gap-1.5 rounded-[10px] py-1.5 pr-2 pl-8 outline-hidden transition-colors duration-150 select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                className,
            )}
            {...props}
            data-oid="fc690da99d"
        >
            <span
                className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center"
                data-oid="880cf3d055"
            >
                <DropdownMenuPrimitive.ItemIndicator data-oid="b43b46f530">
                    <CircleIcon className="size-2 fill-current" data-oid="ad1be9efd0" />
                </DropdownMenuPrimitive.ItemIndicator>
            </span>
            {children}
        </DropdownMenuPrimitive.RadioItem>
    );
}

function DropdownMenuLabel({
    className,
    inset,
    ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Label> & { inset?: boolean }) {
    return (
        <DropdownMenuPrimitive.Label
            data-slot="dropdown-menu-label"
            data-inset={inset}
            className={cn('px-2 py-1.5 text-sm font-medium data-[inset]:pl-8', className)}
            {...props}
            data-oid="276cdd8395"
        />
    );
}

function DropdownMenuSeparator({
    className,
    ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
    return (
        <DropdownMenuPrimitive.Separator
            data-slot="dropdown-menu-separator"
            className={cn('bg-border -mx-1 my-1 h-px', className)}
            {...props}
            data-oid="23f40fc463"
        />
    );
}

function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<'span'>) {
    return (
        <span
            data-slot="dropdown-menu-shortcut"
            className={cn('text-muted-foreground ml-auto text-xs tracking-widest', className)}
            {...props}
            data-oid="8a296cec03"
        />
    );
}

function DropdownMenuSub({ ...props }: React.ComponentProps<typeof DropdownMenuPrimitive.Sub>) {
    return (
        <DropdownMenuPrimitive.Sub data-slot="dropdown-menu-sub" {...props} data-oid="3e51c394ba" />
    );
}

function DropdownMenuSubTrigger({
    className,
    inset,
    children,
    ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubTrigger> & { inset?: boolean }) {
    return (
        <DropdownMenuPrimitive.SubTrigger
            data-slot="dropdown-menu-sub-trigger"
            data-inset={inset}
            className={cn(
                'focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground text-mini flex cursor-pointer items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 outline-hidden transition-colors duration-150 select-none data-[inset]:pl-8',
                className,
            )}
            {...props}
            data-oid="e30e0caa42"
        >
            {children}
            <ChevronRightIcon className="ml-auto size-4" data-oid="e657542edc" />
        </DropdownMenuPrimitive.SubTrigger>
    );
}

function DropdownMenuSubContent({
    className,
    ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.SubContent>) {
    return (
        <DropdownMenuPrimitive.SubContent
            data-slot="dropdown-menu-sub-content"
            className={cn(
                'bg-popover text-popover-foreground border-border-popover data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-lg border p-1.5 shadow-lg data-[state=closed]:duration-150 data-[state=closed]:ease-in data-[state=open]:duration-200 data-[state=open]:ease-out',
                className,
            )}
            {...props}
            data-oid="c3d7302fef"
        />
    );
}

export {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuPortal,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
};
