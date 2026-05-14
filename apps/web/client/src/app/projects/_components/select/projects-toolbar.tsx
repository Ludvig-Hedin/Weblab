'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import type { ProjectFolder } from './project-card-utils';
import { Routes } from '@/utils/constants';

export type ProjectSort = 'Last viewed' | 'Date created' | 'Alphabetical';
export type ProjectView = 'grid' | 'list' | 'table';
export type StatusFilter = 'all' | 'published' | 'unpublished';
// Either a sentinel ('all' / 'none') or a real folder UUID — both are strings,
// so the type collapses to `string` after literal widening.
export type FolderFilter = string;
export type DateFilter = 'all' | 'today' | 'week' | 'month';

export interface ProjectFilters {
    status: StatusFilter;
    folderId: FolderFilter;
    dateRange: DateFilter;
    techStacks: string[];
}

export const DEFAULT_FILTERS: ProjectFilters = {
    status: 'all',
    folderId: 'all',
    dateRange: 'all',
    techStacks: [],
};

export const countActiveFilters = (filters: ProjectFilters): number => {
    let count = 0;
    if (filters.status !== 'all') count += 1;
    if (filters.folderId !== 'all') count += 1;
    if (filters.dateRange !== 'all') count += 1;
    count += filters.techStacks.length;
    return count;
};

interface ProjectsToolbarProps {
    searchQuery: string;
    onSearchChange: (value: string) => void;
    sort: ProjectSort;
    onSortChange: (sort: ProjectSort) => void;
    filters: ProjectFilters;
    onFiltersChange: (filters: ProjectFilters) => void;
    view: ProjectView;
    onViewChange: (view: ProjectView) => void;
    folders: ProjectFolder[];
    availableTechStacks: string[];
    onCreateFolder: () => void;
}

const FRAMEWORK_LABELS: Record<string, string> = {
    next: 'Next.js',
    nextjs: 'Next.js',
    vite: 'Vite',
    react: 'React',
    astro: 'Astro',
    remix: 'Remix',
    'tanstack-start': 'TanStack',
    tanstack: 'TanStack',
    static: 'Static HTML',
    html: 'HTML',
};

export const formatTechLabel = (id: string): string =>
    FRAMEWORK_LABELS[id.toLowerCase()] ?? id.charAt(0).toUpperCase() + id.slice(1);

