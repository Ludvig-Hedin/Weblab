'use client';

import type { LucideIcon } from 'lucide-react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';

import { AccordionItem } from '@weblab/ui/accordion';
import { cn } from '@weblab/ui/utils';

export interface SectionProps {
    id: string;
    title: string;
    /**
     * Optional count of "set" properties. The number is no longer rendered,
     * but a non-zero count lifts the title to the primary foreground and
     * lights up a small brand-blue dot beside it so a populated section
     * draws the eye when scanning the column.
     */
    setCount?: number;
    /**
     * Optional 14-px lucide icon shown before the title — speeds up section
     * recognition (Type for Typography, LayoutGrid for Layout, etc).
     */
    icon?: LucideIcon;
    children: React.ReactNode;
    className?: string;
    /** Optional inline action rendered to the right of the chevron. */
    actions?: React.ReactNode;
}

/**
 * Standard accordion section used by every Style panel section.
 *
 * Implementation detail: we render `AccordionPrimitive.Header` +
 * `AccordionPrimitive.Trigger` directly instead of going through the shared
 * `@weblab/ui/accordion` `AccordionTrigger`. The shared one bakes in
 * `justify-between gap-4` + an internal chevron, but our layout needs a
 * full-width trigger with a span that flex-grows so the chevron always
 * lands at the far right of the panel regardless of title length.
 */
export function Section({
    id,
    title,
    setCount,
    icon: Icon,
    children,
    className,
    actions,
}: SectionProps) {
    const hasSet = setCount !== undefined && setCount > 0;
    return (
        // Hairline dividers between sections give the column a rhythm without
        // adding any shadow / heavy borders. `first:border-t-0` avoids a
        // doubled line under the element-header divider above. `/30` opacity
        // matches the brand "whisper" direction — visible enough to read as
        // a separator, quiet enough to fade behind populated content.
        <AccordionItem
            value={id}
            className={cn('border-border/30 border-t border-b-0 px-0 first:border-t-0', className)}
        >
            <AccordionPrimitive.Header className="flex w-full">
                <AccordionPrimitive.Trigger
                    className={cn(
                        // Sentence-case title in `text-small font-semibold` reads
                        // like a properties inspector, not a settings page.
                        // State cues stay subtle: chevron rotates + brand dot
                        // when populated. Hover lifts the title one step and
                        // lifts the chevron from muted to secondary so the
                        // header reads as clickable without adding a fill.
                        'group/section-header text-small hover:text-foreground-primary flex w-full items-center gap-2 px-3 py-2.5 font-semibold tracking-tight transition-colors outline-none [&[data-state=open]>svg]:rotate-180',
                        hasSet ? 'text-foreground-primary' : 'text-foreground-secondary',
                    )}
                >
                    {Icon && <Icon className="text-foreground-tertiary size-3.5 shrink-0" />}
                    <span className="flex-1 truncate text-left">{title}</span>
                    {hasSet && (
                        <span
                            aria-hidden
                            className="bg-foreground-brand size-1.5 shrink-0 rounded-full"
                        />
                    )}
                    <ChevronDown className="text-muted-foreground group-hover/section-header:text-foreground-secondary size-3.5 shrink-0 transition-transform duration-150" />
                </AccordionPrimitive.Trigger>
                {actions && (
                    <div
                        className="flex items-center pr-2"
                        onClick={(event) => event.stopPropagation()}
                    >
                        {actions}
                    </div>
                )}
            </AccordionPrimitive.Header>
            <AccordionPrimitive.Content className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-sm">
                {/* `pt-2` gives the first row breathing room from the bold
                    header above; `gap-1.5` is the inter-row rhythm. */}
                <div className="flex flex-col gap-1.5 pt-2 pb-3">{children}</div>
            </AccordionPrimitive.Content>
        </AccordionItem>
    );
}
