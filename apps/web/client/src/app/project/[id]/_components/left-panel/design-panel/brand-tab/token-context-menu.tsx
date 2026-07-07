'use client';

import type { ReactNode } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
    ContextMenuTrigger,
} from '@weblab/ui/context-menu';
import { toast } from '@weblab/ui/sonner';

import type { TokenRowData } from './lib/group-tokens';
import type { ConfirmFn } from './lib/token-mutations';
import { useEditorEngine } from '@/components/store/editor';
import { duplicateToken, moveTokenToGroup, parseTokenName } from './lib/group-ops';
import { slugify } from './lib/token-mutations';

export interface TokenContextMenuProps {
    row: TokenRowData;
    /** Existing group labels in the same section — the "Move to group" targets. */
    groupLabels: string[];
    /** Open the inline editor (also the "Rename" action's target). */
    onRename: () => void;
    confirm: ConfirmFn;
    children: ReactNode;
}

/**
 * Right-click menu for a token row — Rename / Duplicate / Move to group /
 * Delete. Move/new-group are name-prefix rewrites (see `group-ops.ts`); delete
 * always confirms.
 */
export const TokenContextMenu = observer(function TokenContextMenu({
    row,
    groupLabels,
    onRename,
    confirm,
    children,
}: TokenContextMenuProps) {
    const t = useTranslations('editor.leftPanel.brand');
    const editorEngine = useEditorEngine();
    const tokens = editorEngine.tokens;
    const currentGroup = parseTokenName(row.name, row.kind === 'text-style').group;
    // `currentGroup` comes from the raw `-` name (lowercase); `groupLabels`
    // come from `splitGroupLeaf(displayName)` (capitalized). Compare on slug
    // so the token's own group doesn't show as a (no-op) target.
    const currentGroupSlug = currentGroup ? slugify(currentGroup) : null;
    const otherGroups = groupLabels.filter((group) => slugify(group) !== currentGroupSlug);

    const handleDelete = async () => {
        const ok = await confirm({
            title: `Delete “${row.label}”?`,
            description: 'This token will be removed from globals.css and cannot be undone.',
            confirmLabel: 'Delete',
            destructive: true,
        });
        if (!ok) return;
        try {
            if (row.kind === 'color-alias') await tokens.deleteColorStyle(row.name);
            else if (row.kind === 'text-style') await tokens.deleteTextStyle(row.name);
            else await tokens.deleteVariable(row.name);
        } catch (error) {
            console.error('Failed to delete token:', error);
            toast.error('Failed to delete token', {
                description: error instanceof Error ? error.message : 'Please try again.',
            });
        }
    };

    const handleDuplicate = async () => {
        try {
            await duplicateToken(tokens, row);
        } catch (error) {
            console.error('Failed to duplicate token:', error);
            toast.error('Failed to duplicate token', {
                description: error instanceof Error ? error.message : 'Please try again.',
            });
        }
    };

    const handleMove = async (group: string | null) => {
        try {
            await moveTokenToGroup(tokens, row, group);
        } catch (error) {
            console.error('Failed to move token:', error);
            toast.error('Failed to move token', {
                description: error instanceof Error ? error.message : 'Please try again.',
            });
        }
    };

    // TODO(B16): `window.prompt` is a native blocking dialog. No small
    // text-input dialog primitive exists in this panel yet (`useConfirm` is
    // confirm-only) — swap in a Dialog-based prompt when one lands.
    const handleNewGroup = async () => {
        const name = window.prompt('New group name');
        if (!name?.trim()) return;
        await handleMove(name.trim());
    };

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
            <ContextMenuContent className="w-48">
                <ContextMenuItem onSelect={onRename}>{t('tokenRename')}</ContextMenuItem>
                <ContextMenuItem onSelect={() => void handleDuplicate()}>
                    {t('tokenDuplicate')}
                </ContextMenuItem>
                <ContextMenuSub>
                    <ContextMenuSubTrigger>{t('tokenMoveToGroup')}</ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-44">
                        {otherGroups.map((group) => (
                            <ContextMenuItem key={group} onSelect={() => void handleMove(group)}>
                                {group}
                            </ContextMenuItem>
                        ))}
                        {currentGroup && (
                            <ContextMenuItem onSelect={() => void handleMove(null)}>
                                {t('tokenRemoveFromGroup')}
                            </ContextMenuItem>
                        )}
                        {(otherGroups.length > 0 || currentGroup) && <ContextMenuSeparator />}
                        <ContextMenuItem onSelect={() => void handleNewGroup()}>
                            {t('tokenNewGroup')}
                        </ContextMenuItem>
                    </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSeparator />
                <ContextMenuItem variant="destructive" onSelect={() => void handleDelete()}>
                    {t('tokenDelete')}
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
});
