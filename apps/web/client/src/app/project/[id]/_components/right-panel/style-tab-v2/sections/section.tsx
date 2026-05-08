'use client';

import { AccordionContent, AccordionItem, AccordionTrigger } from '@weblab/ui/accordion';
import { cn } from '@weblab/ui/utils';

export interface SectionProps {
    id: string;
    title: string;
    /** Optional count, e.g. "Spacing · 2". When 0/undefined the dot is hidden. */
    setCount?: number;
    children: React.ReactNode;
    className?: string;
    /** Optional inline action rendered to the right of the chevron. */
    actions?: React.ReactNode;
}

/**
 * Standard accordion section used by every Style panel section. The header
 * shows the title, an optional count of "set" properties, and an optional
 * action slot. Body padding is consistent across sections.
 */
export function Section({ id, title, setCount, children, className, actions }: SectionProps) {
    return (
        <AccordionItem value={id} className={cn('border-border/40 px-1', className)}>
            <div className="flex items-center">
                <AccordionTrigger className="text-foreground-secondary text-micro flex-1 px-3 py-2 font-medium uppercase hover:no-underline [&[data-state=open]>svg]:rotate-180">
                    <span className="flex items-center gap-2">
                        {title}
                        {setCount !== undefined && setCount > 0 && (
                            <span className="bg-foreground/8 text-foreground-secondary text-micro inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-medium">
                                {setCount}
                            </span>
                        )}
                    </span>
                </AccordionTrigger>
                {actions && <div className="pr-2">{actions}</div>}
            </div>
            <AccordionContent className="pt-0 pb-3">
                <div className="flex flex-col gap-1">{children}</div>
            </AccordionContent>
        </AccordionItem>
    );
}
