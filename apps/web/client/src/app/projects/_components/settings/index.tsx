'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import type { Project } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';

import type { ProjectOrganizationProps } from '../select/project-card-utils';
import { ProjectDetailsDialog } from '../select/project-details-dialog';
import { CloneProject } from './clone-project';
import { CreateTemplate } from './create-template';
import { DeleteProject } from './delete-project';
import { OfflinePinToggle } from './offline-pin-toggle';
import { RenameProject } from './rename-project';

export function SettingsDropdown({
    project,
    refetch,
    open,
    onOpenChange,
    onSelect,
    onSelectMultiple,
    trigger = true,
    folders = [],
    onMoveToFolder,
    onCreateFolder,
}: {
    project: Project;
    refetch: () => void;
    /** Controlled open state — lets a parent (e.g. right-click) drive the menu. */
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Select just this project. Shows a "Select" item when provided. */
    onSelect?: () => void;
    /** Enter multi-select mode. Shows a "Select multiple" item when provided. */
    onSelectMultiple?: () => void;
    /** Render the `…` trigger button. Set false to drive the menu purely from `open`. */
    trigger?: boolean;
} & ProjectOrganizationProps) {
    const [showDetails, setShowDetails] = useState(false);
    const router = useRouter();
    const t = useTranslations('selectProject');

    const folder = folders.find((item) => item.projectIds.includes(project.id));

    return (
        <>
            <DropdownMenu open={open} onOpenChange={onOpenChange}>
                {trigger && (
                    <DropdownMenuTrigger asChild>
                        <Button
                            aria-label={t('projectActions', { name: project.name })}
                            size="default"
                            variant="ghost"
                            className="hover:bg-background-weblab flex h-8 w-8 cursor-pointer items-center justify-center p-0 backdrop-blur-lg"
                            onPointerDown={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                            }}
                        >
                            <Icons.DotsHorizontal />
                        </Button>
                    </DropdownMenuTrigger>
                )}
                <DropdownMenuContent
                    className="z-50"
                    align="end"
                    alignOffset={-4}
                    sideOffset={8}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                >
                    <DropdownMenuItem
                        onSelect={() => router.push(`/project/${project.id}`)}
                        className="text-foreground-active hover:!bg-background-weblab hover:!text-foreground-active gap-2"
                    >
                        <Icons.Gear className="h-4 w-4" />
                        Site settings
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setShowDetails(true)}>
                        <Icons.InfoCircled className="h-4 w-4" />
                        {t('showDetails')}
                    </DropdownMenuItem>
                    {onMoveToFolder && (
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                                <Icons.MoveToFolder className="mr-2 h-4 w-4" />
                                {t('moveToFolder')}
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                                {folders.map((item) => (
                                    <DropdownMenuItem
                                        key={item.id}
                                        disabled={item.id === folder?.id}
                                        onSelect={() => void onMoveToFolder(item.id)}
                                    >
                                        {item.name}
                                    </DropdownMenuItem>
                                ))}
                                {folder && (
                                    <DropdownMenuItem onSelect={() => void onMoveToFolder(null)}>
                                        {t('removeFromFolder')}
                                    </DropdownMenuItem>
                                )}
                                {onCreateFolder && (
                                    <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onSelect={onCreateFolder}>
                                            {t('createFolder')}
                                        </DropdownMenuItem>
                                    </>
                                )}
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>
                    )}
                    <RenameProject project={project} refetch={refetch} />
                    <CloneProject project={project} refetch={refetch} />
                    <CreateTemplate project={project} refetch={refetch} />
                    <OfflinePinToggle project={project} />
                    {onSelect && (
                        <DropdownMenuItem
                            onSelect={() => onSelect()}
                            className="text-foreground-active hover:!bg-background-weblab hover:!text-foreground-active gap-2"
                        >
                            <Icons.SquareCheck className="h-4 w-4" />
                            {t('select')}
                        </DropdownMenuItem>
                    )}
                    {onSelectMultiple && (
                        <DropdownMenuItem
                            onSelect={() => onSelectMultiple()}
                            className="text-foreground-active hover:!bg-background-weblab hover:!text-foreground-active gap-2"
                        >
                            <Icons.ListCheck className="h-4 w-4" />
                            {t('selectMultiple')}
                        </DropdownMenuItem>
                    )}
                    <DeleteProject project={project} refetch={refetch} />
                </DropdownMenuContent>
            </DropdownMenu>
            <ProjectDetailsDialog
                project={project}
                folderName={folder?.name}
                open={showDetails}
                onOpenChange={setShowDetails}
            />
        </>
    );
}
