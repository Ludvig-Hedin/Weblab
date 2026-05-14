'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { ImageContentData } from '@weblab/models';
import { useFile } from '@weblab/file-system/hooks';
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
import { Button } from '@weblab/ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@weblab/ui/context-menu';
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { cn } from '@weblab/ui/utils';
import { convertToBase64DataUrl, getDirName } from '@weblab/utility';

import type { AssetData } from './types';
import type { FolderTreeNode } from './utils/asset-tree';
import { AssetActions } from './asset-actions';
import { ASSET_ROOT } from './hooks/use-asset-browse';
import { getAssetTypeIcon, getFileExtensionLabel } from './utils/asset-display';
import { flattenFolderTree } from './utils/asset-tree';
import { getAssetUrl } from './utils/asset-url';
import { canCompressAsset, compressAsset, formatBytes } from './utils/compress-asset';

interface AssetItemProps {
    asset: AssetData;
    projectId: string;
    branchId: string;
    folderTree: FolderTreeNode[];
    selectionMode: boolean;
    isSelected: boolean;
    onToggleSelect: () => void;
    onImageDragStart: (e: React.DragEvent<HTMLDivElement>, image: ImageContentData) => void;
    onImageDragEnd: () => void;
    onImageMouseDown: () => void;
    onImageMouseUp: () => void;
    onRename: (oldPath: string, newName: string) => Promise<void>;
    onMove: (assetPath: string, targetFolder: string) => Promise<void>;
    onReplaceAsset: (assetPath: string, bytes: Uint8Array) => Promise<void>;
    onDelete: (filePath: string) => Promise<void>;
    onAddToChat: (assetPath: string) => void;
}

