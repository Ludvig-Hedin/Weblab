'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { useTranslations } from 'next-intl';

import type { Project } from '@weblab/models';
import { Checkbox } from '@weblab/ui/checkbox';
import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';
import { timeAgo } from '@weblab/utility';

import type { ProjectListItem } from './project-card-utils';
import { env } from '@/env';
import { EditAppButton } from '../edit-app';
import { SettingsDropdown } from '../settings';
import {
    getDisplayUrl,
    getFaviconUrl,
    getProjectPreviewImageUrl,
    getProjectSandboxPreviewUrl,
    getProjectSiteUrl,
} from './project-card-utils';
import { ProjectPreviewSurface } from './project-preview-surface';

export function ProjectCard({
    project,
    refetch,
    searchQuery = '',
    HighlightText,
    selectionMode = false,
    selected = false,
    onSelectionChange,
    isBackfilling = false,
}: {
    project: ProjectListItem;
    refetch: () => void | Promise<unknown>;
    searchQuery?: string;
    HighlightText?: React.ComponentType<{ text: string; searchQuery: string }>;
    selectionMode?: boolean;
    selected?: boolean;
    onSelectionChange?: (selected: boolean) => void;
    isBackfilling?: boolean;
}) {
    const t = useTranslations('selectProject') as (
        key: string,
        values?: Record<string, string | number>,
    ) => string;
    const router = useRouter();
    const [faviconFailed, setFaviconFailed] = useState(false);
    // Instant-feedback state. Flips on `onClick` for the project link and
    // stays true until the parent route swaps this component out — gives
    // the user a per-card "Opening…" overlay instead of an empty wait while
    // the editor route hydrates.
    const [isOpening, setIsOpening] = useState(false);
    const [hasPrefetched, setHasPrefetched] = useState(false);

    const lastUpdated = useMemo(
        () => timeAgo(project.metadata?.updatedAt),
        [project.metadata?.updatedAt],
    );
    // "Recently active" surfaces a green dot when the project was touched in
    // the last 5 minutes — gives the dashboard a heartbeat for parallel work.
    const isRecentlyActive = useMemo(() => {
        const updated = project.metadata?.updatedAt;
        if (!updated) return false;
        const ts = new Date(updated).getTime();
        return Number.isFinite(ts) && Date.now() - ts < 5 * 60 * 1000;
    }, [project.metadata?.updatedAt]);
    const previewImageUrl = useMemo(() => getProjectPreviewImageUrl(project), [project]);
    const siteUrl = useMemo(() => getProjectSiteUrl(project), [project]);
    const sandboxPreviewUrl = useMemo(() => getProjectSandboxPreviewUrl(project), [project]);
    const displayUrl = useMemo(() => getDisplayUrl(siteUrl), [siteUrl]);
    const faviconUrl = useMemo(() => getFaviconUrl(siteUrl), [siteUrl]);

    useEffect(() => {
        setFaviconFailed(false);
    }, [faviconUrl]);

    const projectHref = `/project/${project.id}`;

    const handleSelectionClick = () => {
        if (selectionMode) {
            onSelectionChange?.(!selected);
        }
    };

    // Warm the editor route on first hover so the click → render gap is
    // dominated by data, not by JS chunk download. Next's <Link> already
    // prefetches on viewport entry but only the page boundary — calling
    // router.prefetch explicitly ensures the loader chunk is hot.
    //
    // NOTE: When NEXT_PUBLIC_AGGRESSIVE_PREFETCH=true, this previously also
    // pre-populated the tRPC bootstrap cache. The Convex client uses its own
    // subscription cache and doesn't expose an equivalent prefetch hook from
    // outside React; the flag is currently route-prefetch-only.
    const handleHoverPrefetch = useCallback(() => {
        if (hasPrefetched || selectionMode) return;
        router.prefetch(projectHref);
        // env imported for parity with prior aggressive-prefetch flag — keep
        // the read so the value is statically referenced for tree-shaking.
        void env.NEXT_PUBLIC_AGGRESSIVE_PREFETCH;
        setHasPrefetched(true);
    }, [hasPrefetched, projectHref, router, selectionMode]);

    const handleOpenClick = useCallback(() => {
        // Skip overlay while in selection mode — click toggles the checkbox
        // instead of navigating.
        if (selectionMode) return;
        setIsOpening(true);
    }, [selectionMode]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            onMouseEnter={handleHoverPrefetch}
            onFocus={handleHoverPrefetch}
            className="group/card w-full"
        >
            <div
                className={cn(
                    'rounded-xl p-1.5 transition-colors duration-200',
                    selected ? 'bg-foreground/8' : 'bg-transparent',
                )}
            >
                <div className="relative">
                    {selectionMode ? (
                        <button
                            type="button"
                            className="block w-full overflow-hidden rounded-xl text-left"
                            onClick={handleSelectionClick}
                            aria-label={`Select ${project.name}`}
                        >
                            <ProjectPreviewSurface
                                projectName={project.name}
                                imageUrl={previewImageUrl}
                                siteUrl={siteUrl}
                                sandboxPreviewUrl={sandboxPreviewUrl}
                                className="aspect-[4/2.75] rounded-[inherit] transition-transform duration-300 ease-out group-hover/card:scale-[1.02]"
                            />
                        </button>
                    ) : (
                        <Link
                            href={projectHref}
                            prefetch
                            onClick={handleOpenClick}
                            className="block overflow-hidden rounded-xl"
                            aria-label={t('openProjectAria', { name: project.name })}
                        >
                            <ProjectPreviewSurface
                                projectName={project.name}
                                imageUrl={previewImageUrl}
                                siteUrl={siteUrl}
                                sandboxPreviewUrl={sandboxPreviewUrl}
                                className="aspect-[4/2.75] rounded-[inherit] transition-transform duration-300 ease-out group-hover/card:scale-[1.02]"
                            />
                        </Link>
                    )}

                    <div
                        role="presentation"
                        className={cn(
                            'absolute top-3 left-3 z-30 flex h-8 w-8 items-center justify-center rounded-sm border border-white/10 bg-black/50 backdrop-blur-md transition-opacity',
                            selectionMode || selected
                                ? 'opacity-100'
                                : 'opacity-0 group-hover/card:opacity-100',
                        )}
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => event.stopPropagation()}
                    >
                        <Checkbox
                            checked={selected}
                            onCheckedChange={(checked) => onSelectionChange?.(checked === true)}
                            aria-label={`Select ${project.name}`}
                            className="border-foreground/20 bg-foreground/5 data-[state=checked]:border-foreground/30 data-[state=checked]:bg-foreground data-[state=checked]:text-background rounded-full"
                        />
                    </div>

                    {/* Status / freshness indicator — recently active wins
                        over the backfill pulse so a live edit isn't hidden by
                        a stale screenshot refresh happening in parallel. */}
                    {(isRecentlyActive || isBackfilling) && !selectionMode && (
                        <div
                            className={cn(
                                'pointer-events-none absolute top-3 left-3 z-20 flex h-8 w-8 items-center justify-center transition-opacity',
                                selectionMode || selected
                                    ? 'opacity-0'
                                    : 'group-hover/card:opacity-0',
                            )}
                        ></div>
                    )}

                    {!selectionMode && (
                        <>
                            <div
                                className="absolute top-3 right-3 z-30 opacity-0 transition-opacity duration-200 group-hover/card:opacity-100"
                                onClick={(e) => e.stopPropagation()}
                                onPointerDown={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                                role="presentation"
                            >
                                <SettingsDropdown
                                    project={project as Project}
                                    refetch={() => {
                                        void refetch();
                                    }}
                                />
                            </div>
                            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center opacity-0 transition-opacity group-hover/card:pointer-events-auto group-hover/card:opacity-100">
                                <EditAppButton project={project as Project} />
                            </div>
                        </>
                    )}

                    {/* Opening overlay — fires the moment the user clicks
                        the card / name. Stays mounted until the editor
                        route swaps this component out, so the user never
                        sees a blank gap between click and editor paint. */}
                    {isOpening && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.12 }}
                            className="bg-background/72 pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center gap-2 rounded-xl backdrop-blur-sm"
                            aria-live="polite"
                        >
                            <Icons.LoadingSpinner className="text-foreground/70 h-5 w-5 animate-spin" />
                            <span className="text-foreground-secondary px-3 text-center text-xs">
                                {t('opening', { name: project.name })}
                            </span>
                        </motion.div>
                    )}
                </div>

                <div className="mt-3 flex items-start justify-between gap-3 px-1">
                    <div className="min-w-0">
                        {selectionMode ? (
                            <button
                                type="button"
                                className="flex max-w-full items-center gap-2 text-left"
                                onClick={handleSelectionClick}
                            >
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
                                <span className="text-foreground truncate text-sm font-medium underline decoration-transparent underline-offset-3 transition-colors duration-200 group-hover/card:decoration-current">
                                    {HighlightText ? (
                                        <HighlightText
                                            text={project.name}
                                            searchQuery={searchQuery}
                                        />
                                    ) : (
                                        project.name
                                    )}
                                </span>
                            </button>
                        ) : (
                            <Link
                                href={projectHref}
                                prefetch
                                onClick={handleOpenClick}
                                className="flex max-w-full items-center gap-2"
                            >
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
                                <span className="text-foreground truncate text-sm font-medium underline decoration-transparent underline-offset-3 transition-colors duration-200 group-hover/card:decoration-current">
                                    {HighlightText ? (
                                        <HighlightText
                                            text={project.name}
                                            searchQuery={searchQuery}
                                        />
                                    ) : (
                                        project.name
                                    )}
                                </span>
                            </Link>
                        )}

                        {siteUrl ? (
                            <a
                                href={siteUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-foreground-tertiary hover:text-foreground mt-1 flex items-center gap-2 text-xs transition-colors"
                            >
                                <Icons.ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60" />
                                <span className="truncate">{displayUrl}</span>
                            </a>
                        ) : (
                            <div className="text-foreground-tertiary mt-1 flex items-center gap-2 text-xs">
                                <Icons.ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-40" />
                                <span className="truncate">Not Published</span>
                            </div>
                        )}
                    </div>

                    {selectionMode ? (
                        <button
                            type="button"
                            className="text-foreground-tertiary mt-0.5 flex-shrink-0 text-xs"
                            onClick={handleSelectionClick}
                        >
                            {lastUpdated} ago
                        </button>
                    ) : (
                        <Link
                            href={projectHref}
                            prefetch
                            onClick={handleOpenClick}
                            className="text-foreground-tertiary mt-0.5 flex-shrink-0 text-xs"
                        >
                            {lastUpdated} ago
                        </Link>
                    )}
                </div>
            </div>
        </motion.div>
    );
}
