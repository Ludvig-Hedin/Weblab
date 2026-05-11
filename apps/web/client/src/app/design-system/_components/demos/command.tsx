'use client';

import { useEffect, useState } from 'react';

import { Button } from '@weblab/ui/button';
import {
    Command,
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
    CommandShortcut,
} from '@weblab/ui/command';
import { Icons } from '@weblab/ui/icons';
import { Kbd } from '@weblab/ui/kbd';

import { Section } from '../section';

export function CommandDemo() {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setOpen((v) => !v);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    return (
        <Section
            title="Command palette"
            tag="selection"
            inspectId="command"
            filePath="packages/ui/src/components/command.tsx"
            id="command"
        >
            <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" onClick={() => setOpen(true)}>
                    Open palette <Kbd className="ml-2">⌘K</Kbd>
                </Button>
            </div>

            <div className="border-border mt-4 max-w-md overflow-hidden rounded-xl border">
                <Command className="bg-background">
                    <CommandInput placeholder="Type a command or search…" />
                    <CommandList>
                        <CommandEmpty>No results found.</CommandEmpty>
                        <CommandGroup heading="Project">
                            <CommandItem>
                                <Icons.Plus className="mr-2 h-4 w-4" />
                                Create project
                                <CommandShortcut>⌘N</CommandShortcut>
                            </CommandItem>
                            <CommandItem>
                                <Icons.MagnifyingGlass className="mr-2 h-4 w-4" />
                                Search
                            </CommandItem>
                        </CommandGroup>
                        <CommandSeparator />
                        <CommandGroup heading="Settings">
                            <CommandItem>
                                <Icons.Gear className="mr-2 h-4 w-4" />
                                Preferences
                                <CommandShortcut>⌘,</CommandShortcut>
                            </CommandItem>
                            <CommandItem>
                                <Icons.Person className="mr-2 h-4 w-4" />
                                Account
                            </CommandItem>
                        </CommandGroup>
                    </CommandList>
                </Command>
            </div>

            <CommandDialog open={open} onOpenChange={setOpen}>
                <CommandInput placeholder="Type a command or search…" />
                <CommandList>
                    <CommandEmpty>No results found.</CommandEmpty>
                    <CommandGroup heading="Quick actions">
                        <CommandItem>
                            <Icons.Plus className="mr-2 h-4 w-4" />
                            Create project
                            <CommandShortcut>⌘N</CommandShortcut>
                        </CommandItem>
                        <CommandItem>
                            <Icons.MagnifyingGlass className="mr-2 h-4 w-4" />
                            Search files
                        </CommandItem>
                    </CommandGroup>
                </CommandList>
            </CommandDialog>
        </Section>
    );
}
