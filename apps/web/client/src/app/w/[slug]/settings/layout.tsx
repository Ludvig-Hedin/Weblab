import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';

import { TopBar } from '@/app/projects/_components/top-bar';
import { api } from '@/trpc/server';
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
    // before the tRPC call throws UNAUTHORIZED.
    const user = await getCurrentUser();
    if (!user) {
        redirect(getSignInUrl(`/w/${slug}/settings`));
    }

    const workspace = await api.workspace.getBySlug({ slug });
    if (!workspace) {
        redirect(Routes.PROJECTS);
    }

    const caps = await api.user.capabilities({ workspaceId: workspace.id });
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
