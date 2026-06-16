'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import type { Project } from '@weblab/models';
import { Checkbox } from '@weblab/ui/checkbox';
import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';
import { timeAgo } from '@weblab/utility';

import type { ProjectListItem } from './project-card-utils';
import { isDesktopLocalAvailable } from '@/hooks/use-open-local-project';
import { SettingsDropdown } from '../settings';
import { ProjectCardContextMenu } from './project-card-context-menu';
import {
    getDisplayUrl,
    getFaviconUrl,
    getProjectPreviewImageUrl,
    getProjectSiteUrl,
} from './project-card-utils';
import { formatTechLabel } from './projects-toolbar';

interface ProjectRowProps {
    project: ProjectListItem;
    variant: 'list' | 'table';
    refetch: () => void | Promise<unknown>;
    searchQuery?: string;
    HighlightText?: React.ComponentType<{ text: string; searchQuery: string }>;
    selectionMode?: boolean;
    selected?: boolean;
    onSelectionChange?: (selected: boolean) => void;
    isBackfilling?: boolean;
}

const getFramework = (project: ProjectListItem): string | null => {
    const fw = project.metadata?.runtime?.framework;
    return fw ? formatTechLabel(fw) : null;
};

export const ProjectRow = ({
    project,
    variant,
    refetch,
    searchQuery = '',
    HighlightText,
    selectionMode = false,
    selected = false,
    onSelectionChange,
    isBackfilling = false,
}: ProjectRowProps) => {
    const tBase = useTranslations('selectProject');
    const t = tBase as (key: string, values?: Record<string, string | number>) => string;
    const router = useRouter();
    const [faviconFailed, setFaviconFailed] = useState(false);
    const [isOpening, setIsOpening] = useState(false);
    const [hasPrefetched, setHasPrefetched] = useState(false);
    const lastUpdated = useMemo(
        () => timeAgo(project.metadata?.updatedAt),
        [project.metadata?.updatedAt],
    );
    const previewImageUrl = useMemo(() => getProjectPreviewImageUrl(project), [project]);
    const siteUrl = useMemo(() => getProjectSiteUrl(project), [project]);
    const displayUrl = useMemo(() => getDisplayUrl(siteUrl), [siteUrl]);
    const faviconUrl = useMemo(() => getFaviconUrl(siteUrl), [siteUrl]);
    const framework = useMemo(() => getFramework(project), [project]);

    useEffect(() => {
        setFaviconFailed(false);
    }, [faviconUrl]);

    const projectHref = `/project/${project.id}`;
    const initial = project.name.trim().charAt(0).toUpperCase() || '?';
    const isPublished = siteUrl !== null;

    // Local (desktop-only) projects also surface in the browser dashboard but
    // can't be opened here — see project-card.tsx for the full rationale.
    const [isDesktop, setIsDesktop] = useState(false);
    useEffect(() => setIsDesktop(isDesktopLocalAvailable()), []);
    const isLocalProject = project.metadata?.storageMode === 'local';
    const openBlocked = isLocalProject && !isDesktop;

    // Row-level navigation. In selection mode the same click toggles the
    // checkbox instead. Buttons / dropdowns inside the row stop propagation
    // so they never reach this handler.
    const handleRowActivate = (event?: React.MouseEvent | React.KeyboardEvent) => {
        if (selectionMode) {
            onSelectionChange?.(!selected);
            return;
        }
        // Local project in the browser: explain instead of navigating to an
        // editor route that can't boot a NodeFs runtime here.
        if (openBlocked) {
            toast.error(t('localDesktopOnly'));
            return;
        }
        if (event && (event.metaKey || event.ctrlKey || event.shiftKey)) {
            window.open(projectHref, '_blank', 'noopener,noreferrer');
            return;
        }
        setIsOpening(true);
        router.push(projectHref);
    };

    const handleRowKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleRowActivate(event);
        }
    };

    // Middle-click → new tab. Right-click is ignored here so the context menu
    // (Phase B) can take over.
    const handleRowAuxClick = (event: React.MouseEvent) => {
        if (selectionMode || event.button !== 1 || openBlocked) return;
        event.preventDefault();
        window.open(projectHref, '_blank', 'noopener,noreferrer');
    };

    const handleHoverPrefetch = useCallback(() => {
        if (hasPrefetched || selectionMode || openBlocked) return;
        router.prefetch(projectHref);
        setHasPrefetched(true);
    }, [hasPrefetched, projectHref, router, selectionMode, openBlocked]);

    const thumb = (
        <div className="bg-background-canvas relative h-10 w-14 shrink-0 overflow-hidden rounded-md">
            {previewImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={previewImageUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                />
            ) : (
                <div className="flex h-full w-full items-center justify-center bg-[#111]">
                    <span className="text-foreground/20 text-xs font-semibold">{initial}</span>
                </div>
            )}
            {isBackfilling && (
                <span
                    aria-label={t('freshCapturing')}
                    title={t('freshCapturing')}
                    className="bg-foreground-success/80 absolute top-1 left-1 h-1.5 w-1.5 animate-pulse rounded-full"
                />
            )}
        </div>
    );

    const nameCell = (
        <div className="flex min-w-0 items-center gap-2">
            {faviconUrl && !faviconFailed ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={faviconUrl}
                    alt=""
                    className="h-4 w-4 shrink-0 rounded-xs object-cover"
                    loading="lazy"
                    onError={() => setFaviconFailed(true)}
                />
            ) : (
                <Icons.Globe className="text-foreground-tertiary h-4 w-4 shrink-0" />
            )}
            <span className="text-foreground truncate text-sm font-medium">
                {HighlightText ? (
                    <HighlightText text={project.name} searchQuery={searchQuery} />
                ) : (
                    project.name
                )}
            </span>
            {isLocalProject && (
                <span
                    title={openBlocked ? t('localDesktopOnly') : undefined}
                    className="border-foreground/10 bg-foreground/4 text-foreground-tertiary text-tiny inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 font-medium"
                >
                    <Icons.Laptop className="h-3 w-3" />
                    {t('localBadge')}
                </span>
            )}
        </div>
    );

    const statusPill = (
        <span
            className={cn(
                'text-tiny inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium',
                isPublished
                    ? 'border-foreground-success/20 bg-foreground-success/10 text-foreground-success'
                    : 'border-foreground/10 bg-foreground/4 text-foreground-tertiary',
            )}
        >
            <span
                className={cn(
                    'h-1 w-1 rounded-full',
                    isPublished ? 'bg-foreground-success/80' : 'bg-foreground-tertiary/60',
                )}
            />
            {isPublished ? t('statusPublished') : t('statusDraft')}
        </span>
    );

    // Click swallow — keeps interactive children (checkbox, dropdown, link)
    // from triggering row-level navigation. Pointer events only; keyboard
    // is handled by each child's own interactive element so the user can
    // still tab through them.
    const stopClick = (event: React.MouseEvent) => event.stopPropagation();

    const checkbox = (
        <div
            role="presentation"
            className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center transition-opacity',
                selectionMode || selected ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100',
            )}
            onClick={stopClick}
        >
            <Checkbox
                checked={selected}
                onCheckedChange={(checked) => onSelectionChange?.(checked === true)}
                aria-label={`Select ${project.name}`}
                className="border-foreground/20 bg-foreground/5 data-[state=checked]:border-foreground/30 data-[state=checked]:bg-foreground data-[state=checked]:text-background rounded-full"
            />
        </div>
    );

    const actions = (
        <div
            role="presentation"
            className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover/row:opacity-100"
            onClick={stopClick}
        >
            {siteUrl && (
                <a
                    href={siteUrl}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    className="text-foreground-tertiary hover:text-foreground hover:bg-foreground/6 flex h-7 w-7 items-center justify-center rounded-sm"
                    title={t('openInNewTab')}
                    aria-label={t('openInNewTab')}
                >
                    <Icons.ExternalLink className="h-3.5 w-3.5" />
                </a>
            )}
            <SettingsDropdown project={project as Project} refetch={() => void refetch()} />
        </div>
    );

    // Single role="link" / role="button" wrapper drives the entire row.
    // Avoids nested <a> / <button> inside a Next <Link> — those produced
    // invalid HTML when the row also rendered an action <a> and a settings
    // dropdown button.
    const rowRole = selectionMode ? 'button' : 'link';
    const rowAriaLabel = selectionMode
        ? `Select ${project.name}`
        : t('openProjectAria', { name: project.name });

    const openingOverlay = isOpening && !selectionMode && (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.12 }}
            className="bg-background/72 pointer-events-none absolute inset-0 z-30 flex items-center justify-center gap-2 rounded-lg backdrop-blur-sm"
            aria-live="polite"
        >
            <Icons.LoadingSpinner className="text-foreground/70 h-4 w-4 animate-spin" />
            <span className="text-foreground-secondary text-xs">
                {t('opening', { name: project.name })}
            </span>
        </motion.div>
    );

    if (variant === 'list') {
        return (
            <ProjectCardContextMenu project={project as Project} refetch={refetch}>
                <motion.div
                    layout
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                    onMouseEnter={handleHoverPrefetch}
                    onFocus={handleHoverPrefetch}
                    className="relative"
                >
                    <div
                        role={rowRole}
                        tabIndex={0}
                        aria-label={rowAriaLabel}
                        onClick={handleRowActivate}
                        onAuxClick={handleRowAuxClick}
                        onKeyDown={handleRowKeyDown}
                        className="group/row hover:bg-foreground/4 focus-visible:bg-foreground/4 focus-visible:outline-foreground/20 flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors focus-visible:outline-2"
                    >
                        {checkbox}
                        {thumb}
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            {nameCell}
                            {displayUrl ? (
                                <span className="text-foreground-tertiary flex items-center gap-1 truncate text-xs">
                                    <Icons.ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
                                    <span className="truncate">{displayUrl}</span>
                                </span>
                            ) : (
                                <span className="text-foreground-tertiary truncate text-xs">
                                    {t('statusDraft')}
                                </span>
                            )}
                        </div>
                        <div className="hidden sm:block">{statusPill}</div>
                        <span className="text-foreground-tertiary hidden w-20 shrink-0 text-right text-xs sm:inline">
                            {lastUpdated} ago
                        </span>
                        {actions}
                    </div>
                    {openingOverlay}
                </motion.div>
            </ProjectCardContextMenu>
        );
    }

    return (
        <ProjectCardContextMenu project={project as Project} refetch={refetch}>
            <motion.div
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 26 }}
                onMouseEnter={handleHoverPrefetch}
                onFocus={handleHoverPrefetch}
                className="relative"
            >
                <div
                    role={rowRole}
                    tabIndex={0}
                    aria-label={rowAriaLabel}
                    onClick={handleRowActivate}
                    onAuxClick={handleRowAuxClick}
                    onKeyDown={handleRowKeyDown}
                    className="group/row hover:bg-foreground/4 focus-visible:bg-foreground/4 focus-visible:outline-foreground/20 grid cursor-pointer grid-cols-[32px_56px_minmax(0,1fr)_minmax(0,1.2fr)_88px_minmax(0,140px)_104px] items-center gap-3 rounded-lg px-2 py-2 transition-colors focus-visible:outline-2"
                >
                    {checkbox}
                    {thumb}
                    {nameCell}
                    <span className="text-foreground-tertiary truncate text-xs">
                        {displayUrl ?? '—'}
                    </span>
                    <span className="text-foreground-tertiary truncate text-xs">
                        {framework ?? '—'}
                    </span>
                    <span className="text-foreground-tertiary truncate text-xs">
                        {lastUpdated} ago
                    </span>
                    <div className="flex items-center justify-end gap-2">
                        {statusPill}
                        {actions}
                    </div>
                </div>
                {openingOverlay}
            </motion.div>
        </ProjectCardContextMenu>
    );
};

export const ProjectTableHeader = () => {
    const t = useTranslations('selectProject');
    return (
        <div className="text-foreground-tertiary border-foreground/8 text-tiny grid grid-cols-[32px_56px_minmax(0,1fr)_minmax(0,1.2fr)_88px_minmax(0,140px)_104px] items-center gap-3 border-b px-2 pb-2 font-medium">
            <span></span>
            <span></span>
            <span>{t('tableColName')}</span>
            <span>{t('tableColUrl')}</span>
            <span>{t('tableColTech')}</span>
            <span>{t('tableColUpdated')}</span>
            <span className="text-right">{t('tableColStatus')}</span>
        </div>
    );
};
