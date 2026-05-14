import type { FileEntry } from '@weblab/file-system';
import { getAssetType, getMimeType } from '@weblab/utility';

import type { AssetData } from '../types';

export interface FolderTreeNode {
    name: string;
    path: string;
    children: FolderTreeNode[];
}

/** Build the nested directory structure (folders only) from a recursive entry tree. */
export function buildFolderTree(entries: FileEntry[]): FolderTreeNode[] {
    return entries
        .filter((entry) => entry.isDirectory)
        .map((entry) => ({
            name: entry.name,
            path: entry.path,
            children: buildFolderTree(entry.children ?? []),
        }));
}

/** Locate a folder node anywhere in the recursive entry tree by its path. */
function findFolderNode(entries: FileEntry[], folderPath: string): FileEntry | undefined {
    for (const entry of entries) {
        if (!entry.isDirectory) continue;
        if (entry.path === folderPath) return entry;
        const found = findFolderNode(entry.children ?? [], folderPath);
        if (found) return found;
    }
    return undefined;
}

/** Direct children (files + folders) of a folder path within the recursive tree. */
export function getFolderEntries(
    rootEntries: FileEntry[],
    rootPath: string,
    folderPath: string,
): FileEntry[] {
    if (folderPath === rootPath) return rootEntries;
    return findFolderNode(rootEntries, folderPath)?.children ?? [];
}

export interface FlatFolder {
    name: string;
    path: string;
    depth: number;
}

/** Flatten the nested folder tree into a depth-tagged list (for dropdown menus). */
export function flattenFolderTree(nodes: FolderTreeNode[], depth = 0): FlatFolder[] {
    return nodes.flatMap((node) => [
        { name: node.name, path: node.path, depth },
        ...flattenFolderTree(node.children, depth + 1),
    ]);
}

/** Map file entries (non-directories) to classified asset records. */
export function entriesToAssets(entries: FileEntry[]): AssetData[] {
    return entries
        .filter((entry) => !entry.isDirectory)
        .map((entry) => ({
            name: entry.name,
            path: entry.path,
            type: getAssetType(entry.name),
            mimeType: getMimeType(entry.name),
            size: entry.size,
            modifiedTime: entry.modifiedTime,
        }));
}
