'use client';

import { useState } from 'react';
import { api } from '@convex/_generated/api';
import { useConvex, useMutation, useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';

import type { Project } from '@weblab/models';
import { DropdownMenuItem } from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { toast } from '@weblab/ui/sonner';

import type { Id } from '@convex/_generated/dataModel';
import { transKeys } from '@/i18n/keys';
import {
    cacheProject,
    evictCachedProject,
    precacheNavigationUrls,
    requestPersistentStorage,
} from '@/services/offline/project-cache';

/**
 * Per-project "Make available offline" toggle in the project-card dropdown.
 * Mirrors the toggle in editor → Settings → Project but reachable from
 * `/projects` so power users can pin without entering each project first.
 */
export function OfflinePinToggle({ project }: { project: Project }) {
    const t = useTranslations();
    const projectId = project.id as Id<'projects'>;
    const convex = useConvex();
    const isPinned = useQuery(api.projectOffline.isPinned, { projectId });
    const pinOffline = useMutation(api.projectOffline.pin);
    const unpinOffline = useMutation(api.projectOffline.unpin);
    const [isPending, setIsPending] = useState(false);

    const handleToggle = async (event: Event) => {
        event.preventDefault();
        // The toggle fans out to several network calls; guard against a fast
        // reopen-and-reclick re-firing pin/unpin mid-flight.
        if (isPending) return;
        setIsPending(true);
        try {
            if (isPinned) {
                await unpinOffline({ projectId });
                await evictCachedProject(project.id);
                toast.success(
                    t(transKeys.projects.dialogs.offline.toastRemoved, { name: project.name }),
                );
            } else {
                await pinOffline({ projectId });
                // Pull branches on demand so we cache a record the offline
                // bootstrap can actually mount.
                const branchList = await convex.query(api.branches.getByProjectId, {
                    projectId,
                });
                if (branchList.length === 0) {
                    toast.warning(
                        t(transKeys.projects.dialogs.offline.toastPinned, { name: project.name }),
                    );
                } else {
                    // TODO(convex-migration): branch shape from Convex is Doc<'branches'> (sandboxId,
                    // _id, etc.), but cacheProject expects the legacy Branch model. Cast for now —
                    // the offline cache should be updated to read Doc<'branches'> directly.
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await cacheProject(project, branchList as any);
                }
                await requestPersistentStorage();
                await precacheNavigationUrls([`/project/${project.id}`, '/projects']);
                if (branchList.length > 0) {
                    toast.success(
                        t(transKeys.projects.dialogs.offline.toastMarked, { name: project.name }),
                    );
                }
            }
        } catch (err) {
            console.error('Failed to toggle offline pin', err);
            toast.error(t(transKeys.projects.dialogs.offline.toastFailed));
        } finally {
            setIsPending(false);
        }
    };

    return (
        <DropdownMenuItem
            disabled={isPending}
            onSelect={(event) => {
                void handleToggle(event);
            }}
            className="text-foreground-active hover:!bg-background-weblab hover:!text-foreground-active gap-2"
        >
            <Icons.Download className="h-4 w-4" />
            {isPinned
                ? t(transKeys.projects.actions.removeOfflineCopy)
                : t(transKeys.projects.actions.makeAvailableOffline)}
        </DropdownMenuItem>
    );
}
