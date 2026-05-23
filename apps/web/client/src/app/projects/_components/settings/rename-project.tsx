'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import type { Project } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@weblab/ui/dialog';
import { DropdownMenuItem } from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { cn } from '@weblab/ui/utils';

import { transKeys } from '@/i18n/keys';
import { api } from '@/trpc/react';

export function RenameProject({ project, refetch }: { project: Project; refetch: () => void }) {
    const t = useTranslations();
    const utils = api.useUtils();
    const { mutateAsync: updateProject } = api.project.update.useMutation();
    const [showRenameDialog, setShowRenameDialog] = useState(false);
    const [projectName, setProjectName] = useState(project.name);
    // Reject whitespace-only names too — `length === 0` previously let `"   "` through (issue #41).
    const isProjectNameEmpty = useMemo(() => projectName.trim().length === 0, [projectName]);

    useEffect(() => {
        setProjectName(project.name);
    }, [project.name]);

    const handleRenameProject = async () => {
        const trimmedName = projectName.trim();
        if (trimmedName.length === 0) return;
        const now = new Date();

        try {
            await updateProject({
                id: project.id,
                name: trimmedName,
                updatedAt: now,
            });
            // Invalidate queries to refresh UI
            await Promise.all([
                utils.project.list.invalidate(),
                utils.project.get.invalidate({ projectId: project.id }),
            ]);

            // Optimistically update list ordering and title immediately
            window.dispatchEvent(
                new CustomEvent('weblab_project_updated', {
                    detail: {
                        id: project.id,
                        name: trimmedName,
                        metadata: {
                            updatedAt: now.toISOString(),
                            description: project.metadata?.description,
                        },
                    },
                }),
            );
            window.dispatchEvent(
                new CustomEvent('weblab_project_modified', {
                    detail: { id: project.id },
                }),
            );
            setShowRenameDialog(false);
            refetch();
        } catch (error) {
            console.error('Failed to rename project:', error);
        }
    };

    return (
        <>
            <DropdownMenuItem
                onSelect={(event) => {
                    event.preventDefault();
                    setShowRenameDialog(true);
                }}
                className="text-foreground-active hover:!bg-background-weblab hover:!text-foreground-active gap-2"
            >
                <Icons.Pencil className="h-4 w-4" />
                {t(transKeys.projects.actions.renameProject)}
            </DropdownMenuItem>

            <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
                <DialogContent>
                    {/*
                      Wrap in a form so pressing Enter submits the rename
                      (issue #41). The submit button drives the same handler.
                    */}
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (isProjectNameEmpty) return;
                            void handleRenameProject();
                        }}
                    >
                        <DialogHeader>
                            <DialogTitle>{t(transKeys.projects.dialogs.rename.title)}</DialogTitle>
                        </DialogHeader>
                        <div className="flex w-full flex-col gap-2">
                            <Label htmlFor="text">
                                {t(transKeys.projects.dialogs.rename.label)}
                            </Label>
                            <Input
                                id="text"
                                minLength={0}
                                type="text"
                                value={projectName || ''}
                                onInput={(e) => setProjectName(e.currentTarget.value)}
                            />
                            <p
                                className={cn(
                                    'text-destructive text-xs transition-opacity',
                                    isProjectNameEmpty ? 'opacity-100' : 'opacity-0',
                                )}
                            >
                                {t(transKeys.projects.dialogs.rename.error)}
                            </p>
                        </div>
                        <DialogFooter>
                            <Button
                                type="button"
                                variant={'ghost'}
                                onClick={() => setShowRenameDialog(false)}
                            >
                                {t(transKeys.projects.actions.cancel)}
                            </Button>
                            <Button
                                type="submit"
                                disabled={isProjectNameEmpty}
                                className="rounded-md text-sm"
                            >
                                {t(transKeys.projects.actions.rename)}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </>
    );
}
