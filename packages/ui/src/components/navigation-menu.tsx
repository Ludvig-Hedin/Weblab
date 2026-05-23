import * as React from 'react';
import * as NavigationMenuPrimitive from '@radix-ui/react-navigation-menu';
import { cva } from 'class-variance-authority';
import { ChevronDownIcon } from 'lucide-react';

import { cn } from '../utils';

function NavigationMenu({
    className,
    children,
    viewport = true,
    ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Root> & { viewport?: boolean }) {
    return (
        <NavigationMenuPrimitive.Root
            data-slot="navigation-menu"
            data-viewport={viewport}
            className={cn(
                'group/navigation-menu relative flex max-w-max flex-1 items-center justify-center',
                className,
            )}
            {...props}
            data-oid="fbed64e290"
        >
            {children}
            {viewport && <NavigationMenuViewport data-oid="0b4fb76fb1" />}
        </NavigationMenuPrimitive.Root>
    );
}

function NavigationMenuList({
    className,
    ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.List>) {
    return (
        <NavigationMenuPrimitive.List
            data-slot="navigation-menu-list"
            className={cn(
                'group flex flex-1 list-none items-center justify-center gap-1',
                className,
            )}
            {...props}
            data-oid="44dacd452b"
        />
    );
}

function NavigationMenuItem({
    className,
    ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Item>) {
    return (
        <NavigationMenuPrimitive.Item
            data-slot="navigation-menu-item"
            className={cn('relative', className)}
            {...props}
            data-oid="765f36c5ba"
        />
    );
}

// Density-aligned with DropdownMenu/Menubar items: h-7 row, 10px padding,
// 12px font, 6px radius. Hover/open uses --accent (popover-hover).
const navigationMenuTriggerStyle = cva(
    'group text-foreground hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground data-[state=open]:hover:bg-accent data-[state=open]:text-accent-foreground data-[state=open]:focus:bg-accent data-[state=open]:bg-accent/60 text-mini inline-flex h-7 w-max items-center justify-center gap-1.5 rounded-sm bg-transparent px-2.5 font-medium transition-colors duration-150 outline-none focus-visible:outline-1 disabled:pointer-events-none disabled:opacity-50',
);

function NavigationMenuTrigger({
    className,
    children,
    ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Trigger>) {
    return (
        <NavigationMenuPrimitive.Trigger
            data-slot="navigation-menu-trigger"
            className={cn(navigationMenuTriggerStyle(), 'group', className)}
            {...props}
            data-oid="01ed5a1132"
        >
            {children}{' '}
            <ChevronDownIcon
                className="relative top-[1px] ml-1 size-3 transition duration-300 group-data-[state=open]:rotate-180"
                aria-hidden="true"
                data-oid="1012cece02"
            />
        </NavigationMenuPrimitive.Trigger>
    );
}

function NavigationMenuContent({
    className,
    ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Content>) {
    return (
        <NavigationMenuPrimitive.Content
            data-slot="navigation-menu-content"
            className={cn(
                'data-[motion^=from-]:animate-in data-[motion^=to-]:animate-out data-[motion^=from-]:fade-in data-[motion^=to-]:fade-out data-[motion=from-end]:slide-in-from-right-52 data-[motion=from-start]:slide-in-from-left-52 data-[motion=to-end]:slide-out-to-right-52 data-[motion=to-start]:slide-out-to-left-52 top-0 left-0 w-full p-1 md:absolute md:w-auto',
                'group-data-[viewport=false]/navigation-menu:bg-popover group-data-[viewport=false]/navigation-menu:text-popover-foreground group-data-[viewport=false]/navigation-menu:data-[state=open]:animate-in group-data-[viewport=false]/navigation-menu:data-[state=closed]:animate-out group-data-[viewport=false]/navigation-menu:data-[state=closed]:zoom-out-95 group-data-[viewport=false]/navigation-menu:data-[state=open]:zoom-in-95 group-data-[viewport=false]/navigation-menu:data-[state=open]:fade-in-0 group-data-[viewport=false]/navigation-menu:data-[state=closed]:fade-out-0 group-data-[viewport=false]/navigation-menu:top-full group-data-[viewport=false]/navigation-menu:mt-1.5 group-data-[viewport=false]/navigation-menu:overflow-hidden group-data-[viewport=false]/navigation-menu:rounded-md group-data-[viewport=false]/navigation-menu:border group-data-[viewport=false]/navigation-menu:shadow group-data-[viewport=false]/navigation-menu:duration-200 **:data-[slot=navigation-menu-link]:focus:ring-0 **:data-[slot=navigation-menu-link]:focus:outline-none',
                className,
            )}
            {...props}
            data-oid="e2bde94824"
        />
    );
}

function NavigationMenuViewport({
    className,
    ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Viewport>) {
    return (
        <div
            className={cn('absolute top-full left-0 isolate z-50 flex justify-center')}
            data-oid="1e798bfc3f"
        >
            <NavigationMenuPrimitive.Viewport
                data-slot="navigation-menu-viewport"
                className={cn(
                    'origin-top-center bg-popover text-popover-foreground border-border-popover data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-90 relative mt-1.5 h-[var(--radix-navigation-menu-viewport-height)] w-full overflow-hidden rounded-md border shadow md:w-[var(--radix-navigation-menu-viewport-width)]',
                    className,
                )}
                {...props}
                data-oid="645b3588d2"
            />
        </div>
    );
}

function NavigationMenuLink({
    className,
    ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Link>) {
    return (
        <NavigationMenuPrimitive.Link
            data-slot="navigation-menu-link"
            className={cn(
                "data-[active=true]:focus:bg-accent data-[active=true]:hover:bg-accent data-[active=true]:bg-accent/60 data-[active=true]:text-accent-foreground hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground text-mini flex flex-col gap-1 rounded-sm px-2.5 py-1.5 transition-colors duration-150 outline-none [&_svg:not([class*='size-'])]:size-4",
                className,
            )}
            {...props}
            data-oid="08fdcd4b68"
        />
    );
}

function NavigationMenuIndicator({
    className,
    ...props
}: React.ComponentProps<typeof NavigationMenuPrimitive.Indicator>) {
    return (
        <NavigationMenuPrimitive.Indicator
            data-slot="navigation-menu-indicator"
            className={cn(
                'data-[state=visible]:animate-in data-[state=hidden]:animate-out data-[state=hidden]:fade-out data-[state=visible]:fade-in top-full z-[1] flex h-1.5 items-end justify-center overflow-hidden',
                className,
            )}
            {...props}
            data-oid="d33aed547e"
        >
            <div
                className="bg-border relative top-[60%] h-2 w-2 rotate-45 rounded-tl-sm shadow-md"
                data-oid="34ed7bcd15"
            />
        </NavigationMenuPrimitive.Indicator>
    );
}

export {
    NavigationMenu,
    NavigationMenuContent,
    NavigationMenuIndicator,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuList,
    NavigationMenuTrigger,
    navigationMenuTriggerStyle,
    NavigationMenuViewport,
};
