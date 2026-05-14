'use client';

import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';

import type { ImageMessageContext } from '@weblab/models/chat';
import { MessageContextType } from '@weblab/models/chat';
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
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';
import { convertToBase64DataUrl, getMimeType } from '@weblab/utility';

import { useEditorEngine } from '@/components/store/editor';
import { AssetFolderSelect } from './asset-folder-select';
import { AssetGrid } from './asset-grid';
import { AssetSidebar } from './asset-sidebar';
import { AssetSortMenu } from './asset-sort-menu';
import { AssetToolbar } from './asset-toolbar';
import { BulkActionBar } from './bulk-action-bar';
import { useAssetBrowse } from './hooks/use-asset-browse';
import { useAssetOperations } from './hooks/use-asset-operations';
import { useAssetSelection } from './hooks/use-asset-selection';
import { canCompressAsset, compressAsset, formatBytes } from './utils/compress-asset';

export const AssetsTab = observer(() => {
    const editorEngine = useEditorEngine();
    const projectId = editorEngine.projectId;
    const branchId = editorEngine.branches.activeBranch.id;

    // Browse state, folder tree, and the filtered + sorted asset list.
    const {
        activeFolder,
        setActiveFolder,
        activeType,
        setActiveType,
        search,
        setSearch,
        sort,
        setSort,
        folderTree,
        visibleAssets,
        typeCounts,
        loading,
        error,
    } = useAssetBrowse(projectId, branchId);

    // Multi-select state.
    const { selectionMode, selected, toggle, clear, enterSelectionMode, exitSelectionMode } =
        useAssetSelection();
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

    // Clear the selection when the browsing scope changes.
    useEffect(() => {
        clear();
    }, [activeFolder, activeType, clear]);

    // Get the CodeEditorApi for the active branch
    const branchData = editorEngine.branches.getBranchDataById(
        editorEngine.branches.activeBranch.id,
    );

    // Mutation handlers (upload / create folder / rename / move / replace / delete).
    const {
        isUploading,
        handleUpload,
        handleCreateFolder,
        handleRename,
        handleMove,
        handleReplaceAsset,
        handleDelete,
    } = useAssetOperations(activeFolder, branchData?.codeEditor, editorEngine);

    const handleCreateFolderWithFeedback = async (name: string) => {
        try {
            await handleCreateFolder(name);
            toast.success(`Folder "${name}" created`);
        } catch (error) {
            console.error('Failed to create folder:', error);
            toast.error(
                `Failed to create folder: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
            throw error;
        }
    };

    const handleRenameWithFeedback = async (oldPath: string, newName: string) => {
        try {
            await handleRename(oldPath, newName);
            toast.success('Asset renamed successfully');
        } catch (error) {
            console.error('Failed to rename asset:', error);
            toast.error(
                `Failed to rename asset: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
            throw error;
        }
    };

    const handleMoveWithFeedback = async (assetPath: string, targetFolder: string) => {
        try {
            await handleMove(assetPath, targetFolder);
            toast.success('Asset moved successfully');
        } catch (error) {
            console.error('Failed to move asset:', error);
            toast.error(
                `Failed to move asset: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
            throw error;
        }
    };

    const handleDeleteWithFeedback = async (filePath: string) => {
        try {
            await handleDelete(filePath);
            toast.success('Asset deleted successfully');
        } catch (error) {
            console.error('Failed to delete asset:', error);
            toast.error(
                `Failed to delete asset: ${error instanceof Error ? error.message : 'Unknown error'}`,
            );
            throw error;
        }
    };

    const handleAddToChat = async (assetPath: string) => {
        try {
            const fileName = assetPath.split('/').pop() ?? assetPath;
            const mimeType = getMimeType(fileName);

            const fileContent = await branchData?.codeEditor.readFile(assetPath);
            if (!fileContent) {
                throw new Error('Failed to load asset file');
            }

            const base64Content = convertToBase64DataUrl(fileContent, mimeType);

            const imageContext: ImageMessageContext = {
                type: MessageContextType.IMAGE,
                source: 'local',
                path: assetPath,
                branchId: branchId,
                content: base64Content,
                displayName: fileName,
                mimeType: mimeType,
            };

            editorEngine.chat.context.addContexts([imageContext]);
            toast.success('Asset added to chat');
        } catch (error) {
            console.error('Failed to add asset to chat:', error);
            toast.error('Failed to add asset to chat');
        }
    };

    // --- Bulk actions ---------------------------------------------------------

    const handleBulkMove = async (targetFolder: string) => {
        const targets = visibleAssets.filter((asset) => selected.has(asset.path));
        let moved = 0;
        for (const asset of targets) {
            try {
                await handleMove(asset.path, targetFolder);
                moved += 1;
            } catch (moveError) {
                console.error('Failed to move asset:', moveError);
            }
        }
        if (moved > 0) {
            toast.success(`Moved ${moved} asset${moved === 1 ? '' : 's'}`);
        }
        if (moved < targets.length) {
            toast.error(`Failed to move ${targets.length - moved} asset(s)`);
        }
        exitSelectionMode();
    };

    const handleBulkCompress = async () => {
        const codeEditor = branchData?.codeEditor;
        if (!codeEditor) return;

        const targets = visibleAssets.filter(
            (asset) => selected.has(asset.path) && canCompressAsset(asset.name),
        );
        let compressed = 0;
        let savedBytes = 0;
        for (const asset of targets) {
            try {
                const content = await codeEditor.readFile(asset.path);
                if (!(content instanceof Uint8Array)) continue;
                const result = await compressAsset(asset.name, content);
                if (result.compressedSize < result.originalSize) {
                    await handleReplaceAsset(asset.path, result.bytes);
                    compressed += 1;
                    savedBytes += result.originalSize - result.compressedSize;
                }
            } catch (compressError) {
                console.error('Failed to compress asset:', compressError);
            }
        }
        if (compressed > 0) {
            toast.success(`Compressed ${compressed} asset${compressed === 1 ? '' : 's'}`, {
                description: `Saved ${formatBytes(savedBytes)}`,
            });
        } else {
            toast.info('No assets needed compression');
        }
        exitSelectionMode();
    };

    const handleBulkDelete = async () => {
        const paths = [...selected];
        let deleted = 0;
        for (const path of paths) {
            try {
                await handleDelete(path);
                deleted += 1;
            } catch (deleteError) {
                console.error('Failed to delete asset:', deleteError);
            }
        }
        if (deleted > 0) {
            toast.success(`Deleted ${deleted} asset${deleted === 1 ? '' : 's'}`);
        }
        if (deleted < paths.length) {
            toast.error(`Failed to delete ${paths.length - deleted} asset(s)`);
        }
        setBulkDeleteOpen(false);
        exitSelectionMode();
    };

    if (loading) {
        return (
            <div className="flex h-full w-full items-center justify-center gap-2">
                <Icons.LoadingSpinner className="h-4 w-4 animate-spin" />
                Loading assets...
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-small text-destructive flex h-full w-full items-center justify-center">
                Error: {error.message}
            </div>
        );
    }

    return (
        <div className="@container flex h-full w-full flex-col">
            <div className="px-3 pt-3 pb-2">
                <AssetToolbar
                    search={search}
                    setSearch={setSearch}
                    isUploading={isUploading}
                    onUpload={handleUpload}
                    onCreateFolder={handleCreateFolderWithFeedback}
                />
            </div>

            {/* Narrow: folder/type dropdown above the grid. */}
            <div className="px-3 pb-2 @[380px]:hidden">
                <AssetFolderSelect
                    activeType={activeType}
                    setActiveType={setActiveType}
                    activeFolder={activeFolder}
                    setActiveFolder={setActiveFolder}
                    folderTree={folderTree}
                    typeCounts={typeCounts}
                />
            </div>

            {/* Sort + select controls, replaced by the bulk action bar in select mode. */}
            <div className="px-3 pb-2">
                {selectionMode ? (
                    <BulkActionBar
                        selectedCount={selected.size}
                        folderTree={folderTree}
                        onMove={(target) => void handleBulkMove(target)}
                        onCompress={() => void handleBulkCompress()}
                        onDelete={() => setBulkDeleteOpen(true)}
                        onDone={exitSelectionMode}
                    />
                ) : (
                    <div className="flex items-center justify-between gap-2">
                        <AssetSortMenu sort={sort} setSort={setSort} />
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-foreground-secondary hover:text-foreground-primary text-mini h-7 gap-1"
                            onClick={enterSelectionMode}
                            disabled={visibleAssets.length === 0}
                        >
                            <Icons.ListCheck className="h-3.5 w-3.5" />
                            Select
                        </Button>
                    </div>
                )}
            </div>

            {/* Wide: persistent sidebar beside the grid. */}
            <div className="flex min-h-0 flex-1 gap-3 px-3 pb-3">
                <div className="hidden @[380px]:flex">
                    <AssetSidebar
                        activeType={activeType}
                        setActiveType={setActiveType}
                        activeFolder={activeFolder}
                        setActiveFolder={setActiveFolder}
                        folderTree={folderTree}
                        typeCounts={typeCounts}
                    />
                </div>

                <AssetGrid
                    assets={visibleAssets}
                    projectId={projectId}
                    branchId={branchId}
                    search={search}
                    folderTree={folderTree}
                    selectionMode={selectionMode}
                    selected={selected}
                    onToggleSelect={toggle}
                    onUpload={handleUpload}
                    onRename={handleRenameWithFeedback}
                    onMove={handleMoveWithFeedback}
                    onReplaceAsset={handleReplaceAsset}
                    onDelete={handleDeleteWithFeedback}
                    onAddToChat={(path) => void handleAddToChat(path)}
                />
            </div>

            <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Delete {selected.size} asset{selected.size === 1 ? '' : 's'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the selected asset
                            {selected.size === 1 ? '' : 's'}. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => void handleBulkDelete()}
                            className="bg-destructive hover:bg-destructive/90 text-white"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
});
