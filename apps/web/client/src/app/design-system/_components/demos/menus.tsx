'use client';

import { useMemo, useState } from 'react';

import { Button } from '@weblab/ui/button';
import {
    ContextMenu,
    ContextMenuCheckboxItem,
    ContextMenuContent,
    ContextMenuItem,
    ContextMenuLabel,
    ContextMenuSeparator,
    ContextMenuTrigger,
} from '@weblab/ui/context-menu';
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuSeparator,
    DropdownMenuShortcut,
    DropdownMenuSub,
    DropdownMenuSubContent,
    DropdownMenuSubTrigger,
    DropdownMenuTrigger,
} from '@weblab/ui/dropdown-menu';
import { Icons } from '@weblab/ui/icons';
import { Input } from '@weblab/ui/input';
import {
    Menubar,
    MenubarContent,
    MenubarItem,
    MenubarMenu,
    MenubarSeparator,
    MenubarShortcut,
    MenubarTrigger,
} from '@weblab/ui/menubar';
import {
    NavigationMenu,
    NavigationMenuContent,
    NavigationMenuItem,
    NavigationMenuLink,
    NavigationMenuList,
    NavigationMenuTrigger,
} from '@weblab/ui/navigation-menu';

import { Section } from '../section';

const SAMPLE_PROJECTS = [
    'weblab-marketing',
    'weblab-docs',
    'commerce-mvp',
    'design-system',
    'editor-prototype',
    'internal-tools',
];

