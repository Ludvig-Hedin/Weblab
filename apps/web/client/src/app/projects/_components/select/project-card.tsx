'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';

import type { Project } from '@weblab/models';
import { Checkbox } from '@weblab/ui/checkbox';
import { Icons } from '@weblab/ui/icons';
import { cn } from '@weblab/ui/utils';
import { timeAgo } from '@weblab/utility';

import type { ProjectListItem } from './project-card-utils';
import { EditAppButton } from '../edit-app';
import { SettingsDropdown } from '../settings';
import {
    getDisplayUrl,
    getFaviconUrl,
    getProjectPreviewImageUrl,
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
}: {
    project: ProjectListItem;
    refetch: () => void | Promise<unknown>;
    searchQuery?: string;
    HighlightText?: React.ComponentType<{ text: string; searchQuery: string }>;
    selectionMode?: boolean;
    selected?: boolean;
    onSelectionChange?: (selected: boolean) => void;
}) {
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

    useEffect(() => {
        setFaviconFailed(false);
    }, [faviconUrl]);

    const handleCardClick = () => {
        if (selectionMode) {
            onSelectionChange?.(!selected);
            return;
        }

        router.push(`/project/${project.id}`);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -2 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className="group w-full"
        >
            <div
                className={cn(
                    'cursor-pointer rounded-xl p-1.5 transition-colors duration-200',
                    selected ? 'bg-foreground/8' : 'bg-transparent hover:bg-foreground/4',
                )}
                onClick={handleCardClick}
                onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleCardClick();
                    }
                }}
                role="button"
                tabIndex={0}
            >
                <div className="relative">
                    <ProjectPreviewSurface
                        projectName={project.name}
                        imageUrl={previewImageUrl}
                        siteUrl={siteUrl}
                        className="aspect-[4/2.75]"
                    />

                    <button
                        type="button"
                        className={cn(
                            'absolute top-3 left-3 z-30 rounded-full border border-white/10 bg-black/50 p-1.5 backdrop-blur-md transition-opacity',
                            selectionMode || selected
                                ? 'opacity-100'
                                : 'opacity-0 group-hover:opacity-100',
                        )}
                        onClick={(event) => event.stopPropagation()}
                    >
                        <Checkbox
                            checked={selected}
                            onCheckedChange={(checked) => onSelectionChange?.(checked === true)}
                            aria-label={`Select ${project.name}`}
                            className="rounded-full border-foreground/20 bg-foreground/5 data-[state=checked]:border-foreground/30 data-[state=checked]:bg-foreground data-[state=checked]:text-background"
                        />
                    </button>

                    {!selectionMode && (
                        <>
                            <div className="absolute top-3 right-3 z-30 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                                <SettingsDropdown
                                    project={project as Project}
                                    refetch={() => {
                                        void refetch();
                                    }}
                                />
                            </div>
                            <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                                <EditAppButton project={project as Project} />
                            </div>
                        </>
                    )}
                </div>

                <div className="mt-3 flex items-start justify-between gap-3 px-1">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
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

                        <div className="text-foreground-tertiary mt-1 flex items-center gap-2 text-xs">
                            <Icons.ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-60" />
                            <span className="truncate">{displayUrl ?? 'No URL yet'}</span>
                        </div>
                    </div>

                    <span className="text-foreground-tertiary mt-0.5 flex-shrink-0 text-xs">
                        {lastUpdated} ago
                    </span>
                </div>
            </div>
        </motion.div>
    );
}
