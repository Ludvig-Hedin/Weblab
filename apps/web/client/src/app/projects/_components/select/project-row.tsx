'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import type { Project } from '@weblab/models';
import { Checkbox } from '@weblab/ui/checkbox';
import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';
import { timeAgo } from '@weblab/utility';

import type { ProjectListItem } from './project-card-utils';
import { SettingsDropdown } from '../settings';
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
    const t = useTranslations('selectProject');
    const router = useRouter();
    const [faviconFailed, setFaviconFailed] = useState(false);
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

    // Row-level navigation. In selection mode the same click toggles the
    // checkbox instead. Buttons / dropdowns inside the row stop propagation
    // so they never reach this handler.
    const handleRowActivate = () => {
        if (selectionMode) {
            onSelectionChange?.(!selected);
        } else {
            router.push(projectHref);
        }
    };

    const handleRowKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleRowActivate();
        }
    };

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
                    className="absolute top-1 left-1 h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400/80"
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
                    className="h-4 w-4 shrink-0 rounded-[4px] object-cover"
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
        </div>
    );

    const statusPill = (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide uppercase',
                isPublished
                    ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                    : 'border-foreground/10 bg-foreground/4 text-foreground-tertiary',
            )}
        >
            <span
                className={cn(
                    'h-1 w-1 rounded-full',
                    isPublished ? 'bg-emerald-400/80' : 'bg-foreground-tertiary/60',
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
    const rowAriaLabel = selectionMode ? `Select ${project.name}` : `Open ${project.name}`;

    if (variant === 'list') {
        return (
            <motion.div
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            >
                <div
                    role={rowRole}
                    tabIndex={0}
                    aria-label={rowAriaLabel}
                    onClick={handleRowActivate}
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
            </motion.div>
        );
    }

    return (
        <motion.div
            layout
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
        >
            <div
                role={rowRole}
                tabIndex={0}
                aria-label={rowAriaLabel}
                onClick={handleRowActivate}
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
                <span className="text-foreground-tertiary truncate text-xs">{lastUpdated} ago</span>
                <div className="flex items-center justify-end gap-2">
                    {statusPill}
                    {actions}
                </div>
            </div>
        </motion.div>
    );
};

export const ProjectTableHeader = () => {
    const t = useTranslations('selectProject');
    return (
        <div className="text-foreground-tertiary border-foreground/8 grid grid-cols-[32px_56px_minmax(0,1fr)_minmax(0,1.2fr)_88px_minmax(0,140px)_104px] items-center gap-3 border-b px-2 pb-2 text-[10px] font-medium tracking-wider uppercase">
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
