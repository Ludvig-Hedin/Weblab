import type { RowRendererProps } from 'react-arborist';
import { forwardRef } from 'react';

import type { PageNode } from '@weblab/models/pages';
import { cn } from '@weblab/ui/utils';

export const PageTreeRow = forwardRef<
    HTMLDivElement,
    RowRendererProps<PageNode> & { isHighlighted?: boolean }
>(({ attrs, children, isHighlighted }, ref) => {
    return (
        <div
            ref={ref}
            {...attrs}
            className={cn(
                'h-6 w-full cursor-pointer rounded outline-none',
                'text-foreground-weblab/70',
                !attrs['aria-selected'] && [
                    isHighlighted && 'bg-background-weblab text-foreground-primary',
                    'hover:text-foreground-primary hover:bg-background-weblab',
                ],
                attrs['aria-selected'] && [
                    '!bg-blue-400 dark:!bg-blue-400',
                    '!text-primary dark:!text-primary',
                    '![&]:hover:bg-blue-400 dark:[&]:hover:bg-blue-400',
                ],
            )}
        >
            {children}
        </div>
    );
});
