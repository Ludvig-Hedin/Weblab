'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@convex/_generated/api';
import { useAction, useQuery } from 'convex/react';
import localforage from 'localforage';
import { toast } from 'sonner';

import type { FrameworkId } from '@weblab/framework';

import type { Id } from '@convex/_generated/dataModel';
import { useAuthContext } from '@/app/auth/auth-context';
import { ACTIVE_WORKSPACE_STORAGE_KEY } from '@/app/w/[slug]/_components/workspace-context';
import { LocalForageKeys, Routes } from '@/utils/constants';

function readActiveWorkspaceId(): string | undefined {
    if (typeof window === 'undefined') return undefined;
    try {
        const id = window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
        return id && id.length > 0 ? id : undefined;
    } catch {
        return undefined;
    }
}

export type BlankCreatePhase = 'idle' | 'forking-sandbox' | 'creating-project' | 'opening-editor';

const SUPPORTED_FRAMEWORKS = new Set<string>([
    'nextjs',
    'vite-react',
    'remix',
    'astro',
    'tanstack-start',
    'static-html',
]);

type ConvexFramework =
    | 'nextjs'
    | 'vite-react'
    | 'remix'
    | 'astro'
    | 'tanstack-start'
    | 'static-html';

export function useCreateBlankProject() {
    const user = useQuery(api.users.me);
    const createBlankProject = useAction(api.projectActions.createBlank);
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

        if (!user?._id) {
            await localforage.setItem(LocalForageKeys.RETURN_URL, window.location.pathname);
            setIsAuthModalOpen(true);
            return;
        }

        setPhase('forking-sandbox');
        try {
            setPhase('creating-project');
            const workspaceId = readActiveWorkspaceId();
            const convexFramework: ConvexFramework = SUPPORTED_FRAMEWORKS.has(framework)
                ? (framework as ConvexFramework)
                : 'nextjs';
            const result = await createBlankProject({
                framework: convexFramework,
                ...(workspaceId ? { workspaceId: workspaceId as Id<'workspaces'> } : {}),
            });

            if (result?.projectId) {
                setPhase('opening-editor');
                router.push(`${Routes.PROJECT}/${result.projectId}`);
                // Leave the phase at 'opening-editor' so the overlay stays
                // up until the new route mounts. Resetting here would flash
                // the hero back in for the duration of the navigation.
                return;
            }
            setPhase('idle');
        } catch (error) {
            console.error('Error creating blank project:', error);

            // Convex actions that hit a recognized Vercel provisioning failure
            // throw a ConvexError carrying a structured `{ message, retryable }`
            // payload (see convex/lib/sandboxErrors.ts). Prefer it: a plain
            // Error from a Convex action is redacted to "Server Error" in prod,
            // so `error.message` alone is useless there.
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

            // Transient triggers, in order:
            //   - the structured `retryable` flag from a classified ConvexError,
            //   - upstream gateway errors (502/503/504),
            //   - the sandbox.fork retry-exhaustion message format
            //     ("Failed to create sandbox after N attempts: ..."),
            //   - generic timeout / temporarily unavailable phrasing.
            // Crucially this does NOT include the bare substring "sandbox",
            // which used to match permanent failures like quota/billing
            // errors and surfaced a misleading Retry CTA.
            const lower = errorMessage.toLowerCase();
            const isTransient =
                structuredRetryable ??
                (/\b50[234]\b/.test(errorMessage) ||
                    /failed to create sandbox after \d+ attempts?/i.test(errorMessage) ||
                    lower.includes('temporarily unavailable') ||
                    lower.includes('timeout') ||
                    lower.includes('timed out'));

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
