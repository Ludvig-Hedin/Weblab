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

    // Scroll to active tab when it changes — wait one paint via rAF so the
    // new tab has its final layout, then scroll. Smoother than a fixed
    // setTimeout and cancellable if the active file flips again first.
    useEffect(() => {
        const container = ref.current;
        if (!container || !activeFile?.path) return;

        const rafId = requestAnimationFrame(() => {
            const activeTab = container.querySelector('[data-active="true"]');
            if (!activeTab) return;
            const containerRect = container.getBoundingClientRect();
            const tabRect = activeTab.getBoundingClientRect();
            if (tabRect.left < containerRect.left) {
                container.scrollTo({
                    left: container.scrollLeft + tabRect.left - containerRect.left,
                    behavior: 'smooth',
                });
            } else if (tabRect.right > containerRect.right) {
                container.scrollTo({
                    left: container.scrollLeft + tabRect.right - containerRect.right,
                    behavior: 'smooth',
                });
            }
        });
        return () => cancelAnimationFrame(rafId);
    }, [activeFile?.path]);

    return (
        <div className="bg-background-chrome border-border-bar relative flex h-9 flex-shrink-0 items-center justify-between border-b pl-0">
            <div
                className="flex h-full w-full items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                ref={ref}
                onWheel={(event) => {
                    // Let a vertical trackpad/mouse wheel scroll the tab strip.
                    if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
                        event.currentTarget.scrollLeft += event.deltaY;
                    }
                }}
            >
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
            <div className="flex h-full flex-none items-center px-1">
                <DropdownMenu>
                    <DropdownMenuTrigger
                        aria-label="File tab options"
                        className="text-foreground-tertiary hover:text-foreground-primary hover:bg-foreground/[0.06] flex h-7 w-7 items-center justify-center rounded-md"
                    >
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
