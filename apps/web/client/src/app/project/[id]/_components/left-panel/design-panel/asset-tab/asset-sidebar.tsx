'use client';

import { useState } from 'react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@weblab/ui/collapsible';
import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import type { AssetTypeFilter } from './hooks/use-asset-browse';
import type { FolderTreeNode } from './utils/asset-tree';
import { ASSET_ROOT } from './hooks/use-asset-browse';
import { ASSET_TYPE_LABEL, getAssetTypeIcon, TYPE_FILTER_ORDER } from './utils/asset-display';

interface AssetSidebarProps {
    activeType: AssetTypeFilter;
    setActiveType: (type: AssetTypeFilter) => void;
    activeFolder: string;
    setActiveFolder: (path: string) => void;
    folderTree: FolderTreeNode[];
    typeCounts: Record<string, number>;
}

interface RowProps {
    icon: React.ComponentType<{ className?: string }>;
    label: string;
    count?: number;
    active: boolean;
    onClick: () => void;
}

const SidebarRow = ({ icon: Icon, label, count, active, onClick }: RowProps) => (
    <button
        type="button"
        onClick={onClick}
        className={cn(
            'text-mini flex h-7 w-full items-center gap-1.5 rounded-md px-2 transition-colors duration-150',
            active
                ? 'bg-background-bar-active text-foreground-primary'
                : 'text-foreground-secondary hover:bg-background-bar-active hover:text-foreground-primary',
        )}
    >
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="flex-1 truncate text-left">{label}</span>
        {count !== undefined && (
            <span className="text-foreground-tertiary tabular-nums">{count}</span>
        )}
    </button>
);

interface FolderRowProps {
    node: FolderTreeNode;
    depth: number;
    activeFolder: string;
    setActiveFolder: (path: string) => void;
}

const FolderRow = ({ node, depth, activeFolder, setActiveFolder }: FolderRowProps) => {
    const [open, setOpen] = useState(false);
    const hasChildren = node.children.length > 0;
    const active = activeFolder === node.path;

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <div
                className={cn(
                    'text-mini flex h-7 w-full items-center gap-1 rounded-md pr-2 transition-colors duration-150',
                    active
                        ? 'bg-background-bar-active text-foreground-primary'
                        : 'text-foreground-secondary hover:bg-background-bar-active hover:text-foreground-primary',
                )}
                style={{ paddingLeft: 4 + depth * 12 }}
            >
                {hasChildren ? (
                    <CollapsibleTrigger asChild>
                        <button
                            type="button"
                            aria-label={open ? 'Collapse folder' : 'Expand folder'}
                            className="text-foreground-tertiary hover:text-foreground-primary flex h-4 w-4 shrink-0 items-center justify-center"
                        >
                            <Icons.ChevronRight
                                className={cn('h-3 w-3 transition-transform', open && 'rotate-90')}
                            />
                        </button>
                    </CollapsibleTrigger>
                ) : (
                    <span className="h-4 w-4 shrink-0" />
                )}
                <button
                    type="button"
                    onClick={() => setActiveFolder(node.path)}
                    className="flex flex-1 items-center gap-1.5 overflow-hidden"
                >
                    <Icons.File className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate text-left">{node.name}</span>
                </button>
            </div>
            {hasChildren && (
                <CollapsibleContent>
                    {node.children.map((child) => (
                        <FolderRow
                            key={child.path}
                            node={child}
                            depth={depth + 1}
                            activeFolder={activeFolder}
                            setActiveFolder={setActiveFolder}
                        />
                    ))}
                </CollapsibleContent>
            )}
        </Collapsible>
    );
};

export const AssetSidebar = ({
    activeType,
    setActiveType,
    activeFolder,
    setActiveFolder,
    folderTree,
    typeCounts,
}: AssetSidebarProps) => {
    return (
        <div className="border-border-primary flex w-40 shrink-0 flex-col gap-0.5 overflow-y-auto border-r pr-2">
            <SidebarRow
                icon={Icons.ViewGrid}
                label="All assets"
                count={typeCounts.all ?? 0}
                active={activeType === 'all'}
                onClick={() => setActiveType('all')}
            />
            {TYPE_FILTER_ORDER.filter((type) => (typeCounts[type] ?? 0) > 0).map((type) => (
                <SidebarRow
                    key={type}
                    icon={getAssetTypeIcon(type)}
                    label={ASSET_TYPE_LABEL[type]}
                    count={typeCounts[type] ?? 0}
                    active={activeType === type}
                    onClick={() => setActiveType(type)}
                />
            ))}

            <div className="border-border-primary my-1.5 border-t" />

            <SidebarRow
                icon={Icons.File}
                label="No folder"
                active={activeFolder === ASSET_ROOT}
                onClick={() => setActiveFolder(ASSET_ROOT)}
            />
            {folderTree.map((node) => (
                <FolderRow
                    key={node.path}
                    node={node}
                    depth={0}
                    activeFolder={activeFolder}
                    setActiveFolder={setActiveFolder}
                />
            ))}
        </div>
    );
};
