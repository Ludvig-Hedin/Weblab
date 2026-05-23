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
import { DropdownMenuItem } from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';

import { transKeys } from '@/i18n/keys';
import { api } from '@/trpc/react';

export function DeleteProject({ project, refetch }: { project: Project; refetch: () => void }) {
    const t = useTranslations();
    const { mutateAsync: deleteProject } = api.project.delete.useMutation();
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);

    const handleDeleteProject = async () => {
        try {
            await deleteProject({ id: project.id });
            setShowDeleteDialog(false);
            refetch();
        } catch (error) {
            console.error('Error deleting project:', error);
            toast.error('Failed to delete project', {
                description: error instanceof Error ? error.message : 'Unknown error',
            });
        }
    };

    return (
        <>
            <DropdownMenuItem
                onSelect={(event) => {
                    event.preventDefault();
                    setShowDeleteDialog(true);
                }}
                className="text-destructive hover:!bg-destructive/15 hover:!text-destructive gap-2"
            >
                <Icons.Trash className="h-4 w-4" />
                {t(transKeys.projects.actions.deleteProject)}
            </DropdownMenuItem>
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
                        <Button variant={'ghost'} onClick={() => setShowDeleteDialog(false)}>
                            {t(transKeys.projects.actions.cancel)}
                        </Button>
                        <Button
                            variant={'destructive'}
                            className="rounded-md text-sm"
                            onClick={(e) => {
                                e.stopPropagation();
                                void handleDeleteProject();
                            }}
                        >
                            {t(transKeys.projects.actions.delete)}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
