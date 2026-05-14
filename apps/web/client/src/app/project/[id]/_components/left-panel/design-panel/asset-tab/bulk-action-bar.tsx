'use client';

import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';

import type { FolderTreeNode } from './utils/asset-tree';
import { ASSET_ROOT } from './hooks/use-asset-browse';
import { flattenFolderTree } from './utils/asset-tree';

interface BulkActionBarProps {
    selectedCount: number;
    folderTree: FolderTreeNode[];
    onMove: (targetFolder: string) => void;
    onCompress: () => void;
    onDelete: () => void;
    onDone: () => void;
}

const actionButtonClass = 'text-foreground-secondary hover:text-foreground-primary h-7 w-7';

export const BulkActionBar = ({
    selectedCount,
    folderTree,
    onMove,
    onCompress,
    onDelete,
    onDone,
}: BulkActionBarProps) => {
    const folders = [
        { path: ASSET_ROOT, label: 'No folder' },
        ...flattenFolderTree(folderTree).map((folder) => ({
            path: folder.path,
            label: folder.name,
        })),
    ];
    const hasSelection = selectedCount > 0;

    return (
        <div className="border-border-primary bg-background-secondary flex items-center gap-1 rounded-md border px-2 py-1">
            <span className="text-foreground-secondary text-mini flex-1 truncate">
                {selectedCount} selected
            </span>

            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        size="icon"
                        className={actionButtonClass}
                        aria-label="Move selected to folder"
                        title="Move to folder"
                        disabled={!hasSelection}
                    >
                        <Icons.MoveToFolder className="h-3.5 w-3.5" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                    {folders.map((folder) => (
                        <DropdownMenuItem
                            key={folder.path}
                            className="flex items-center gap-2"
                            onSelect={() => onMove(folder.path)}
                        >
                            <Icons.File className="h-3 w-3" />
                            {folder.label}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>

            <Button
                variant="ghost"
                size="icon"
                className={actionButtonClass}
                aria-label="Compress selected"
                title="Compress"
                onClick={onCompress}
                disabled={!hasSelection}
            >
                <Icons.Scissors className="h-3.5 w-3.5" />
            </Button>

            <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive h-7 w-7"
                aria-label="Delete selected"
                title="Delete"
                onClick={onDelete}
                disabled={!hasSelection}
            >
                <Icons.Trash className="h-3.5 w-3.5" />
            </Button>

            <Button
                variant="ghost"
                size="icon"
                className={actionButtonClass}
                aria-label="Exit select mode"
                title="Done"
                onClick={onDone}
            >
                <Icons.CrossS className="h-3.5 w-3.5" />
            </Button>
        </div>
    );
};
