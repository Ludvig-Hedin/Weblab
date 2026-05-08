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
                    ? ['bg-blue-400/90 dark:bg-blue-400/90', 'text-primary dark:text-primary']
                    : [isHighlighted && 'bg-background-weblab text-foreground-primary'],
                isHighlighted
                    ? 'text-foreground-primary bg-blue-400/90 hover:bg-blue-400'
                    : 'text-foreground-weblab/70 hover:text-foreground-primary hover:bg-blue-400/30',
            )}
        >
            {children}
        </div>
    );
};