export const AssetItem = ({
    asset,
    projectId,
    branchId,
    folderTree,
    selectionMode,
    isSelected,
    onToggleSelect,
    onImageDragStart,
    onImageDragEnd,
    onImageMouseDown,
    onImageMouseUp,
    onRename,
    onMove,
    onReplaceAsset,
    onDelete,
    onAddToChat,
}: AssetItemProps) => {
    const { content, loading } = useFile(projectId, branchId, asset.path);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isRenaming, setIsRenaming] = useState(false);
    const [newName, setNewName] = useState(asset.name);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const renameInputRef = useRef<HTMLInputElement>(null);

    const isImage = asset.type === 'image';
    const isVideo = asset.type === 'video';
    const isPreviewable = isImage || isVideo;
    const TypeIcon = getAssetTypeIcon(asset.type);
    const extensionLabel = getFileExtensionLabel(asset.name);
    const canCompress = canCompressAsset(asset.name);

    // Build a preview URL for image / video assets only — other types render a
    // generic card and never need their bytes decoded.
    useEffect(() => {
        if (!isPreviewable || !content) {
            setPreviewUrl(null);
            return;
        }

        // SVG (and other text-based images) arrive as a string.
        if (typeof content === 'string') {
            if (asset.name.toLowerCase().endsWith('.svg')) {
                setPreviewUrl(convertToBase64DataUrl(content, 'image/svg+xml'));
            } else {
                setPreviewUrl(null);
            }
            return;
        }

        const blob = new Blob([content as BlobPart], {
            type: asset.mimeType || 'application/octet-stream',
        });
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        return () => URL.revokeObjectURL(url);
    }, [content, isPreviewable, asset.name, asset.mimeType]);

    // Close the dropdown when entering rename mode or showing the delete dialog.
    useEffect(() => {
        if (isRenaming || showDeleteDialog) {
            setDropdownOpen(false);
        }
    }, [isRenaming, showDeleteDialog]);

    // Focus the rename input when entering rename mode.
    useEffect(() => {
        if (isRenaming) {
            renameInputRef.current?.focus();
            renameInputRef.current?.select();
        }
    }, [isRenaming]);

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
        if (!isImage) return;
        const imageContentData: ImageContentData = {
            fileName: asset.name,
            content: content as string,
            mimeType: asset.mimeType,
            originPath: asset.path,
        };
        onImageDragStart(e, imageContentData);
    };

    const handleRename = async () => {
        if (newName.trim() && newName !== asset.name) {
            try {
                await onRename(asset.path, newName.trim());
                setIsRenaming(false);
            } catch (error) {
                toast.error('Failed to rename file', {
                    description: error instanceof Error ? error.message : 'Unknown error',
                });
                setNewName(asset.name);
            }
        } else {
            setIsRenaming(false);
        }
    };

    const handleDelete = async () => {
        try {
            await onDelete(asset.path);
            setShowDeleteDialog(false);
        } catch (error) {
            toast.error('Failed to delete file', {
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            void handleRename();
        } else if (e.key === 'Escape') {
            setNewName(asset.name);
            setIsRenaming(false);
        }
    };

    const handleMoveTo = async (targetFolder: string) => {
        try {
            await onMove(asset.path, targetFolder);
        } catch (error) {
            // onMove surfaces its own error toast.
            console.error('Failed to move asset:', error);
        }
    };

    const handleCopyUrl = async () => {
        try {
            await navigator.clipboard.writeText(getAssetUrl(asset.path));
            toast.success('URL copied');
        } catch {
            toast.error('Failed to copy URL');
        }
    };

    const handleCompress = async () => {
        if (!(content instanceof Uint8Array)) {
            toast.error('This file type cannot be compressed');
            return;
        }
        const originalBytes = content;
        try {
            const result = await compressAsset(asset.name, originalBytes);
            if (result.compressedSize >= result.originalSize) {
                toast.info('Asset is already optimized');
                return;
            }
            await onReplaceAsset(asset.path, result.bytes);
            toast.success('Asset compressed', {
                description: `${formatBytes(result.originalSize)} → ${formatBytes(result.compressedSize)}`,
                action: {
                    label: 'Undo',
                    onClick: () => {
                        onReplaceAsset(asset.path, originalBytes).catch((undoError) => {
                            console.error('Failed to undo compression:', undoError);
                            toast.error('Failed to undo compression');
                        });
                    },
                },
            });
        } catch (error) {
            toast.error('Failed to compress asset', {
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    };

    const currentFolder = getDirName(asset.path);
    const moveTargets = [
        { path: ASSET_ROOT, label: 'No folder' },
        ...flattenFolderTree(folderTree).map((folder) => ({
            path: folder.path,
            label: folder.name,
        })),
    ].filter((target) => target.path !== currentFolder);

    const actionHandlers = {
        asset,
        moveTargets,
        canCompress,
        onAddToChat: () => onAddToChat(asset.path),
        onCopyUrl: () => void handleCopyUrl(),
        onRename: () => setIsRenaming(true),
        onMoveTo: (target: string) => void handleMoveTo(target),
        onCompress: () => void handleCompress(),
        onDelete: () => setShowDeleteDialog(true),
    };

    return (
        <div className="group">
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    {}
                    <div
                        className={cn(
                            'bg-background-secondary border-border-primary relative aspect-square overflow-hidden rounded-md border transition-colors',
                            isSelected ? 'border-border-weblab' : 'hover:border-border-weblab',
                            isImage && !selectionMode && 'cursor-grab',
                        )}
                        draggable={isImage && !selectionMode}
                        onDragStart={handleDragStart}
                        onDragEnd={onImageDragEnd}
                        onDragOver={(e) => {
                            // Allow external file drops by preventing default but not stopping propagation.
                            const isExternalDrag =
                                e.dataTransfer.types.includes('Files') &&
                                !e.dataTransfer.types.includes('application/json');
                            if (isExternalDrag) {
                                e.preventDefault();
                            }
                        }}
                        onMouseDown={isImage && !selectionMode ? onImageMouseDown : undefined}
                        onMouseUp={isImage && !selectionMode ? onImageMouseUp : undefined}
                    >
                        {loading && isPreviewable ? (
                            <div className="flex h-full w-full items-center justify-center">
                                <Icons.Reload className="text-foreground-secondary h-4 w-4 animate-spin" />
                            </div>
                        ) : isPreviewable && previewUrl ? (
                            isVideo ? (
                                <video
                                    src={previewUrl}
                                    className="h-full w-full object-cover"
                                    muted
                                    loop
                                    playsInline
                                    preload="metadata"
                                    onMouseEnter={(e) => void e.currentTarget.play()}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.pause();
                                        e.currentTarget.currentTime = 0;
                                    }}
                                />
                            ) : (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={previewUrl}
                                    alt={asset.name}
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                />
                            )
                        ) : (
                            <div className="text-foreground-tertiary flex h-full w-full flex-col items-center justify-center gap-1.5">
                                <TypeIcon className="h-7 w-7" />
                                {extensionLabel && (
                                    <span className="text-mini text-foreground-secondary font-medium tracking-wide">
                                        {extensionLabel}
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Hover action menu */}
                        {!isRenaming && !selectionMode && (
                            <div className="absolute top-2 right-2 opacity-0 transition-opacity group-hover:opacity-100">
                                <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            size="icon"
                                            variant="secondary"
                                            className="bg-background-secondary/90 hover:bg-background-weblab h-6 w-6"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                            }}
                                        >
                                            <Icons.DotsHorizontal className="h-3 w-3" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-44">
                                        <AssetActions variant="dropdown" {...actionHandlers} />
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        )}

                        {/* Selection overlay (select mode) */}
                        {selectionMode && (
                            <>
                                <button
                                    type="button"
                                    aria-label={isSelected ? 'Deselect asset' : 'Select asset'}
                                    aria-pressed={isSelected}
                                    onClick={onToggleSelect}
                                    className="absolute inset-0 z-10"
                                />
                                <div
                                    className={cn(
                                        'pointer-events-none absolute top-2 left-2 z-20 flex h-4 w-4 items-center justify-center rounded border',
                                        isSelected
                                            ? 'bg-foreground-primary border-foreground-primary text-background-secondary'
                                            : 'bg-background-secondary/90 border-border-primary',
                                    )}
                                >
                                    {isSelected && <Icons.Check className="h-3 w-3" />}
                                </div>
                            </>
                        )}
                    </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-44">
                    <AssetActions variant="context" {...actionHandlers} />
                </ContextMenuContent>
            </ContextMenu>

            {/* Name section with inline rename */}
            <div className="mt-1 px-1">
                {isRenaming ? (
                    <Input
                        ref={renameInputRef}
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={() => void handleRename()}
                        className="focus-visible:ring-ring text-mini h-6 border-0 bg-transparent p-1 focus-visible:ring-1"
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <div className="text-foreground-primary text-mini truncate" title={asset.name}>
                        {asset.name}
                    </div>
                )}
            </div>

            {/* Delete confirmation dialog */}
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete asset</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete {asset.name}? This action cannot be
                            undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => void handleDelete()}
                            className="bg-destructive hover:bg-destructive/90 text-white"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};
