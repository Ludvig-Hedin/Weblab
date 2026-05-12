'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import type { User } from '@weblab/models';
import { Avatar, AvatarFallback, AvatarImage } from '@weblab/ui/avatar';
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
import { getInitials } from '@weblab/utility';

import { transKeys } from '@/i18n/keys';

interface TopBarPresentationProps {
    /** Current user data */
    user?: User | null;
    /** Current search query */
    searchQuery?: string;
    /** Callback when search changes */
    onSearchChange?: (q: string) => void;
    /** Recent search suggestions */
    recentSearches?: string[];
    /** Whether a project is being created */
    isCreatingProject?: boolean;
    /** Callback when creating a blank project */
    onCreateBlank?: () => void;
    /** Callback when importing a project */
    onImport?: () => void;
    /** Home route path */
    homeRoute?: string;
}

/**
 * TopBarPresentation - Pure presentational version of the TopBar component.
 * Receives all data and callbacks as props instead of using hooks/context.
 */
export const TopBarPresentation = ({
    user,
    searchQuery,
    onSearchChange,
    recentSearches = [],
    isCreatingProject = false,
    onCreateBlank,
    onImport,
    homeRoute = '/',
}: TopBarPresentationProps) => {
    const t = useTranslations();
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
        return () => {
            document.removeEventListener('keydown', handleEscape);
        };
    }, [onSearchChange]);

    return (
        <div className="text-small text-foreground-secondary mx-auto flex w-full max-w-6xl items-center justify-between gap-6 p-4">
            <Link href={homeRoute} className="mt-0 flex items-center justify-start py-3">
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
                            disabled={isCreatingProject}
                        >
                            {isCreatingProject ? (
                                <>
                                    Creating... <Icons.LoadingSpinner className="animate-spin" />
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
                            className="group cursor-pointer select-none"
                            onSelect={onCreateBlank}
                            disabled={isCreatingProject}
                        >
                            {isCreatingProject ? (
                                <Icons.LoadingSpinner className="text-foreground-secondary mr-1 h-4 w-4 animate-spin" />
                            ) : (
                                <Icons.FilePlus className="text-foreground-secondary mr-1 h-4 w-4" />
                            )}
                            {t(transKeys.projects.actions.blankProject)}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="group cursor-pointer select-none"
                            onSelect={onImport}
                        >
                            <Icons.Upload className="text-foreground-secondary mr-1 h-4 w-4" />
                            <p className="text-microPlus">{t(transKeys.projects.actions.import)}</p>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                {/* Simple avatar for presentational component - no dropdown */}
                <Avatar className="h-8 w-8">
                    {user?.avatarUrl && (
                        <AvatarImage
                            src={user.avatarUrl}
                            alt={getInitials(user?.displayName ?? user?.firstName ?? '')}
                        />
                    )}
                    <AvatarFallback>
                        {getInitials(user?.displayName ?? user?.firstName ?? '')}
                    </AvatarFallback>
                </Avatar>
            </div>
        </div>
    );
};
