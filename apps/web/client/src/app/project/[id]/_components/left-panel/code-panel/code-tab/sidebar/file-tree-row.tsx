import type { RowRendererProps } from 'react-arborist';

import type { FileEntry } from '@weblab/file-system/hooks';
import { cn } from '@weblab/ui/utils';

export const FileTreeRow = ({
    attrs,
    children,
    isHighlighted,
}: RowRendererProps<FileEntry> & { isHighlighted: boolean }) => {
    return (
        <div
            {...attrs}
            className={cn(
                'h-6 w-auto min-w-0 cursor-pointer rounded outline-none',
                attrs['aria-selected']
                    ? ['bg-[#109BFF]/90 dark:bg-[#109BFF]/90', 'text-primary dark:text-primary']
                    : [isHighlighted && 'bg-background-onlook text-foreground-primary'],
                isHighlighted
                    ? 'text-foreground-primary bg-[#109BFF]/90 hover:bg-[#109BFF]'
                    : 'text-foreground-onlook/70 hover:text-foreground-primary hover:bg-[#109BFF]/30',
            )}
        >
            {children}
        </div>
    );
};
