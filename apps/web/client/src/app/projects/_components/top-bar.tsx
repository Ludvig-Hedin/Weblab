'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { BrandLogo } from '@weblab/ui/brand';
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

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        if (open) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

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

            <AnimatePresence>
                {open && (
                    <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.12 }}
                        className="absolute top-full left-1/2 z-50 -translate-x-1/2 pt-2"
                    >
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
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// ─── TopBar ──────────────────────────────────────────────────────────────────

export const TopBar = () => {
    const t = useTranslations('projectsTopBar');

    return (
        <div className="text-small text-foreground-secondary mx-auto flex w-full max-w-6xl items-center gap-4 p-4">
            <Link href={Routes.HOME} className="flex shrink-0 items-center py-3">
                <BrandLogo className="h-4" />
            </Link>

            <div className="flex shrink-0 items-center gap-5">
                <ProjectsDropdown />
                <Link
                    href={Routes.MARKETPLACE}
                    className="text-foreground-secondary -mx-1 px-1 py-2 text-sm hover:opacity-80 active:opacity-60"
                >
                    {t('marketplace')}
                </Link>
            </div>

            <div className="flex-1" />

            <div className="flex items-center justify-end gap-3">
                <CurrentUserAvatar className="h-8 w-8" />
            </div>
        </div>
    );
};
