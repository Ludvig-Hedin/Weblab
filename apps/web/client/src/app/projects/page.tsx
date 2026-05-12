'use client';

import { SubscriptionModal } from '@/components/ui/pricing-modal';
import { NonProjectSettingsModal } from '@/components/ui/settings-modal/non-project';
import { OfflineProjectsList } from './_components/offline-projects-list';
import { ProjectsCommandPalette } from './_components/projects-command-palette';
import { SelectProject } from './_components/select';
import { TopBar } from './_components/top-bar';

export default function Page() {
    return (
        <div className="flex h-screen w-screen flex-col">
            <TopBar />
            <div className="flex h-full w-full flex-col items-center gap-4 overflow-x-visible overflow-y-auto py-4">
                <OfflineProjectsList />
                <SelectProject />
            </div>
            <SubscriptionModal />
            <NonProjectSettingsModal />
            <ProjectsCommandPalette />
        </div>
    );
}
