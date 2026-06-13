'use client';

import type { NodeApi, RowRendererProps, TreeApi } from 'react-arborist';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Tree } from 'react-arborist';
import useResizeObserver from 'use-resize-observer';

import { type FileEntry } from '@weblab/file-system/hooks';
import { pathsEqual } from '@weblab/utility';

import { FileTreeNode } from './file-tree-node';
import { FileTreeRow } from './file-tree-row';
import { FileTreeSearch } from './file-tree-search';

interface FileTreeProps {
    onFileSelect: (filePath: string, searchTerm?: string) => void;
    onDeleteFile: (path: string) => void;
    onRenameFile: (oldPath: string, newName: string) => void;
    onRefresh: () => void;
    fileEntries: FileEntry[];
    isLoading: boolean;
    selectedFilePath: string | null | undefined;
    onAddToChat: (filePath: string) => void;
}

export const FileTree = ({
    onFileSelect,
    onDeleteFile,
    onRenameFile,
    onRefresh,
    fileEntries,
    isLoading,
    selectedFilePath,
    onAddToChat,
}: FileTreeProps) => {
    const t = useTranslations('editor.leftPanel.codePanel');
    const treeRef = useRef<TreeApi<FileEntry>>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
    const { ref: resizeObserverRef, width: filesWidth, height: filesHeight } = useResizeObserver();

    // Create flat entry index for efficient operations
    const flatEntryIndex = useMemo(() => {
        const flatIndex = new Map<string, FileEntry>();

        const flattenEntries = (entries: FileEntry[]) => {
            for (const entry of entries) {
                flatIndex.set(entry.path, entry);
                if (entry.children) {
                    flattenEntries(entry.children);
                }
            }
        };

        flattenEntries(fileEntries);
        return flatIndex;
    }, [fileEntries]);

    // Sync tree selection with selected file
    useEffect(() => {
        if (!treeRef.current || !fileEntries.length) {
            return;
        }

        if (!selectedFilePath) {
            // Clear selection when no file is selected
            treeRef.current.deselectAll();
            return;
        }

        // Find the entry that matches the file using robust path comparison
        let targetEntry: FileEntry | null = null;
        for (const [path, entry] of flatEntryIndex) {
            if (!entry.isDirectory && pathsEqual(path, selectedFilePath)) {
                targetEntry = entry;
                break;
            }
        }
        if (targetEntry) {
            treeRef.current.select(targetEntry.path);
            treeRef.current.scrollTo(targetEntry.path);
        }
    }, [selectedFilePath, fileEntries, flatEntryIndex]);

    const filteredFiles = useMemo(() => {
        if (!searchQuery.trim()) {
            return fileEntries;
        }

        const searchLower = searchQuery.toLowerCase();
        const matchingPaths = new Set<string>();

        // Find all matching entries using flat index
        for (const [path, entry] of flatEntryIndex) {
            const nameMatches = entry.name.toLowerCase().includes(searchLower);
            const pathMatches = path.toLowerCase().includes(searchLower);

            if (nameMatches || pathMatches) {
                matchingPaths.add(path);

                // Add all parent paths to ensure they're included
                const pathSegments = path.split('/').filter(Boolean);
                for (let i = 1; i < pathSegments.length; i++) {
                    const parentPath = '/' + pathSegments.slice(0, i).join('/');
                    matchingPaths.add(parentPath);
                }
            }
        }

        // Build filtered tree structure
        const filterEntries = (entries: FileEntry[]): FileEntry[] => {
            return entries.reduce<FileEntry[]>((filtered, entry) => {
                if (matchingPaths.has(entry.path)) {
                    const newEntry = { ...entry };
                    if (entry.children) {
                        newEntry.children = filterEntries(entry.children);
                    }
                    filtered.push(newEntry);
                }
                return filtered;
            }, []);
        };

        return filterEntries(fileEntries);
    }, [fileEntries, flatEntryIndex, searchQuery]);

    // Handle keyboard navigation
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            setSearchQuery('');
            setHighlightedIndex(null);
            return;
        }

        const flattenedNodes = treeRef.current?.visibleNodes ?? [];

        if (flattenedNodes.length === 0) {
            return;
        }

        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();

            if (highlightedIndex === null) {
                setHighlightedIndex(e.key === 'ArrowDown' ? 0 : flattenedNodes.length - 1);
                return;
            }

            const newIndex =
                e.key === 'ArrowDown'
                    ? Math.min(highlightedIndex + 1, flattenedNodes.length - 1)
                    : Math.max(highlightedIndex - 1, 0);

            setHighlightedIndex(newIndex);

            // Ensure highlighted item is visible
            const node = flattenedNodes[newIndex];
            if (node) {
                treeRef.current?.scrollTo(node.id);
            }
        }

        if (e.key === 'Enter' && highlightedIndex !== null) {
            const selectedNode = flattenedNodes[highlightedIndex];
            if (selectedNode && !selectedNode.isInternal && !selectedNode.data.isDirectory) {
                const hasSearchTerm = searchQuery.trim().length > 0;
                onFileSelect(selectedNode.data.path, hasSearchTerm ? searchQuery : undefined);
                setHighlightedIndex(null);
            }
        }
    };

    const handleFileTreeSelect = (nodes: NodeApi<FileEntry>[]) => {
        if (nodes.length > 0 && !nodes[0]?.data.isDirectory && nodes[0]?.data.path) {
            const hasSearchTerm = searchQuery.trim().length > 0;
            onFileSelect(nodes[0].data.path, hasSearchTerm ? searchQuery : undefined);
        }
    };

    const filesTreeDimensions = useMemo(
        () => ({
            width: filesWidth ?? 224, // Match w-56 container width (224px)
            height: (filesHeight ?? 300) - 50,
        }),
        [filesWidth, filesHeight],
    );

    return (
        <div className="bg-background-chrome border-border-bar flex h-full w-56 flex-col border-r">
            <FileTreeSearch
                ref={inputRef}
                searchQuery={searchQuery}
                isLoading={isLoading}
                onSearchChange={setSearchQuery}
                onRefresh={onRefresh}
                onKeyDown={handleKeyDown}
            />
            <div ref={resizeObserverRef} className="text-mini min-h-0 w-full flex-1 px-2">
                {isLoading ? (
                    <div className="text-foreground-tertiary text-small flex h-full flex-col items-center justify-start pt-4">
                        <div className="border-foreground-hover mb-2 h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"></div>
                        <span>{t('loadingFiles')}</span>
                    </div>
                ) : filteredFiles.length === 0 ? (
                    <div className="text-foreground-tertiary text-small flex h-full flex-col items-center justify-start pt-4">
                        {fileEntries.length === 0 ? t('noFilesFound') : t('noFilesMatch')}
                    </div>
                ) : (
                    <Tree
                        ref={treeRef}
                        data={filteredFiles}
                        className="h-full overflow-hidden"
                        idAccessor={(entry: FileEntry) => entry.path}
                        childrenAccessor={(entry: FileEntry) =>
                            entry.children && entry.children.length > 0 ? entry.children : null
                        }
                        onSelect={handleFileTreeSelect}
                        height={filesTreeDimensions.height}
                        width={filesTreeDimensions.width}
                        indent={8}
                        rowHeight={24}
                        openByDefault={false}
                        renderRow={(props: RowRendererProps<FileEntry>) => (
                            <FileTreeRow
                                {...props}
                                isHighlighted={
                                    highlightedIndex !== null &&
                                    treeRef.current?.visibleNodes[highlightedIndex]?.id ===
                                        props.node.id
                                }
                            />
                        )}
                    >
                        {(props) => (
                            <FileTreeNode
                                {...props}
                                onFileSelect={onFileSelect}
                                onRenameFile={onRenameFile}
                                onDeleteFile={onDeleteFile}
                                onAddToChat={onAddToChat}
                            />
                        )}
                    </Tree>
                )}
            </div>
        </div>
    );
};
