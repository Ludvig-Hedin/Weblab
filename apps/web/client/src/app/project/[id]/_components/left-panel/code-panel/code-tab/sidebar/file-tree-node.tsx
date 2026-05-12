'use client';

import type { CSSProperties, KeyboardEvent, MouseEvent, ReactElement } from 'react';
import type { NodeApi } from 'react-arborist';
import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';

import type { FileEntry } from '@weblab/file-system/hooks';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@weblab/ui/alert-dialog';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@weblab/ui/context-menu';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';

import { FileIcon } from './file-icon';

interface FileTreeNodeProps {
    node: NodeApi<FileEntry>;
    style: CSSProperties;
    onFileSelect: (filePath: string, searchTerm?: string) => void;
    onRenameFile: (oldPath: string, newPath: string) => void;
    onDeleteFile: (path: string) => void;
    onAddToChat: (filePath: string) => void;
}

export const FileTreeNode = ({
    node,
    style,
    onFileSelect,
    onRenameFile,
    onDeleteFile,
    onAddToChat,
}: FileTreeNodeProps) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editingName, setEditingName] = useState(node.data.name);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const isDirectory = node.data.isDirectory;

    const handleClick = (e: MouseEvent) => {
        if (isEditing) return;

        if (isDirectory) {
            node.toggle();
            return;
        }
        if (onFileSelect) {
            onFileSelect(node.data.path);
        }
        // Select the node in the tree
        node.select();
    };

    const handleRename = () => {
        if (node.data.isDirectory) return;
        if (isEditing) return;

        setIsEditing(true);
        setEditingName(node.data.name);
    };

    useEffect(() => {
        if (!isEditing) return;
        const input = inputRef.current;
        if (!input) return;

        if (document.activeElement === input) return;

        input.focus();
        const filename = node.data.name;
        const lastDotIndex = filename.lastIndexOf('.');
        if (lastDotIndex > 0 && !isDirectory) {
            input.setSelectionRange(0, lastDotIndex);
        } else {
            input.select();
        }
    }, [isEditing, isDirectory, node.data.name]);

    const handleBlur = () => {
        const trimmed = editingName.trim();
        if (trimmed && trimmed !== node.data.name) {
            const segments = node.data.path.split('/');
            segments[segments.length - 1] = trimmed;
            const newPath = segments.join('/');
            onRenameFile(node.data.path, newPath);
        }
        setIsEditing(false);
        setEditingName(node.data.name);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
            handleBlur();
        } else if (e.key === 'Escape') {
            setIsEditing(false);
            setEditingName(node.data.name);
        }
    };

    const handleAddToChat = () => {
        if (isDirectory || !onAddToChat) return;
        onAddToChat(node.data.path);
    };

    const handleCopyPath = async () => {
        try {
            await navigator.clipboard.writeText(node.data.path);
            toast.success('Path copied');
        } catch (error) {
            console.error('Failed to copy path:', error);
        }
    };

    const handleCopyName = async () => {
        try {
            await navigator.clipboard.writeText(node.data.name);
            toast.success('Name copied');
        } catch (error) {
            console.error('Failed to copy name:', error);
        }
    };

    type MenuItem = {
        label: string;
        action: () => void;
        icon: ReactElement;
        separator: boolean;
        className?: string;
    };

    const deleteItem: MenuItem = {
        label: 'Delete',
        action: () => setShowDeleteDialog(true),
        icon: <Icons.Trash className="text-destructive h-4 w-4" />,
        separator: false,
        className: 'text-destructive',
    };

    const menuItems: MenuItem[] = isDirectory
        ? [
              {
                  label: 'Copy Path',
                  action: handleCopyPath,
                  icon: <Icons.Copy className="h-4 w-4" />,
                  separator: false,
              },
              {
                  label: 'Copy Name',
                  action: handleCopyName,
                  icon: <Icons.File className="h-4 w-4" />,
                  separator: true,
              },
              deleteItem,
          ]
        : [
              {
                  label: 'Add to Chat',
                  action: handleAddToChat,
                  icon: <Icons.Plus className="h-4 w-4" />,
                  separator: false,
              },
              {
                  label: 'Copy Path',
                  action: handleCopyPath,
                  icon: <Icons.Copy className="h-4 w-4" />,
                  separator: false,
              },
              {
                  label: 'Copy Name',
                  action: handleCopyName,
                  icon: <Icons.File className="h-4 w-4" />,
                  separator: false,
              },
              {
                  label: 'Rename',
                  action: handleRename,
                  icon: <Icons.Edit className="h-4 w-4" />,
                  separator: true,
              },
              deleteItem,
          ];

    return (
        <ContextMenu>
            <ContextMenuTrigger>
                <div
                    style={style}
                    className="flex h-6 cursor-pointer items-center rounded"
                    onClick={handleClick}
                    onDoubleClick={(e) => handleRename()}
                >
                    <span className="relative h-4 w-4 flex-none">
                        {isDirectory && (
                            <div className="absolute z-50 flex h-4 w-4 items-center justify-center">
                                <motion.div
                                    initial={false}
                                    animate={{ rotate: node.isOpen ? 90 : 0 }}
                                >
                                    <Icons.ChevronRight className="h-3 w-3" />
                                </motion.div>
                            </div>
                        )}
                    </span>
                    <FileIcon path={node.data.path} isDirectory={isDirectory} />
                    {isEditing ? (
                        <input
                            ref={inputRef}
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onBlur={handleBlur}
                            onKeyDown={handleKeyDown}
                            className="outline-border-active truncate rounded-xs bg-transparent px-0 outline outline-2 outline-offset-2"
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <span className="truncate" title={node.data.name}>
                            {node.data.name}
                        </span>
                    )}
                    {/* {!isDirectory && contentMatches?.has(node.data.path) && (
                        <span className="ml-1 px-1.5 py-0.5 text-mini bg-primary/10 text-primary rounded-full font-medium min-w-[20px] text-center">
                            {contentMatches.get(node.data.path)}
                        </span>
                    )} */}
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
                {menuItems.map((item) => (
                    <div key={item.label}>
                        <ContextMenuItem onClick={item.action} className="cursor-pointer">
                            <span className={cn('flex w-full items-center gap-1', item.className)}>
                                {item.icon}
                                {item.label}
                            </span>
                        </ContextMenuItem>
                        {item.separator && <ContextMenuSeparator />}
                    </div>
                ))}
            </ContextMenuContent>

            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Delete {isDirectory ? 'Folder' : 'File'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete "{node.data.name}"?
                            {isDirectory
                                ? ' This will permanently delete the folder and all its contents.'
                                : ' This action cannot be undone.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => {
                                onDeleteFile(node.data.path);
                                setShowDeleteDialog(false);
                            }}
                            className="bg-destructive text-primary-foreground hover:bg-destructive/80"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </ContextMenu>
    );
};
