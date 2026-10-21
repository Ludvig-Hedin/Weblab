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
                'w-auto min-w-0 cursor-pointer rounded-md outline-none',
                attrs['aria-selected']
                    ? 'bg-foreground/[0.09] text-foreground-primary'
                    : 'text-foreground-secondary hover:bg-foreground/[0.045] hover:text-foreground-primary',
                // Keyboard-highlighted row (arrow keys from search) gets a ring
                // so it stays distinct from the open file.
                isHighlighted && 'ring-foreground/25 text-foreground-primary ring-1 ring-inset',
            )}
        >
            {children}
        </div>
    );
};
