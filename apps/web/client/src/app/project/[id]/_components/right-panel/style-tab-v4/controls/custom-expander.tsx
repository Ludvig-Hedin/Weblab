'use client';

import { ChevronDown, Settings2 } from 'lucide-react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@weblab/ui/collapsible';
import { cn } from '@weblab/ui/utils';

export interface CustomExpanderProps {
    /** Open / closed state. */
    open: boolean;
    onOpenChange: (open: boolean) => void;
    /** Label for the trigger ("Custom", "More", etc.). */
    label?: string;
    /** Visual hint for what's inside ("11 advanced properties"). */
    summary?: string;
    children: React.ReactNode;
    className?: string;
}

/**
 * Disclosure container used beneath every named-style picker (Text, Effects,
 * Transforms) and on Size to reveal raw CSS controls for power users. Keeps
 * the default panel calm while giving lossless access to every v2 property.
 *
 * The expanded content sits flush in the panel column — separated from the
 * trigger by spacing and a single hairline divider, not a filled card — so
 * rows align with the rest of the panel rather than reading as a tinted box.
 */
export function CustomExpander({
    open,
    onOpenChange,
    label = 'Custom',
    summary,
    children,
    className,
}: CustomExpanderProps) {
    return (
        <Collapsible open={open} onOpenChange={onOpenChange} className={cn('w-full', className)}>
            <CollapsibleTrigger
                className={cn(
                    'group/expander text-mini text-foreground-secondary hover:text-foreground-primary mx-3 mt-0.5 flex w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-[4px] py-1 transition-colors outline-none',
                )}
            >
                <Settings2 className="text-foreground-tertiary size-3 shrink-0" />
                <span className="font-medium">{label}</span>
                {summary && (
                    <span className="text-foreground-tertiary text-micro truncate">
                        — {summary}
                    </span>
                )}
                <ChevronDown
                    className={cn(
                        'text-foreground-tertiary group-hover/expander:text-foreground-secondary ml-auto size-3 shrink-0 transition-transform duration-150',
                        open && 'rotate-180',
                    )}
                />
            </CollapsibleTrigger>
            <CollapsibleContent className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden">
                <div className="border-border/30 mx-3 mt-1 mb-1 flex flex-col gap-1 border-t pt-1.5">
                    {children}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}
