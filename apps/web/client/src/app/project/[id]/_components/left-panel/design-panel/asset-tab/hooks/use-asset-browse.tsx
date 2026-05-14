import { useMemo, useState } from 'react';

import type { AssetType } from '@weblab/utility';
import { DEFAULT_IMAGE_DIRECTORY } from '@weblab/constants';
import { useDirectory } from '@weblab/file-system/hooks';

import type { AssetData } from '../types';
import type { FolderTreeNode } from '../utils/asset-tree';
import { buildFolderTree, entriesToAssets, getFolderEntries } from '../utils/asset-tree';

/** Root directory that backs the Assets panel. */
export const ASSET_ROOT = DEFAULT_IMAGE_DIRECTORY;

export type AssetTypeFilter = AssetType | 'all';

export type AssetSort =
    | 'name-asc'
    | 'name-desc'
    | 'modified-desc'
    | 'modified-asc'
    | 'size-desc'
    | 'type';

const SORT_COMPARATORS: Record<AssetSort, (a: AssetData, b: AssetData) => number> = {
    'name-asc': (a, b) => a.name.localeCompare(b.name),
    'name-desc': (a, b) => b.name.localeCompare(a.name),
    'modified-desc': (a, b) => (b.modifiedTime?.getTime() ?? 0) - (a.modifiedTime?.getTime() ?? 0),
    'modified-asc': (a, b) => (a.modifiedTime?.getTime() ?? 0) - (b.modifiedTime?.getTime() ?? 0),
    'size-desc': (a, b) => (b.size ?? 0) - (a.size ?? 0),
    type: (a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name),
};

/**
 * Owns the browse state for the Assets panel — active folder, type filter,
 * search query, and sort — and derives the folder tree, type counts, and the
 * visible asset list from a single recursive read of the asset root.
 */
export const useAssetBrowse = (projectId: string, branchId: string) => {
    const [activeFolder, setActiveFolder] = useState<string>(ASSET_ROOT);
    const [activeType, setActiveType] = useState<AssetTypeFilter>('all');
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState<AssetSort>('name-asc');

    const { entries, loading, error } = useDirectory(projectId, branchId, ASSET_ROOT);

    const folderTree = useMemo<FolderTreeNode[]>(() => buildFolderTree(entries), [entries]);

    // Files directly inside the active folder.
    const folderAssets = useMemo<AssetData[]>(() => {
        const folderEntries = getFolderEntries(entries, ASSET_ROOT, activeFolder);
        return entriesToAssets(folderEntries);
    }, [entries, activeFolder]);

    // Asset count per type within the active folder (plus `all`).
    const typeCounts = useMemo<Record<string, number>>(() => {
        const counts: Record<string, number> = { all: folderAssets.length };
        for (const asset of folderAssets) {
            counts[asset.type] = (counts[asset.type] ?? 0) + 1;
        }
        return counts;
    }, [folderAssets]);

    // Active folder assets narrowed by the type filter and search, then sorted.
    const visibleAssets = useMemo<AssetData[]>(() => {
        let list = folderAssets;
        if (activeType !== 'all') {
            list = list.filter((asset) => asset.type === activeType);
        }
        const query = search.trim().toLowerCase();
        if (query) {
            list = list.filter((asset) => asset.name.toLowerCase().includes(query));
        }
        return [...list].sort(SORT_COMPARATORS[sort]);
    }, [folderAssets, activeType, search, sort]);

    return {
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
    };
};
