'use client';

import { useMemo } from 'react';
import { motion } from 'motion/react';

import type { Project } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { timeAgo } from '@weblab/utility';

interface ProjectCardPresentationProps {
    project: Project;
    /** Resolved image URL (should be pre-resolved, not storage path) */
    imageUrl?: string | null;
    aspectRatio?: string;
    searchQuery?: string;
    HighlightText?: React.ComponentType<{ text: string; searchQuery: string }>;
    /** Callback when edit button is clicked */
    onEdit?: (project: Project) => void;
    /** Callback when rename is clicked */
    onRename?: (project: Project) => void;
    /** Callback when clone is clicked */
    onClone?: (project: Project) => void;
    /** Callback when convert to/from template is clicked */
    onToggleTemplate?: (project: Project) => void;
    /** Callback when delete is clicked */
    onDelete?: (project: Project) => void;
    /** Whether this project is a template */
    isTemplate?: boolean;
}

/**
 * ProjectCardPresentation - Pure presentational version of ProjectCard.
 * Takes all data as props, including pre-resolved image URLs.
 */
export function ProjectCardPresentation({
    project,
    imageUrl,
    aspectRatio = 'aspect-[4/2.6]',
    searchQuery = '',
    HighlightText,
    onEdit,
    onRename,
    onClone,
    onToggleTemplate,
    onDelete,
    isTemplate = false,
}: ProjectCardPresentationProps) {
    const SHOW_DESCRIPTION = false;
    const lastUpdated = useMemo(
        () => timeAgo(project.metadata.updatedAt),
        [project.metadata.updatedAt],
    );
    const storageMode = project.metadata.storageMode ?? 'cloud';
    const storageLabel =
        storageMode === 'hybrid' ? 'Synced' : storageMode === 'local' ? 'Local' : 'Cloud';
    const storageBadgeClass =
        storageMode === 'hybrid'
            ? 'border-success/25 bg-foreground-success/20 text-foreground-success'
            : storageMode === 'local'
              ? 'border-foreground-brand/25 bg-foreground-brand/20 text-foreground-brand'
              : 'border-foreground-primary/15 bg-black/35 text-foreground-primary/85';

    const handleEdit = () => {
        onEdit?.(project);
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -4 }}
            transition={{ type: 'spring', stiffness: 300, damping: 24 }}
            className="w-full cursor-pointer break-inside-avoid"
            onClick={handleEdit}
        >
            <div
                className={`relative ${aspectRatio} group overflow-hidden rounded-lg shadow-sm transition-all duration-300 hover:shadow-xl hover:shadow-black/20`}
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

                <div className="absolute top-3 left-3 z-30">
                    <span
                        className={`rounded-full border px-2 py-1 text-[10px] font-medium backdrop-blur-md ${storageBadgeClass}`}
                    >
                        {storageLabel}
                    </span>
                </div>

                <div className="absolute top-3 right-3 z-30 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                size="default"
                                variant="ghost"
                                className="hover:bg-background-weblab flex h-8 w-8 cursor-pointer items-center justify-center p-0 backdrop-blur-lg"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <Icons.DotsHorizontal />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                            className="z-50"
                            align="end"
                            alignOffset={-4}
                            sideOffset={8}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {onRename && (
                                <DropdownMenuItem
                                    onSelect={(event) => {
                                        event.preventDefault();
                                        onRename(project);
                                    }}
                                    className="text-foreground-active hover:!bg-background-weblab hover:!text-foreground-active gap-2"
                                >
                                    <Icons.Pencil className="h-4 w-4" />
                                    Rename Project
                                </DropdownMenuItem>
                            )}
                            {onClone && (
                                <DropdownMenuItem
                                    onSelect={(event) => {
                                        event.preventDefault();
                                        onClone(project);
                                    }}
                                    className="text-foreground-active hover:!bg-background-weblab hover:!text-foreground-active gap-2"
                                >
                                    <Icons.Copy className="h-4 w-4" />
                                    Clone Project
                                </DropdownMenuItem>
                            )}
                            {onToggleTemplate && (
                                <DropdownMenuItem
                                    onSelect={(event) => {
                                        event.preventDefault();
                                        onToggleTemplate(project);
                                    }}
                                    className="text-foreground-active hover:!bg-background-weblab hover:!text-foreground-active gap-2"
                                >
                                    {isTemplate ? (
                                        <>
                                            <Icons.CrossL className="text-foreground-skill h-4 w-4" />
                                            Unmark as template
                                        </>
                                    ) : (
                                        <>
                                            <Icons.FilePlus className="h-4 w-4" />
                                            Convert to template
                                        </>
                                    )}
                                </DropdownMenuItem>
                            )}
                            {onDelete && (
                                <DropdownMenuItem
                                    variant="destructive"
                                    onSelect={(event) => {
                                        event.preventDefault();
                                        onDelete(project);
                                    }}
                                    className="gap-2"
                                >
                                    <Icons.Trash className="h-4 w-4" />
                                    Delete Project
                                </DropdownMenuItem>
                            )}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                {onEdit && (
                    <div className="bg-background/30 pointer-events-none absolute inset-0 z-20 flex items-center justify-center opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
                        <Button
                            size="default"
                            onClick={(e) => {
                                e.stopPropagation();
                                handleEdit();
                            }}
                            className="border-border bg-background text-foreground hover:bg-background-secondary w-auto cursor-pointer gap-2 border"
                        >
                            <Icons.PencilPaper />
                            <p>Edit App</p>
                        </Button>
                    </div>
                )}

                <div
                    className="from-background via-background/20 group-hover:from-background group-hover:via-background/40 absolute right-0 bottom-0 left-0 h-32 bg-gradient-to-t to-transparent p-4 transition-all duration-300"
                    style={{ bottom: '-1px', left: '-1px', right: '-1px' }}
                >
                    <div className="flex h-full items-end justify-between">
                        <div>
                            <div className="mb-1 truncate text-base font-medium text-white drop-shadow-lg">
                                {HighlightText ? (
                                    <HighlightText text={project.name} searchQuery={searchQuery} />
                                ) : (
                                    project.name
                                )}
                            </div>
                            <div className="mb-1 flex items-center text-xs text-white/70 drop-shadow-lg">
                                <span>{lastUpdated} ago</span>
                            </div>
                            {SHOW_DESCRIPTION && project.metadata?.description && (
                                <div className="line-clamp-1 text-xs text-white/60 drop-shadow-lg">
                                    {HighlightText ? (
                                        <HighlightText
                                            text={project.metadata.description}
                                            searchQuery={searchQuery}
                                        />
                                    ) : (
                                        project.metadata.description
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
