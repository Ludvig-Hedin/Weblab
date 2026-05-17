'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useEffect } from 'react';

import type { WorkspaceKind, WorkspaceRole } from '@weblab/models';

export interface ActiveWorkspace {
    id: string;
    slug: string;
    name: string;
    kind: WorkspaceKind;
    avatarUrl: string | null;
    viewerRole: WorkspaceRole;
}

/**
 * localStorage key for the most-recently-viewed workspace id. Read by the
 * project create flow (which lives outside /w/[slug]) so a "New Project"
 * click from a team workspace dashboard lands the project there instead of
 * defaulting to the user's personal workspace. Cleared on logout via the
 * existing auth flow.
 */
export const ACTIVE_WORKSPACE_STORAGE_KEY = 'weblab.activeWorkspaceId';
export const LAST_WORKSPACE_SLUG_COOKIE = 'weblab.lastWorkspaceSlug';

const WorkspaceContext = createContext<ActiveWorkspace | null>(null);

export function WorkspaceProvider({
    workspace,
    children,
}: {
    workspace: ActiveWorkspace;
    children: ReactNode;
}) {
    useEffect(() => {
        try {
            window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, workspace.id);
        } catch {
            // Private-mode / quota — silently ignored. Create flow falls
            // back to personal workspace when storage is unreadable.
        }
        // Cookie is readable server-side from /projects → lets the cold-load
        // redirect land on the user's last-visited workspace instead of
        // always bouncing to personal. 1-year TTL.
        try {
            document.cookie =
                `${LAST_WORKSPACE_SLUG_COOKIE}=${encodeURIComponent(workspace.slug)};` +
                ` Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
        } catch {
            // ignored
        }
    }, [workspace.id, workspace.slug]);
    return <WorkspaceContext.Provider value={workspace}>{children}</WorkspaceContext.Provider>;
}

export function useActiveWorkspace(): ActiveWorkspace {
    const ws = useContext(WorkspaceContext);
    if (!ws) {
        throw new Error('useActiveWorkspace must be used within a WorkspaceProvider');
    }
    return ws;
}

export function useActiveWorkspaceMaybe(): ActiveWorkspace | null {
    return useContext(WorkspaceContext);
}
