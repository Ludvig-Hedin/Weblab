'use client';

import { useState } from 'react';
import { Moon, Sun } from 'lucide-react';

import { cn } from '@weblab/ui/utils';

import type { TokenRowData } from './lib/group-tokens';
import type { ConfirmFn } from './lib/token-mutations';
import { TokenContextMenu } from './token-context-menu';
import { TokenEditor } from './token-editor';

function RowGlyph({ row, colorValue }: { row: TokenRowData; colorValue: string }) {
    if (row.kind === 'color' || row.kind === 'color-alias') {
        return (
            <span
                aria-hidden
                className="border-border size-3.5 shrink-0 rounded-full border"
                style={{ backgroundColor: colorValue }}
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
 * expand the inline editor; the `☀/◐` toggle swaps the displayed value between
 * light and dark; right-click for rename / duplicate / move-to-group / delete.
 */
export function TokenRow({ row, expanded, onToggle, confirm, groupLabels }: TokenRowProps) {
    const hasDark = row.darkValue != null;
    const [showDark, setShowDark] = useState(false);
    const isDark = showDark && hasDark;
    const activeValue = isDark ? (row.darkValue ?? row.value) : row.value;
    const trailing = row.kind === 'color-alias' ? null : activeValue;

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
                <div
                    className={cn(
                        'group/row hover:bg-background-secondary flex w-full items-center gap-1 rounded-md pr-1 transition-colors duration-150',
                        expanded && 'bg-background-secondary',
                    )}
                >
                    <button
                        type="button"
                        onClick={onToggle}
                        aria-expanded={expanded}
                        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left"
                    >
                        <RowGlyph row={row} colorValue={activeValue} />
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
                    </button>
                    {hasDark && (
                        <button
                            type="button"
                            onClick={() => setShowDark((v) => !v)}
                            aria-label={isDark ? 'Show light value' : 'Show dark value'}
                            aria-pressed={isDark}
                            className="text-foreground-tertiary hover:bg-foreground/10 hover:text-foreground-primary flex size-5 shrink-0 items-center justify-center rounded transition-colors"
                        >
                            {isDark ? <Sun className="size-3" /> : <Moon className="size-3" />}
                        </button>
                    )}
                </div>
            </TokenContextMenu>
            {expanded && <TokenEditor row={row} onClose={onToggle} confirm={confirm} />}
        </div>
    );
}
