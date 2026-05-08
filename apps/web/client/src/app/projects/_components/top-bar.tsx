'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import { BrandLogo } from '@weblab/ui/brand';
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

import { CurrentUserAvatar } from '@/components/ui/avatar-dropdown';
import { useCreateBlankProject } from '@/hooks/use-create-blank-project';
import { useImportLocalProject } from '@/hooks/use-import-local-project';
import { transKeys } from '@/i18n/keys';
import { api } from '@/trpc/react';
import { Routes } from '@/utils/constants';
import { ProjectModeDialog } from './project-mode-dialog';

// ─── Projects dropdown ───────────────────────────────────────────────────────

function ProjectsDropdown() {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    const { data: projects, isLoading } = api.project.list.useQuery({ limit: 5 });

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        if (open) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [open]);

    return (
        <div
            ref={ref}
            className="relative"
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
        >
            <button
                onClick={() => setOpen((v) => !v)}
                className="text-foreground-secondary -mx-1 flex items-center gap-1 px-1 py-2 text-sm hover:opacity-80 active:opacity-60"
            >
                Projects
                <Icons.ChevronDown
                    className={cn(
                        'h-4 w-4 transition-transform duration-200',
                        open && 'rotate-180',
                    )}
                />
            </button>

            {open && (
                <div className="absolute top-full left-1/2 z-50 -translate-x-1/2 pt-2">
                    <div className="bg-background border-foreground/10 min-w-[220px] rounded-lg border p-1 shadow-lg">
                        {isLoading ? (
                            <div className="flex items-center justify-center py-4">
                                <Icons.LoadingSpinner className="text-foreground/30 h-4 w-4 animate-spin" />
                            </div>
                        ) : projects && projects.length > 0 ? (
                            <>
                                <ul>
                                    {projects.map((project) => (
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
                                <div className="border-foreground/8 mt-1 border-t pt-1">
                                    <Link
                                        href={Routes.PROJECTS}
                                        onClick={() => setOpen(false)}
                                        className="text-foreground-tertiary hover:bg-foreground/5 flex items-center gap-1 rounded-md px-2 py-1.5 text-xs transition-colors"
                                    >
                                        View all projects
                                        <Icons.ArrowRight className="h-3 w-3" />
                                    </Link>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col gap-2 px-2 py-3">
                                <p className="text-foreground-tertiary text-xs">No projects yet</p>
                                <Link
                                    href={Routes.NEW_PROJECT}
                                    onClick={() => setOpen(false)}
                                    className="text-foreground-secondary hover:text-foreground flex items-center gap-1 text-xs transition-colors"
                                >
                                    <Icons.FilePlus className="h-3.5 w-3.5" />
                                    Create your first project
                                </Link>
                            </div>
                        )}
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
    const t = useTranslations();
    const router = useRouter();
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [projectModeIntent, setProjectModeIntent] = useState<'create' | 'import' | null>(null);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const searchContainerRef = useRef<HTMLDivElement>(null);

    const { handleStartBlankProject, isCreatingProject } = useCreateBlankProject();
    const { handleImportLocalProject, isImporting } = useImportLocalProject();
    const isBusy = isCreatingProject || isImporting;

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

    const handleCloudModeSelect = () => {
        const intent = projectModeIntent;
        setProjectModeIntent(null);
        if (intent === 'create') {
            void handleStartBlankProject();
        } else if (intent === 'import') {
            void handleImportLocalProject();
        }
    };

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
                    Marketplace
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
                            placeholder="Search projects"
                            className="w-full pr-7 pl-9 focus-visible:border-transparent focus-visible:ring-0"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => onSearchChange?.('')}
                                className="text-foreground-tertiary hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2"
                                aria-label="Clear search"
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
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            className="h-8 cursor-pointer py-[0.4rem] text-sm focus:outline-none"
                            variant="default"
                            disabled={isBusy}
                        >
                            {isCreatingProject ? (
                                <>
                                    Creating... <Icons.LoadingSpinner className="animate-spin" />
                                </>
                            ) : isImporting ? (
                                <>
                                    {t(transKeys.projects.actions.importingLocalFolder)}{' '}
                                    <Icons.LoadingSpinner className="animate-spin" />
                                </>
                            ) : (
                                <>
                                    Create <Icons.ChevronDown />
                                </>
                            )}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent sideOffset={8} className="translate-x-[-12px]">
                        <DropdownMenuItem
                            className={cn(
                                'focus:bg-blue-100 focus:text-blue-900',
                                'hover:bg-blue-100 hover:text-blue-900',
                                'dark:focus:bg-blue-900 dark:focus:text-blue-100',
                                'dark:hover:bg-blue-900 dark:hover:text-blue-100',
                                'group cursor-pointer select-none',
                            )}
                            onSelect={() => {
                                router.push(Routes.NEW_PROJECT);
                            }}
                        >
                            <Icons.Sparkles className="text-foreground-secondary mr-1 h-4 w-4 group-hover:text-blue-100" />
                            <p className="text-microPlus">Start with AI</p>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className={cn(
                                'focus:bg-blue-100 focus:text-blue-900',
                                'hover:bg-blue-100 hover:text-blue-900',
                                'dark:focus:bg-blue-900 dark:focus:text-blue-100',
                                'dark:hover:bg-blue-900 dark:hover:text-blue-100',
                                'group cursor-pointer select-none',
                            )}
                            onSelect={() => setProjectModeIntent('create')}
                            disabled={isCreatingProject}
                        >
                            {isCreatingProject ? (
                                <Icons.LoadingSpinner className="text-foreground-secondary mr-1 h-4 w-4 animate-spin group-hover:text-blue-100" />
                            ) : (
                                <Icons.FilePlus className="text-foreground-secondary mr-1 h-4 w-4 group-hover:text-blue-100" />
                            )}
                            {t(transKeys.projects.actions.blankProject)}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className={cn(
                                'focus:bg-blue-100 focus:text-blue-900',
                                'hover:bg-blue-100 hover:text-blue-900',
                                'dark:focus:bg-blue-900 dark:focus:text-blue-100',
                                'dark:hover:bg-blue-900 dark:hover:text-blue-100',
                                'group cursor-pointer select-none',
                            )}
                            onSelect={() => setProjectModeIntent('import')}
                            disabled={isBusy}
                        >
                            {isImporting ? (
                                <Icons.LoadingSpinner className="text-foreground-secondary mr-1 h-4 w-4 animate-spin group-hover:text-blue-100" />
                            ) : (
                                <Icons.Directory className="text-foreground-secondary mr-1 h-4 w-4 group-hover:text-blue-100" />
                            )}
                            <p className="text-microPlus">
                                {t(transKeys.projects.actions.openLocalFolder)}
                            </p>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className={cn(
                                'focus:bg-blue-100 focus:text-blue-900',
                                'hover:bg-blue-100 hover:text-blue-900',
                                'dark:focus:bg-blue-900 dark:focus:text-blue-100',
                                'dark:hover:bg-blue-900 dark:hover:text-blue-100',
                                'group cursor-pointer select-none',
                            )}
                            onSelect={() => {
                                router.push(Routes.IMPORT_PROJECT);
                            }}
                            disabled={isBusy}
                        >
                            <Icons.Upload className="text-foreground-secondary mr-1 h-4 w-4 group-hover:text-blue-100" />
                            <p className="text-microPlus">{t(transKeys.projects.actions.import)}</p>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className={cn(
                                'focus:bg-blue-100 focus:text-blue-900',
                                'hover:bg-blue-100 hover:text-blue-900',
                                'dark:focus:bg-blue-900 dark:focus:text-blue-100',
                                'dark:hover:bg-blue-900 dark:hover:text-blue-100',
                                'group cursor-pointer select-none',
                            )}
                            onSelect={() => {
                                router.push(Routes.IMPORT_GITHUB);
                            }}
                            disabled={isBusy}
                        >
                            <Icons.GitHubLogo className="text-foreground-secondary mr-1 h-4 w-4 group-hover:text-blue-100" />
                            <p className="text-microPlus">
                                {t(transKeys.projects.actions.importFromGitHub)}
                            </p>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                <CurrentUserAvatar className="h-8 w-8" />
            </div>
            <ProjectModeDialog
                open={projectModeIntent !== null}
                intent={projectModeIntent ?? 'create'}
                isBusy={isBusy}
                onOpenChange={(open) => {
                    if (!open) {
                        setProjectModeIntent(null);
                    }
                }}
                onCloudSelect={handleCloudModeSelect}
            />
        </div>
    );
};
