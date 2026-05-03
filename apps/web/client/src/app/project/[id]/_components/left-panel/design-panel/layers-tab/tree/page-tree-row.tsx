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
                'text-foreground-onlook/70',
                !attrs['aria-selected'] && [
                    isHighlighted && 'bg-background-onlook text-foreground-primary',
                    'hover:text-foreground-primary hover:bg-background-onlook',
                ],
                attrs['aria-selected'] && [
                    '!bg-[#109BFF] dark:!bg-[#109BFF]',
                    '!text-primary dark:!text-primary',
                    '![&]:hover:bg-[#109BFF] dark:[&]:hover:bg-[#109BFF]',
                ],
            )}
        >
            {children}
        </div>
    );
});
