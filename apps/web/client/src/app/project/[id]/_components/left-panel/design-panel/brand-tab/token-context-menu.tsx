'use client';

import type { ReactNode } from 'react';
import { observer } from 'mobx-react-lite';

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
        if (row.kind === 'color-alias') await tokens.deleteColorStyle(row.name);
        else if (row.kind === 'text-style') await tokens.deleteTextStyle(row.name);
        else await tokens.deleteVariable(row.name);
    };

    const handleNewGroup = async () => {
        const name = window.prompt('New group name');
        if (!name?.trim()) return;
        await moveTokenToGroup(tokens, row, name.trim());
    };

    return (
        <ContextMenu>
            <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
            <ContextMenuContent className="w-48">
                <ContextMenuItem onSelect={onRename}>Rename</ContextMenuItem>
                <ContextMenuItem onSelect={() => void duplicateToken(tokens, row)}>
                    Duplicate
                </ContextMenuItem>
                <ContextMenuSub>
                    <ContextMenuSubTrigger>Move to group</ContextMenuSubTrigger>
                    <ContextMenuSubContent className="w-44">
                        {otherGroups.map((group) => (
                            <ContextMenuItem
                                key={group}
                                onSelect={() => void moveTokenToGroup(tokens, row, group)}
                            >
                                {group}
                            </ContextMenuItem>
                        ))}
                        {currentGroup && (
                            <ContextMenuItem
                                onSelect={() => void moveTokenToGroup(tokens, row, null)}
                            >
                                Remove from group
                            </ContextMenuItem>
                        )}
                        {(otherGroups.length > 0 || currentGroup) && <ContextMenuSeparator />}
                        <ContextMenuItem onSelect={() => void handleNewGroup()}>
                            New group…
                        </ContextMenuItem>
                    </ContextMenuSubContent>
                </ContextMenuSub>
                <ContextMenuSeparator />
                <ContextMenuItem variant="destructive" onSelect={() => void handleDelete()}>
                    Delete
                </ContextMenuItem>
            </ContextMenuContent>
        </ContextMenu>
    );
});
