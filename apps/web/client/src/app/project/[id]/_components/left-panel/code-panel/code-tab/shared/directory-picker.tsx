'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import type { FileEntry } from '@weblab/file-system/hooks';
import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';

import { transKeys } from '@/i18n/keys';

interface DirectoryPickerProps {
    entries: FileEntry[];
    selectedPath: string;
    onSelect: (path: string) => void;
    disabled?: boolean;
}

interface DirectoryNode {
    name: string;
    path: string;
    children: DirectoryNode[];
}

const buildDirectoryTree = (entries: FileEntry[]): DirectoryNode[] => {
    return entries
        .filter((entry) => entry.isDirectory)
        .map((entry) => ({
            name: entry.name,
            path: entry.path,
            children: entry.children ? buildDirectoryTree(entry.children) : [],
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
};

const expandAncestors = (
    nodes: DirectoryNode[],
    targetPath: string,
    open: Set<string>,
): boolean => {
    for (const node of nodes) {
        if (node.path === targetPath) {
            open.add(node.path);
            return true;
        }
        if (expandAncestors(node.children, targetPath, open)) {
            open.add(node.path);
            return true;
        }
    }
    return false;
};

const Row = ({
    node,
    depth,
    selectedPath,
    expanded,
    toggle,
    onSelect,
    disabled,
}: {
    node: DirectoryNode;
    depth: number;
    selectedPath: string;
    expanded: Set<string>;
    toggle: (path: string) => void;
    onSelect: (path: string) => void;
    disabled?: boolean;
}) => {
    const t = useTranslations();
    const isOpen = expanded.has(node.path);
    const isSelected = selectedPath === node.path;
    const hasChildren = node.children.length > 0;

    return (
        <div>
            <div
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-current={isSelected ? 'true' : undefined}
                onClick={() => !disabled && onSelect(node.path)}
                onKeyDown={(e) => {
                    if (disabled) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(node.path);
                    }
                }}
                className={cn(
                    'text-small flex h-7 cursor-pointer items-center gap-1 rounded-sm px-1 select-none',
                    isSelected
                        ? 'bg-background-bar-active text-foreground-primary'
                        : 'text-foreground-secondary hover:bg-background-bar-active/50 hover:text-foreground-primary',
                    disabled && 'cursor-not-allowed opacity-50',
                )}
                style={{ paddingLeft: depth * 12 + 4 }}
            >
                <button
                    type="button"
                    aria-label={
                        isOpen
                            ? t(transKeys.editor.panels.code.directoryPicker.collapse)
                            : t(transKeys.editor.panels.code.directoryPicker.expand)
                    }
                    onClick={(e) => {
                        e.stopPropagation();
                        if (hasChildren) toggle(node.path);
                    }}
                    className="flex h-4 w-4 items-center justify-center"
                    disabled={(disabled ?? false) || !hasChildren}
                    tabIndex={-1}
                >
                    {hasChildren ? (
                        <Icons.ChevronRight
                            className={cn(
                                'text-foreground-tertiary h-3 w-3 transition-transform',
                                isOpen && 'rotate-90',
                            )}
                        />
                    ) : null}
                </button>
                {isOpen && hasChildren ? (
                    <Icons.DirectoryOpen className="h-4 w-4 shrink-0" />
                ) : (
                    <Icons.Directory className="h-4 w-4 shrink-0" />
                )}
                <span className="truncate">{node.name}</span>
            </div>
            {isOpen &&
                node.children.map((child) => (
                    <Row
                        key={child.path}
                        node={child}
                        depth={depth + 1}
                        selectedPath={selectedPath}
                        expanded={expanded}
                        toggle={toggle}
                        onSelect={onSelect}
                        disabled={disabled}
                    />
                ))}
        </div>
    );
};

export const DirectoryPicker = ({
    entries,
    selectedPath,
    onSelect,
    disabled,
}: DirectoryPickerProps) => {
    const t = useTranslations();
    const tree = useMemo(() => buildDirectoryTree(entries), [entries]);
    const [expanded, setExpanded] = useState<Set<string>>(() => {
        const initial = new Set<string>();
        if (selectedPath) expandAncestors(tree, selectedPath, initial);
        return initial;
    });

    useEffect(() => {
        if (!selectedPath) return;
        setExpanded((prev) => {
            const next = new Set(prev);
            expandAncestors(tree, selectedPath, next);
            return next;
        });
    }, [selectedPath, tree]);

    const toggle = (path: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(path)) next.delete(path);
            else next.add(path);
            return next;
        });
    };

    const isRootSelected = selectedPath === '' || selectedPath === '/';
    const displayPath = selectedPath === '' || selectedPath === '/' ? '/' : `/${selectedPath}`;

    return (
        <div className="flex flex-col gap-1.5">
            <div className="text-foreground-tertiary text-mini">
                {t(transKeys.editor.panels.code.directoryPicker.selected)}{' '}
                <code className="bg-background-secondary text-foreground-primary rounded px-1 py-0.5">
                    {displayPath}
                </code>
            </div>
            <div className="border-border-bar bg-background-secondary/40 max-h-56 overflow-y-auto rounded-md border p-1">
                <div
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    aria-current={isRootSelected ? 'true' : undefined}
                    onClick={() => !disabled && onSelect('')}
                    onKeyDown={(e) => {
                        if (disabled) return;
                        if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelect('');
                        }
                    }}
                    className={cn(
                        'text-small flex h-7 cursor-pointer items-center gap-1 rounded-sm px-1 select-none',
                        isRootSelected
                            ? 'bg-background-bar-active text-foreground-primary'
                            : 'text-foreground-secondary hover:bg-background-bar-active/50 hover:text-foreground-primary',
                        disabled && 'cursor-not-allowed opacity-50',
                    )}
                >
                    <span className="w-4" />
                    <Icons.Directory className="h-4 w-4 shrink-0" />
                    <span className="truncate">/</span>
                </div>
                {tree.map((node) => (
                    <Row
                        key={node.path}
                        node={node}
                        depth={1}
                        selectedPath={selectedPath}
                        expanded={expanded}
                        toggle={toggle}
                        onSelect={onSelect}
                        disabled={disabled}
                    />
                ))}
            </div>
        </div>
    );
};
