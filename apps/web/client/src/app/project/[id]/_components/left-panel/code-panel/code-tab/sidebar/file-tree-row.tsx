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
                    ? 'bg-foreground-brand/90 text-primary hover:bg-foreground-brand'
                    : isHighlighted
                      ? 'bg-foreground-brand/90 text-foreground-primary hover:bg-foreground-brand'
                      : 'text-foreground-weblab/70 hover:bg-foreground-brand/30 hover:text-foreground-primary',
            )}
        >
            {children}
        </div>
    );
};
