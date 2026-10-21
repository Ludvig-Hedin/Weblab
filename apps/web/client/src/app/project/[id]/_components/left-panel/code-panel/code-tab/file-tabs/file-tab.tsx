'use client';

import { useEffect, useState } from 'react';

import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import type { EditorFile } from '../shared/types';
import { isDirty } from '../shared/utils';
import { FileIcon } from '../sidebar/file-icon';

export interface FileTabProps {
    file: EditorFile;
    isActive: boolean;
    onClick: () => void;
    onClose: () => void;
    dataActive: boolean;
}

export const FileTab = ({ file, isActive, onClick, onClose, dataActive }: FileTabProps) => {
    const [isFileDirty, setIsFileDirty] = useState(false);
    const filename = file.path.split('/').pop() || '';

    useEffect(() => {
        // `isDirty` is async (hashes file content). If the file changes
        // rapidly, an older Promise can resolve after a newer one and stomp
        // the correct state. Guard with a cancellation flag so only the most
        // recent run can call `setIsFileDirty`.
        let cancelled = false;
        void isDirty(file).then((next) => {
            if (!cancelled) setIsFileDirty(next);
        });
        return () => {
            cancelled = true;
        };
    }, [file.path, file.content, file.type, file.originalHash]);

    return (
        <div
            className={cn(
                'group border-border-bar relative flex h-full max-w-56 min-w-0 flex-none items-center border-r',
                // The active tab takes the editor's surface and hides the bar's
                // bottom hairline, so it reads as the top of the open file.
                isActive
                    ? 'bg-background-canvas text-foreground-primary after:bg-background-canvas after:absolute after:inset-x-0 after:-bottom-px after:h-px'
                    : 'text-foreground-tertiary hover:text-foreground-secondary hover:bg-foreground/[0.03]',
            )}
            data-active={dataActive}
            title={file.path}
            onMouseDown={(e) => {
                if (e.button === 1) {
                    e.preventDefault();
                    onClose?.();
                }
            }}
        >
            <button
                className="text-small flex h-full min-w-0 flex-1 items-center gap-2 pr-1 pl-3 focus:outline-none focus-visible:underline"
                onClick={onClick}
            >
                <FileIcon path={file.path} isDirectory={false} className="h-3.5 w-3.5" />
                <span className="min-w-0 truncate">{filename}</span>
            </button>
            {/* Close slot doubles as the unsaved dot: dot at rest, X on hover. */}
            <button
                aria-label="Close file"
                className={cn(
                    'text-foreground-tertiary hover:text-foreground-primary hover:bg-foreground/[0.08] mr-1.5 flex h-5 w-5 flex-none items-center justify-center rounded',
                    !isActive && !isFileDirty && 'opacity-0 group-hover:opacity-100',
                )}
                onClick={(e) => {
                    e.stopPropagation();
                    onClose?.();
                }}
            >
                {isFileDirty ? (
                    <>
                        <span className="bg-foreground-secondary h-2 w-2 rounded-full group-hover:hidden" />
                        <Icons.CrossS className="hidden h-3 w-3 group-hover:block" />
                    </>
                ) : (
                    <Icons.CrossS className="h-3 w-3" />
                )}
            </button>
        </div>
    );
};