export const ProjectsToolbar = ({
    searchQuery,
    onSearchChange,
    sort,
    onSortChange,
    filters,
    onFiltersChange,
    view,
    onViewChange,
    folders,
    availableTechStacks,
    onCreateFolder,
}: ProjectsToolbarProps) => {
    const t = useTranslations('selectProject');
    const tNav = useTranslations('projectsTopBar');
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey) {
                const target = event.target as HTMLElement | null;
                const isEditable =
                    target &&
                    (target.tagName === 'INPUT' ||
                        target.tagName === 'TEXTAREA' ||
                        target.isContentEditable);
                if (!isEditable) {
                    event.preventDefault();
                    searchInputRef.current?.focus();
                    searchInputRef.current?.select();
                }
            } else if (
                event.key === 'Escape' &&
                document.activeElement === searchInputRef.current
            ) {
                onSearchChange('');
                searchInputRef.current?.blur();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onSearchChange]);

    const activeFilterCount = countActiveFilters(filters);
    const sortOptions: { value: ProjectSort; label: string }[] = [
        { value: 'Last viewed', label: t('sortLastViewed') },
        { value: 'Date created', label: t('sortDateCreated') },
        { value: 'Alphabetical', label: t('sortAlphabetical') },
    ];
    const currentSortLabel = sortOptions.find((o) => o.value === sort)?.label ?? sort;

    // Concrete component refs — typo-proof at compile time (cast through
    // `keyof typeof Icons` would have hidden a wrong name until runtime).
    const ICON_BY_VIEW = {
        grid: Icons.ViewGrid,
        list: Icons.ListBullet,
        table: Icons.Layout,
    } as const;
    const layoutButtons: { value: ProjectView; label: string }[] = [
        { value: 'grid', label: t('layoutGrid') },
        { value: 'list', label: t('layoutList') },
        { value: 'table', label: t('layoutTable') },
    ];

    const resetFilters = () => onFiltersChange(DEFAULT_FILTERS);

    return (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-4">
                <h2 className="text-foreground shrink-0 text-2xl font-normal tracking-tight">
                    {t('projectsHeading')}
                </h2>
                <motion.div
                    className="relative hidden min-w-0 sm:block"
                    initial={false}
                    animate={
                        isSearchFocused
                            ? { width: '100%', maxWidth: 360 }
                            : { width: '100%', maxWidth: 280 }
                    }
                    transition={{ duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                >
                    <Icons.MagnifyingGlass className="text-foreground-tertiary pointer-events-none absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2" />
                    <Input
                        ref={searchInputRef}
                        value={searchQuery}
                        onChange={(event) => onSearchChange(event.currentTarget.value)}
                        onFocus={() => setIsSearchFocused(true)}
                        onBlur={() => setIsSearchFocused(false)}
                        placeholder={tNav('searchProjects')}
                        className="bg-foreground/4 border-foreground/8 hover:border-foreground/12 focus-visible:border-foreground/20 h-9 w-full rounded-md pr-7 pl-9 text-sm focus-visible:ring-0"
                        aria-label={tNav('searchProjects')}
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => onSearchChange('')}
                            className="text-foreground-tertiary hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded-sm transition-colors"
                            aria-label={t('clearSearch')}
                        >
                            <Icons.CrossS className="h-4 w-4" />
                        </button>
                    )}
                </motion.div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                {/* Filter dropdown */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                                'text-foreground-tertiary hover:text-foreground hover:border-foreground/10 hover:bg-foreground/6 h-8 gap-1.5 border border-transparent text-xs font-normal',
                                activeFilterCount > 0 &&
                                    'text-foreground border-foreground/10 bg-foreground/6',
                            )}
                        >
                            <Icons.MixerHorizontal className="h-3.5 w-3.5" />
                            <span>{t('filterLabel')}</span>
                            {activeFilterCount > 0 && (
                                <span className="text-foreground bg-foreground/12 ml-0.5 rounded-full px-1.5 text-[10px] leading-4">
                                    {activeFilterCount}
                                </span>
                            )}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[220px]">
                        <DropdownMenuLabel className="text-foreground-tertiary text-[11px]">
                            {t('filterStatus')}
                        </DropdownMenuLabel>
                        <DropdownMenuRadioGroup
                            value={filters.status}
                            onValueChange={(value) =>
                                onFiltersChange({ ...filters, status: value as StatusFilter })
                            }
                        >
                            <DropdownMenuRadioItem value="all">
                                {t('filterStatusAll')}
                            </DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="published">
                                {t('filterStatusPublished')}
                            </DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="unpublished">
                                {t('filterStatusUnpublished')}
                            </DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>

                        <DropdownMenuSeparator />
                        <DropdownMenuLabel className="text-foreground-tertiary text-[11px]">
                            {t('filterDate')}
                        </DropdownMenuLabel>
                        <DropdownMenuRadioGroup
                            value={filters.dateRange}
                            onValueChange={(value) =>
                                onFiltersChange({ ...filters, dateRange: value as DateFilter })
                            }
                        >
                            <DropdownMenuRadioItem value="all">
                                {t('filterDateAll')}
                            </DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="today">
                                {t('filterDateToday')}
                            </DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="week">
                                {t('filterDateWeek')}
                            </DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="month">
                                {t('filterDateMonth')}
                            </DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>

                        {folders.length > 0 && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel className="text-foreground-tertiary text-[11px]">
                                    {t('filterFolder')}
                                </DropdownMenuLabel>
                                <DropdownMenuRadioGroup
                                    value={filters.folderId}
                                    onValueChange={(value) =>
                                        onFiltersChange({
                                            ...filters,
                                            folderId: value,
                                        })
                                    }
                                >
                                    <DropdownMenuRadioItem value="all">
                                        {t('filterFolderAll')}
                                    </DropdownMenuRadioItem>
                                    <DropdownMenuRadioItem value="none">
                                        {t('filterFolderNone')}
                                    </DropdownMenuRadioItem>
                                    {folders.map((folder) => (
                                        <DropdownMenuRadioItem key={folder.id} value={folder.id}>
                                            {folder.name}
                                        </DropdownMenuRadioItem>
                                    ))}
                                </DropdownMenuRadioGroup>
                            </>
                        )}

                        {availableTechStacks.length > 0 && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuLabel className="text-foreground-tertiary text-[11px]">
                                    {t('filterTech')}
                                </DropdownMenuLabel>
                                {availableTechStacks.map((stack) => {
                                    const checked = filters.techStacks.includes(stack);
                                    return (
                                        <DropdownMenuCheckboxItem
                                            key={stack}
                                            checked={checked}
                                            onCheckedChange={() => {
                                                const nextStacks = checked
                                                    ? filters.techStacks.filter((s) => s !== stack)
                                                    : [...filters.techStacks, stack];
                                                onFiltersChange({
                                                    ...filters,
                                                    techStacks: nextStacks,
                                                });
                                            }}
                                        >
                                            {formatTechLabel(stack)}
                                        </DropdownMenuCheckboxItem>
                                    );
                                })}
                            </>
                        )}

                        {activeFilterCount > 0 && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={resetFilters}>
                                    <Icons.Reset className="h-3.5 w-3.5" />
                                    {t('filterReset')}
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>

                {/* Sort dropdown */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-foreground-tertiary hover:text-foreground hover:border-foreground/10 hover:bg-foreground/6 h-8 gap-1.5 border border-transparent text-xs font-normal"
                        >
                            <Icons.MixerVertical className="h-3.5 w-3.5" />
                            <span>
                                {t('sortLabel')}
                                <span className="text-foreground ml-1">{currentSortLabel}</span>
                            </span>
                            <Icons.ChevronDown className="h-3 w-3 opacity-60" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[180px]">
                        <DropdownMenuRadioGroup
                            value={sort}
                            onValueChange={(value) => onSortChange(value as ProjectSort)}
                        >
                            {sortOptions.map((option) => (
                                <DropdownMenuRadioItem key={option.value} value={option.value}>
                                    {option.label}
                                </DropdownMenuRadioItem>
                            ))}
                        </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                </DropdownMenu>

                {/* Layout toggle */}
                {/* Layout toggle — uses native <button> w/ aria-pressed so we
                    own the active styling explicitly. Radix ToggleGroup's
                    base `data-[state=on]:bg-accent` collided with our
                    foreground/N override via tailwind-merge and read as a
                    hover-only state to the user. Plain buttons are simpler
                    and visually decisive. */}
                <div
                    role="group"
                    aria-label={t('layoutGrid')}
                    className="bg-foreground/4 border-foreground/8 flex items-center gap-0.5 rounded-md border p-0.5"
                >
                    {layoutButtons.map((option) => {
                        const Icon = ICON_BY_VIEW[option.value];
                        const isActive = view === option.value;
                        return (
                            <Tooltip key={option.value}>
                                <TooltipTrigger asChild>
                                    <button
                                        type="button"
                                        aria-label={option.label}
                                        aria-pressed={isActive}
                                        onClick={() => onViewChange(option.value)}
                                        className={cn(
                                            'inline-flex h-7 w-7 items-center justify-center rounded-sm transition-colors',
                                            isActive
                                                ? 'text-foreground bg-foreground/14 shadow-foreground/10 shadow-[inset_0_0_0_1px]'
                                                : 'text-foreground-tertiary hover:text-foreground hover:bg-foreground/6',
                                        )}
                                    >
                                        <Icon className="h-3.5 w-3.5" />
                                    </button>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="text-xs">
                                    {option.label}
                                </TooltipContent>
                            </Tooltip>
                        );
                    })}
                </div>

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onCreateFolder}
                    className="text-foreground-tertiary hover:text-foreground hover:border-foreground/10 hover:bg-foreground/6 h-8 gap-1.5 border border-transparent text-xs font-normal"
                >
                    <Icons.DirectoryPlus className="h-4 w-4" />
                    {t('createFolder')}
                </Button>

                <Button variant="default" size="sm" asChild className="h-8 gap-1 text-xs">
                    <Link href={Routes.NEW_PROJECT}>
                        <Icons.Plus className="h-4 w-4" />
                        <span>{tNav('newProject')}</span>
                    </Link>
                </Button>
            </div>
        </div>
    );
};
