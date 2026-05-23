'use client';

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { motion } from 'motion/react';

import { cn } from '../utils';

/**
 * Tabs context — exposes the active value + a unique layoutId per Tabs
 * instance so the sliding active indicator (rendered inside TabsTrigger
 * via `motion.span layoutId={...}`) only morphs within its own Tabs root.
 */
interface TabsContextValue {
    value: string | undefined;
    layoutId: string;
}
const TabsContext = React.createContext<TabsContextValue | null>(null);

let tabsInstanceCounter = 0;

function Tabs({
    className,
    value,
    defaultValue,
    onValueChange,
    children,
    ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
    const [internal, setInternal] = React.useState<string | undefined>(defaultValue);
    const active = value ?? internal;
    const layoutId = React.useMemo(() => `tabs-indicator-${++tabsInstanceCounter}`, []);

    return (
        <TabsPrimitive.Root
            data-slot="tabs"
            className={cn('flex flex-col gap-2', className)}
            value={value}
            defaultValue={defaultValue}
            onValueChange={(v) => {
                setInternal(v);
                onValueChange?.(v);
            }}
            {...props}
            data-oid="c1900a8000"
        >
            <TabsContext.Provider value={{ value: active, layoutId }}>
                {children}
            </TabsContext.Provider>
        </TabsPrimitive.Root>
    );
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
    return (
        <TabsPrimitive.List
            data-slot="tabs-list"
            className={cn(
                'bg-muted text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded-md p-[3px]',
                className,
            )}
            {...props}
            data-oid="4c84fd42ba"
        />
    );
}

function TabsTrigger({
    className,
    value,
    children,
    ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
    const ctx = React.useContext(TabsContext);
    const isActive = ctx?.value === value;

    return (
        <TabsPrimitive.Trigger
            data-slot="tabs-trigger"
            value={value}
            className={cn(
                "data-[state=active]:text-foreground text-foreground/70 hover:text-foreground text-small relative inline-flex h-[calc(100%-1px)] flex-1 items-center justify-center gap-1.5 rounded-sm border border-transparent px-2 py-1 font-medium whitespace-nowrap transition-colors duration-150 outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
                className,
            )}
            {...props}
            data-oid="efb2238521"
        >
            {/* Sliding active indicator — morphs between triggers via shared layoutId.
                Only the active trigger mounts the motion span, so motion treats the
                position change as a layout swap and animates the rect. */}
            {isActive && ctx && (
                <motion.span
                    layoutId={ctx.layoutId}
                    className="bg-background dark:bg-background-tertiary absolute inset-0 z-0 rounded-sm shadow-sm"
                    transition={{ type: 'spring', stiffness: 380, damping: 32 }}
                />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">{children}</span>
        </TabsPrimitive.Trigger>
    );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
    return (
        <TabsPrimitive.Content
            data-slot="tabs-content"
            className={cn('flex-1 outline-none', className)}
            {...props}
            data-oid="1f1f400760"
        />
    );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
