'use client';

import { useEffect, useState } from 'react';
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { getMimeType, isVideoFile } from '@weblab/utility';

interface ImageItemProps {
    image: {
        name: string;
        path: string;
        mimeType?: string;
    };
    projectId: string;
    branchId: string;
    onImageDragStart: (e: React.DragEvent<HTMLDivElement>, image: ImageContentData) => void;
    onImageDragEnd: () => void;
    onImageMouseDown: () => void;
    onImageMouseUp: () => void;
    onRename: (oldPath: string, newName: string) => Promise<void>;
    onDelete: (filePath: string) => Promise<void>;
    onAddToChat: (imagePath: string) => void;
}

export const ImageItem = ({
    image,
    projectId,
    branchId,
    onImageDragStart,
    onImageDragEnd,
    onImageMouseDown,
    onImageMouseUp,
    onRename,
    onDelete,
    onAddToChat,
}: ImageItemProps) => {
    const { content, loading } = useFile(projectId, branchId, image.path);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [isRenaming, setIsRenaming] = useState(false);
    const [newName, setNewName] = useState(image.name);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [dropdownOpen, setDropdownOpen] = useState(false);

    // Check if the file is a video
    const isVideo = isVideoFile(image.name);

    // Convert content to data URL for display
    useEffect(() => {
        if (!content) {
            setImageUrl(null);
            return;
        }

        // Handle SVG files (text content)
        if (typeof content === 'string' && image.name.toLowerCase().endsWith('.svg')) {
            // Create data URL for SVG
            const svgDataUrl = `data:image/svg+xml;base64,${btoa(content)}`;
            setImageUrl(svgDataUrl);
            return;
        }

        // Handle other text files (shouldn't happen for images, but just in case)
        if (typeof content === 'string') {
            setImageUrl(null);
            return;
        }

        // Handle binary content (PNG, JPG, videos, etc.)
        const blob = new Blob([content as BlobPart], { type: image.mimeType || 'image/*' });
        const url = URL.createObjectURL(blob);
        setImageUrl(url);

        // Clean up function to revoke object URL (only for blob URLs)
        return () => {
            URL.revokeObjectURL(url);
        };
    }, [content, image.mimeType, image.name]);

    // Close dropdown when entering rename mode or showing delete dialog
    useEffect(() => {
        if (isRenaming || showDeleteDialog) {
            setDropdownOpen(false);
        }
    }, [isRenaming, showDeleteDialog]);

    if (loading) {
        return (
            <div className="bg-background-secondary border-border-primary flex aspect-square items-center justify-center rounded-md border">
                <Icons.Reload className="text-foreground-secondary h-4 w-4 animate-spin" />
            </div>
        );
    }

    if (!imageUrl) {
        return (
            <div className="bg-background-secondary border-border-primary flex aspect-square items-center justify-center rounded-md border">
                <Icons.Image className="text-foreground-secondary h-4 w-4" />
            </div>
        );
    }

    const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
        const imageContentData: ImageContentData = {
            fileName: image.name,
            content: content as string,
            mimeType: getMimeType(image.name),
            originPath: image.path,
        };
        onImageDragStart(e, imageContentData);
    };

    const handleRename = async () => {
        if (newName.trim() && newName !== image.name) {
            try {
                await onRename(image.path, newName.trim());
                setIsRenaming(false);
            } catch (error) {
                toast.error('Failed to rename file', {
                    description: error instanceof Error ? error.message : 'Unknown error',
                });
                console.error('Failed to rename file:', error);
                setNewName(image.name); // Reset on error
            }
        } else {
            setIsRenaming(false);
        }
    };

    const handleDelete = async () => {
        try {
            await onDelete(image.path);
            setShowDeleteDialog(false);
        } catch (error) {
            toast.error('Failed to delete file', {
                description: error instanceof Error ? error.message : 'Unknown error',
            });
            console.error('Failed to delete file:', error);
        }
    };

    const handleAddToChat = () => {
        onAddToChat(image.path);
        setDropdownOpen(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            void handleRename();
        } else if (e.key === 'Escape') {
            setNewName(image.name);
            setIsRenaming(false);
        }
    };

    return (
        <div className="group">
            <div
                className="bg-background-secondary border-border-primary hover:border-border-weblab relative aspect-square cursor-pointer overflow-hidden rounded-md border transition-colors"
                onDragStart={handleDragStart}
                onDragEnd={onImageDragEnd}
                onDragOver={(e) => {
                    // Allow external file drops by preventing default but not stopping propagation
                    const isExternalDrag =
                        e.dataTransfer.types.includes('Files') &&
                        !e.dataTransfer.types.includes('application/json');
                    if (isExternalDrag) {
                        e.preventDefault();
                    }
                }}
                onMouseDown={onImageMouseDown}
                onMouseUp={onImageMouseUp}
            >
                {isVideo ? (
                    <video
                        src={imageUrl}
                        className="h-full w-full object-cover"
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        onMouseEnter={(e) => e.currentTarget.play()}
                        onMouseLeave={(e) => {
                            e.currentTarget.pause();
                            e.currentTarget.currentTime = 0;
                        }}
                    />
                ) : (
                    <img
                        src={imageUrl}
                        alt={image.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                    />
                )}

                {/* Action menu */}
                {!isRenaming && (
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
                            <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleAddToChat();
                                    }}
                                    className="flex items-center gap-2"
                                >
                                    <Icons.Plus className="h-3 w-3" />
                                    Add to Chat
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setIsRenaming(true);
                                    }}
                                    className="flex items-center gap-2"
                                >
                                    <Icons.Edit className="h-3 w-3" />
                                    Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setShowDeleteDialog(true);
                                    }}
                                    className="flex items-center gap-2 text-red-500 hover:text-red-600 focus:text-red-600"
                                >
                                    <Icons.Trash className="h-3 w-3" />
                                    Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                )}
            </div>

            {/* Name section with rename functionality */}
            <div className="mt-1 px-1">
                {isRenaming ? (
                    <Input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        onKeyDown={handleKeyDown}
                        onBlur={() => void handleRename()}
                        className="focus-visible:ring-ring text-mini h-6 border-0 bg-transparent p-1 focus-visible:ring-1"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                    />
                ) : (
                    <div className="text-foreground-primary text-mini truncate" title={image.name}>
                        {image.name}
                    </div>
                )}
            </div>

            {/* Delete confirmation dialog */}
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {isVideo ? 'Video' : 'Image'}</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete {image.name}? This action cannot be
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
