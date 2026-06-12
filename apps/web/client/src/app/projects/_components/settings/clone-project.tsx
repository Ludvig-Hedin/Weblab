'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@convex/_generated/api';
import { useAction } from 'convex/react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import type { Project } from '@weblab/models';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@weblab/ui/alert-dialog';
import { Button } from '@weblab/ui/button';
import { DropdownMenuItem } from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { cn } from '@weblab/ui/utils';

import type { Id } from '@convex/_generated/dataModel';
import { transKeys } from '@/i18n/keys';
import { readActiveWorkspaceId } from '@/utils/active-workspace';

export function CloneProject({ project, refetch }: { project: Project; refetch: () => void }) {
    const t = useTranslations();
    const forkProject = useAction(api.projectActions.fork);
    const [showCloneDialog, setShowCloneDialog] = useState(false);
    const [cloneProjectName, setCloneProjectName] = useState(`${project.name} (Clone)`);
    const [isCloningProject, setIsCloningProject] = useState(false);
    const isCloneProjectNameEmpty = useMemo(
        () => cloneProjectName.trim().length === 0,
        [cloneProjectName],
    );

    useEffect(() => {
        setCloneProjectName(`${project.name} (Clone)`);
    }, [project.name]);

    const handleCloneProject = async () => {
        setIsCloningProject(true);
        try {
            await forkProject({
                projectId: project.id as Id<'projects'>,
                name: cloneProjectName,
                workspaceId: readActiveWorkspaceId() as Id<'workspaces'> | undefined,
            });

            toast.success('Project cloned successfully');
            setShowCloneDialog(false);
            refetch();
        } catch (error) {
            console.error('Error cloning project:', error);

            // Convex actions that hit a recognized failure throw a ConvexError
            // carrying a structured `{ message, retryable }` payload (see
            // convex/lib/sandboxErrors.ts). Prefer it: a plain Error from a
            // Convex action is redacted to "Server Error" in prod, so
            // `error.message` alone is useless there. Mirrors
            // use-create-blank-project.ts.
            const structured = (error as { data?: unknown } | null)?.data;
            const structuredMessage =
                structured &&
                typeof structured === 'object' &&
                typeof (structured as { message?: unknown }).message === 'string'
                    ? (structured as { message: string }).message
                    : null;
            const structuredRetryable =
                structured &&
                typeof structured === 'object' &&
                typeof (structured as { retryable?: unknown }).retryable === 'boolean'
                    ? (structured as { retryable: boolean }).retryable
                    : null;

            const errorMessage =
                structuredMessage ?? (error instanceof Error ? error.message : String(error));

            // Transient classification deliberately does NOT include the bare
            // substring "sandbox" — that used to match permanent, actionable
            // fork errors (missing/expired snapshot, billing) and masked them
            // behind a generic "try again later" toast.
            const lower = errorMessage.toLowerCase();
            const isTransient =
                structuredRetryable ??
                (/\b50[234]\b/.test(errorMessage) ||
                    lower.includes('temporarily unavailable') ||
                    lower.includes('timeout') ||
                    lower.includes('timed out'));

            if (isTransient) {
                toast.error('Sandbox service temporarily unavailable', {
                    description:
                        'Please try again in a few moments. Our servers may be experiencing high load.',
                });
            } else {
                toast.error('Failed to clone project', {
                    description: errorMessage,
                });
            }
        } finally {
            setIsCloningProject(false);
        }
    };

    return (
        <>
            <DropdownMenuItem
                onSelect={(event) => {
                    event.preventDefault();
                    setShowCloneDialog(true);
                }}
                className="text-foreground-active hover:!bg-background-weblab hover:!text-foreground-active gap-2"
            >
                <Icons.Copy className="h-4 w-4" />
                {t(transKeys.projects.actions.cloneProject)}
            </DropdownMenuItem>

            <AlertDialog open={showCloneDialog} onOpenChange={setShowCloneDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {t(transKeys.projects.dialogs.clone.title)}
                        </AlertDialogTitle>
                    </AlertDialogHeader>
                    <div className="flex w-full flex-col gap-2">
                        <Label htmlFor="clone-name">
                            {t(transKeys.projects.dialogs.clone.label)}
                        </Label>
                        <Input
                            id="clone-name"
                            type="text"
                            placeholder={t(transKeys.projects.dialogs.clone.placeholder)}
                            value={cloneProjectName || ''}
                            onChange={(e) => setCloneProjectName(e.target.value)}
                        />
                        <p
                            className={cn(
                                'text-destructive text-xs transition-opacity',
                                isCloneProjectNameEmpty ? 'opacity-100' : 'opacity-0',
                            )}
                        >
                            {t(transKeys.projects.dialogs.clone.error)}
                        </p>
                    </div>
                    <AlertDialogFooter>
                        <Button
                            variant={'ghost'}
                            onClick={() => setShowCloneDialog(false)}
                            disabled={isCloningProject}
                        >
                            {t(transKeys.projects.actions.cancel)}
                        </Button>
                        <Button
                            disabled={isCloneProjectNameEmpty || isCloningProject}
                            className="rounded-md text-sm"
                            onClick={handleCloneProject}
                        >
                            {isCloningProject ? (
                                <>
                                    <Icons.LoadingSpinner className="mr-2 h-4 w-4 animate-spin" />
                                    Cloning…
                                </>
                            ) : (
                                t(transKeys.projects.actions.clone)
                            )}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
