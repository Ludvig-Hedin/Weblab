'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import {
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';

import type { Id } from '@convex/_generated/dataModel';
import { useEditorEngine } from '@/components/store/editor';
import { transKeys } from '@/i18n/keys';
import { Routes } from '@/utils/constants';

export const RecentProjectsMenu = observer(() => {
    const editorEngine = useEditorEngine();
    const currentProjectId = editorEngine.projectId;
    const router = useRouter();
    const t = useTranslations();
    const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null);

    const projects = useQuery(api.projects.list, {
        limit: 5,
        excludeProjectId: currentProjectId as Id<'projects'>,
    });
    const isLoadingProjects = projects === undefined;

    const recentProjects = projects?.filter((project) => project._id !== currentProjectId) ?? [];

    const handleProjectClick = (e: React.MouseEvent, projectId: string) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return; // browser handles new tab/window
        e.preventDefault();
        setLoadingProjectId(projectId);
        router.push(`${Routes.PROJECT}/${projectId}`);
    };

    const handleProjectHover = (projectId: string) => {
        try {
            router.prefetch(`${Routes.PROJECT}/${projectId}`);
        } catch {
            // Silently ignore prefetch errors — they shouldn't block UX.
        }
    };

    if (isLoadingProjects) {
        return (
            <DropdownMenuSub>
                <DropdownMenuSubTrigger className="cursor-pointer">
                    <div className="center flex flex-row items-center">
                        <Icons.Cube className="mr-2" />
                        {t(transKeys.projects.actions.recentProjects)}
                    </div>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="ml-2">
                    <DropdownMenuItem disabled>
                        <div className="center flex flex-row items-center">
                            <Icons.LoadingSpinner className="mr-2 h-4 w-4 animate-spin" />
                            Loading projects…
                        </div>
                    </DropdownMenuItem>
                </DropdownMenuSubContent>
            </DropdownMenuSub>
        );
    }

    if (!recentProjects.length) {
        return (
            <DropdownMenuSub>
                <DropdownMenuSubTrigger className="cursor-pointer">
                    <div className="center flex flex-row items-center">
                        <Icons.Cube className="mr-2" />
                        {t(transKeys.projects.actions.recentProjects)}
                    </div>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="ml-2">
                    <DropdownMenuItem disabled>
                        <div className="center text-muted-foreground flex flex-row items-center">
                            <Icons.Cube className="mr-2" />
                            {t(transKeys.projects.select.empty)}
                        </div>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild className="cursor-pointer">
                        <Link href={Routes.PROJECTS}>
                            <div className="center flex flex-row items-center">
                                <Icons.Tokens className="mr-2" />
                                {t(transKeys.projects.actions.goToAllProjects)}
                            </div>
                        </Link>
                    </DropdownMenuItem>
                </DropdownMenuSubContent>
            </DropdownMenuSub>
        );
    }

    return (
        <DropdownMenuSub>
            <DropdownMenuSubTrigger className="cursor-pointer">
                <div className="center flex flex-row items-center">
                    <Icons.Cube className="mr-2" />
                    {t(transKeys.projects.actions.recentProjects)}
                </div>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="ml-2 w-48">
                {recentProjects.map((project) => (
                    <DropdownMenuItem
                        key={project._id}
                        asChild
                        disabled={loadingProjectId === project._id}
                        className="cursor-pointer"
                    >
                        <Link
                            href={`${Routes.PROJECT}/${project._id}`}
                            onClick={(e) => handleProjectClick(e, project._id)}
                            onMouseEnter={() => handleProjectHover(project._id)}
                            onFocus={() => handleProjectHover(project._id)}
                        >
                            <div className="center group flex flex-row items-center">
                                {loadingProjectId === project._id ? (
                                    <Icons.LoadingSpinner className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                    <Icons.Cube className="mr-2" />
                                )}
                                <span className="max-w-[120px] truncate">{project.name}</span>
                            </div>
                        </Link>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuSubContent>
        </DropdownMenuSub>
    );
});
