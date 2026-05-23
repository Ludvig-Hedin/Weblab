import * as React from 'react';
import * as MenubarPrimitive from '@radix-ui/react-menubar';
import { CheckIcon, ChevronRightIcon, CircleIcon } from 'lucide-react';

import { cn } from '../utils';

function Menubar({ className, ...props }: React.ComponentProps<typeof MenubarPrimitive.Root>) {
    return (
        <MenubarPrimitive.Root
            data-slot="menubar"
            className={cn(
                'bg-background flex h-9 items-center gap-1 rounded-md border p-1 shadow-xs',
                className,
            )}
            {...props}
            data-oid="7e3d0d5bfa"
        />
    );
}

function MenubarMenu({ ...props }: React.ComponentProps<typeof MenubarPrimitive.Menu>) {
    return <MenubarPrimitive.Menu data-slot="menubar-menu" {...props} data-oid="2bd15fabd7" />;
}

function MenubarGroup({ ...props }: React.ComponentProps<typeof MenubarPrimitive.Group>) {
    return <MenubarPrimitive.Group data-slot="menubar-group" {...props} data-oid="eb7329d97b" />;
}

function MenubarPortal({ ...props }: React.ComponentProps<typeof MenubarPrimitive.Portal>) {
    return <MenubarPrimitive.Portal data-slot="menubar-portal" {...props} data-oid="b8581cd782" />;
}

function MenubarRadioGroup({ ...props }: React.ComponentProps<typeof MenubarPrimitive.RadioGroup>) {
    return (
        <MenubarPrimitive.RadioGroup
            data-slot="menubar-radio-group"
            {...props}
            data-oid="61331f2663"
        />
    );
}

function MenubarTrigger({
    className,
    ...props
}: React.ComponentProps<typeof MenubarPrimitive.Trigger>) {
    return (
        <MenubarPrimitive.Trigger
            data-slot="menubar-trigger"
            className={cn(
                'focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground text-mini flex items-center rounded-sm px-2.5 py-1 font-medium outline-hidden transition-colors duration-150 select-none',
                className,
            )}
            {...props}
            data-oid="5dceaf931f"
        />
    );
}

function MenubarContent({
    className,
    align = 'start',
    alignOffset = -4,
    sideOffset = 8,
    ...props
}: React.ComponentProps<typeof MenubarPrimitive.Content>) {
    return (
        <MenubarPortal data-oid="6ea37efe2f">
            <MenubarPrimitive.Content
                data-slot="menubar-content"
                align={align}
                alignOffset={alignOffset}
                sideOffset={sideOffset}
                className={cn(
                    'bg-popover text-popover-foreground border-border-popover data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[12rem] origin-(--radix-menubar-content-transform-origin) overflow-hidden rounded-md border p-1 shadow-md data-[state=closed]:duration-150 data-[state=closed]:ease-in data-[state=open]:duration-200 data-[state=open]:ease-out',
                    className,
                )}
                {...props}
                data-oid="b9e41c5278"
            />
        </MenubarPortal>
    );
}

function MenubarItem({
    className,
    inset,
    variant = 'default',
    ...props
}: React.ComponentProps<typeof MenubarPrimitive.Item> & {
    inset?: boolean;
    variant?: 'default' | 'destructive';
}) {
    return (
        <MenubarPrimitive.Item
            data-slot="menubar-item"
            data-inset={inset}
            data-variant={variant}
            className={cn(
                "focus:bg-accent focus:text-accent-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:focus:text-destructive data-[variant=destructive]:*:[svg]:!text-destructive [&_svg:not([class*='text-'])]:text-muted-foreground text-mini relative flex cursor-default items-center gap-2 rounded-sm px-2.5 py-1.5 outline-hidden transition-colors duration-150 select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                className,
            )}
            {...props}
            data-oid="6681b9d0e7"
        />
    );
}

function MenubarCheckboxItem({
    className,
    children,
    checked,
    ...props
}: React.ComponentProps<typeof MenubarPrimitive.CheckboxItem>) {
    return (
        <MenubarPrimitive.CheckboxItem
            data-slot="menubar-checkbox-item"
            className={cn(
                "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-xs py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                className,
            )}
            checked={checked}
            {...props}
            data-oid="6f62b6420c"
        >
            <span
                className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center"
                data-oid="5ee96aa905"
            >
                <MenubarPrimitive.ItemIndicator data-oid="b8bd21c76b">
                    <CheckIcon className="size-4" data-oid="482c0b10e7" />
                </MenubarPrimitive.ItemIndicator>
            </span>
            {children}
        </MenubarPrimitive.CheckboxItem>
    );
}

