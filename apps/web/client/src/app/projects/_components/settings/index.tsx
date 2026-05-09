'use client';

import { useRouter } from 'next/navigation';

import type { Project } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';

import { CloneProject } from './clone-project';
import { CreateTemplate } from './create-template';
import { DeleteProject } from './delete-project';
import { OfflinePinToggle } from './offline-pin-toggle';
import { RenameProject } from './rename-project';

export function SettingsDropdown({ project, refetch }: { project: Project; refetch: () => void }) {
    const router = useRouter();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    size="default"
                    variant="ghost"
                    className="hover:bg-background-weblab flex h-8 w-8 cursor-pointer items-center justify-center p-0 backdrop-blur-lg"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Icons.DotsHorizontal />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                className="z-50"
                align="end"
                alignOffset={-4}
                sideOffset={8}
                onClick={(e) => e.stopPropagation()}
            >
                <DropdownMenuItem
                    onSelect={() => router.push(`/project/${project.id}`)}
                    className="text-foreground-active hover:!bg-background-weblab hover:!text-foreground-active gap-2"
                >
                    <Icons.Gear className="h-4 w-4" />
                    Site settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <RenameProject project={project} refetch={refetch} />
                <CloneProject project={project} refetch={refetch} />
                <CreateTemplate project={project} refetch={refetch} />
                <OfflinePinToggle project={project} />
                <DeleteProject project={project} refetch={refetch} />
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
