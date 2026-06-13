'use client';

import { useTranslations } from 'next-intl';

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';

import type { AssetTypeFilter } from './hooks/use-asset-browse';
import type { FolderTreeNode } from './utils/asset-tree';
import { ASSET_ROOT } from './hooks/use-asset-browse';
import { ASSET_TYPE_LABEL, getAssetTypeIcon, TYPE_FILTER_ORDER } from './utils/asset-display';
import { flattenFolderTree } from './utils/asset-tree';

interface AssetFolderSelectProps {
    activeType: AssetTypeFilter;
    setActiveType: (type: AssetTypeFilter) => void;
    activeFolder: string;
    setActiveFolder: (path: string) => void;
    folderTree: FolderTreeNode[];
    typeCounts: Record<string, number>;
}

export const AssetFolderSelect = ({
    activeType,
    setActiveType,
    activeFolder,
    setActiveFolder,
    folderTree,
    typeCounts,
}: AssetFolderSelectProps) => {
    const t = useTranslations('editor.leftPanel.assets');
    const flatFolders = flattenFolderTree(folderTree);
    const activeFolderName =
        activeFolder === ASSET_ROOT
            ? t('noFolder')
            : (flatFolders.find((folder) => folder.path === activeFolder)?.name ?? t('noFolder'));

    const TriggerIcon = activeType === 'all' ? Icons.ViewGrid : getAssetTypeIcon(activeType);
    const triggerLabel =
        activeType === 'all'
            ? activeFolder === ASSET_ROOT
                ? t('allAssets')
                : activeFolderName
            : ASSET_TYPE_LABEL[activeType];

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <button
                    type="button"
                    className="border-border-primary bg-background-secondary hover:border-border-weblab text-mini text-foreground-primary flex h-8 w-full items-center justify-between gap-2 rounded-md border px-2.5 transition-colors"
                >
                    <span className="flex items-center gap-1.5 overflow-hidden">
                        <TriggerIcon className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{triggerLabel}</span>
                    </span>
                    <Icons.ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
                </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuRadioGroup
                    value={activeType}
                    onValueChange={(value) => setActiveType(value as AssetTypeFilter)}
                >
                    <DropdownMenuRadioItem value="all" className="gap-2">
                        <Icons.ViewGrid className="h-3.5 w-3.5" />
                        <span className="flex-1">{t('allAssets')}</span>
                        <span className="text-foreground-tertiary tabular-nums">
                            {typeCounts.all ?? 0}
                        </span>
                    </DropdownMenuRadioItem>
                    {TYPE_FILTER_ORDER.filter((type) => (typeCounts[type] ?? 0) > 0).map((type) => {
                        const TypeIcon = getAssetTypeIcon(type);
                        return (
                            <DropdownMenuRadioItem key={type} value={type} className="gap-2">
                                <TypeIcon className="h-3.5 w-3.5" />
                                <span className="flex-1">{ASSET_TYPE_LABEL[type]}</span>
                                <span className="text-foreground-tertiary tabular-nums">
                                    {typeCounts[type] ?? 0}
                                </span>
                            </DropdownMenuRadioItem>
                        );
                    })}
                </DropdownMenuRadioGroup>

                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-foreground-tertiary text-mini">
                    {t('folders')}
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                    value={activeFolder}
                    onValueChange={(value) => setActiveFolder(value)}
                >
                    <DropdownMenuRadioItem value={ASSET_ROOT} className="gap-2">
                        <Icons.File className="h-3.5 w-3.5" />
                        {t('noFolder')}
                    </DropdownMenuRadioItem>
                    {flatFolders.map((folder) => (
                        <DropdownMenuRadioItem
                            key={folder.path}
                            value={folder.path}
                            className="gap-2"
                            style={{ paddingLeft: 8 + (folder.depth + 1) * 12 }}
                        >
                            <Icons.File className="h-3.5 w-3.5" />
                            {folder.name}
                        </DropdownMenuRadioItem>
                    ))}
                </DropdownMenuRadioGroup>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};
