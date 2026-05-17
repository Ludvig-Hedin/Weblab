import { useMemo } from 'react';

import type { Capability } from '@weblab/auth';

import { api } from '@/trpc/react';

/**
 * Returns the caller's capability set for a given project, plus convenience
 * booleans for the most common gates. The editor uses this to hide write
 * affordances when the caller is a viewer/reviewer. Server-side caps are
 * the trust boundary — UI gating is a hint only.
 */
export function useProjectCapabilities(projectId: string | null | undefined) {
    const { data, isLoading } = api.user.capabilities.useQuery(
        projectId ? { projectId } : { projectId: '' },
        { enabled: !!projectId },
    );

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
