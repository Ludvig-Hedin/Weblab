'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import localforage from 'localforage';
import { toast } from 'sonner';

import { DEFAULT_NEW_PROJECT_TEMPLATE } from '@weblab/constants';

import { useAuthContext } from '@/app/auth/auth-context';
import { api } from '@/trpc/react';
import { LocalForageKeys, Routes } from '@/utils/constants';

function buildBlankProjectName(): string {
    const now = new Date();
    const month = now.toLocaleString(undefined, { month: 'short' });
    const day = now.getDate();
    return `New Project · ${month} ${day}`;
}

export function useCreateBlankProject() {
    const { data: user } = api.user.get.useQuery();
    const { mutateAsync: forkSandbox } = api.sandbox.fork.useMutation();
    const { mutateAsync: createProject } = api.project.create.useMutation();
    const { setIsAuthModalOpen } = useAuthContext();
    const router = useRouter();
    const [isCreatingProject, setIsCreatingProject] = useState(false);

    const handleStartBlankProject = async () => {
        if (!user?.id) {
            // Store the return URL and open auth modal
            await localforage.setItem(LocalForageKeys.RETURN_URL, window.location.pathname);
            setIsAuthModalOpen(true);
            return;
        }

        setIsCreatingProject(true);
        try {
            const { sandboxId, previewUrl } = await forkSandbox({
                sandbox: DEFAULT_NEW_PROJECT_TEMPLATE,
                config: {
                    title: `Blank project - ${user.id}`,
                    tags: ['blank', user.id],
                },
            });

            const newProject = await createProject({
                project: {
                    name: buildBlankProjectName(),
                    description: 'Your new blank project',
                    tags: ['blank'],
                },
                sandboxId,
                sandboxUrl: previewUrl,
                userId: user.id,
            });

            if (newProject) {
                router.push(`${Routes.PROJECT}/${newProject.id}`);
            }
        } catch (error) {
            console.error('Error creating blank project:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);

            if (errorMessage.includes('502') || errorMessage.includes('sandbox')) {
                toast.error('Sandbox service temporarily unavailable', {
                    description:
                        'Please try again in a few moments. Our servers may be experiencing high load.',
                    action: {
                        label: 'Retry',
                        onClick: () => void handleStartBlankProject(),
                    },
                });
            } else {
                toast.error('Failed to create project', {
                    description: errorMessage,
                });
            }
        } finally {
            setIsCreatingProject(false);
        }
    };

    return { handleStartBlankProject, isCreatingProject };
}
