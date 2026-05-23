import { useMemo } from 'react';
import { api } from '@convex/_generated/api';
import { useQuery } from 'convex/react';

import type { Capability } from '@weblab/auth';

import type { Id } from '@convex/_generated/dataModel';

/**
 * Returns the caller's capability set for a given project, plus convenience
 * booleans for the most common gates. The editor uses this to hide write
 * affordances when the caller is a viewer/reviewer. Server-side caps are
 * the trust boundary — UI gating is a hint only.
 */
export function useProjectCapabilities(projectId: string | null | undefined) {
    const data = useQuery(
        api.users.capabilities,
        projectId ? { projectId: projectId as Id<'projects'> } : 'skip',
    );
    const isLoading = projectId ? data === undefined : false;

    return useMemo(() => {
        const caps = new Set<Capability>(data ?? []);
        return {
            isLoading,
            caps,
            canView: caps.has('project.view'),
            canEdit: caps.has('project.update'),
            canPublish: caps.has('project.publish'),
            canInvite: caps.has('project.invite'),
            canDelete: caps.has('project.delete'),
            canComment: caps.has('project.comment'),
            canUseAi: caps.has('project.use_ai'),
            canManageAccess: caps.has('project.manage_access_mode'),
        };
    }, [data, isLoading]);
}
