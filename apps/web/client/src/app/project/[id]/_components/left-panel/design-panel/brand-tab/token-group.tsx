'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';

import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuTrigger,
} from '@weblab/ui/context-menu';
import { cn } from '@weblab/ui/utils';

import type { TokenGroupData } from './lib/group-tokens';
import type { ConfirmFn } from './lib/token-mutations';
import { useEditorEngine } from '@/components/store/editor';
import { deleteGroup, renameGroup } from './lib/group-ops';
import { TokenRow } from './token-row';

export interface TokenGroupProps {
    group: TokenGroupData;
    expandedName: string | null;
    onToggleRow: (name: string) => void;
    confirm: ConfirmFn;
    /** Sibling group labels in the same section — for "Move to group". */
    groupLabels: string[];
}

/**
 * Collapsible group header + its rows. Groups are derived from token names
 * (see `group-tokens.ts`); right-click the header to rename or delete the
 * whole group (name-prefix rewrites — see `group-ops.ts`).
 */
export function TokenGroup({
    group,
    expandedName,
    onToggleRow,
    confirm,
    groupLabels,
}: TokenGroupProps) {
    const editorEngine = useEditorEngine();
    const tokens = editorEngine.tokens;
    const [open, setOpen] = useState(true);

    const handleRenameGroup = async () => {
        const name = window.prompt('Rename group', group.label);
        if (!name?.trim() || name.trim() === group.label) return;
        await renameGroup(tokens, group.rows, name.trim());
    };

    const handleDeleteGroup = async () => {
        const ok = await confirm({
            title: `Delete group “${group.label}”?`,
            description: `All ${group.rows.length} token(s) in this group will be removed from globals.css and cannot be undone.`,
            confirmLabel: 'Delete group',
            destructive: true,
        });
        if (!ok) return;
        await deleteGroup(tokens, group.rows);
    };

    return (
        <div className="flex flex-col">
            <ContextMenu>
                <ContextMenuTrigger asChild>
                    <button
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        aria-expanded={open}
                        className="text-foreground-secondary hover:text-foreground-primary flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left transition-colors"
                    >
                        <ChevronRight
                            className={cn(
                                'text-muted-foreground size-3 shrink-0 transition-transform duration-150',
                                open && 'rotate-90',
                            )}
                        />
                        <span className="text-mini min-w-0 flex-1 truncate font-medium">
                            {group.label}
                        </span>
                        <span className="text-foreground-tertiary text-micro shrink-0 tabular-nums">
                            {group.rows.length}
                        </span>
                    </button>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-44">
                    <ContextMenuItem onSelect={() => void handleRenameGroup()}>
                        Rename group
                    </ContextMenuItem>
                    <ContextMenuItem
                        variant="destructive"
                        onSelect={() => void handleDeleteGroup()}
                    >
                        Delete group
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>
            {open && (
                <div className="flex flex-col gap-0.5 pl-3">
                    {group.rows.map((row) => (
                        <TokenRow
                            key={row.name}
                            row={row}
                            expanded={expandedName === row.name}
                            onToggle={() => onToggleRow(row.name)}
                            confirm={confirm}
                            groupLabels={groupLabels}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
