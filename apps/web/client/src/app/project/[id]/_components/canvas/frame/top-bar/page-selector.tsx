import React, { useMemo, useState } from 'react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import type { Frame, PageNode } from '@weblab/models';
import { LeftPanelTabValue } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';
import { Separator } from '@weblab/ui/separator';
import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';
import { inferPageFromUrl, pathsEqual } from '@weblab/utility';

import { useEditorEngine } from '@/components/store/editor';
import { isFolderNode, isPageNode } from '@/components/store/editor/pages/helper';
import { HoverOnlyTooltip } from '../../../editor-bar/hover-tooltip';
import { PageModal } from '../../../left-panel/design-panel/page-tab/page-modal';

function flattenPages(pages: PageNode[]): PageNode[] {
    return pages.reduce<PageNode[]>((acc, page) => {
        if (isPageNode(page)) {
            acc.push(page);
        }
        if (page.children) {
            acc.push(...flattenPages(page.children));
        }
        return acc;
    }, []);
}

interface PageSelectorProps {
    frame: Frame;
    className?: string;
    tooltipSide?: 'top' | 'bottom' | 'left' | 'right';
    showIcon?: boolean;
    buttonSize?: 'sm' | 'default' | 'lg';
    buttonClassName?: string;
}

export const PageSelector = observer(
    ({
        frame,
        className,
        tooltipSide = 'top',
        showIcon = false,
        buttonSize = 'sm',
        buttonClassName,
    }: PageSelectorProps) => {
        const editorEngine = useEditorEngine();
        const t = useTranslations('editor.canvas.frame.pageSelector');
        const [showCreateModal, setShowCreateModal] = useState(false);
        const [isOpen, setIsOpen] = useState(false);
        const [isNavigating, setIsNavigating] = useState(false);
        const [searchQuery, setSearchQuery] = useState('');

        const inferredCurrentPage = useMemo(() => inferPageFromUrl(frame.url), [frame.url]);

        const allPages = useMemo(() => {
            return flattenPages(editorEngine.pages.tree);
        }, [editorEngine.pages.tree]);

        const currentPage = useMemo(() => {
            const framePathname = new URL(frame.url).pathname;
            return allPages.find((page) => {
                const pagePath = page.path === '/' ? '' : page.path;
                return pathsEqual(framePathname, pagePath) || pathsEqual(framePathname, page.path);
            });
        }, [frame.url, allPages]);

        const displayCurrentPage = currentPage ?? {
            name: inferredCurrentPage.name,
            path: inferredCurrentPage.path,
            isRoot: inferredCurrentPage.path === '/',
        };

        const filteredPages = useMemo(() => {
            if (!searchQuery.trim()) return null;
            const q = searchQuery.toLowerCase();
            return allPages.filter(
                (p) => p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q),
            );
        }, [allPages, searchQuery]);

        const handlePageSelect = async (page: PageNode) => {
            setIsOpen(false);
            setIsNavigating(true);
            try {
                await editorEngine.frames.navigateToPath(frame.id, page.path);
            } catch (error) {
                console.error('Failed to navigate to page:', error);
                toast.error('Failed to navigate', {
                    description: error instanceof Error ? error.message : 'Unknown error',
                });
            } finally {
                setIsNavigating(false);
            }
        };

        const handleManagePages = () => {
            editorEngine.state.setLeftPanelTab(LeftPanelTabValue.PAGES);
            editorEngine.state.setLeftPanelLocked(true);
            setIsOpen(false);
        };

        const handleOpenChange = (open: boolean) => {
            setIsOpen(open);
            if (!open) {
                setSearchQuery('');
            }
            if (open) {
                editorEngine.frames.select([frame]);
            }
        };

        const renderTreeItems = (pages: PageNode[], depth = 0): React.ReactElement[] => {
            const items: React.ReactElement[] = [];

            for (const page of pages) {
                if (isFolderNode(page)) {
                    items.push(
                        <div
                            key={`folder-${page.id}`}
                            className="text-foreground-tertiary mt-2 px-3 pb-0.5 text-tiny font-medium tracking-widest uppercase first:mt-0"
                        >
                            {page.name}
                        </div>,
                    );
                    if (page.children && page.children.length > 0) {
                        items.push(...renderTreeItems(page.children, depth + 1));
                    }
                    continue;
                }

                const isCurrentPage = currentPage?.id === page.id;
                items.push(
                    <button
                        key={page.id}
                        type="button"
                        onClick={() => void handlePageSelect(page)}
                        className={cn(
                            'hover:bg-background-bar-active flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors',
                            isCurrentPage
                                ? 'text-foreground-primary'
                                : 'text-foreground-secondary hover:text-foreground-primary',
                        )}
                        style={{
                            paddingLeft: depth > 0 ? `${12 + depth * 8}px` : undefined,
                        }}
                    >
                        <Icons.File className="h-3.5 w-3.5 shrink-0 opacity-60" />
                        <span className="min-w-0 flex-1 truncate">{page.name}</span>
                        {isCurrentPage && (
                            <Icons.Check className="text-foreground-brand ml-auto h-3 w-3 shrink-0" />
                        )}
                    </button>,
                );

                if (page.children && page.children.length > 0) {
                    items.push(...renderTreeItems(page.children, depth + 1));
                }
            }

            return items;
        };

        return (
            <>
                <Popover open={isOpen} onOpenChange={handleOpenChange}>
                    <HoverOnlyTooltip
                        content={t('page')}
                        side={tooltipSide}
                        className="mb-1"
                        hideArrow
                        disabled={isOpen}
                    >
                        <PopoverTrigger asChild>
                            <Button
                                variant="ghost"
                                size={buttonSize}
                                className={cn(
                                    'text-mini h-auto gap-1 px-2 py-1 hover:!bg-transparent focus:!bg-transparent active:!bg-transparent',
                                    buttonClassName,
                                    className,
                                )}
                            >
                                {showIcon && <Icons.File className="h-4 w-4 shrink-0" />}
                                {isNavigating ? (
                                    <Icons.LoadingSpinner className="h-3 w-3 animate-spin" />
                                ) : (
                                    <span className="max-w-24 truncate">
                                        {displayCurrentPage.name}
                                    </span>
                                )}
                                <Icons.ChevronDown className="text-foreground-tertiary h-3 w-3 shrink-0" />
                            </Button>
                        </PopoverTrigger>
                    </HoverOnlyTooltip>

                    <PopoverContent
                        align="start"
                        className="bg-background-overlay border-border-bar w-64 p-0 shadow-lg"
                        onClick={(e) => e.stopPropagation()}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-3 py-2">
                            <span className="text-foreground-tertiary text-xs font-medium">
                                {t('currentPage')}
                            </span>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="text-foreground-tertiary hover:text-foreground-primary h-5 w-5 rounded"
                                onClick={() => {
                                    setShowCreateModal(true);
                                    setIsOpen(false);
                                }}
                                title={t('newPage')}
                            >
                                <Icons.Plus className="h-3.5 w-3.5" />
                            </Button>
                        </div>

                        {/* Current page row */}
                        <div className="bg-background-tertiary/40 mx-2 mb-2 flex items-center gap-2 rounded-md px-2 py-1.5">
                            <Icons.File className="text-foreground-secondary h-3.5 w-3.5 shrink-0" />
                            <span className="text-foreground-primary min-w-0 flex-1 truncate text-sm">
                                {displayCurrentPage.name}
                            </span>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="text-foreground-tertiary hover:text-foreground-primary h-5 w-5 shrink-0 rounded"
                                onClick={handleManagePages}
                                title={t('pageSettings')}
                            >
                                <Icons.Gear className="h-3 w-3" />
                            </Button>
                        </div>

                        {/* Search */}
                        <div className="mx-2 mb-2 flex items-center gap-2 rounded-md border border-transparent bg-black/20 px-2 py-1.5 focus-within:border-white/10">
                            <Icons.MagnifyingGlass className="text-foreground-tertiary h-3.5 w-3.5 shrink-0" />
                            <input
                                type="text"
                                placeholder={t('searchPlaceholder')}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                                        e.stopPropagation();
                                    }
                                    if (e.key === 'Escape') {
                                        if (searchQuery) {
                                            setSearchQuery('');
                                        } else {
                                            setIsOpen(false);
                                        }
                                        e.stopPropagation();
                                    }
                                }}
                                className="text-foreground placeholder:text-foreground-tertiary min-w-0 flex-1 bg-transparent text-sm outline-none"
                            />
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="text-foreground-tertiary hover:text-foreground-secondary"
                                >
                                    <Icons.CrossS className="h-3 w-3" />
                                </button>
                            )}
                        </div>

                        <Separator className="mb-1 opacity-30" />

                        {/* Page list */}
                        <div className="max-h-[240px] overflow-y-auto px-1 py-1">
                            {filteredPages !== null ? (
                                filteredPages.length > 0 ? (
                                    filteredPages.map((page) => {
                                        const isCurrentPage = currentPage?.id === page.id;
                                        return (
                                            <button
                                                key={page.id}
                                                type="button"
                                                onClick={() => void handlePageSelect(page)}
                                                className={cn(
                                                    'hover:bg-background-bar-active flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm transition-colors',
                                                    isCurrentPage
                                                        ? 'text-foreground-primary'
                                                        : 'text-foreground-secondary hover:text-foreground-primary',
                                                )}
                                            >
                                                <Icons.File className="h-3.5 w-3.5 shrink-0 opacity-60" />
                                                <span className="min-w-0 flex-1 truncate">
                                                    {page.name}
                                                </span>
                                                {isCurrentPage && (
                                                    <Icons.Check className="text-foreground-brand ml-auto h-3 w-3 shrink-0" />
                                                )}
                                            </button>
                                        );
                                    })
                                ) : (
                                    <p className="text-foreground-tertiary px-3 py-3 text-sm">
                                        {t('noPagesFound')}
                                    </p>
                                )
                            ) : editorEngine.pages.isScanning && allPages.length === 0 ? (
                                <div className="text-foreground-tertiary flex items-center gap-2 px-3 py-2 text-sm">
                                    <Icons.LoadingSpinner className="h-3 w-3 animate-spin" />
                                    <span>{t('scanningPages')}</span>
                                </div>
                            ) : (
                                renderTreeItems(editorEngine.pages.tree)
                            )}
                        </div>

                        <Separator className="mt-1 opacity-30" />

                        {/* Footer */}
                        <div className="p-1">
                            <button
                                type="button"
                                onClick={handleManagePages}
                                className="text-foreground-secondary hover:bg-background-bar-active hover:text-foreground-primary flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors"
                            >
                                <Icons.Gear className="h-3.5 w-3.5 shrink-0 opacity-60" />
                                <span>{t('manageAllPages')}</span>
                            </button>
                        </div>
                    </PopoverContent>
                </Popover>

                <PageModal mode="create" open={showCreateModal} onOpenChange={setShowCreateModal} />
            </>
        );
    },
);
