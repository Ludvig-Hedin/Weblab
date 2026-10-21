import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { api } from '@convex/_generated/api';
import { fetchQuery } from 'convex/nextjs';

import type { Id } from '@convex/_generated/dataModel';
import { getCurrentUser, getSignInUrl } from '@/utils/auth/current-user';
import { ProjectLoadError } from './project-load-error';

/** Segment entry rechecks ordinary access even when the editor layout is reused. */
export async function OrdinaryProjectBoundary({
    children,
    params,
    section,
}: {
    children: React.ReactNode;
    params: Promise<{ id: string }>;
    section: 'preview' | 'settings' | 'wireframe';
}) {
    const { id } = await params;
    if (!(await getCurrentUser()))
        redirect(getSignInUrl(`/project/${encodeURIComponent(id)}/${section}`));
    const { getToken } = await auth();
    const token = await getToken({ template: 'convex' });
    if (
        !token ||
        !(await fetchQuery(api.projects.hasAccess, { projectId: id as Id<'projects'> }, { token }))
    ) {
        return <ProjectLoadError variant="forbidden" />;
    }
    return <>{children}</>;
}