export function MenusDemo() {
    const [sort, setSort] = useState('alpha');
    const [order, setOrder] = useState('newest');
    const [visible, setVisible] = useState({
        grid: true,
        ruler: false,
        guides: true,
    });
    const [filter, setFilter] = useState('');
    const filtered = useMemo(
        () =>
            SAMPLE_PROJECTS.filter((p) =>
                filter ? p.toLowerCase().includes(filter.toLowerCase()) : true,
            ),
        [filter],
    );

    return (
        <div id="menus">
            <Section
                title="Dropdown menu"
                tag="menus"
                inspectId="dropdown-menu"
                filePath="packages/ui/src/components/dropdown-menu.tsx"
            >
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline">
                            Actions <Icons.ChevronDown className="ml-1 h-3.5 w-3.5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                        <DropdownMenuLabel>Project</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>
                            <Icons.Pencil className="mr-2 h-4 w-4" /> Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                            <Icons.Copy className="mr-2 h-4 w-4" /> Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                            <Icons.ExternalLink className="mr-2 h-4 w-4" /> Open
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive">
                            <Icons.Trash className="mr-2 h-4 w-4" /> Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </Section>

            <Section
                title="Alignment & side"
                tag="menus"
                inspectId="dropdown-menu"
                filePath="packages/ui/src/components/dropdown-menu.tsx"
            >
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    {(['start', 'center', 'end'] as const).map((align) =>
                        (['bottom', 'top'] as const).map((side) => (
                            <DropdownMenu key={`${align}-${side}`}>
                                <DropdownMenuTrigger asChild>
                                    <Button variant="outline" size="sm">
                                        {align} · {side}
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align={align} side={side} className="w-44">
                                    <DropdownMenuItem>Option one</DropdownMenuItem>
                                    <DropdownMenuItem>Option two</DropdownMenuItem>
                                    <DropdownMenuItem>Option three</DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        )),
                    )}
                </div>
            </Section>

            <Section
                title="Widths"
                tag="menus"
                inspectId="dropdown-menu"
                filePath="packages/ui/src/components/dropdown-menu.tsx"
            >
                <div className="flex flex-wrap items-start gap-3">
                    {(
                        [
                            { w: 'w-40', label: 'Compact (w-40)' },
                            { w: 'w-56', label: 'Default (w-56)' },
                            { w: 'w-72', label: 'Rich (w-72)' },
                            { w: 'w-96', label: 'Wide (w-96)' },
                        ] as const
                    ).map(({ w, label }) => (
                        <DropdownMenu key={w}>
                            <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="sm">
                                    {label}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className={w}>
                                <DropdownMenuLabel>{label}</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem>
                                    <Icons.Pencil className="mr-2 h-4 w-4" /> Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                    <Icons.Copy className="mr-2 h-4 w-4" /> Duplicate
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    ))}
                </div>
            </Section>

            <Section
                title="Item types"
                tag="menus"
                inspectId="dropdown-menu"
                filePath="packages/ui/src/components/dropdown-menu.tsx"
            >
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline">
                            Open all item types <Icons.ChevronDown className="ml-1 h-3.5 w-3.5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-72">
                        <DropdownMenuLabel>Item types</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>Plain item</DropdownMenuItem>
                        <DropdownMenuItem>
                            <Icons.Pencil className="mr-2 h-4 w-4" /> With leading icon
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                            <Icons.Copy className="mr-2 h-4 w-4" />
                            <div className="flex flex-col">
                                <span>Duplicate</span>
                                <span className="text-foreground-tertiary text-xs">
                                    Create a copy in this folder
                                </span>
                            </div>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                            <Icons.Clipboard className="mr-2 h-4 w-4" /> Paste
                            <DropdownMenuShortcut>⌘V</DropdownMenuShortcut>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                            <Icons.Cube className="mr-2 h-4 w-4" /> Inspect
                            <span className="bg-background-success text-foreground-success ml-auto rounded px-1.5 py-0.5 text-[10px] font-medium">
                                Beta
                            </span>
                        </DropdownMenuItem>
                        <DropdownMenuItem disabled>
                            <Icons.LockClosed className="mr-2 h-4 w-4" /> Locked
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive">
                            <Icons.Trash className="mr-2 h-4 w-4" /> Delete
                            <DropdownMenuShortcut>⌘⌫</DropdownMenuShortcut>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </Section>

            <Section
                title="Radio group (sort & order)"
                tag="menus"
                inspectId="dropdown-menu"
                filePath="packages/ui/src/components/dropdown-menu.tsx"
            >
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline">
                            <Icons.MixerHorizontal className="mr-1 h-3.5 w-3.5" /> Sort &amp; order
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                        <DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
                            <DropdownMenuRadioItem value="alpha">
                                Alphabetical
                            </DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="created">
                                Date created
                            </DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="viewed">
                                Last viewed
                            </DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>Order</DropdownMenuLabel>
                        <DropdownMenuRadioGroup value={order} onValueChange={setOrder}>
                            <DropdownMenuRadioItem value="newest">
                                Newest first
                            </DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="oldest">
                                Oldest first
                            </DropdownMenuRadioItem>
                        </DropdownMenuRadioGroup>
                    </DropdownMenuContent>
                </DropdownMenu>
                <p className="text-foreground-tertiary mt-2 text-xs">
                    Canonical pattern for the projects-page settings dropdown.
                </p>
            </Section>

            <Section
                title="Checkbox group (visibility)"
                tag="menus"
                inspectId="dropdown-menu"
                filePath="packages/ui/src/components/dropdown-menu.tsx"
            >
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline">
                            <Icons.EyeOpen className="mr-1 h-3.5 w-3.5" /> Visibility
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-48">
                        <DropdownMenuLabel>Show</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuCheckboxItem
                            checked={visible.grid}
                            onCheckedChange={(v) => setVisible((s) => ({ ...s, grid: Boolean(v) }))}
                        >
                            Grid
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                            checked={visible.ruler}
                            onCheckedChange={(v) =>
                                setVisible((s) => ({ ...s, ruler: Boolean(v) }))
                            }
                        >
                            Ruler
                        </DropdownMenuCheckboxItem>
                        <DropdownMenuCheckboxItem
                            checked={visible.guides}
                            onCheckedChange={(v) =>
                                setVisible((s) => ({ ...s, guides: Boolean(v) }))
                            }
                        >
                            Guides
                        </DropdownMenuCheckboxItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </Section>

            <Section
                title="Submenu"
                tag="menus"
                inspectId="dropdown-menu"
                filePath="packages/ui/src/components/dropdown-menu.tsx"
            >
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline">
                            Device <Icons.ChevronDown className="ml-1 h-3.5 w-3.5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                        <DropdownMenuItem>
                            <Icons.Desktop className="mr-2 h-4 w-4" /> Desktop
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                            <Icons.Tablet className="mr-2 h-4 w-4" /> Tablet
                        </DropdownMenuItem>
                        <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                                <Icons.Mobile className="mr-2 h-4 w-4" /> Mobile
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="w-44">
                                <DropdownMenuItem>iPhone 15</DropdownMenuItem>
                                <DropdownMenuItem>Pixel 8</DropdownMenuItem>
                                <DropdownMenuItem>Galaxy S24</DropdownMenuItem>
                            </DropdownMenuSubContent>
                        </DropdownMenuSub>
                    </DropdownMenuContent>
                </DropdownMenu>
            </Section>

            <Section
                title="With search filter"
                tag="menus"
                inspectId="dropdown-menu"
                filePath="packages/ui/src/components/dropdown-menu.tsx"
            >
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline">
                            Projects <Icons.ChevronDown className="ml-1 h-3.5 w-3.5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-72">
                        <div className="border-border mb-1 border-b px-2 py-1.5">
                            <Input
                                value={filter}
                                onChange={(e) => setFilter(e.target.value)}
                                placeholder="Filter projects…"
                                className="hover:border-input focus:border-input h-7 border-transparent bg-transparent px-2 text-xs shadow-none focus-visible:ring-0"
                            />
                        </div>
                        <div className="max-h-72 overflow-y-auto">
                            {filtered.length > 0 ? (
                                filtered.map((p) => (
                                    <DropdownMenuItem key={p}>
                                        <Icons.File className="mr-2 h-4 w-4" /> {p}
                                    </DropdownMenuItem>
                                ))
                            ) : (
                                <div className="text-foreground-tertiary px-2 py-6 text-center text-xs">
                                    No projects match “{filter}”.
                                </div>
                            )}
                        </div>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>
                            <Icons.ExternalLink className="mr-2 h-4 w-4" /> View all projects
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                <p className="text-foreground-tertiary mt-2 text-xs">
                    Direct replacement for the hand-rolled projects dropdown in the projects top
                    bar.
                </p>
            </Section>

            <Section
                title="Empty &amp; loading"
                tag="menus"
                inspectId="dropdown-menu"
                filePath="packages/ui/src/components/dropdown-menu.tsx"
            >
                <div className="flex flex-wrap gap-3">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                                Empty
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-56">
                            <div className="text-foreground-tertiary flex flex-col items-center gap-1 px-3 py-6 text-center text-xs">
                                <Icons.MagnifyingGlass className="text-foreground-tertiary h-4 w-4" />
                                <span className="text-foreground text-sm font-medium">
                                    No results
                                </span>
                                <span>Try a different search term.</span>
                            </div>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                                Loading
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-56">
                            <div className="text-foreground-tertiary flex items-center justify-center gap-2 px-3 py-6 text-xs">
                                <Icons.LoadingSpinner className="h-3.5 w-3.5 animate-spin" />
                                Loading projects…
                            </div>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </Section>

            <Section
                title="Triggers — icon-only & split"
                tag="menus"
                inspectId="dropdown-menu"
                filePath="packages/ui/src/components/dropdown-menu.tsx"
            >
                <div className="flex flex-wrap items-center gap-4">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                                <Icons.DotsHorizontal className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem>
                                <Icons.Pencil className="mr-2 h-4 w-4" /> Rename
                            </DropdownMenuItem>
                            <DropdownMenuItem>
                                <Icons.Copy className="mr-2 h-4 w-4" /> Duplicate
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem variant="destructive">
                                <Icons.Trash className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="icon">
                                <Icons.DotsVertical className="h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem>Open</DropdownMenuItem>
                            <DropdownMenuItem>Share</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="compact">
                                <Icons.MixerHorizontal className="h-3.5 w-3.5" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-44">
                            <DropdownMenuItem>Customize</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <div className="border-input bg-background inline-flex items-center overflow-hidden rounded-full border shadow-xs">
                        <Button variant="ghost" className="rounded-none rounded-l-full">
                            <Icons.Play className="mr-1 h-3.5 w-3.5" /> Run
                        </Button>
                        <div className="bg-border h-5 w-px" />
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="rounded-none rounded-r-full"
                                >
                                    <Icons.ChevronDown className="h-3.5 w-3.5" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                                <DropdownMenuItem>Run with config A</DropdownMenuItem>
                                <DropdownMenuItem>Run with config B</DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>
                <p className="text-foreground-tertiary mt-2 text-xs">
                    Each trigger uses <code>&lt;Button asChild&gt;</code>. The 9 raw-button triggers
                    in Stage B will adopt one of these shapes.
                </p>
            </Section>

            <Section
                title="Context menu"
                tag="menus"
                inspectId="context-menu"
                filePath="packages/ui/src/components/context-menu.tsx"
            >
                <ContextMenu>
                    <ContextMenuTrigger asChild>
                        <div className="border-border text-foreground-tertiary flex h-32 w-64 cursor-default items-center justify-center rounded-xl border border-dashed text-xs">
                            Right-click anywhere here
                        </div>
                    </ContextMenuTrigger>
                    <ContextMenuContent>
                        <ContextMenuLabel>Element</ContextMenuLabel>
                        <ContextMenuSeparator />
                        <ContextMenuItem>Edit</ContextMenuItem>
                        <ContextMenuItem>Duplicate</ContextMenuItem>
                        <ContextMenuCheckboxItem checked>Visible</ContextMenuCheckboxItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem className="text-destructive">Delete</ContextMenuItem>
                    </ContextMenuContent>
                </ContextMenu>
            </Section>

            <Section
                title="Menubar"
                tag="menus"
                inspectId="menubar"
                filePath="packages/ui/src/components/menubar.tsx"
            >
                <Menubar>
                    <MenubarMenu>
                        <MenubarTrigger>File</MenubarTrigger>
                        <MenubarContent>
                            <MenubarItem>
                                New project <MenubarShortcut>⌘N</MenubarShortcut>
                            </MenubarItem>
                            <MenubarItem>
                                Open <MenubarShortcut>⌘O</MenubarShortcut>
                            </MenubarItem>
                            <MenubarSeparator />
                            <MenubarItem>Save</MenubarItem>
                        </MenubarContent>
                    </MenubarMenu>
                    <MenubarMenu>
                        <MenubarTrigger>Edit</MenubarTrigger>
                        <MenubarContent>
                            <MenubarItem>
                                Undo <MenubarShortcut>⌘Z</MenubarShortcut>
                            </MenubarItem>
                            <MenubarItem>
                                Redo <MenubarShortcut>⇧⌘Z</MenubarShortcut>
                            </MenubarItem>
                        </MenubarContent>
                    </MenubarMenu>
                    <MenubarMenu>
                        <MenubarTrigger>View</MenubarTrigger>
                        <MenubarContent>
                            <MenubarItem>Zoom in</MenubarItem>
                            <MenubarItem>Zoom out</MenubarItem>
                        </MenubarContent>
                    </MenubarMenu>
                </Menubar>
            </Section>

            <Section
                title="Navigation menu"
                tag="menus"
                inspectId="navigation-menu"
                filePath="packages/ui/src/components/navigation-menu.tsx"
            >
                <NavigationMenu>
                    <NavigationMenuList>
                        <NavigationMenuItem>
                            <NavigationMenuTrigger>Product</NavigationMenuTrigger>
                            <NavigationMenuContent>
                                <ul className="grid w-72 gap-2 p-3">
                                    <li>
                                        <NavigationMenuLink className="hover:bg-accent block rounded-md p-2 text-sm">
                                            Visual editor
                                        </NavigationMenuLink>
                                    </li>
                                    <li>
                                        <NavigationMenuLink className="hover:bg-accent block rounded-md p-2 text-sm">
                                            AI chat
                                        </NavigationMenuLink>
                                    </li>
                                    <li>
                                        <NavigationMenuLink className="hover:bg-accent block rounded-md p-2 text-sm">
                                            CMS
                                        </NavigationMenuLink>
                                    </li>
                                </ul>
                            </NavigationMenuContent>
                        </NavigationMenuItem>
                        <NavigationMenuItem>
                            <NavigationMenuLink className="block px-3 py-2 text-sm">
                                Pricing
                            </NavigationMenuLink>
                        </NavigationMenuItem>
                        <NavigationMenuItem>
                            <NavigationMenuLink className="block px-3 py-2 text-sm">
                                Docs
                            </NavigationMenuLink>
                        </NavigationMenuItem>
                    </NavigationMenuList>
                </NavigationMenu>
            </Section>
        </div>
    );
}
