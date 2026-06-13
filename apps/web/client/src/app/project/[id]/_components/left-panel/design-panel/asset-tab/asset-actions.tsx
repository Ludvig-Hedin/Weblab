'use client';

import { useTranslations } from 'next-intl';

import {
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
} from '@weblab/ui/context-menu';
import {
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';

import type { AssetData } from './types';

export interface AssetMoveTarget {
    path: string;
    label: string;
}

export interface AssetActionsProps {
    variant: 'dropdown' | 'context';
    asset: AssetData;
    moveTargets: AssetMoveTarget[];
    canCompress: boolean;
    onAddToChat: () => void;
    onCopyUrl: () => void;
    onRename: () => void;
    onMoveTo: (targetFolder: string) => void;
    onCompress: () => void;
    onDelete: () => void;
}

/**
 * The shared action set for an asset, rendered into either the `...` dropdown
 * or the right-click context menu so both stay in sync.
 */
export const AssetActions = ({
    variant,
    asset,
    moveTargets,
    canCompress,
    onAddToChat,
    onCopyUrl,
    onRename,
    onMoveTo,
    onCompress,
    onDelete,
}: AssetActionsProps) => {
    const t = useTranslations('editor.leftPanel.assets');
    const isDropdown = variant === 'dropdown';
    const Item = isDropdown ? DropdownMenuItem : ContextMenuItem;
    const Sub = isDropdown ? DropdownMenuSub : ContextMenuSub;
    const SubTrigger = isDropdown ? DropdownMenuSubTrigger : ContextMenuSubTrigger;
    const SubContent = isDropdown ? DropdownMenuSubContent : ContextMenuSubContent;
    const Separator = isDropdown ? DropdownMenuSeparator : ContextMenuSeparator;

    return (
        <>
            {asset.type === 'image' && (
                <Item className="flex items-center gap-2" onSelect={onAddToChat}>
                    <Icons.Plus className="h-3 w-3" />
                    {t('addToChat')}
                </Item>
            )}
            <Item className="flex items-center gap-2" onSelect={onCopyUrl}>
                <Icons.ClipboardCopy className="h-3 w-3" />
                {t('copyUrl')}
            </Item>
            <Item className="flex items-center gap-2" onSelect={onRename}>
                <Icons.Edit className="h-3 w-3" />
                {t('rename')}
            </Item>
            {moveTargets.length > 0 && (
                <Sub>
                    <SubTrigger className="flex items-center gap-2">
                        <Icons.MoveToFolder className="h-3 w-3" />
                        {t('moveTo')}
                    </SubTrigger>
                    <SubContent>
                        {moveTargets.map((target) => (
                            <Item
                                key={target.path}
                                className="flex items-center gap-2"
                                onSelect={() => onMoveTo(target.path)}
                            >
                                <Icons.File className="h-3 w-3" />
                                {target.label}
                            </Item>
                        ))}
                    </SubContent>
                </Sub>
            )}
            {canCompress && (
                <Item className="flex items-center gap-2" onSelect={onCompress}>
                    <Icons.Scissors className="h-3 w-3" />
                    {t('compress')}
                </Item>
            )}
            <Separator />
            <Item
                className="text-destructive hover:text-destructive focus:text-destructive flex items-center gap-2"
                onSelect={onDelete}
            >
                <Icons.Trash className="h-3 w-3" />
                {t('delete')}
            </Item>
        </>
    );
};
