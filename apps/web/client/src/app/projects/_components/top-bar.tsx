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

    // API hooks
    const { data: user } = api.user.get.useQuery();
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

    // Recent-searches persistence was removed (issue #56) — the data was
    // collected into localforage but never surfaced to users, so we deleted
    // the writes/reads rather than building UI for dead state.

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setIsSearchFocused(false);
                searchInputRef.current?.blur();
                onSearchChange?.('');
            }
        };

        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('keydown', handleEscape);
        };
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
        <div className="text-small text-foreground-secondary mx-auto flex w-full max-w-6xl items-center justify-between gap-6 p-4">
            <Link href={Routes.HOME} className="mt-0 flex items-center justify-start py-3">
                <BrandLogo className="h-4" />
            </Link>

            {typeof onSearchChange === 'function' ? (
                <div className="flex min-w-0 flex-1 justify-center">
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
