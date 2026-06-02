import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useConvex, useQuery } from 'convex/react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';
import { usePostHog } from 'posthog-js/react';

import { ProductType } from '@weblab/stripe';
import { Badge } from '@weblab/ui/badge';
import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import type { Id } from '@convex/_generated/dataModel';
import { useEditorEngine } from '@/components/store/editor';
import { useStateManager } from '@/components/store/state';
import { useDownloadProjectToFolder } from '@/hooks/use-download-project-to-folder';
import { useProjectCapabilitiesContext } from '@/hooks/use-project-capabilities-context';
import { transKeys } from '@/i18n/keys';
import { Routes } from '@/utils/constants';
import { CloneProjectDialog } from '../clone-project-dialog';
import { NewProjectMenu } from './new-project-menu';
import { RecentProjectsMenu } from './recent-projects';

export const ProjectBreadcrumb = observer(() => {
    const editorEngine = useEditorEngine();
    const stateManager = useStateManager();
    const posthog = usePostHog();
    const router = useRouter();
    const project = useQuery(
        api.projects.get,
        editorEngine.projectId ? { projectId: editorEngine.projectId as Id<'projects'> } : 'skip',
    );
    const convex = useConvex();
    const subscription = useQuery(api.subscriptions.get, {});
    const isPro = subscription?.product?.type === ProductType.PRO;
    const { canView, canEdit, isLoading: capsLoading } = useProjectCapabilitiesContext();
    const showViewerPill = !capsLoading && canView && !canEdit;
    const t = useTranslations();
    const closeTimeoutRef = useRef<Timer | null>(null);
    const navTimeoutRef = useRef<Timer | null>(null);
    const mountedRef = useRef(true);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isClosingProject, setIsClosingProject] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const [showCloneDialog, setShowCloneDialog] = useState(false);
    const { handleDownloadToFolder, isDownloading: isDownloadingToFolder } =
        useDownloadProjectToFolder();

    // Guard against setState post-unmount: clear timers and mark unmounted.
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
            if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
        };
    }, []);

    async function handleNavigateToProjects(_route?: 'create' | 'import') {
        try {
            setIsClosingProject(true);
            void editorEngine.screenshot.captureScreenshot();
        } catch (error) {
            console.error('Failed to take screenshots:', error);
        } finally {
            // Route back to the project's owning workspace so editors that
            // launched from a team workspace return there. Falls back to
            // `/projects` (which itself redirects to first workspace) if the
            // project's workspace can't be resolved.
            const targetWsId = (project as { workspaceId?: string | null } | null)?.workspaceId;
            const finish = (href: string) => {
                if (mountedRef.current) setIsClosingProject(false);
                router.push(href);
            };
            if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current);
            navTimeoutRef.current = setTimeout(() => {
                if (!targetWsId) {
                    finish(Routes.PROJECTS);
                    return;
                }
                convex
                    .query(api.workspaces.list, {})
                    .then((list) => {
                        const target = list.find((w) => w._id === targetWsId);
                        finish(target ? `/w/${target.slug}/projects` : Routes.PROJECTS);
                    })
                    .catch(() => finish(Routes.PROJECTS));
            }, 100);
        }
    }

    async function handleDownloadCode() {
        if (!project) {
            console.error('No project found');
            return;
        }

        const sandboxId = editorEngine.branches.activeBranch?.sandbox?.id;
        if (!sandboxId) {
            console.error('No sandbox ID found');
            return;
        }

        try {
            setIsDownloading(true);

            const result = await editorEngine.activeSandbox.downloadFiles(project.name);

            if (result) {
                window.open(result.downloadUrl, '_blank', 'noopener,noreferrer');

                posthog.capture('download_project_code', {
                    projectId: project._id,
                    projectName: project.name,
                });

                toast.success(t(transKeys.projects.actions.downloadSuccess));
            } else {
                throw new Error('Failed to generate download URL');
            }
        } catch (error) {
            console.error('Download failed:', error);
            toast.error(t(transKeys.projects.actions.downloadError), {
                description: error instanceof Error ? error.message : 'Unknown error',
            });

            posthog.capture('download_project_code_failed', {
                projectId: project._id,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setIsDownloading(false);
        }
    }

    return (
        <div className="text-small mr-0 flex flex-row items-center gap-2">
            <DropdownMenu open={isDropdownOpen} onOpenChange={setIsDropdownOpen}>
                <DropdownMenuTrigger asChild>
                    <Button
                        variant="ghost"
                        className={cn(
                            'text-foreground-weblab text-small hover:text-foreground-active group -ml-0.5 cursor-pointer gap-2 px-1.5',
                            isDropdownOpen
                                ? 'bg-background-secondary hover:!bg-background-secondary'
                                : 'hover:!bg-transparent',
                        )}
                    >
                        <Icons.WeblabLogo
                            className={cn(
                                'hidden h-9 w-9 md:block',
                                isClosingProject && 'animate-pulse',
                            )}
                        />
                        <span className="text-foreground-weblab text-small group-hover:text-foreground-active mx-0 max-w-[60px] cursor-pointer truncate px-0 md:max-w-[100px] lg:max-w-[200px]">
                            {isClosingProject ? 'Stopping project...' : project?.name}
                        </span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                    align="start"
                    className="w-56"
                    onMouseEnter={() => {
                        if (closeTimeoutRef.current) {
                            clearTimeout(closeTimeoutRef.current);
                        }
                    }}
                    onMouseLeave={() => {
                        closeTimeoutRef.current = setTimeout(() => {
                            setIsDropdownOpen(false);
                        }, 300);
                    }}
                >
                    <DropdownMenuItem asChild className="cursor-pointer">
                        <Link
                            href={Routes.PROJECTS}
                            onClick={(e) => {
                                // cmd/ctrl/shift/middle handled by browser → new tab/window.
                                if (e.metaKey || e.ctrlKey || e.shiftKey) return;
                                e.preventDefault();
                                void handleNavigateToProjects();
                            }}
                        >
                            <div className="center group flex flex-row items-center">
                                <Icons.Tokens className="mr-2" />
                                {t(transKeys.projects.actions.goToAllProjects)}
                            </div>
                        </Link>
                    </DropdownMenuItem>
                    <RecentProjectsMenu />
                    <NewProjectMenu onShowCloneDialog={setShowCloneDialog} />
                    <DropdownMenuItem
                        onClick={() => {
                            void handleDownloadCode();
                        }}
                        disabled={isDownloading || !isPro}
                        className="cursor-pointer"
                    >
                        <div className="center group flex w-full flex-row items-center justify-between">
                            <div className="center flex flex-row items-center">
                                <Icons.Download className="mr-2" />
                                {isDownloading
                                    ? t(transKeys.projects.actions.downloadingCode)
                                    : t(transKeys.projects.actions.downloadCode)}
                            </div>
                            <Badge
                                variant="secondary"
                                className="bg-foreground/10 text-foreground-secondary text-micro ml-2 rounded-full px-1.5 py-0 font-medium"
                            >
                                PRO
                            </Badge>
                        </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => {
                            void handleDownloadToFolder();
                        }}
                        disabled={isDownloadingToFolder}
                        className="cursor-pointer"
                    >
                        <div className="center group flex flex-row items-center">
                            {isDownloadingToFolder ? (
                                <Icons.LoadingSpinner className="mr-2 animate-spin" />
                            ) : (
                                <Icons.Directory className="mr-2" />
                            )}
                            {isDownloadingToFolder
                                ? t(transKeys.projects.actions.downloadingToFolder)
                                : t(transKeys.projects.actions.downloadToFolder)}
                        </div>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        className="cursor-pointer"
                        onClick={() => stateManager.setIsSettingsModalOpen(true)}
                    >
                        <div className="center group flex flex-row items-center">
                            <Icons.Gear className="mr-2 transition-transform group-hover:rotate-12" />
                            {t(transKeys.help.menu.openSettings)}
                        </div>
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            {showViewerPill && (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Badge
                                variant="secondary"
                                className="bg-foreground/10 text-foreground-secondary text-micro rounded-full px-2 py-0.5 font-medium"
                            >
                                Viewer access
                            </Badge>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                            You are viewing this project in read-only mode. Editing is disabled.
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            )}

            <CloneProjectDialog
                isOpen={showCloneDialog}
                onClose={() => setShowCloneDialog(false)}
                projectName={project?.name}
            />
        </div>
    );
});
