'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';

import { BrandLogo } from '@weblab/ui/brand';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { cn } from '@weblab/ui/utils';

import { CurrentUserAvatar } from '@/components/ui/avatar-dropdown';
import { api } from '@/trpc/react';
import { Routes } from '@/utils/constants';

// ─── Projects dropdown ───────────────────────────────────────────────────────

function ProjectsDropdown() {
    const t = useTranslations('projectsTopBar') as (
        key: string,
        values?: Record<string, string>,
    ) => string;
    const [open, setOpen] = useState(false);
    const [filter, setFilter] = useState('');
    const ref = useRef<HTMLDivElement>(null);
    const filterInputRef = useRef<HTMLInputElement>(null);
    // 12 covers the common "recent projects" case for power users juggling
    // several work streams without exploding the popover height. Anything
    // beyond is reached via "View all projects" or the global search.
    const PROJECTS_DROPDOWN_LIMIT = 12;
    const { data: projects, isLoading } = api.project.list.useQuery({
        limit: PROJECTS_DROPDOWN_LIMIT,
    });

    // Close on outside click. We no longer toggle on hover (touch users were
    // getting a flicker because the menu opened on mousedown and immediately
    // closed on mouseleave) — open/close is now strictly click + keyboard.
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        if (open) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    // Reset and focus the filter every time the menu opens so typing is
    // instantaneous — matches the cmdk-style ergonomics power users expect.
    useEffect(() => {
        if (!open) {
            setFilter('');
            return;
        }
        const id = window.requestAnimationFrame(() => filterInputRef.current?.focus());
        return () => window.cancelAnimationFrame(id);
    }, [open]);

    const filteredProjects = (projects ?? []).filter((project) =>
        filter ? project.name.toLowerCase().includes(filter.toLowerCase()) : true,
    );
    const showFilter = (projects?.length ?? 0) > 5;

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setOpen((v) => !v)}
                onKeyDown={(e) => {
                    if (e.key === 'Escape') setOpen(false);
                }}
                aria-haspopup="menu"
                aria-expanded={open}
                className="text-foreground-secondary -mx-1 flex items-center gap-1 px-1 py-2 text-sm hover:opacity-80 active:opacity-60"
            >
                {t('projects')}
                <Icons.ChevronDown
                    className={cn(
                        'h-4 w-4 transition-transform duration-200',
                        open && 'rotate-180',
                    )}
                />
            </button>

            {open && (
                <div className="absolute top-full left-1/2 z-50 -translate-x-1/2 pt-2">
                    <div className="bg-background border-foreground/10 min-w-[260px] rounded-lg border p-1 shadow-lg">
                        {showFilter && (
                            <div className="border-foreground/8 mb-1 border-b px-2 py-1.5">
                                <Input
                                    ref={filterInputRef}
                                    value={filter}
                                    onChange={(e) => setFilter(e.currentTarget.value)}
                                    placeholder={t('filterRecent')}
                                    className="h-7 border-transparent bg-transparent px-0 text-xs focus-visible:border-transparent focus-visible:ring-0"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Escape') setOpen(false);
                                    }}
                                />
                            </div>
                        )}
                        {isLoading ? (
                            <div className="flex items-center justify-center py-4">
                                <Icons.LoadingSpinner className="text-foreground/30 h-4 w-4 animate-spin" />
                            </div>
                        ) : filteredProjects.length > 0 ? (
                            <ul className="max-h-72 overflow-y-auto">
                                {filteredProjects.map((project) => (
                                    <li key={project.id}>
                                        <Link
                                            href={`${Routes.PROJECT}/${project.id}`}
                                            onClick={() => setOpen(false)}
                                            className="hover:bg-foreground/5 active:bg-foreground/10 flex flex-col gap-0.5 rounded-md px-2 py-2 transition-colors"
                                        >
                                            <span className="text-foreground truncate text-sm font-medium">
                                                {project.name}
                                            </span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        ) : filter ? (
                            <div className="text-foreground-tertiary px-2 py-3 text-xs">
                                {t('noMatches', { filter })}
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2 px-2 py-3">
                                <p className="text-foreground-tertiary text-xs">
                                    {t('noProjectsYet')}
                                </p>
                                <Link
                                    href={Routes.NEW_PROJECT}
                                    onClick={() => setOpen(false)}
                                    className="text-foreground-secondary hover:text-foreground flex items-center gap-1 text-xs transition-colors"
                                >
                                    <Icons.FilePlus className="h-3.5 w-3.5" />
                                    {t('createFirst')}
                                </Link>
                            </div>
                        )}
                        {/* Always render "View all" so even an empty dropdown
                            offers a path back to the full projects index — the
                            old gated version stranded zero-project users. */}
                        <div className="border-foreground/8 mt-1 border-t pt-1">
                            <Link
                                href={Routes.PROJECTS}
                                onClick={() => setOpen(false)}
                                className="text-foreground-tertiary hover:bg-foreground/5 flex items-center gap-1 rounded-md px-2 py-1.5 text-xs transition-colors"
                            >
                                {t('viewAll')}
                                <Icons.ArrowRight className="h-3 w-3" />
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── TopBar ──────────────────────────────────────────────────────────────────

interface TopBarProps {
    searchQuery?: string;
    onSearchChange?: (q: string) => void;
}

export const TopBar = ({ searchQuery, onSearchChange }: TopBarProps) => {
    const t = useTranslations('projectsTopBar');
    const router = useRouter();
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const searchContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                searchContainerRef.current &&
                !searchContainerRef.current.contains(event.target as Node)
            ) {
                setIsSearchFocused(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsSearchFocused(false);
                searchInputRef.current?.blur();
                onSearchChange?.('');
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [onSearchChange]);

    // Keyboard-first search: `/` from anywhere outside an editable field
    // focuses the search box. `Cmd+K` is reserved for the command palette
    // (ProjectsCommandPalette), not the search input.
    useEffect(() => {
        if (typeof onSearchChange !== 'function') return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
            const target = e.target as HTMLElement | null;
            const isEditable =
                target &&
                (target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.isContentEditable);
            if (isEditable) return;
            e.preventDefault();
            searchInputRef.current?.focus();
            searchInputRef.current?.select();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [onSearchChange]);

    return (
        <div className="text-small text-foreground-secondary mx-auto flex w-full max-w-6xl items-center gap-4 p-4">
            {/* Logo */}
            <Link href={Routes.HOME} className="flex shrink-0 items-center py-3">
                <BrandLogo className="h-4" />
            </Link>

            {/* Nav links */}
            <div className="flex shrink-0 items-center gap-5">
                <ProjectsDropdown />
                <Link
                    href={Routes.MARKETPLACE}
                    className="text-foreground-secondary -mx-1 px-1 py-2 text-sm hover:opacity-80 active:opacity-60"
                >
                    {t('marketplace')}
                </Link>
            </div>

            {/* Search (only when onSearchChange is provided) */}
            {typeof onSearchChange === 'function' ? (
                <div className="flex min-w-0 flex-1 justify-end">
                    <motion.div
                        ref={searchContainerRef}
                        className="relative hidden w-full sm:block"
                        initial={false}
                        animate={
                            isSearchFocused
                                ? { width: '100%', maxWidth: '360px' }
                                : { width: '100%', maxWidth: '260px' }
                        }
                        transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
                    >
                        <Icons.MagnifyingGlass className="text-foreground-tertiary absolute top-1/2 left-3 z-10 h-4 w-4 -translate-y-1/2" />
                        <Input
                            ref={searchInputRef}
                            value={searchQuery ?? ''}
                            onChange={(e) => onSearchChange?.(e.currentTarget.value)}
                            onFocus={() => setIsSearchFocused(true)}
                            placeholder={t('searchProjects')}
                            className="w-full pr-7 pl-9 focus-visible:border-transparent focus-visible:ring-0"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => onSearchChange?.('')}
                                className="text-foreground-tertiary hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
                                aria-label={t('clearSearch')}
                            >
                                <Icons.CrossS className="h-4 w-4" />
                            </button>
                        )}
                    </motion.div>
                </div>
            ) : (
                <div className="flex-1" />
            )}

            {/* Actions */}
            <div className="mt-0 flex items-center justify-end gap-3">
                {/* Single, unambiguous entry point. The full chooser
                    (AI prompt, blank, GitHub, folder) lives at /projects/new
                    so each option can carry a real description instead of
                    cramming icons into a dropdown. */}
                <Button
                    className="h-8 cursor-pointer py-[0.4rem] text-sm focus:outline-none"
                    variant="default"
                    onClick={() => router.push(Routes.NEW_PROJECT)}
                >
                    <Icons.Plus className="h-4 w-4" />
                    {t('newProject')}
                </Button>
                <CurrentUserAvatar className="h-8 w-8" />
            </div>
        </div>
    );
};
