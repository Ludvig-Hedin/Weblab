'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useAction } from 'convex/react';
import { observer } from 'mobx-react-lite';
import { useTranslations } from 'next-intl';

import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@weblab/ui/alert-dialog';
import { Button } from '@weblab/ui/button';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import { Label } from '@weblab/ui/label';
import { toast } from '@weblab/ui/sonner';
import { cn } from '@weblab/ui/utils';

import type { Id } from '@convex/_generated/dataModel';
import { useEditorEngine } from '@/components/store/editor';
import { Routes } from '@/utils/constants';

interface CloneProjectDialogProps {
    isOpen: boolean;
    onClose: () => void;
    projectName?: string;
}

export const CloneProjectDialog = observer(
    ({ isOpen, onClose, projectName }: CloneProjectDialogProps) => {
        const t = useTranslations('editor.clone');
        const editorEngine = useEditorEngine();
        const router = useRouter();
        const cloneProject = useAction(api.projectActions.fork);
        const [cloneProjectName, setCloneProjectName] = useState(
            projectName ? `${projectName} (Clone)` : '',
        );
        const [isCloningCurrentProject, setIsCloningCurrentProject] = useState(false);
        const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

        useEffect(() => {
            return () => {
                if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
            };
        }, []);

        // Generate default clone name
        const defaultCloneName = useMemo(() => {
            if (projectName) {
                return `${projectName} (Clone)`;
            }
            return 'Cloned Project';
        }, [projectName]);

        const isCloneProjectNameEmpty = useMemo(
            () => cloneProjectName.trim().length === 0,
            [cloneProjectName],
        );

        // Reset the form when dialog opens
        const handleOpenChange = (open: boolean) => {
            if (open) {
                setCloneProjectName(defaultCloneName);
            } else if (!open) {
                onClose();
                // Reset form after closing
                if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
                resetTimeoutRef.current = setTimeout(() => {
                    setCloneProjectName('');
                    setIsCloningCurrentProject(false);
                }, 200);
            }
        };

        const handleCloneCurrentProject = async () => {
            if (!editorEngine.projectId) {
                toast.error(t('toastNoProject'));
                return;
            }

            setIsCloningCurrentProject(true);
            try {
                // Capture screenshot of current project before navigation
                try {
                    editorEngine.screenshot.captureScreenshot();
                } catch (error) {
                    console.error('Failed to capture screenshot:', error);
                }

                const clonedProject = await cloneProject({
                    projectId: editorEngine.projectId as Id<'projects'>,
                    name: cloneProjectName.trim(),
                });

                if (clonedProject) {
                    toast.success(t('toastSuccess'));
                    onClose();
                    router.push(`${Routes.PROJECT}/${clonedProject.projectId}`);
                } else {
                    toast.error(t('toastFailed'), {
                        description: t('toastServerError'),
                    });
                }
            } catch (error) {
                console.error('Error cloning project:', error);

                // Convex actions that hit a recognized failure throw a
                // ConvexError carrying a structured `{ message, retryable }`
                // payload (see convex/lib/sandboxErrors.ts). Prefer it: a plain
                // Error from a Convex action is redacted to "Server Error" in
                // prod, so `error.message` alone is useless there. Mirrors
                // settings/clone-project.tsx + use-create-blank-project.ts.
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

                // Transient classification deliberately does NOT include the
                // bare substring "sandbox" — that matched permanent, actionable
                // fork errors (missing/expired snapshot, billing) and masked
                // them behind a generic "try again later" toast that retries
                // forever. Mirrors settings/clone-project.tsx.
                const lower = errorMessage.toLowerCase();
                const isTransient =
                    structuredRetryable ??
                    (/\b50[234]\b/.test(errorMessage) ||
                        lower.includes('temporarily unavailable') ||
                        lower.includes('timeout') ||
                        lower.includes('timed out'));

                if (isTransient) {
                    toast.error(t('toastUnavailable'), {
                        description: t('toastHighLoad'),
                    });
                } else {
                    toast.error(t('toastFailed'), {
                        description: errorMessage,
                    });
                }
            } finally {
                setIsCloningCurrentProject(false);
            }
        };

        return (
            <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('dialogTitle')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('dialogDesc')}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="flex w-full flex-col gap-2">
                        <Label htmlFor="clone-name">{t('projectNameLabel')}</Label>
                        <Input
                            id="clone-name"
                            type="text"
                            placeholder={t('projectNamePlaceholder')}
                            value={cloneProjectName}
                            onChange={(e) => setCloneProjectName(e.target.value)}
                        />
                        <p
                            className={cn(
                                'text-mini text-destructive transition-opacity',
                                isCloneProjectNameEmpty ? 'opacity-100' : 'opacity-0',
                            )}
                        >
                            {t('validationEmpty')}
                        </p>
                    </div>
                    <AlertDialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => handleOpenChange(false)}
                            disabled={isCloningCurrentProject}
                        >
                            {t('cancel')}
                        </Button>
                        <Button
                            disabled={isCloneProjectNameEmpty || isCloningCurrentProject}
                            onClick={handleCloneCurrentProject}
                        >
                            {isCloningCurrentProject ? (
                                <>
                                    <Icons.LoadingSpinner className="mr-2 h-4 w-4 animate-spin" />
                                    {t('cloning')}
                                </>
                            ) : (
                                t('clone')
                            )}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        );
    },
);
