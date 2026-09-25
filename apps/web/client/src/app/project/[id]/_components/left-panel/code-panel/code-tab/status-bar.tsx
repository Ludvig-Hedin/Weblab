'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

import { Icons } from '@weblab/ui/icons';

import type { EditorFile } from './shared/types';

interface StatusBarProps {
    activeFile: EditorFile | null;
    cursorInfo: { line: number; column: number; selectionLength: number } | null;
    hasUnsavedChanges: boolean;
    lastSavedAt: number | null;
}

const LANGUAGE_LABELS: Record<string, string> = {
    ts: 'TypeScript',
    tsx: 'TypeScript JSX',
    mts: 'TypeScript',
    cts: 'TypeScript',
    js: 'JavaScript',
    jsx: 'JavaScript JSX',
    mjs: 'JavaScript',
    cjs: 'JavaScript',
    css: 'CSS',
    html: 'HTML',
    json: 'JSON',
    md: 'Markdown',
    mdx: 'MDX',
};

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
    const t = useTranslations('editor.leftPanel.codePanel');
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!lastSavedAt) return;
        const id = setInterval(() => setNow(Date.now()), 15_000);
        return () => clearInterval(id);
    }, [lastSavedAt]);

    if (!activeFile) return null;

    const baseName = activeFile.path.split('/').pop() ?? '';
    const extension = baseName.includes('.')
        ? (baseName.split('.').pop()?.toLowerCase() ?? '')
        : '';
    const language =
        activeFile.type === 'binary'
            ? 'Binary'
            : (LANGUAGE_LABELS[extension] ?? (extension ? extension.toUpperCase() : 'Plain text'));

    const savedLabel = lastSavedAt && !hasUnsavedChanges ? formatRelative(lastSavedAt, now) : null;

    return (
        <div className="bg-background-chrome border-border-bar text-mini text-foreground-tertiary flex h-7 flex-shrink-0 items-center justify-between gap-3 border-t px-4 select-none">
            <div className="flex min-w-0 items-center gap-3 truncate">
                {hasUnsavedChanges ? (
                    <span className="text-foreground-secondary flex items-center gap-1.5">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
                        {t('unsaved')}
                    </span>
                ) : (
                    savedLabel && (
                        <span className="flex items-center gap-1.5">
                            <Icons.Check className="h-3 w-3" />
                            {savedLabel}
                        </span>
                    )
                )}
            </div>
            <div className="flex items-center gap-3">
                {cursorInfo && (
                    <span>
                        Ln {cursorInfo.line}, Col {cursorInfo.column}
                        {cursorInfo.selectionLength > 0 && ` · ${cursorInfo.selectionLength} sel`}
                    </span>
                )}
                <span>{language}</span>
            </div>
        </div>
    );
};
