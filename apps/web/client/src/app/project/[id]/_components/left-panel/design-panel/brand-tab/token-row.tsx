'use client';

import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import type { TokenRowData } from './lib/group-tokens';
import type { ConfirmFn } from './lib/token-mutations';
import { TokenContextMenu } from './token-context-menu';
import { TokenEditor } from './token-editor';

function RowGlyph({ row }: { row: TokenRowData }) {
    if (row.kind === 'color' || row.kind === 'color-alias') {
        return (
            <span
                aria-hidden
                className="border-border size-3.5 shrink-0 rounded-full border"
                style={{ backgroundColor: row.value }}
            />
        );
    }
    const glyph = row.kind === 'text-style' ? 'Aa' : row.kind === 'dimension' ? '#' : '·';
    return (
        <span
            aria-hidden
            className="border-border text-foreground-tertiary flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border font-mono text-[8px] leading-none"
        >
            {glyph}
        </span>
    );
}

export interface TokenRowProps {
    row: TokenRowData;
    expanded: boolean;
    onToggle: () => void;
    confirm: ConfirmFn;
    /** Sibling group labels in the same section — for "Move to group". */
    groupLabels: string[];
}

/**
 * Compact, single-line token row — swatch/glyph + one name + value. Click to
 * expand the inline editor (progressive disclosure); right-click for
 * rename / duplicate / move-to-group / delete.
 */
export function TokenRow({ row, expanded, onToggle, confirm, groupLabels }: TokenRowProps) {
    const trailing = row.kind === 'color-alias' ? null : row.value;
    return (
        <div className="flex flex-col">
            <TokenContextMenu
                row={row}
                groupLabels={groupLabels}
                onRename={() => {
                    if (!expanded) onToggle();
                }}
                confirm={confirm}
            >
                <button
                    type="button"
                    onClick={onToggle}
                    aria-expanded={expanded}
                    className={cn(
                        'group/row hover:bg-background-secondary flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-150',
                        expanded && 'bg-background-secondary',
                    )}
                >
                    <RowGlyph row={row} />
                    <span className="text-foreground-primary text-mini min-w-0 flex-1 truncate">
                        {row.label}
                    </span>
                    {row.aliasLabel && (
                        <span className="text-foreground-tertiary text-micro min-w-0 shrink truncate">
                            → {row.aliasLabel}
                        </span>
                    )}
                    {trailing && (
                        <span className="text-foreground-secondary text-micro shrink-0 truncate">
                            {trailing}
                        </span>
                    )}
                    {row.darkValue != null && (
                        <Icons.Moon
                            aria-label="Has a dark-mode value"
                            className="text-foreground-tertiary size-3 shrink-0"
                        />
                    )}
                </button>
            </TokenContextMenu>
            {expanded && <TokenEditor row={row} onClose={onToggle} confirm={confirm} />}
        </div>
    );
}
