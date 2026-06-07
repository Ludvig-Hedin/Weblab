'use client';

import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';

import { AccordionItem } from '@weblab/ui/accordion';
import { cn } from '@weblab/ui/utils';

export interface SectionProps {
    id: string;
    title: string;
    /**
     * Optional count of "set" properties. The number isn't rendered, but a
     * non-zero count lights a small brand-blue dot before the title. When the
     * count is zero/undefined no dot is rendered at all — the title sits flush
     * left, with no reserved space, so the header never reads as decorated.
     */
    setCount?: number;
    children: React.ReactNode;
    className?: string;
    /** Optional inline action rendered to the right of the chevron. */
    actions?: React.ReactNode;
}

/**
 * v3 accordion section. Slimmer than v2:
 *   - No leading lucide icon (the Figma uses the title alone for hierarchy).
 *   - Brand dot leads the title ONLY when the section has set properties.
 *     When unset, nothing is rendered before the title — no dot, no reserved
 *     space — so the header reads as a calm label, never decorated.
 *   - Smaller chevron + tighter padding to match the 8/4 spacing scale.
 */
export function Section({ id, title, setCount, children, className, actions }: SectionProps) {
    const hasSet = setCount !== undefined && setCount > 0;
    return (
        <AccordionItem
            value={id}
            className={cn('border-border/70 border-t border-b-0 px-0 first:border-t-0', className)}
        >
            <AccordionPrimitive.Header className="flex w-full">
                <AccordionPrimitive.Trigger
                    className={cn(
                        // text-small + medium weight: bold enough to read as a
                        // section header, quiet enough not to compete with the
                        // controls below. Hover lifts to primary; chevron tints
                        // up on the same hover path.
                        'group/section-header text-foreground-primary hover:text-foreground-primary flex w-full items-center gap-2 px-3 py-2.5 text-sm font-semibold tracking-tight transition-colors outline-none [&[data-state=open]>svg]:rotate-180',
                        // hasSet still drives accent dot rendering, no longer
                        // a color delta — section title is always primary.
                    )}
                >
                    {hasSet && (
                        <span
                            aria-hidden
                            className="bg-foreground-brand size-1.5 shrink-0 rounded-full"
                        />
                    )}
                    <span className="flex-1 truncate text-left">{title}</span>
                    <ChevronDown className="text-muted-foreground group-hover/section-header:text-foreground-secondary size-3 shrink-0 transition-transform duration-150" />
                </AccordionPrimitive.Trigger>
                {actions && (
                    // Wrapper exists only to swallow click bubbling that would
                    // otherwise toggle the parent accordion trigger. Real
                    // interactivity lives in the action children, which carry
                    // their own keyboard handlers — wrapper is presentational.
                    <div
                        role="presentation"
                        className="flex items-center pr-2"
                        onClick={(event) => event.stopPropagation()}
                    >
                        {actions}
                    </div>
                )}
            </AccordionPrimitive.Header>
            <AccordionPrimitive.Content className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden text-sm">
                <div className="flex flex-col gap-1 pt-1 pb-2">{children}</div>
            </AccordionPrimitive.Content>
        </AccordionItem>
    );
}
