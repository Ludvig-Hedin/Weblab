'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { WorkspaceKind } from '@weblab/models';
import { Button } from '@weblab/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@weblab/ui/tooltip';
import { cn } from '@weblab/ui/utils';

import { api } from '@/trpc/react';
import { useActiveWorkspace } from './workspace-context';

export function WorkspaceSwitcher() {
    const active = useActiveWorkspace();
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const { data: workspaces, isLoading } = api.workspace.list.useQuery();

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                size="compact"
                                className="text-foreground-secondary -mx-1 max-w-56 gap-1 px-2 text-sm hover:opacity-80 active:opacity-60"
                            >
                                <span className="truncate">{active.name}</span>
                                <Icons.ChevronDown
                                    className={cn(
                                        'h-4 w-4 shrink-0 transition-transform duration-200',
                                        open && 'rotate-180',
                                    )}
                                />
                            </Button>
                        </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" sideOffset={6}>
                        {active.name}
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
            <DropdownMenuContent align="start" sideOffset={8} className="w-[260px]">
                <DropdownMenuLabel className="text-foreground-tertiary text-xs">
                    Workspaces
                </DropdownMenuLabel>
                {isLoading ? (
                    <div className="text-foreground-tertiary px-2 py-1.5 text-xs">Loading…</div>
                ) : (
                    workspaces?.map((ws) => (
                        <DropdownMenuItem
                            key={ws.id}
                            onSelect={() => router.push(`/w/${ws.slug}/projects`)}
                            className="gap-2"
                        >
                            <div className="flex flex-col">
                                <span className="truncate text-sm">{ws.name}</span>
                                {ws.kind === WorkspaceKind.PERSONAL && (
                                    <span className="text-foreground-tertiary text-xs">
                                        Personal
                                    </span>
                                )}
                            </div>
                            {ws.id === active.id && (
                                <Icons.Check className="ml-auto h-4 w-4 shrink-0" />
                            )}
                        </DropdownMenuItem>
                    ))
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => router.push('/w/new')}>
                    Create new workspace
                </DropdownMenuItem>
                <DropdownMenuItem
                    onSelect={() => router.push(`/w/${active.slug}/settings/general`)}
                >
                    Workspace settings
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
