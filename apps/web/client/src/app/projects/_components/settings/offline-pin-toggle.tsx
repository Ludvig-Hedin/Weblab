'use client';

import type { Project } from '@weblab/models';
import { DropdownMenuItem } from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';

import {
    cacheProject,
    evictCachedProject,
    precacheNavigationUrls,
    requestPersistentStorage,
} from '@/services/offline/project-cache';
import { api } from '@/trpc/react';

/**
 * Per-project "Make available offline" toggle in the project-card dropdown.
 * Mirrors the toggle in editor → Settings → Project but reachable from
 * `/projects` so power users can pin without entering each project first.
 */
export function OfflinePinToggle({ project }: { project: Project }) {
    const utils = api.useUtils();
    const { data: isPinned } = api.project.offline.isPinned.useQuery({
        projectId: project.id,
    });
    // Branches are required to seed the offline cache. Without them, an
    // offline boot would render `<ProjectProviders branches={[]}>` and
    // crash on `editorEngine.branches.activeBranch.id`. Lazy-loaded so the
    // /projects grid doesn't fan out one query per card.
    const { data: branches, refetch: fetchBranches } = api.branch.getByProjectId.useQuery(
        { projectId: project.id },
        { enabled: false },
    );
    const { mutateAsync: pinOffline } = api.project.offline.pin.useMutation();
    const { mutateAsync: unpinOffline } = api.project.offline.unpin.useMutation();

    const handleToggle = async (event: Event) => {
        event.preventDefault();
        try {
            if (isPinned) {
                await unpinOffline({ projectId: project.id });
                await evictCachedProject(project.id);
                toast.success(`${project.name} removed from offline access.`);
            } else {
                await pinOffline({ projectId: project.id });
                // Pull branches on demand so we cache a record the offline
                // bootstrap can actually mount.
                const result = branches ? { data: branches } : await fetchBranches();
                const branchList = result.data ?? [];
                if (branchList.length === 0) {
                    toast.warning(
                        `${project.name} pinned. Open it once online to finish caching.`,
                    );
                } else {
                    await cacheProject(project, branchList);
                }
                await requestPersistentStorage();
                await precacheNavigationUrls([`/project/${project.id}`, '/projects']);
                if (branchList.length > 0) {
                    toast.success(`${project.name} marked as available offline.`);
                }
            }
            await utils.project.offline.isPinned.invalidate({ projectId: project.id });
            await utils.project.offline.listPinned.invalidate();
        } catch (err) {
            console.error('Failed to toggle offline pin', err);
            toast.error('Could not update offline availability.');
        }
    };

    return (
        <DropdownMenuItem
            onSelect={(event) => {
                void handleToggle(event);
            }}
            className="text-foreground-active hover:!bg-background-weblab hover:!text-foreground-active gap-2"
        >
            <Icons.Download className="h-4 w-4" />
            {isPinned ? 'Remove offline copy' : 'Make available offline'}
        </DropdownMenuItem>
    );
}
