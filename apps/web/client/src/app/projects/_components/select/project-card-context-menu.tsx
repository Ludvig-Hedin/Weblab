'use client';

import { useState } from 'react';
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
    ContextMenuTrigger,
} from '@weblab/ui/context-menu';
import { Icons } from '@weblab/ui/icons';

import { transKeys } from '@/i18n/keys';
import { api } from '@/trpc/react';
import { Routes } from '@/utils/constants';

interface ProjectCardContextMenuProps {
    project: Project;
    refetch: () => void | Promise<unknown>;
    children: React.ReactNode;
}

export function ProjectCardContextMenu({
    project,
    refetch,
    children,
}: ProjectCardContextMenuProps) {
    const t = useTranslations();
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const { mutateAsync: deleteProject, isPending: isDeleting } = api.project.delete.useMutation();

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
        try {
            await deleteProject({ id: project.id });
            setShowDeleteDialog(false);
            await refetch();
            toast.success('Project deleted');
        } catch (error) {
            toast.error('Failed to delete project', {
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    };

    return (
        <>
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
