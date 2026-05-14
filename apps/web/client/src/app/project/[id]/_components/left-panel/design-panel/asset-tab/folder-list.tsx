'use client';

import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';

import type { FolderData } from './types';

interface FolderListProps {
    folders: FolderData[];
    onFolderClick: (folder: FolderData) => void;
}

export const FolderList = ({ folders, onFolderClick }: FolderListProps) => {
    if (folders.length === 0) {
        return null;
    }

    return (
        <div className="flex flex-col gap-2">
            <div className="text-foreground-secondary text-mini font-medium">Folders</div>
            <div className="flex flex-wrap gap-1">
                {folders.map((folder) => (
                    <Button
                        key={folder.path}
                        variant="outline"
                        size="sm"
                        className="text-mini h-7"
                        onClick={() => onFolderClick(folder)}
                    >
                        <Icons.File className="mr-1 h-3 w-3" />
                        {folder.name}
                    </Button>
                ))}
            </div>
        </div>
    );
};
