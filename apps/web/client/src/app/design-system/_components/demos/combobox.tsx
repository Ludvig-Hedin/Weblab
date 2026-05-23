'use client';

import { useMemo, useState } from 'react';

import { Button } from '@weblab/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
    CommandShortcut,
} from '@weblab/ui/command';
import { Icons } from '@weblab/ui/icons';
import { Popover, PopoverContent, PopoverTrigger } from '@weblab/ui/popover';

import { Section } from '../section';

const PROJECTS = [
    { id: '1', name: 'weblab-marketing', tag: 'Marketing' },
    { id: '2', name: 'weblab-docs', tag: 'Docs' },
    { id: '3', name: 'commerce-mvp', tag: 'Product' },
    { id: '4', name: 'design-system', tag: 'Design' },
    { id: '5', name: 'editor-prototype', tag: 'R&D' },
    { id: '6', name: 'internal-tools', tag: 'Internal' },
];

const FILES = [
    { path: 'apps/web/client/src/app/layout.tsx', icon: 'file' as const },
    { path: 'apps/web/client/src/app/globals.css', icon: 'file' as const },
    { path: 'packages/ui/src/components/button.tsx', icon: 'file' as const },
    { path: 'packages/ui/src/components', icon: 'dir' as const },
    { path: 'docs/agent-context', icon: 'dir' as const },
];

const SLASH_COMMANDS = [
    {
        name: '/explain',
        description: 'Explain the selected code',
        shortcut: '⌘E',
    },
    { name: '/fix', description: 'Fix the bug in this file', shortcut: '⌘F' },
    {
        name: '/refactor',
        description: 'Refactor the selected block',
        shortcut: '⌘R',
    },
    { name: '/test', description: 'Write a unit test', shortcut: '⌘T' },
    { name: '/docs', description: 'Generate inline JSDoc', shortcut: '⌘D' },
];

