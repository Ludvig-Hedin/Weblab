'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';

import { BrandLogo } from '@weblab/ui/brand';
import { Button } from '@weblab/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from '@weblab/ui/command';
import { Icons } from '@weblab/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';
import { cn } from '@weblab/ui/utils';

import { useActiveWorkspaceMaybe } from '@/app/w/[slug]/_components/workspace-context';
import { WorkspaceSwitcher } from '@/app/w/[slug]/_components/workspace-switcher';
import { CurrentUserAvatar } from '@/components/ui/avatar-dropdown';
import { Routes } from '@/utils/constants';

// ─── Projects dropdown ───────────────────────────────────────────────────────

function ProjectsDropdown() {
    const t = useTranslations('projectsTopBar') as (
        key: string,
        values?: Record<string, string>,
    ) => string;
    const [open, setOpen] = useState(false);
    // 12 covers the common "recent projects" case for power users juggling
    // several work streams without exploding the popover height. Anything
    // beyond is reached via "View all projects" or the global search.
    const PROJECTS_DROPDOWN_LIMIT = 12;
    const projects = useQuery(api.projects.list, {
        limit: PROJECTS_DROPDOWN_LIMIT,
    });
    const isLoading = projects === undefined;

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="ghost"
                    size="compact"
                    className="text-foreground-secondary -mx-1 gap-1 px-1 py-2 text-sm hover:opacity-80 active:opacity-60"
                >
                    {t('projects')}
                    <Icons.ChevronDown
                        className={cn(
                            'h-4 w-4 transition-transform duration-200',
                            open && 'rotate-180',
                        )}
                    />
                </Button>
            </PopoverTrigger>
            <PopoverContent align="start" sideOffset={8} className="w-[260px] p-0">
                <Command>
                    {(projects?.length ?? 0) > 5 && (
                        <CommandInput placeholder={t('filterRecent')} />
                    )}
                    <CommandList>
                        {isLoading ? (
                            <div className="flex items-center justify-center py-4">
                                <Icons.LoadingSpinner className="text-foreground/30 h-4 w-4 animate-spin" />
                            </div>
                        ) : (projects?.length ?? 0) > 0 ? (
                            <CommandGroup>
                                {(projects ?? []).map((project) => (
                                    <CommandItem key={project._id} value={project.name} asChild>
                                        <Link
                                            href={`${Routes.PROJECT}/${project._id}`}
                                            onClick={() => setOpen(false)}
                                        >
                                            <span className="text-foreground truncate text-sm font-medium">
                                                {project.name}
                                            </span>
                                        </Link>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
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
                        {!isLoading && (projects?.length ?? 0) > 0 && (
                            <CommandEmpty>{t('noMatches', { filter: '' })}</CommandEmpty>
                        )}
                        <CommandSeparator />
                        <CommandGroup>
                            <CommandItem asChild>
                                <Link
                                    href={Routes.PROJECTS}
                                    onClick={() => setOpen(false)}
                                    className="text-foreground-tertiary flex items-center gap-1 text-xs"
                                >
                                    {t('viewAll')}
                                    <Icons.ArrowRight className="ml-auto h-3 w-3" />
                                </Link>
                            </CommandItem>
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

// ─── TopBar ──────────────────────────────────────────────────────────────────

export const TopBar = () => {
    const t = useTranslations('projectsTopBar');
    const activeWorkspace = useActiveWorkspaceMaybe();

    return (
        <div className="text-small text-foreground-secondary mx-auto flex w-full max-w-6xl items-center gap-4 p-4">
            <Link href={Routes.HOME} className="flex shrink-0 items-center py-3">
                <BrandLogo className="h-4" />
            </Link>

            {activeWorkspace ? (
                <>
                    <span className="text-foreground-tertiary">/</span>
                    <WorkspaceSwitcher />
                </>
            ) : null}

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
