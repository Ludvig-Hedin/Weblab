import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { api } from '@convex/_generated/api';
import { fetchQuery } from 'convex/nextjs';

import type { WorkspaceKind, WorkspaceRole } from '@weblab/models';

import type { ActiveWorkspace } from './_components/workspace-context';
import { getCurrentUser, getSignInUrl } from '@/utils/auth/current-user';
import { Routes } from '@/utils/constants';
import { WorkspaceProvider } from './_components/workspace-context';

interface WorkspaceLayoutProps {
    children: ReactNode;
    params: Promise<{ slug: string }>;
}

export default async function WorkspaceLayout({ children, params }: WorkspaceLayoutProps) {
    const { slug } = await params;

    const user = await getCurrentUser();
    if (!user) {
        redirect(getSignInUrl(`/w/${slug}/projects`));
    }

    const { getToken } = await auth();
    const token = await getToken({ template: 'convex' });
    const workspace = await fetchQuery(
        api.workspaces.getBySlug,
        { slug },
        { token: token ?? undefined },
    );

    if (!workspace) {
        // Not a member, or workspace doesn't exist. Fall back to the user's
        // personal workspace via the legacy projects route which handles
        // the redirect.
        redirect(Routes.PROJECTS);
    }

    const active: ActiveWorkspace = {
        id: workspace._id,
        slug: workspace.slug,
        name: workspace.name,
        kind: workspace.kind as WorkspaceKind,
        avatarUrl: workspace.avatarUrl ?? null,
        viewerRole: workspace.viewerRole as WorkspaceRole,
    };

    return <WorkspaceProvider workspace={active}>{children}</WorkspaceProvider>;
}
