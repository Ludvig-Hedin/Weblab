'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

import type { Project } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';

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
}) {
    const router = useRouter();
    const t = useTranslations('selectProject');

    return (
        <DropdownMenu open={open} onOpenChange={onOpenChange}>
            {trigger && (
                <DropdownMenuTrigger asChild>
                    <Button
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
    );
}