export function ComboboxDemo() {
    const [project, setProject] = useState<string | null>('design-system');
    const [mentionOpen, setMentionOpen] = useState(false);
    const [slashOpen, setSlashOpen] = useState(false);
    const [mentionFilter, setMentionFilter] = useState('');
    const [slashFilter, setSlashFilter] = useState('');
    const [loading, setLoading] = useState(false);

    const filteredFiles = useMemo(
        () =>
            FILES.filter((f) =>
                mentionFilter ? f.path.toLowerCase().includes(mentionFilter.toLowerCase()) : true,
            ),
        [mentionFilter],
    );

    return (
        <div id="combobox">
            <Section
                title="Project picker"
                tag="combobox"
                inspectId="command"
                filePath="packages/ui/src/components/command.tsx"
            >
                <Popover>
                    <PopoverTrigger asChild>
                        <Button variant="outline" className="w-72 justify-between" size="sm">
                            <span className="truncate">{project ?? 'Select project…'}</span>
                            <Icons.ChevronDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-60" />
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-72 p-0">
                        <Command>
                            <CommandInput placeholder="Search projects…" />
                            <CommandList>
                                <CommandEmpty>No projects match.</CommandEmpty>
                                <CommandGroup heading="Recent">
                                    {PROJECTS.slice(0, 3).map((p) => (
                                        <CommandItem
                                            key={p.id}
                                            value={p.name}
                                            onSelect={(value) => setProject(value)}
                                        >
                                            <Icons.File className="mr-2 h-4 w-4" />
                                            <span className="truncate">{p.name}</span>
                                            <span className="text-foreground-tertiary ml-auto text-xs">
                                                {p.tag}
                                            </span>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                                <CommandSeparator />
                                <CommandGroup heading="All">
                                    {PROJECTS.slice(3).map((p) => (
                                        <CommandItem
                                            key={p.id}
                                            value={p.name}
                                            onSelect={(value) => setProject(value)}
                                        >
                                            <Icons.File className="mr-2 h-4 w-4" />
                                            <span className="truncate">{p.name}</span>
                                            <span className="text-foreground-tertiary ml-auto text-xs">
                                                {p.tag}
                                            </span>
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            </CommandList>
                        </Command>
                    </PopoverContent>
                </Popover>
                <p className="text-foreground-tertiary mt-2 text-xs">
                    Canonical replacement for the projects-top-bar hand-rolled dropdown.
                </p>
            </Section>

            <Section
                title="@mention list (controlled)"
                tag="combobox"
                inspectId="command"
                filePath="packages/ui/src/components/command.tsx"
            >
                <div className="flex items-center gap-3">
                    <Popover open={mentionOpen} onOpenChange={setMentionOpen}>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="sm">
                                <Icons.ChatBubble className="mr-1 h-3.5 w-3.5" /> Toggle @mention
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-72 p-0">
                            <Command shouldFilter={false}>
                                <CommandInput
                                    placeholder="Search files…"
                                    value={mentionFilter}
                                    onValueChange={setMentionFilter}
                                />
                                <CommandList>
                                    {filteredFiles.length === 0 ? (
                                        <CommandEmpty>No matching files.</CommandEmpty>
                                    ) : (
                                        <CommandGroup heading="Files">
                                            {filteredFiles.map((f) => (
                                                <CommandItem
                                                    key={f.path}
                                                    value={f.path}
                                                    onSelect={() => setMentionOpen(false)}
                                                >
                                                    {f.icon === 'dir' ? (
                                                        <Icons.Directory className="mr-2 h-4 w-4" />
                                                    ) : (
                                                        <Icons.File className="mr-2 h-4 w-4" />
                                                    )}
                                                    <span className="truncate">{f.path}</span>
                                                </CommandItem>
                                            ))}
                                        </CommandGroup>
                                    )}
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                    <p className="text-foreground-tertiary text-xs">
                        Controlled <code>open</code> — the parent owns state. Pattern for the TipTap
                        file-mention extension.
                    </p>
                </div>
            </Section>

            <Section
                title="Slash commands"
                tag="combobox"
                inspectId="command"
                filePath="packages/ui/src/components/command.tsx"
            >
                <div className="flex items-center gap-3">
                    <Popover open={slashOpen} onOpenChange={setSlashOpen}>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="sm">
                                <Icons.Code className="mr-1 h-3.5 w-3.5" /> Toggle slash menu
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-80 p-0">
                            <Command shouldFilter>
                                <CommandInput
                                    placeholder="Type a command…"
                                    value={slashFilter}
                                    onValueChange={setSlashFilter}
                                />
                                <CommandList>
                                    <CommandEmpty>No commands.</CommandEmpty>
                                    <CommandGroup heading="Commands">
                                        {SLASH_COMMANDS.map((c) => (
                                            <CommandItem
                                                key={c.name}
                                                value={c.name}
                                                onSelect={() => setSlashOpen(false)}
                                            >
                                                <Icons.Sparkles className="mr-2 h-4 w-4" />
                                                <div className="flex min-w-0 flex-col">
                                                    <span className="truncate">{c.name}</span>
                                                    <span className="text-foreground-tertiary truncate text-xs">
                                                        {c.description}
                                                    </span>
                                                </div>
                                                <CommandShortcut>{c.shortcut}</CommandShortcut>
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                    <p className="text-foreground-tertiary text-xs">
                        Same shape, command-flavored — pattern for the TipTap slash-commands
                        extension.
                    </p>
                </div>
            </Section>

            <Section
                title="Async loading & empty"
                tag="combobox"
                inspectId="command"
                filePath="packages/ui/src/components/command.tsx"
            >
                <div className="flex flex-wrap items-start gap-4">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setLoading(true);
                                    window.setTimeout(() => setLoading(false), 1500);
                                }}
                            >
                                Open async picker
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-72 p-0">
                            <Command>
                                <CommandInput placeholder="Search…" />
                                <CommandList>
                                    {loading ? (
                                        <div className="text-foreground-tertiary flex items-center justify-center gap-2 px-3 py-6 text-xs">
                                            <Icons.LoadingSpinner className="h-3.5 w-3.5 animate-spin" />
                                            Loading results…
                                        </div>
                                    ) : (
                                        <>
                                            <CommandEmpty>No results.</CommandEmpty>
                                            <CommandGroup heading="Suggestions">
                                                <CommandItem>Item A</CommandItem>
                                                <CommandItem>Item B</CommandItem>
                                                <CommandItem>Item C</CommandItem>
                                            </CommandGroup>
                                        </>
                                    )}
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" size="sm">
                                Empty result state
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-72 p-0">
                            <Command>
                                <CommandInput placeholder="Search the void…" />
                                <CommandList>
                                    <CommandEmpty>
                                        <div className="flex flex-col items-center gap-1 py-4">
                                            <Icons.MagnifyingGlass className="text-foreground-tertiary h-4 w-4" />
                                            <span className="text-foreground text-sm font-medium">
                                                Nothing found
                                            </span>
                                            <span className="text-foreground-tertiary text-xs">
                                                Try a different keyword.
                                            </span>
                                        </div>
                                    </CommandEmpty>
                                </CommandList>
                            </Command>
                        </PopoverContent>
                    </Popover>
                </div>
            </Section>
        </div>
    );
}
