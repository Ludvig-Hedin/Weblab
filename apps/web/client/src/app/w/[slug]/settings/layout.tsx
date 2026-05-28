import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { api } from '@convex/_generated/api';
import { fetchQuery } from 'convex/nextjs';

import { TopBar } from '@/app/projects/_components/top-bar';
import { getCurrentUser, getSignInUrl } from '@/utils/auth/current-user';
import { Routes } from '@/utils/constants';
import { SettingsNav } from './_components/settings-nav';

interface SettingsLayoutProps {
    children: ReactNode;
    params: Promise<{ slug: string }>;
}

export default async function WorkspaceSettingsLayout({ children, params }: SettingsLayoutProps) {
    const { slug } = await params;

    // Mirror /w/[slug]/layout: redirect anonymous visitors to sign-in
    // before the Convex call throws UNAUTHORIZED.
    // Preserve the actual deep-link via the middleware-set `x-pathname`
    // header so e.g. /w/[slug]/settings/members survives the round trip
    // through sign-in. Without this we landed every signed-out user on
    // /w/[slug]/settings — which itself 404s because it has no page.tsx.
    const user = await getCurrentUser();
    if (!user) {
        const requestPath = (await headers()).get('x-pathname') ?? `/w/${slug}/settings/general`;
        redirect(getSignInUrl(requestPath));
    }

    const { getToken } = await auth();
    const token = await getToken({ template: 'convex' });

    const workspace = await fetchQuery(
        api.workspaces.getBySlug,
        { slug },
        { token: token ?? undefined },
    );
    if (!workspace) {
        redirect(Routes.PROJECTS);
    }

    const caps = await fetchQuery(
        api.users.capabilities,
        { workspaceId: workspace._id },
        { token: token ?? undefined },
    );
    const canUpdate = caps.includes('workspace.update');
    const canManageMembers = caps.includes('workspace.manage_members');
    const canInvite = caps.includes('workspace.invite');

    return (
        <div className="flex h-screen w-screen flex-col">
            <div className="desktop-drag-region w-full">
                <TopBar />
            </div>
            <div className="mx-auto flex w-full max-w-5xl flex-1 gap-8 p-6">
                <SettingsNav
                    slug={slug}
                    canUpdate={canUpdate}
                    canManageMembers={canManageMembers}
                    canInvite={canInvite}
                />
                <div className="flex-1">{children}</div>
            </div>
        </div>
    );
}
