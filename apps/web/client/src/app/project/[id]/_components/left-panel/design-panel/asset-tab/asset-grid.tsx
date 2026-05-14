'use client';

import type { AssetData } from './types';
import type { FolderTreeNode } from './utils/asset-tree';
import { AssetDragOverlay, AssetDropzone } from './asset-dropzone';
import { AssetItem } from './asset-item';
import { useAssetDragDrop } from './hooks/use-asset-drag-drop';

interface AssetGridProps {
    assets: AssetData[];
    projectId: string;
    branchId: string;
    search: string;
    folderTree: FolderTreeNode[];
    selectionMode: boolean;
    selected: Set<string>;
    onToggleSelect: (assetPath: string) => void;
    onUpload: (files: FileList) => Promise<void>;
    onRename: (oldPath: string, newName: string) => Promise<void>;
    onMove: (assetPath: string, targetFolder: string) => Promise<void>;
    onReplaceAsset: (assetPath: string, bytes: Uint8Array) => Promise<void>;
    onDelete: (filePath: string) => Promise<void>;
    onAddToChat: (assetPath: string) => void;
}

export const AssetGrid = ({
    assets,
    projectId,
    branchId,
    search,
    folderTree,
    selectionMode,
    selected,
    onToggleSelect,
    onUpload,
    onRename,
    onMove,
    onReplaceAsset,
    onDelete,
    onAddToChat,
}: AssetGridProps) => {
    const {
        handleDragEnter,
        handleDragLeave,
        handleDragOver,
        handleDrop,
        isDragging,
        onImageDragStart,
        onImageDragEnd,
        onImageMouseDown,
        onImageMouseUp,
    } = useAssetDragDrop(onUpload);

    const isEmpty = assets.length === 0;

    return (
        <div
            className="relative h-full flex-1 overflow-auto"
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
        >
            {isEmpty ? (
                <AssetDropzone isDragging={isDragging} hasSearch={!!search} onUpload={onUpload} />
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-2 @[480px]:grid-cols-3">
                        {assets.map((asset) => (
                            <AssetItem
                                key={asset.path}
                                asset={asset}
                                projectId={projectId}
                                branchId={branchId}
                                folderTree={folderTree}
                                selectionMode={selectionMode}
                                isSelected={selected.has(asset.path)}
                                onToggleSelect={() => onToggleSelect(asset.path)}
                                onImageDragStart={onImageDragStart}
                                onImageDragEnd={onImageDragEnd}
                                onImageMouseDown={onImageMouseDown}
                                onImageMouseUp={onImageMouseUp}
                                onRename={onRename}
                                onMove={onMove}
                                onReplaceAsset={onReplaceAsset}
                                onDelete={onDelete}
                                onAddToChat={onAddToChat}
                            />
                        ))}
                    </div>
                    {isDragging && <AssetDragOverlay />}
                </>
            )}
        </div>
    );
};
