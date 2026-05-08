'use client';

import { useEffect, useState } from 'react';

import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import type { EditorFile } from '../shared/types';
import { isDirty } from '../shared/utils';

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
        isDirty(file).then(setIsFileDirty);
    }, [file.path, file.content, file.type, file.type === 'text' ? file.originalHash : null]);

    return (
        <div
            className="group relative h-full min-w-28 overflow-hidden pr-3 pl-3"
            data-active={dataActive}
        >
            <div className="bg-foreground/10 absolute top-1/2 right-0 h-[50%] w-[0.5px] -translate-y-1/2"></div>
            <div className="relative flex h-full items-center overflow-hidden">
                <button
                    className={cn(
                        'text-small flex h-full min-w-0 flex-1 items-center focus:outline-none',
                        isActive
                            ? isFileDirty
                                ? 'text-blue-400'
                                : 'text-foreground'
                            : isFileDirty
                              ? 'text-blue-400'
                              : 'text-foreground-secondary/50',
                    )}
                    onClick={onClick}
                >
                    <span className="min-w-0 truncate">{filename}</span>
                    {isFileDirty && (
                        <span
                            className={cn(
                                'ml-1 flex-shrink-0',
                                isActive ? 'text-blue-400' : 'text-blue-400',
                            )}
                        >
                            ●
                        </span>
                    )}
                    {isActive && (
                        <div
                            className={cn(
                                'absolute bottom-0 left-0 h-[2px] w-full',
                                isFileDirty ? 'bg-blue-400' : 'bg-foreground-hover',
                            )}
                        ></div>
                    )}
                    {!isActive && (
                        <div className="bg-foreground-tertiary/50 absolute bottom-0 left-0 h-[2px] w-full opacity-0 group-hover:opacity-100"></div>
                    )}
                </button>
                <div className="group-hover:bg-background-primary absolute top-1/2 right-[-3px] z-10 -translate-y-1/2 rounded-md opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                        className={cn(
                            'hover:text-foreground-hover hover:bg-secondary flex-shrink-0 cursor-pointer p-1.5 hover:rounded-md',
                            isActive ? 'text-foreground-secondary' : 'text-foreground-primary',
                        )}
                        onClick={(e) => {
                            e.stopPropagation();
                            onClose?.();
                        }}
                    >
                        <Icons.CrossS className="h-3 w-3" />
                    </button>
                </div>
            </div>
        </div>
    );
};
