'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import localforage from 'localforage';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { BrandLogo } from '@weblab/ui/brand';
import { DEFAULT_NEW_PROJECT_TEMPLATE } from '@weblab/constants';
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

import { useAuthContext } from '@/app/auth/auth-context';
import { CurrentUserAvatar } from '@/components/ui/avatar-dropdown';
import { useImportLocalProject } from '@/hooks/use-import-local-project';
import { transKeys } from '@/i18n/keys';
import { api } from '@/trpc/react';
import { LocalForageKeys, Routes } from '@/utils/constants';

const RECENT_SEARCHES_KEY = 'weblab_recent_searches';
const RECENT_COLORS_KEY = 'weblab_recent_colors';

interface TopBarProps {
    searchQuery?: string;
    onSearchChange?: (q: string) => void;
}

export const TopBar = ({ searchQuery, onSearchChange }: TopBarProps) => {
    const t = useTranslations();
    const router = useRouter();
    const [isSearchFocused, setIsSearchFocused] = useState(false);
    const [recentSearches, setRecentSearches] = useState<string[]>([]);
    const [recentColors, setRecentColors] = useState<string[]>([]);
    const [isCreatingProject, setIsCreatingProject] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);
    const searchContainerRef = useRef<HTMLDivElement>(null);

    // API hooks
    const { data: user } = api.user.get.useQuery();
    const { mutateAsync: forkSandbox } = api.sandbox.fork.useMutation();
    const { mutateAsync: createProject } = api.project.create.useMutation();
    const { setIsAuthModalOpen } = useAuthContext();
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

    // Load suggestions from localforage
    useEffect(() => {
        const loadRecentSearches = async () => {
            try {
                const rs = (await localforage.getItem<string[]>(RECENT_SEARCHES_KEY)) ?? [];
                if (Array.isArray(rs)) setRecentSearches(rs.slice(0, 6));
            } catch {}
        };
        loadRecentSearches();
        const loadRecentColors = async () => {
            try {
                const rc = (await localforage.getItem<string[]>(RECENT_COLORS_KEY)) ?? [];
                if (Array.isArray(rc)) setRecentColors(rc.slice(0, 10));
            } catch {}
        };
        loadRecentColors();
    }, []);

    // Persist non-empty search queries to recent
    useEffect(() => {
        const q = (searchQuery ?? '').trim();
        if (!q) return;
        const timer = setTimeout(async () => {
            try {
                const recentSearches =
                    (await localforage.getItem<string[]>(RECENT_SEARCHES_KEY)) ?? [];
                const rs = new Set<string>([q, ...recentSearches]);
                const arr = Array.from(rs).slice(0, 8);
                localforage.setItem(RECENT_SEARCHES_KEY, arr);
                setRecentSearches(arr);
            } catch {}
        }, 600);
        return () => clearTimeout(timer);
    }, [searchQuery]);

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

    const handleStartBlankProject = async () => {
        if (!user?.id) {
            // Store the return URL and open auth modal
            await localforage.setItem(LocalForageKeys.RETURN_URL, window.location.pathname);
            setIsAuthModalOpen(true);
            return;
        }

        setIsCreatingProject(true);
        try {
            const { sandboxId, previewUrl } = await forkSandbox({
                sandbox: DEFAULT_NEW_PROJECT_TEMPLATE,
                config: {
                    title: `Blank project - ${user.id}`,
                    tags: ['blank', user.id],
                },
            });

            const newProject = await createProject({
                project: {
                    name: 'New Project',
                    description: 'Your new blank project',
                    tags: ['blank'],
                },
                sandboxId,
                sandboxUrl: previewUrl,
                userId: user.id,
            });

            if (newProject) {
                router.push(`${Routes.PROJECT}/${newProject.id}`);
            }
        } catch (error) {
            console.error('Error creating blank project:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);

            if (errorMessage.includes('502') || errorMessage.includes('sandbox')) {
                toast.error('Sandbox service temporarily unavailable', {
                    description:
                        'Please try again in a few moments. Our servers may be experiencing high load.',
                });
            } else {
                toast.error('Failed to create project', {
                    description: errorMessage,
                });
            }
        } finally {
            setIsCreatingProject(false);
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
                            onSelect={handleStartBlankProject}
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
                            onSelect={() => void handleImportLocalProject()}
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
                    </DropdownMenuContent>
                </DropdownMenu>
                <CurrentUserAvatar className="h-8 w-8" />
            </div>
        </div>
    );
};
