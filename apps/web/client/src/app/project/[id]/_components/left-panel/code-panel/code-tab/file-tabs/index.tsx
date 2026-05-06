'use client';

import { useEffect, useRef } from 'react';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { pathsEqual } from '@weblab/utility';

import type { EditorFile } from '../shared/types';
import { FileTab } from './file-tab';

interface FileTabsProps {
    openedFiles: EditorFile[];
    activeFile: EditorFile | null;
    onFileSelect: (file: EditorFile) => void;
    onCloseFile: (fileId: string) => void;
    onCloseAllFiles: () => void;
}

export const FileTabs = ({
    openedFiles,
    activeFile,
    onFileSelect,
    onCloseFile,
    onCloseAllFiles,
}: FileTabsProps) => {
    const ref = useRef<HTMLDivElement>(null);

    // Scroll to active tab when it changes
    useEffect(() => {
        const container = ref.current;
        if (!container || !activeFile?.path) return;

        // Wait for the file tabs to be rendered
        setTimeout(() => {
            const activeTab = container.querySelector('[data-active="true"]');
            if (activeTab) {
                const containerRect = container.getBoundingClientRect();
                const tabRect = activeTab.getBoundingClientRect();

                // Calculate if the tab is outside the visible area
                if (tabRect.left < containerRect.left) {
                    // Tab is to the left of the visible area
                    container.scrollLeft += tabRect.left - containerRect.left;
                } else if (tabRect.right > containerRect.right) {
                    // Tab is to the right of the visible area
                    container.scrollLeft += tabRect.right - containerRect.right;
                }
            }
        }, 100);
    }, [activeFile?.path]);

    return (
        <div className="relative flex h-10 flex-shrink-0 items-center justify-between border-b-[0.5px] pl-0">
            <div className="flex h-full w-full items-center overflow-x-auto" ref={ref}>
                {openedFiles.map((file) => (
                    <FileTab
                        key={file.path}
                        file={file}
                        isActive={pathsEqual(activeFile?.path, file.path)}
                        onClick={() => onFileSelect(file)}
                        onClose={() => onCloseFile(file.path)}
                        dataActive={pathsEqual(activeFile?.path, file.path)}
                    />
                ))}
            </div>
            <div className="bg-background flex h-full w-11 items-center border-l-[0.5px] p-1">
                <DropdownMenu>
                    <DropdownMenuTrigger className="text-muted-foreground hover:text-foreground hover:bg-foreground/5 flex h-full w-full items-center justify-center rounded p-1 px-2.5">
                        <Icons.DotsHorizontal className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="-mt-1">
                        <DropdownMenuItem
                            onClick={() => activeFile && onCloseFile(activeFile.path)}
                            disabled={!activeFile}
                            className="cursor-pointer"
                        >
                            Close file
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={onCloseAllFiles}
                            disabled={openedFiles.length === 0}
                            className="cursor-pointer"
                        >
                            Close all
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>
        </div>
    );
};
