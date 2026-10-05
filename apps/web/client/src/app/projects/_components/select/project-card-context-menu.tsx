'use client';

import { useState } from 'react';
import { api } from '@convex/_generated/api';
import { useMutation } from 'convex/react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import type { Project } from '@weblab/models';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@weblab/ui/alert-dialog';
import { Button } from '@weblab/ui/button';
import {
    ContextMenu,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuSeparator,
    ContextMenuSub,
    ContextMenuSubContent,
    ContextMenuSubTrigger,
    ContextMenuTrigger,
} from '@weblab/ui/context-menu';
import { Icons } from '@weblab/ui/icons';

import type { ProjectOrganizationProps } from './project-card-utils';
import type { Id } from '@convex/_generated/dataModel';
import { transKeys } from '@/i18n/keys';
import { Routes } from '@/utils/constants';
import { ProjectDetailsDialog } from './project-details-dialog';

interface ProjectCardContextMenuProps extends ProjectOrganizationProps {
    project: Project;
    refetch: () => void | Promise<unknown>;
    children: React.ReactNode;
}

export function ProjectCardContextMenu({
    project,
    refetch,
    children,
    folders = [],
    onMoveToFolder,
    onCreateFolder,
}: ProjectCardContextMenuProps) {
    const t = useTranslations();
    const menuT = useTranslations('selectProject');
    const [showDetails, setShowDetails] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const deleteProject = useMutation(api.projects.remove);

    const projectHref = `${Routes.PROJECT}/${project.id}`;

    const getAbsoluteUrl = () => `${window.location.origin}${projectHref}`;

    const copyText = async (text: string, successLabel: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success(successLabel);
        } catch {
            toast.error('Copy failed');
        }
    };

    const openInNewTab = () => window.open(projectHref, '_blank', 'noopener,noreferrer');

    const openInNewWindow = () =>
        window.open(projectHref, '_blank', 'noopener,noreferrer,popup,width=1280,height=800');

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            await deleteProject({ projectId: project.id as Id<'projects'> });
            setShowDeleteDialog(false);
            await refetch();
            toast.success('Project deleted');
        } catch (error) {
            toast.error('Failed to delete project', {
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        } finally {
            setIsDeleting(false);
        }
    };

    const folder = folders.find((item) => item.projectIds.includes(project.id));

    return (
        <>
            <ProjectDetailsDialog
                project={project}
                folderName={folder?.name}
                open={showDetails}
                onOpenChange={setShowDetails}
            />
            <ContextMenu>
                <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
                <ContextMenuContent className="w-56">
                    <ContextMenuItem asChild>
                        <a href={projectHref} className="cursor-pointer">
                            <Icons.Cube className="mr-2 h-4 w-4" />
                            Open
                        </a>
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={openInNewTab} className="cursor-pointer">
                        <Icons.ExternalLink className="mr-2 h-4 w-4" />
                        Open in new tab
                    </ContextMenuItem>
                    <ContextMenuItem onSelect={openInNewWindow} className="cursor-pointer">
                        <Icons.ExternalLink className="mr-2 h-4 w-4" />
                        Open in new window
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onSelect={() => setShowDetails(true)}>
                        <Icons.InfoCircled className="h-4 w-4" />
                        {menuT('showDetails')}
                    </ContextMenuItem>
                    {onMoveToFolder && (
                        <ContextMenuSub>
                            <ContextMenuSubTrigger>
                                <Icons.MoveToFolder className="mr-2 h-4 w-4" />
                                {menuT('moveToFolder')}
                            </ContextMenuSubTrigger>
                            <ContextMenuSubContent>
                                {folders.map((item) => (
                                    <ContextMenuItem
                                        key={item.id}
                                        disabled={item.id === folder?.id}
                                        onSelect={() => void onMoveToFolder(item.id)}
                                    >
                                        {item.name}
                                    </ContextMenuItem>
                                ))}
                                {folder && (
                                    <ContextMenuItem onSelect={() => void onMoveToFolder(null)}>
                                        {menuT('removeFromFolder')}
                                    </ContextMenuItem>
                                )}
                                {onCreateFolder && (
                                    <>
                                        <ContextMenuSeparator />
                                        <ContextMenuItem onSelect={onCreateFolder}>
                                            {menuT('createFolder')}
                                        </ContextMenuItem>
                                    </>
                                )}
                            </ContextMenuSubContent>
                        </ContextMenuSub>
                    )}
                    <ContextMenuSeparator />
                    <ContextMenuItem
                        onSelect={() => void copyText(getAbsoluteUrl(), 'Link copied')}
                        className="cursor-pointer"
                    >
                        <Icons.Link className="mr-2 h-4 w-4" />
                        Copy link
                    </ContextMenuItem>
                    <ContextMenuItem
                        onSelect={() => void copyText(project.id, 'Project ID copied')}
                        className="cursor-pointer"
                    >
                        <Icons.Clipboard className="mr-2 h-4 w-4" />
                        Copy project ID
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem
                        onSelect={(event) => {
                            event.preventDefault();
                            setShowDeleteDialog(true);
                        }}
                        disabled={isDeleting}
                        className="text-destructive hover:!bg-destructive/15 hover:!text-destructive cursor-pointer gap-2"
                    >
                        <Icons.Trash className="h-4 w-4" />
                        {t(transKeys.projects.actions.deleteProject)}
                    </ContextMenuItem>
                </ContextMenuContent>
            </ContextMenu>
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t(transKeys.projects.dialogs.delete.title)}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {t(transKeys.projects.dialogs.delete.description)}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <Button variant="ghost" onClick={() => setShowDeleteDialog(false)}>
                            {t(transKeys.projects.actions.cancel)}
                        </Button>
                        <Button
                            variant="destructive"
                            className="rounded-md text-sm"
                            disabled={isDeleting}
                            onClick={() => void handleDelete()}
                        >
                            {t(transKeys.projects.actions.delete)}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
