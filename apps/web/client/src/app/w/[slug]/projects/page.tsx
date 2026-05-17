'use client';

import { WorkspaceKind } from '@weblab/models';

import { OfflineProjectsList } from '@/app/projects/_components/offline-projects-list';
import { ProjectsCommandPalette } from '@/app/projects/_components/projects-command-palette';
import { SelectProject } from '@/app/projects/_components/select';
import { TopBar } from '@/app/projects/_components/top-bar';
import { SubscriptionModal } from '@/components/ui/pricing-modal';
import { NonProjectSettingsModal } from '@/components/ui/settings-modal/non-project';
import { SharedWithMe } from '../_components/shared-with-me';
import { useActiveWorkspace } from '../_components/workspace-context';

export default function WorkspaceProjectsPage() {
    const workspace = useActiveWorkspace();
    const isPersonal = workspace.kind === WorkspaceKind.PERSONAL;

    return (
        <div className="flex h-screen w-screen flex-col">
            <div className="desktop-drag-region w-full">
                <TopBar />
            </div>
            <div className="flex h-full w-full flex-col items-center gap-4 overflow-x-visible overflow-y-auto py-4">
                <OfflineProjectsList />
                <SelectProject workspaceId={workspace.id} />
                {isPersonal && <SharedWithMe />}
            </div>
            <SubscriptionModal />
            <NonProjectSettingsModal />
            <ProjectsCommandPalette />
        </div>
    );
}
