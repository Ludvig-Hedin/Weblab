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
        const input = inputRef.current;
        if (!input) {
            return;
        }

        if (!isEditing) {
            return;
        }

        // Don't focus if already focused
        if (document.activeElement === input) {
            return;
        }

        input.focus();
        const filename = node.data.name;
        const lastDotIndex = filename.lastIndexOf('.');
        if (lastDotIndex > 0 && !isDirectory) {
            // Select from start to before the last dot (extension)
            input?.setSelectionRange(0, lastDotIndex);
        } else {
            // If no extension or is directory, select all
            input?.select();
        }
    }, [inputRef.current]);

    const handleBlur = () => {
        if (editingName.trim() && editingName !== node.data.name) {
            const newPath = node.data.path.replace(node.data.name, editingName.trim());
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
        } catch (error) {
            console.error('Failed to copy path:', error);
        }
    };

    const menuItems: Array<{
        label: string;
        action: () => void;
        icon: ReactElement;
        separator: boolean;
        className?: string;
    } | null> = [
        !isDirectory
            ? {
                  label: 'Add to Chat',
                  action: handleAddToChat,
                  icon: <Icons.Plus className="h-4 w-4" />,
                  separator: false,
              }
            : null,
        {
            label: 'Copy Path',
            action: handleCopyPath,
            icon: <Icons.Copy className="h-4 w-4" />,
            separator: false,
        },
        !isDirectory
            ? {
                  label: 'Rename',
                  action: handleRename,
                  icon: <Icons.Edit className="h-4 w-4" />,
                  separator: false,
              }
            : null,
        {
            label: 'Delete',
            action: () => {
                setShowDeleteDialog(true);
            },
            icon: <Icons.Trash className="h-4 w-4 text-red-500" />,
            separator: false,
            className: 'text-red-500',
        },
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
                                    <Icons.ChevronRight className="h-2.5 w-2.5" />
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
                            className="outline-rounded outline-border-primary truncate rounded-[1px] bg-transparent px-0 outline-2 outline-offset-2"
                            onClick={(e) => e.stopPropagation()}
                        />
                    ) : (
                        <span className="truncate">{node.data.name}</span>
                    )}
                    {/* {!isDirectory && contentMatches?.has(node.data.path) && (
                        <span className="ml-1 px-1.5 py-0.5 text-mini bg-primary/10 text-primary rounded-full font-medium min-w-[20px] text-center">
                            {contentMatches.get(node.data.path)}
                        </span>
                    )} */}
                </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
                {menuItems
                    .filter((item) => item !== null)
                    .map((item, index) => (
                        <div key={item.label}>
                            <ContextMenuItem onClick={item.action} className="cursor-pointer">
                                <span
                                    className={cn('flex w-full items-center gap-1', item.className)}
                                >
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
                            className="text-primary bg-red-600 hover:bg-red-700"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </ContextMenu>
    );
};
