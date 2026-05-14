'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import localforage from 'localforage';
import { toast } from 'sonner';

import type { FrameworkId } from '@weblab/framework';

import { useAuthContext } from '@/app/auth/auth-context';
import { api } from '@/trpc/react';
import { LocalForageKeys, Routes } from '@/utils/constants';

export type BlankCreatePhase = 'idle' | 'forking-sandbox' | 'creating-project' | 'opening-editor';

export function useCreateBlankProject() {
    const { data: user } = api.user.get.useQuery();
    const { mutateAsync: createBlankProject } = api.project.createBlank.useMutation();
    const { setIsAuthModalOpen } = useAuthContext();
    const router = useRouter();
    const [phase, setPhase] = useState<BlankCreatePhase>('idle');
    const isCreatingProject = phase !== 'idle';

    const handleStartBlankProject = async (framework: FrameworkId = 'nextjs') => {
        // Idempotency: the button's `disabled` prop is the primary
        // guard, but this hook is also called programmatically (toast
        // "Retry" action below). A second call while the first is
        // still in-flight would fork a second sandbox and create a
        // duplicate project, so bail early here too.
        if (isCreatingProject) {
            return;
        }

        if (!user?.id) {
            await localforage.setItem(LocalForageKeys.RETURN_URL, window.location.pathname);
            setIsAuthModalOpen(true);
            return;
        }

        setPhase('forking-sandbox');
        try {
            setPhase('creating-project');
            const newProject = await createBlankProject({
                framework,
            });

            if (newProject) {
                setPhase('opening-editor');
                router.push(`${Routes.PROJECT}/${newProject.id}`);
                // Leave the phase at 'opening-editor' so the overlay stays
                // up until the new route mounts. Resetting here would flash
                // the hero back in for the duration of the navigation.
                return;
            }
            setPhase('idle');
        } catch (error) {
            console.error('Error creating blank project:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);

            // Transient triggers, in order:
            //   - upstream gateway errors (502/503/504) bubbling up from CSB,
            //   - the sandbox.fork retry-exhaustion message format
            //     ("Failed to create sandbox after N attempts: ..."),
            //   - generic timeout / temporarily unavailable phrasing.
            // Crucially this does NOT include the bare substring "sandbox",
            // which used to match permanent failures like quota/billing
            // errors and surfaced a misleading Retry CTA.
            const lower = errorMessage.toLowerCase();
            const isTransient =
                /\b50[234]\b/.test(errorMessage) ||
                /failed to create sandbox after \d+ attempts?/i.test(errorMessage) ||
                lower.includes('temporarily unavailable') ||
                lower.includes('timeout') ||
                lower.includes('timed out');

            if (isTransient) {
                toast.error('Sandbox service temporarily unavailable', {
                    description:
                        'Please try again in a few moments. Our servers may be experiencing high load.',
                    action: {
                        label: 'Retry',
                        onClick: () => void handleStartBlankProject(framework),
                    },
                });
            } else {
                toast.error('Failed to create project', {
                    description: errorMessage,
                });
            }
            setPhase('idle');
        }
    };

    return { handleStartBlankProject, isCreatingProject, phase };
}
