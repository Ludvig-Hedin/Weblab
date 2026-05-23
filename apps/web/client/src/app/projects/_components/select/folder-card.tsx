'use client';

import { useMemo } from 'react';
import { ChevronRight, FolderClosed, FolderOpen } from 'lucide-react';
import { motion } from 'motion/react';

import { timeAgo } from '@weblab/utility';

import type { ProjectFolder, ProjectListItem } from './project-card-utils';
import { getDisplayUrl, getProjectPreviewImageUrl, getProjectSiteUrl } from './project-card-utils';

interface FolderCardProps {
    folder: ProjectFolder;
    projects: ProjectListItem[];
    isOpen: boolean;
    onToggle: () => void;
}

const PreviewTile = ({ project }: { project?: ProjectListItem }) => {
    const imageUrl = project ? getProjectPreviewImageUrl(project) : null;
    const siteUrl = project ? getProjectSiteUrl(project) : null;
    const displayUrl = getDisplayUrl(siteUrl);

    return (
        <div className="border-foreground-primary/8 bg-background-primary relative overflow-hidden rounded-lg border shadow-[0_18px_40px_rgba(0,0,0,0.2)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.1),_transparent_40%),linear-gradient(155deg,_rgba(126,97,72,0.32),_rgba(20,16,14,0.96)_58%)]" />
            {imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={imageUrl}
                    alt={project?.name ?? 'Project preview'}
                    className="absolute inset-0 h-full w-full object-cover"
                    loading="lazy"
                />
            )}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.05),rgba(0,0,0,0.4))]" />
            {displayUrl && (
                <div className="border-foreground-primary/8 text-microPlus absolute inset-x-2 bottom-2 truncate rounded-full border bg-black/52 px-2 py-1 text-white/72 backdrop-blur-md">
                    {displayUrl}
                </div>
            )}
        </div>
    );
};

export const FolderCard = ({ folder, projects, isOpen, onToggle }: FolderCardProps) => {
    const projectCount = projects.length;
    const lastUpdated = useMemo(() => {
        if (projects.length === 0) {
            return 'Empty';
        }

        const latest = [...projects].sort(
            (left, right) =>
                new Date(right.metadata.updatedAt).getTime() -
                new Date(left.metadata.updatedAt).getTime(),
        )[0];

        return latest ? `${timeAgo(latest.metadata.updatedAt)} ago` : 'Empty';
    }, [projects]);

    const previewProjects = projects.slice(0, 3);

    return (
        <motion.button
            type="button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ y: -3 }}
            transition={{ type: 'spring', stiffness: 280, damping: 24 }}
            className="group w-full text-left"
            onClick={onToggle}
        >
            <div className="border-foreground-primary/8 bg-background group-hover:border-foreground-primary/14 relative aspect-[4/2.75] overflow-hidden rounded-[26px] border p-3 shadow-[0_24px_70px_rgba(0,0,0,0.28)] transition-colors duration-200">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.08),_transparent_38%),linear-gradient(160deg,_rgba(97,76,54,0.22),_rgba(18,15,14,0.96)_60%)]" />
                <div className="relative grid h-full grid-cols-[1.3fr_0.9fr] gap-2.5">
                    <PreviewTile project={previewProjects[0]} />
                    <div className="grid gap-2.5">
                        <PreviewTile project={previewProjects[1]} />
                        <PreviewTile project={previewProjects[2]} />
                    </div>
                </div>
                <div className="absolute inset-x-0 bottom-0 rounded-b-[26px] bg-[linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,0.76)_48%,rgba(0,0,0,0.92))] px-4 pt-16 pb-4">
                    <div className="flex items-end justify-between gap-3">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                {isOpen ? (
                                    <FolderOpen className="h-4 w-4 shrink-0 text-white/82" />
                                ) : (
                                    <FolderClosed className="h-4 w-4 shrink-0 text-white/72" />
                                )}
                                <span className="truncate text-sm font-medium text-white">
                                    {folder.name}
                                </span>
                            </div>
                            <div className="mt-1 text-xs text-white/58">
                                {projectCount} {projectCount === 1 ? 'site' : 'sites'}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-white/52">
                            <span>{lastUpdated}</span>
                            <ChevronRight
                                className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </motion.button>
    );
};
