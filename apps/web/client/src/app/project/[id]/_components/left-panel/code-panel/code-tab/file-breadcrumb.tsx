import { Fragment } from 'react';

import { Icons } from '@weblab/ui/icons';

import type { EditorFile } from './shared/types';
import { FileIcon } from './sidebar/file-icon';

// Quiet "where am I" line above the code, like VS Code / t3code breadcrumbs.
export const FileBreadcrumb = ({ activeFile }: { activeFile: EditorFile | null }) => {
    if (!activeFile) return null;

    const segments = activeFile.path.split('/').filter(Boolean);
    const fileName = segments.pop() ?? activeFile.path;

    return (
        <div
            className="bg-background-canvas text-mini text-foreground-tertiary flex h-8 flex-shrink-0 items-center gap-1 overflow-hidden px-4 select-none"
            title={activeFile.path}
        >
            {segments.map((segment, i) => (
                <Fragment key={`${segment}-${i}`}>
                    <span className="truncate">{segment}</span>
                    <Icons.ChevronRight className="text-foreground-quadranary h-3 w-3 flex-none" />
                </Fragment>
            ))}
            <FileIcon path={activeFile.path} isDirectory={false} className="h-3.5 w-3.5" />
            <span className="text-foreground-secondary flex-none truncate">{fileName}</span>
        </div>
    );
};
