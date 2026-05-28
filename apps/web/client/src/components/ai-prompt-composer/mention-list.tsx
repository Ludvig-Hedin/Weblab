'use client';

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import type { MentionItem } from './types';

interface MentionListProps {
    items: MentionItem[];
    command: (item: MentionItem) => void;
}

export interface MentionListRef {
    onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const MentionList = forwardRef<MentionListRef, MentionListProps>(
    ({ items, command }, ref) => {
        const [selectedIndex, setSelectedIndex] = useState(0);

        useEffect(() => {
            setSelectedIndex(0);
        }, [items]);

        useImperativeHandle(
            ref,
            () => ({
                onKeyDown({ event }) {
                    if (event.key === 'ArrowUp') {
                        setSelectedIndex(
                            (prev) =>
                                (prev - 1 + Math.max(items.length, 1)) % Math.max(items.length, 1),
                        );
                        return true;
                    }
                    if (event.key === 'ArrowDown') {
                        setSelectedIndex((prev) => (prev + 1) % Math.max(items.length, 1));
                        return true;
                    }
                    if (event.key === 'Enter') {
                        const item = items[selectedIndex];
                        if (item) {
                            command(item);
                            return true;
                        }
                        // No match to select — let the editor handle Enter
                        // (newline / submit) instead of swallowing the keypress.
                        return false;
                    }
                    return false;
                },
            }),
            [items, selectedIndex, command],
        );

        if (items.length === 0) {
            return <div className="text-foreground-tertiary px-3 py-2 text-xs">No results</div>;
        }

        return (
            <div className="flex max-h-64 flex-col overflow-y-auto">
                {items.map((item, index) => (
                    <button
                        key={item.id}
                        type="button"
                        className={cn(
                            'flex items-center gap-2 px-3 py-1.5 text-left text-xs',
                            'hover:bg-background-secondary cursor-pointer',
                            index === selectedIndex && 'bg-background-secondary',
                        )}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            command(item);
                        }}
                    >
                        {item.isDirectory ? (
                            <Icons.DirectoryOpen className="text-foreground-tertiary h-3.5 w-3.5 shrink-0" />
                        ) : (
                            <Icons.File className="text-foreground-tertiary h-3.5 w-3.5 shrink-0" />
                        )}
                        <span className="text-foreground-primary truncate">{item.label}</span>
                        {item.label !== item.path && (
                            <span className="text-foreground-tertiary ml-auto shrink-0 truncate pl-4 font-mono">
                                {item.path}
                            </span>
                        )}
                    </button>
                ))}
            </div>
        );
    },
);
MentionList.displayName = 'MentionList';
