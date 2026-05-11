'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandShortcut,
} from '@weblab/ui/command';
import { Icons } from '@weblab/ui/icons';

import { useStateManager } from '@/components/store/state';
import { SettingsTabValue } from '@/components/ui/settings-modal/helpers';
import { api } from '@/trpc/react';
import { Routes } from '@/utils/constants';

/**
 * Global Cmd+K command palette for the /projects index. Mirrors the in-editor
 * CommandPalette but is project-list-centric: jump to any project, create a
 * new one, open settings, sign out — all keyboard-driven. Loaded once at the
 * projects page level so power users never need to mouse-navigate.
 */
export function ProjectsCommandPalette() {
    const router = useRouter();
    const stateManager = useStateManager();
    const [open, setOpen] = useState(false);

    // Fetch lazily — the palette is opt-in via Cmd+K, no need to spend a
    // round-trip on every projects-page mount just to keep the list warm.
    const { data: projects } = api.project.list.useQuery(undefined, { enabled: open });

    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((prev) => !prev);
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, []);

    const run = (action: () => void) => {
        setOpen(false);
        // Defer the navigation a tick so the close transition doesn't fight
        // focus restoration — same idiom the in-editor palette uses.
        setTimeout(action, 0);
    };

    return (
        <CommandDialog
            open={open}
            onOpenChange={setOpen}
            title="Command Palette"
            description="Jump to a project, create one, or run an action."
        >
            <CommandInput placeholder="Type a command or search projects…" autoFocus />
            <CommandList>
                <CommandEmpty>No commands found.</CommandEmpty>

                {projects && projects.length > 0 && (
                    <CommandGroup heading="Jump to project">
                        {projects.slice(0, 25).map((project) => (
                            <CommandItem
                                key={project.id}
                                value={`Open ${project.name} project ${project.id}`}
                                onSelect={() =>
                                    run(() => router.push(`${Routes.PROJECT}/${project.id}`))
                                }
                            >
                                <Icons.Cube />
                                <span className="truncate">{project.name}</span>
                            </CommandItem>
                        ))}
                    </CommandGroup>
                )}

                <CommandGroup heading="Actions">
                    <CommandItem
                        value="New project create"
                        onSelect={() => run(() => router.push(Routes.NEW_PROJECT))}
                    >
                        <Icons.Plus />
                        <span>New project</span>
                    </CommandItem>
                    <CommandItem
                        value="Marketplace templates"
                        onSelect={() => run(() => router.push(Routes.MARKETPLACE))}
                    >
                        <Icons.Globe />
                        <span>Browse Marketplace</span>
                    </CommandItem>
                    <CommandItem
                        value="Open settings preferences account"
                        onSelect={() =>
                            run(() => {
                                stateManager.settingsTab = SettingsTabValue.ACCOUNT;
                                stateManager.isSettingsModalOpen = true;
                            })
                        }
                    >
                        <Icons.Gear />
                        <span>Open Settings</span>
                    </CommandItem>
                </CommandGroup>

                <CommandGroup heading="Shortcuts">
                    <CommandItem
                        value="Focus search filter projects"
                        onSelect={() =>
                            run(() => {
                                const input =
                                    document.querySelector<HTMLInputElement>(
                                        'input[placeholder="Search projects"]',
                                    );
                                input?.focus();
                                input?.select();
                            })
                        }
                    >
                        <Icons.MagnifyingGlass />
                        <span>Search projects</span>
                        <CommandShortcut>/</CommandShortcut>
                    </CommandItem>
                </CommandGroup>
            </CommandList>
        </CommandDialog>
    );
}
