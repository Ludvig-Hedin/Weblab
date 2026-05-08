'use client';

import { useMemo } from 'react';

import type { Project } from '@weblab/models';
import { timeAgo } from '@weblab/utility';

interface SquareProjectCardPresentationProps {
    project: Project;
    /** Resolved image URL (should be pre-resolved, not storage path) */
    imageUrl?: string | null;
    searchQuery?: string;
    HighlightText?: React.ComponentType<{ text: string; searchQuery: string }>;
    /** Callback when card is clicked */
    onClick?: (project: Project) => void;
}

/**
 * SquareProjectCardPresentation - Pure presentational version of SquareProjectCard.
 * Takes all data as props, including pre-resolved image URLs.
 */
export function SquareProjectCardPresentation({
    project,
    imageUrl,
    searchQuery = '',
    HighlightText,
    onClick,
}: SquareProjectCardPresentationProps) {
    const lastUpdated = useMemo(
        () => timeAgo(project.metadata.updatedAt),
        [project.metadata.updatedAt],
    );

    const handleClick = () => {
        onClick?.(project);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClick();
        }
    };

    return (
        <div className="group cursor-pointer transition-all duration-300" onClick={handleClick}>
            <div
                className={`relative aspect-[4/2.8] w-full overflow-hidden rounded-lg shadow-sm transition-all duration-300`}
            >
                {imageUrl ? (
                    <img
                        src={imageUrl}
                        alt={project.name}
                        className="absolute inset-0 h-full w-full object-cover"
                        loading="lazy"
                    />
                ) : (
                    <>
                        <div className="absolute inset-0 h-full w-full bg-gradient-to-t from-gray-800/40 via-gray-500/40 to-gray-400/40" />
                        <div
                            className="absolute inset-0 rounded-lg border-[0.5px] border-gray-500/70"
                            style={{
                                maskImage:
                                    'linear-gradient(to bottom, black 60%, transparent 100%)',
                            }}
                        />
                    </>
                )}

                <div className="absolute inset-0 bg-black/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

                <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 to-transparent" />

                {onClick && (
                    <div className="bg-background/30 absolute inset-0 z-30 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                handleClick();
                            }}
                            className="border-border bg-background text-foreground hover:bg-background-secondary w-auto cursor-pointer gap-2 rounded border px-4 py-2"
                        >
                            ✏️ Edit
                        </button>
                    </div>
                )}

                <div className="absolute right-0 bottom-0 left-0 z-10 p-3 transition-opacity duration-300 group-hover:opacity-50">
                    <div className="mb-1 truncate text-sm font-medium text-white drop-shadow-lg">
                        {HighlightText ? (
                            <HighlightText text={project.name} searchQuery={searchQuery} />
                        ) : (
                            project.name
                        )}
                    </div>
                    <div className="mb-1 flex items-center text-xs text-white/70 drop-shadow-lg">
                        <span>{lastUpdated} ago</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
