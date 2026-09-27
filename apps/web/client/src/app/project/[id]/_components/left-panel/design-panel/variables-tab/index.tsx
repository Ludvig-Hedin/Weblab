'use client';

import { useEffect, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { cn } from '@weblab/ui/utils';

import type { TokenSectionData, TokenSectionId } from '../brand-tab/lib/group-tokens';
import { useEditorEngine } from '@/components/store/editor';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { AddTokenForm } from '../brand-tab/editors/add-token-form';
import { buildTokenSections } from '../brand-tab/lib/group-tokens';
import { useLocalStorageState } from '../brand-tab/lib/use-local-storage-state';
import { SetupTokensCta } from '../brand-tab/setup-tokens-cta';
import { TokenGroup } from '../brand-tab/token-group';
import { TokenRow } from '../brand-tab/token-row';

type CollectionId = TokenSectionId | 'all';

const SECTION_IDS: TokenSectionId[] = ['colors', 'sizes', 'radius', 'text-styles', 'other'];

function filterSection(section: TokenSectionData, query: string): TokenSectionData {
    const q = query.trim().toLowerCase();
    if (!q) return section;
    const matches = (label: string, name: string) =>
        label.toLowerCase().includes(q) || name.toLowerCase().includes(q);
    const rows = section.rows.filter((r) => matches(r.label, r.name));
    const groups = section.groups
        .map((g) => ({
            ...g,
            rows: g.rows.filter((r) => matches(r.label, r.name)),
        }))
        .filter((g) => g.rows.length > 0);
    const count = rows.length + groups.reduce((n, g) => n + g.rows.length, 0);
    return { ...section, rows, groups, count };
}

/**
 * Variables tab — the project's design tokens (globals.css `@theme`) as
 * collections plus a Name / Value list, like Figma's variables table.
 * Rows edit inline; hover a row for the edit button, right-click for rename,
 * duplicate, move and delete.
 */
export const VariablesTab = observer(() => {
    const t = useTranslations('editor.leftPanel.variables');
    const tokens = useEditorEngine().tokens;
    const { confirm, dialog } = useConfirm();
    const [collection, setCollection] = useLocalStorageState<CollectionId>(
        'weblab.variables-tab.collection',
        'all',
    );
    const [query, setQuery] = useState('');
    const [expandedName, setExpandedName] = useState<string | null>(null);
    const [adding, setAdding] = useState<TokenSectionId | null>(null);
    const [hasScanned, setHasScanned] = useState(false);

    useEffect(() => {
        void tokens.scan().finally(() => setHasScanned(true));
    }, [tokens]);

    if (!tokens.hasTokensLayer) {
        return (
            <div className="flex flex-col gap-3 p-3">
                {hasScanned ? (
                    <SetupTokensCta />
                ) : (
                    <div className="flex items-center justify-center py-8">
                        <Icons.LoadingSpinner className="text-muted-foreground h-4 w-4 animate-spin" />
                    </div>
                )}
            </div>
        );
    }

    const sections = buildTokenSections({
        variables: tokens.variables,
        colorStyles: tokens.colorStyles,
        textStyles: tokens.textStyles,
        resolveVar: (name) => tokens.resolveVariableValue(name),
    });
    const total = sections.reduce((n, s) => n + s.count, 0);
    const sectionName = (id: TokenSectionId) => t(`collectionNames.${id}`);
    const shown = sections
        .filter((s) => collection === 'all' || s.id === collection)
        .map((s) => filterSection(s, query))
        // "All" hides empty collections unless one is being added to.
        .filter((s) => collection !== 'all' || s.count > 0 || adding === s.id);
    const searching = query.trim().length > 0;
    const visibleCount = shown.reduce((n, s) => n + s.count, 0);

    const toggleRow = (name: string) => setExpandedName((prev) => (prev === name ? null : name));
    const startAdding = (id: TokenSectionId) => {
        setAdding(id);
        if (collection !== 'all') setCollection(id);
    };

    return (
        <div className="flex h-full flex-col">
            <div className="border-border/60 border-b p-2">
                <div className="relative">
                    <Icons.MagnifyingGlass className="text-muted-foreground absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2" />
                    <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t('search')}
                        aria-label={t('search')}
                        className="text-mini h-8 pl-7"
                    />
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
                {tokens.scanError && (
                    <p className="text-destructive text-mini px-3 py-2">{tokens.scanError}</p>
                )}

                {/* Collections */}
                <nav aria-label={t('collections')} className="border-border/60 border-b px-2 py-2">
                    <p className="text-foreground-secondary text-mini px-2 pb-1 font-medium">
                        {t('collections')}
                    </p>
                    <CollectionItem
                        label={t('all')}
                        count={total}
                        active={collection === 'all'}
                        onClick={() => setCollection('all')}
                    />
                    {sections.map((s) => (
                        <CollectionItem
                            key={s.id}
                            label={sectionName(s.id)}
                            count={s.count}
                            active={collection === s.id}
                            onClick={() => setCollection(s.id)}
                        />
                    ))}
                </nav>

                {/* Name / Value table */}
                <div className="text-foreground-tertiary text-micro bg-background-chrome border-border/60 sticky top-0 z-10 flex items-center justify-between border-b px-4 py-1.5">
                    <span>{t('name')}</span>
                    <span>{t('value')}</span>
                </div>

                {searching && visibleCount === 0 ? (
                    <p className="text-foreground-tertiary text-mini px-4 py-3">
                        {t('noMatch', { query: query.trim() })}
                    </p>
                ) : (
                    shown.map((section) => (
                        <div key={section.id} className="flex flex-col gap-0.5 pt-2 pb-1">
                            {collection === 'all' && (
                                <p className="text-foreground-primary text-mini px-4 pb-0.5 font-medium">
                                    {sectionName(section.id)}
                                </p>
                            )}
                            {adding === section.id && (
                                <AddTokenForm
                                    sectionId={section.id}
                                    onClose={() => setAdding(null)}
                                />
                            )}
                            {section.count === 0 && adding !== section.id && (
                                <p className="text-foreground-tertiary text-mini px-4 py-1.5">
                                    {t('empty')}
                                </p>
                            )}
                            <div className="flex flex-col gap-0.5 px-2">
                                {section.rows.map((row) => (
                                    <TokenRow
                                        key={row.name}
                                        row={row}
                                        expanded={expandedName === row.name}
                                        onToggle={() => toggleRow(row.name)}
                                        confirm={confirm}
                                        groupLabels={section.groups.map((g) => g.label)}
                                    />
                                ))}
                                {section.groups.map((group) => (
                                    <TokenGroup
                                        key={group.key}
                                        group={group}
                                        expandedName={expandedName}
                                        onToggleRow={toggleRow}
                                        confirm={confirm}
                                        groupLabels={section.groups.map((g) => g.label)}
                                    />
                                ))}
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="border-border/60 border-t p-2">
                {collection === 'all' ? (
                    <DropdownMenu modal={false}>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start gap-2"
                            >
                                <Icons.Plus className="size-3.5" />
                                {t('createVariable')}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-48">
                            {SECTION_IDS.map((id) => (
                                <DropdownMenuItem key={id} onSelect={() => startAdding(id)}>
                                    {sectionName(id)}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                ) : (
                    <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start gap-2"
                        onClick={() => startAdding(collection)}
                    >
                        <Icons.Plus className="size-3.5" />
                        {t('createVariable')}
                    </Button>
                )}
            </div>
            {dialog}
        </div>
    );
});

function CollectionItem({
    label,
    count,
    active,
    onClick,
}: {
    label: string;
    count: number;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-current={active}
            className={cn(
                'text-mini flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                active
                    ? 'bg-background-secondary text-foreground-primary font-medium'
                    : 'text-foreground-secondary hover:bg-background-secondary hover:text-foreground-primary',
            )}
        >
            <span className="min-w-0 flex-1 truncate">{label}</span>
            <span className="text-foreground-tertiary text-micro shrink-0 tabular-nums">
                {count}
            </span>
        </button>
    );
}
