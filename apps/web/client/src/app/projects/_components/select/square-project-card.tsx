'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import type { Project } from '@weblab/models';
import { STORAGE_BUCKETS } from '@weblab/constants';
import { timeAgo } from '@weblab/utility';

import { Routes } from '@/utils/constants';
import { getFileUrlFromStorage } from '@/utils/supabase/client';
import { EditAppButton } from '../edit-app';
import { SettingsDropdown } from '../settings';
import { ProjectCardContextMenu } from './project-card-context-menu';

export function SquareProjectCard({
    project,
    searchQuery = '',
    HighlightText,
    refetch,
}: {
    project: Project;
    searchQuery?: string;
    HighlightText?: React.ComponentType<{ text: string; searchQuery: string }>;
    refetch: () => void;
}) {
    const [img, setImg] = useState<string | null>(null);
    const projectHref = `${Routes.PROJECT}/${project.id}`;

    useEffect(() => {
        let isMounted = true;
        const preview = project.metadata?.previewImg;
        if (!preview) return;
        if (preview.type === 'url' && preview.url) {
            if (isMounted) setImg(preview.url);
        } else {
            const path = preview.storagePath?.path ?? '';
            if (!path) return;
            const bucket = preview.storagePath?.bucket ?? STORAGE_BUCKETS.PREVIEW_IMAGES;
            const url = getFileUrlFromStorage(bucket, path);
            if (isMounted) setImg(url ?? null);
        }
        return () => {
            isMounted = false;
        };
    }, [project.metadata?.previewImg]);

    const lastUpdated = useMemo(
        () => (project.metadata?.updatedAt ? timeAgo(project.metadata.updatedAt) : null),
        [project.metadata?.updatedAt],
    );

    // Deterministic brand-tinted gradient for projects without a thumbnail.
    // Older projects never captured a screenshot so they fell back to a
    // flat grey block — using a hash of the project id gives every card a
    // stable, recognizable identity instead.
    const fallback = useMemo(() => {
        const palette = [
            { from: '#1f2a37', via: '#0f172a', to: '#020617', text: '#e2e8f0' }, // slate
            { from: '#1e293b', via: '#0c4a6e', to: '#082f49', text: '#bae6fd' }, // sky
            { from: '#1e1b4b', via: '#312e81', to: '#1e1b4b', text: '#c7d2fe' }, // indigo
            { from: '#134e4a', via: '#042f2e', to: '#022c22', text: '#99f6e4' }, // teal
            { from: '#3f1d1d', via: '#7c2d12', to: '#431407', text: '#fed7aa' }, // orange
            { from: '#1f2937', via: '#374151', to: '#111827', text: '#d1d5db' }, // gray
        ];
        let hash = 0;
        for (let i = 0; i < project.id.length; i++) {
            hash = (hash * 31 + project.id.charCodeAt(i)) | 0;
        }
        const swatch = palette[Math.abs(hash) % palette.length]!;
        const initial = (project.name?.trim()?.[0] ?? '?').toUpperCase();
        return { swatch, initial };
    }, [project.id, project.name]);

    return (
        <ProjectCardContextMenu project={project} refetch={refetch}>
            <Link
                href={projectHref}
                className="group block cursor-pointer transition-all duration-300"
            >
                <div
                    className={`relative aspect-[4/2.8] w-full overflow-hidden rounded-lg shadow-sm transition-all duration-300`}
                >
                    {img ? (
                        <img
                            src={img}
                            alt={project.name}
                            className="absolute inset-0 h-full w-full object-cover"
                            loading="lazy"
                        />
                    ) : (
                        <>
                            <div
                                className="absolute inset-0 h-full w-full"
                                style={{
                                    backgroundImage: `linear-gradient(160deg, ${fallback.swatch.from} 0%, ${fallback.swatch.via} 55%, ${fallback.swatch.to} 100%)`,
                                }}
                            />
                            <div
                                className="absolute inset-0 flex items-center justify-center"
                                aria-hidden
                            >
                                <span
                                    className="font-semibold opacity-70 select-none"
                                    style={{
                                        color: fallback.swatch.text,
                                        fontSize: 'clamp(2.5rem, 5vw, 4rem)',
                                        letterSpacing: '-0.04em',
                                    }}
                                >
                                    {fallback.initial}
                                </span>
                            </div>
                            <div
                                className="border-foreground-tertiary/40 absolute inset-0 rounded-lg border-[0.5px]"
                                style={{
                                    maskImage:
                                        'linear-gradient(to bottom, black 60%, transparent 100%)',
                                }}
                            />
                        </>
                    )}

                    <div className="absolute inset-0 bg-black/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />

                    <div className="bg-background/30 absolute inset-0 z-30 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                        <EditAppButton
                            project={project}
                            onClick={(e) => {
                                e.stopPropagation();
                                // Cancel the wrapping <Link>'s navigation.
                                // EditAppButton runs its own router.push, so
                                // we don't want both firing.
                                e.preventDefault();
                            }}
                        />
                    </div>

                    {/* Capture-phase preventDefault swallows the wrapping
                        <Link>'s navigation when the user clicks the settings
                        dots. SettingsDropdown's own stopPropagation halts
                        bubble before reaching here. */}
                    <div
                        className="absolute top-3 right-3 z-30 opacity-0 transition-opacity duration-200 group-hover:opacity-100"
                        onClickCapture={(e) => e.preventDefault()}
                    >
                        <SettingsDropdown project={project} refetch={refetch} />
                    </div>

                    <div className="absolute right-0 bottom-0 left-0 z-10 p-3 transition-opacity duration-300 group-hover:opacity-50">
                        <div className="mb-1 truncate text-sm font-medium text-white drop-shadow-lg">
                            {HighlightText ? (
                                <HighlightText text={project.name} searchQuery={searchQuery} />
                            ) : (
                                project.name
                            )}
                        </div>
                        <div className="mb-1 flex items-center text-xs text-white/70 drop-shadow-lg">
                            {lastUpdated !== null && <span>{lastUpdated} ago</span>}
                        </div>
                    </div>
                </div>
            </Link>
        </ProjectCardContextMenu>
    );
}
