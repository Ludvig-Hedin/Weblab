'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useAction } from 'convex/react';
import { observer } from 'mobx-react-lite';

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
                toast.error('No project to clone');
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
                    toast.success('Project cloned successfully');
                    onClose();
                    router.push(`${Routes.PROJECT}/${clonedProject.projectId}`);
                } else {
                    toast.error('Failed to clone project', {
                        description: 'No project was returned from the server.',
                    });
                }
            } catch (error) {
                console.error('Error cloning project:', error);
                const errorMessage = error instanceof Error ? error.message : String(error);

                if (errorMessage.includes('502') || errorMessage.includes('sandbox')) {
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
                setIsCloningCurrentProject(false);
            }
        };

        return (
            <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Clone Project</AlertDialogTitle>
                        <AlertDialogDescription>
                            Create a copy of this project with all settings preserved.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="flex w-full flex-col gap-2">
                        <Label htmlFor="clone-name">Project Name</Label>
                        <Input
                            id="clone-name"
                            type="text"
                            placeholder="Enter name for cloned project"
                            value={cloneProjectName}
                            onChange={(e) => setCloneProjectName(e.target.value)}
                        />
                        <p
                            className={cn(
                                'text-mini text-destructive transition-opacity',
                                isCloneProjectNameEmpty ? 'opacity-100' : 'opacity-0',
                            )}
                        >
                            Project name can't be empty
                        </p>
                    </div>
                    <AlertDialogFooter>
                        <Button
                            variant="ghost"
                            onClick={() => handleOpenChange(false)}
                            disabled={isCloningCurrentProject}
                        >
                            Cancel
                        </Button>
                        <Button
                            disabled={isCloneProjectNameEmpty || isCloningCurrentProject}
                            onClick={handleCloneCurrentProject}
                        >
                            {isCloningCurrentProject ? (
                                <>
                                    <Icons.LoadingSpinner className="mr-2 h-4 w-4 animate-spin" />
                                    Cloning...
                                </>
                            ) : (
                                'Clone Project'
                            )}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        );
    },
);
