'use client';

import { useEffect, useState } from 'react';

import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@weblab/ui/command';
import { Icons } from '@weblab/ui/icons';

/**
 * cmd+shift+f project-search stub.
 *
 * Full project-wide text search requires a backend search index that does not
 * yet exist. This component opens a dialog that clearly communicates that
 * limitation and offers the file finder (cmd+p) as an alternative for
 * filename-based navigation.
 */
export function ProjectSearch() {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const handler = () => setOpen((prev) => !prev);
        window.addEventListener('open-project-search', handler);
        return () => window.removeEventListener('open-project-search', handler);
    }, []);

    const openFileFinder = () => {
        setOpen(false);
        setTimeout(() => window.dispatchEvent(new Event('open-file-finder')), 0);
    };

    return (
        <CommandDialog
            open={open}
            onOpenChange={setOpen}
            title="Project Search"
            description="Search for text across all project files."
        >
            <CommandInput placeholder="Search across files…" autoFocus disabled />
            <CommandList>
                <CommandEmpty>
                    Project-wide text search is not yet available.
                </CommandEmpty>
                <CommandGroup heading="Alternative">
                    <CommandItem onSelect={openFileFinder}>
                        <Icons.MagnifyingGlass />
                        <div className="flex min-w-0 flex-col">
                            <span>Quick Open File</span>
                            <span className="text-foreground-tertiary text-mini">
                                Search files by name with ⌘ P
                            </span>
                        </div>
                    </CommandItem>
                </CommandGroup>
            </CommandList>
        </CommandDialog>
    );
}
