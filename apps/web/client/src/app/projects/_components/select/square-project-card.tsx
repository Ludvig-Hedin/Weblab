'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { Project } from '@weblab/models';
import { STORAGE_BUCKETS } from '@weblab/constants';
import { timeAgo } from '@weblab/utility';

import { getFileUrlFromStorage } from '@/utils/supabase/client';
import { EditAppButton } from '../edit-app';
import { SettingsDropdown } from '../settings';

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
    const router = useRouter();

    const handleClick = () => {
        router.push(`/project/${project.id}`);
    };

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

    return (
        <div
            className="group cursor-pointer transition-all duration-300"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleClick();
                }
            }}
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
                        <div className="from-foreground/30 via-foreground/15 to-foreground/10 absolute inset-0 h-full w-full bg-gradient-to-t" />
                        <div
                            className="border-foreground-tertiary/70 absolute inset-0 rounded-lg border-[0.5px]"
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
                        }}
                    />
                </div>

                <div className="absolute top-3 right-3 z-30 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
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
        </div>
    );
}
