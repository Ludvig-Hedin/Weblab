'use client';

import { useEffect, useState } from 'react';

import type { EditorFile } from './shared/types';

interface StatusBarProps {
    activeFile: EditorFile | null;
    cursorInfo: { line: number; column: number; selectionLength: number } | null;
    hasUnsavedChanges: boolean;
    lastSavedAt: number | null;
}

const formatRelative = (ts: number, now: number): string => {
    const delta = Math.max(0, now - ts);
    if (delta < 5_000) return 'Saved just now';
    if (delta < 60_000) return `Saved ${Math.round(delta / 1000)}s ago`;
    if (delta < 3_600_000) return `Saved ${Math.round(delta / 60_000)}m ago`;
    return `Saved ${Math.round(delta / 3_600_000)}h ago`;
};

export const StatusBar = ({
    activeFile,
    cursorInfo,
    hasUnsavedChanges,
    lastSavedAt,
}: StatusBarProps) => {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!lastSavedAt) return;
        const id = setInterval(() => setNow(Date.now()), 15_000);
        return () => clearInterval(id);
    }, [lastSavedAt]);

    if (!activeFile) return null;

    const language =
        activeFile.path.split('.').pop()?.toUpperCase() ??
        (activeFile.type === 'binary' ? 'BIN' : 'TXT');

    const savedLabel = lastSavedAt && !hasUnsavedChanges ? formatRelative(lastSavedAt, now) : null;

    return (
        <div className="bg-background-bar border-border-bar text-mini text-foreground-tertiary flex h-6 flex-shrink-0 items-center justify-between gap-3 border-t px-3 select-none">
            <div className="flex min-w-0 items-center gap-3 truncate">
                <span className="truncate">{activeFile.path}</span>
                {hasUnsavedChanges && (
                    <span className="text-foreground-brand flex items-center gap-1">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
                        Unsaved
                    </span>
                )}
                {savedLabel && <span>{savedLabel}</span>}
            </div>
            <div className="flex items-center gap-3">
                {cursorInfo && (
                    <span>
                        Ln {cursorInfo.line}, Col {cursorInfo.column}
                        {cursorInfo.selectionLength > 0 && ` · ${cursorInfo.selectionLength} sel`}
                    </span>
                )}
                <span className="tracking-wide">{language}</span>
            </div>
        </div>
    );
};