function MenubarRadioItem({
    className,
    children,
    ...props
}: React.ComponentProps<typeof MenubarPrimitive.RadioItem>) {
    return (
        <MenubarPrimitive.RadioItem
            data-slot="menubar-radio-item"
            className={cn(
                "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-xs py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                className,
            )}
            {...props}
            data-oid="fa38692c55"
        >
            <span
                className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center"
                data-oid="1c540d85e9"
            >
                <MenubarPrimitive.ItemIndicator data-oid="6bc542c02d">
                    <CircleIcon className="size-2 fill-current" data-oid="500ea86135" />
                </MenubarPrimitive.ItemIndicator>
            </span>
            {children}
        </MenubarPrimitive.RadioItem>
    );
}

function MenubarLabel({
    className,
    inset,
    ...props
}: React.ComponentProps<typeof MenubarPrimitive.Label> & { inset?: boolean }) {
    return (
        <MenubarPrimitive.Label
            data-slot="menubar-label"
            data-inset={inset}
            className={cn('px-2 py-1.5 text-sm font-medium data-[inset]:pl-8', className)}
            {...props}
            data-oid="2dfcb000f7"
        />
    );
}

function MenubarSeparator({
    className,
    ...props
}: React.ComponentProps<typeof MenubarPrimitive.Separator>) {
    return (
        <MenubarPrimitive.Separator
            data-slot="menubar-separator"
            className={cn('bg-border -mx-1 my-1 h-px', className)}
            {...props}
            data-oid="11c2a7c5ae"
        />
    );
}

function MenubarShortcut({ className, ...props }: React.ComponentProps<'span'>) {
    return (
        <span
            data-slot="menubar-shortcut"
            className={cn('text-muted-foreground ml-auto text-xs tracking-widest', className)}
            {...props}
            data-oid="3a4e03b3cd"
        />
    );
}

function MenubarSub({ ...props }: React.ComponentProps<typeof MenubarPrimitive.Sub>) {
    return <MenubarPrimitive.Sub data-slot="menubar-sub" {...props} data-oid="37dd356065" />;
}

function MenubarSubTrigger({
    className,
    inset,
    children,
    ...props
}: React.ComponentProps<typeof MenubarPrimitive.SubTrigger> & { inset?: boolean }) {
    return (
        <MenubarPrimitive.SubTrigger
            data-slot="menubar-sub-trigger"
            data-inset={inset}
            className={cn(
                'focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground text-mini flex cursor-default items-center rounded-sm px-2.5 py-1.5 transition-colors duration-150 outline-none select-none data-[inset]:pl-8',
                className,
            )}
            {...props}
            data-oid="5f6dc65a67"
        >
            {children}
            <ChevronRightIcon className="ml-auto h-4 w-4" data-oid="6fa6349ab0" />
        </MenubarPrimitive.SubTrigger>
    );
}

function MenubarSubContent({
    className,
    ...props
}: React.ComponentProps<typeof MenubarPrimitive.SubContent>) {
    return (
        <MenubarPrimitive.SubContent
            data-slot="menubar-sub-content"
            className={cn(
                'bg-popover text-popover-foreground border-border-popover data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] origin-(--radix-menubar-content-transform-origin) overflow-hidden rounded-md border p-1 shadow-lg data-[state=closed]:duration-150 data-[state=closed]:ease-in data-[state=open]:duration-200 data-[state=open]:ease-out',
                className,
            )}
            {...props}
            data-oid="8e198361bd"
        />
    );
}

export {
    Menubar,
    MenubarCheckboxItem,
    MenubarContent,
    MenubarGroup,
    MenubarItem,
    MenubarLabel,
    MenubarMenu,
    MenubarPortal,
    MenubarRadioGroup,
    MenubarRadioItem,
    MenubarSeparator,
    MenubarShortcut,
    MenubarSub,
    MenubarSubContent,
    MenubarSubTrigger,
    MenubarTrigger,
};
