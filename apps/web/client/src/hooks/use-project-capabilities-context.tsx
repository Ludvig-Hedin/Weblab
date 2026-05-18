'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import type { Capability } from '@weblab/auth';

import { api } from '@/trpc/react';
import { useProjectCapabilities } from './use-project-capabilities';

interface ProjectCapabilitiesContextValue {
    isLoading: boolean;
    caps: Set<Capability>;
    canView: boolean;
    canEdit: boolean;
    canPublish: boolean;
    canInvite: boolean;
    canDelete: boolean;
    canComment: boolean;
    canUseAi: boolean;
    canManageAccess: boolean;
}

const ProjectCapabilitiesContext = createContext<ProjectCapabilitiesContextValue | null>(null);

/**
 * Mount once at the editor entry. Fetches capabilities for the active project
 * a single time and exposes them via context. Also watches the global
 * react-query mutation cache for FORBIDDEN errors — if any mutation fails
 * with FORBIDDEN, we treat it as "access lost mid-session" and:
 *   1. invalidate the cap query so the UI re-evaluates with the new state
 *   2. surface a single toast pointing the user at a refresh
 *
 * Throttled to once-per-session so a chain of permission-denied mutations
 * doesn't spam the user.
 */
export function ProjectCapabilitiesProvider({
    projectId,
    children,
}: {
    projectId: string | null | undefined;
    children: ReactNode;
}) {
    const value = useProjectCapabilities(projectId);
    const memoed = useMemo(() => value, [value]);
    useAccessLostHandler(projectId);
    return (
        <ProjectCapabilitiesContext.Provider value={memoed}>
            {children}
        </ProjectCapabilitiesContext.Provider>
    );
}

function isForbiddenError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const e = error as { data?: { code?: string }; message?: string };
    if (e.data?.code === 'FORBIDDEN') return true;
    if (typeof e.message === 'string' && e.message.toLowerCase().includes('forbidden')) {
        return true;
    }
    return false;
}

function useAccessLostHandler(projectId: string | null | undefined) {
    const queryClient = useQueryClient();
    const utils = api.useUtils();
    const surfacedRef = useRef(false);
    const [, force] = useState(0);

    useEffect(() => {
        if (!projectId) return;
        surfacedRef.current = false;
        force((n) => n + 1);
    }, [projectId]);

    useEffect(() => {
        if (!projectId) return;
        const cache = queryClient.getMutationCache();
        const unsubscribe = cache.subscribe((event) => {
            if (event.type !== 'updated') return;
            const mutation = event.mutation;
            if (mutation.state.status !== 'error') return;
            const err = mutation.state.error;
            if (!isForbiddenError(err)) return;
            if (surfacedRef.current) return;
            surfacedRef.current = true;
            // Refresh caps so UI affordances re-render with the new (denied)
            // state. Invalidate ALL capabilities queries (no input filter) —
            // they may have been issued with `{ projectId, workspaceId }`
            // shapes that won't match a `{ projectId }`-only filter.
            void utils.user.capabilities.invalidate();
            toast.error('You no longer have access to this project', {
                description: 'Refresh the page to continue.',
                action: {
                    label: 'Refresh',
                    onClick: () => window.location.reload(),
                },
                duration: 30_000,
            });
        });
        return () => {
            unsubscribe();
        };
    }, [projectId, queryClient, utils]);
}

/**
 * Read the active project's capabilities from the surrounding
 * `ProjectCapabilitiesProvider`. Throws if used outside the provider — fail
 * loud rather than silently denying writes via empty cap set.
 */
export function useProjectCapabilitiesContext(): ProjectCapabilitiesContextValue {
    const ctx = useContext(ProjectCapabilitiesContext);
    if (!ctx) {
        throw new Error(
            'useProjectCapabilitiesContext must be used inside <ProjectCapabilitiesProvider>',
        );
    }
    return ctx;
}
