'use client';

import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

import { cn } from '@weblab/ui/utils';

import type { SlashCommand } from './types';

interface SlashListProps {
    items: SlashCommand[];
    command: (item: SlashCommand) => void;
}

export interface SlashListRef {
    onKeyDown: (props: { event: KeyboardEvent }) => boolean;
}

export const SlashList = forwardRef<SlashListRef, SlashListProps>(({ items, command }, ref) => {
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
                    // No command to select — let the editor handle Enter
                    // (newline / submit) instead of swallowing the keypress.
                    return false;
                }
                return false;
            },
        }),
        [items, selectedIndex, command],
    );

    if (items.length === 0) {
        return <div className="text-foreground-tertiary px-3 py-2 text-xs">No commands found</div>;
    }

    return (
        <div className="flex max-h-64 flex-col overflow-y-auto">
            {items.map((item, index) => {
                const Icon = item.icon;
                return (
                    <button
                        key={item.name}
                        type="button"
                        className={cn(
                            'flex items-center gap-2 px-3 py-1.5 text-left',
                            'hover:bg-background-secondary cursor-pointer',
                            index === selectedIndex && 'bg-background-secondary',
                        )}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            command(item);
                        }}
                    >
                        <Icon className="text-foreground-tertiary h-3.5 w-3.5 shrink-0" />
                        <span className="text-foreground-primary text-xs font-medium">
                            {item.label}
                        </span>
                        <span className="text-foreground-tertiary ml-auto text-xs">
                            {item.description}
                        </span>
                    </button>
                );
            })}
        </div>
    );
});
SlashList.displayName = 'SlashList';
