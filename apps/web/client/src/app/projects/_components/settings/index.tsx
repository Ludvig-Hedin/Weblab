'use client';

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
import { useRouter } from 'next/navigation';
import { CloneProject } from './clone-project';
import { CreateTemplate } from './create-template';
import { DeleteProject } from './delete-project';
import { RenameProject } from './rename-project';

export function SettingsDropdown({ project, refetch }: { project: Project; refetch: () => void }) {
    const router = useRouter();

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    size="default"
                    variant="ghost"
                    className="w-8 h-8 p-0 flex items-center justify-center hover:bg-background-onlook cursor-pointer backdrop-blur-lg"
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
                    className="text-foreground-active hover:!bg-background-onlook hover:!text-foreground-active gap-2"
                >
                    <Icons.Gear className="w-4 h-4" />
                    Site settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <RenameProject project={project} refetch={refetch} />
                <CloneProject project={project} refetch={refetch} />
                <CreateTemplate project={project} refetch={refetch} />
                <DeleteProject project={project} refetch={refetch} />
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
