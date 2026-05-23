import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';

import type { ActiveWorkspace } from './_components/workspace-context';
import { api } from '@/trpc/server';
import { getCurrentUser, getSignInUrl } from '@/utils/auth/current-user';
import { Routes } from '@/utils/constants';
import { WorkspaceProvider } from './_components/workspace-context';

interface WorkspaceLayoutProps {
    children: ReactNode;
    params: Promise<{ slug: string }>;
}

export default async function WorkspaceLayout({ children, params }: WorkspaceLayoutProps) {
    const { slug } = await params;

    // Auth gate first: `api.workspace.getBySlug` is a `protectedProcedure`,
    // so an anonymous deep-link to /w/<slug>/projects would surface as a
    // server-rendered UNAUTHORIZED error instead of the redirect-to-sign-in
    // the user expects.
    const user = await getCurrentUser();
    if (!user) {
        redirect(getSignInUrl(`/w/${slug}/projects`));
    }

    const workspace = await api.workspace.getBySlug({ slug });

    if (!workspace) {
        // Not a member, or workspace doesn't exist. Fall back to the user's
        // personal workspace via the legacy projects route which handles
        // the redirect.
        redirect(Routes.PROJECTS);
    }

    const active: ActiveWorkspace = {
        id: workspace.id,
        slug: workspace.slug,
        name: workspace.name,
        kind: workspace.kind,
        avatarUrl: workspace.avatarUrl,
        viewerRole: workspace.viewerRole,
    };

    return <WorkspaceProvider workspace={active}>{children}</WorkspaceProvider>;
}
